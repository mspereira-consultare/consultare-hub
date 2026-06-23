import argparse
import base64
import hashlib
import html as html_lib
import json
import os
import re
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import requests

try:
    from database_manager import DatabaseManager
except ImportError:
    DatabaseManager = None

try:
    from storage_s3 import download_s3_object_bytes
except ImportError:
    download_s3_object_bytes = None


SERVICE_NAME = "repasse_email"
PROVIDER = "mailersend"
STATUS_PENDING = "PENDING"
STATUS_RUNNING = "RUNNING"
STATUS_COMPLETED = "COMPLETED"
STATUS_PARTIAL = "PARTIAL"
STATUS_FAILED = "FAILED"


def _now_iso() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _clean(value) -> str:
    return str(value or "").strip()


def _row_get(row, idx: int, key: str):
    if isinstance(row, dict):
        return row.get(key)
    if isinstance(row, (tuple, list)):
        return row[idx] if idx < len(row) else None
    return getattr(row, key, None)


def _json_list(value) -> List[str]:
    raw = _clean(value)
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        if not isinstance(parsed, list):
            return []
        return [_clean(item) for item in parsed if _clean(item)]
    except Exception:
        return []


def _is_dry_run() -> bool:
    return _clean(os.getenv("REPASSE_EMAIL_DRY_RUN", "1")).lower() in ("1", "true", "yes", "on")


def _rate_limit_sleep():
    per_min = max(1, int(os.getenv("REPASSE_EMAIL_RATE_LIMIT_PER_MIN", "10") or "10"))
    time.sleep(max(0.0, 60.0 / float(per_min)))


def _format_brl(value) -> str:
    try:
        amount = float(value or 0)
    except Exception:
        amount = 0.0
    raw = f"{amount:,.2f}"
    return "R$ " + raw.replace(",", "X").replace(".", ",").replace("X", ".")


def _format_date_br(value: str) -> str:
    raw = _clean(value)
    match = re.match(r"^(\d{4})-(\d{2})-(\d{2})", raw)
    if match:
        return f"{match.group(3)}/{match.group(2)}/{match.group(1)}"
    return raw or "-"


def _format_period_br(value: str) -> str:
    raw = _clean(value)
    match = re.match(r"^(\d{4})-(\d{2})$", raw)
    if match:
        return f"{match.group(2)}/{match.group(1)}"
    return raw or "-"


def _parse_email_list(value: str) -> List[str]:
    emails: List[str] = []
    for part in re.split(r"[;,]", _clean(value)):
        email = _clean(part)
        if email and _is_valid_email(email) and email.lower() not in [item.lower() for item in emails]:
            emails.append(email)
    return emails


def _resolve_logo_path() -> Path:
    explicit = _clean(os.getenv("REPASSE_EMAIL_LOGO_PATH"))
    if explicit:
        return Path(explicit)
    return Path(__file__).resolve().parents[1] / "apps" / "painel" / "public" / "logo-white.png"


def _load_logo_attachment() -> Optional[Dict]:
    try:
        logo_bytes = _resolve_logo_path().read_bytes()
    except Exception as exc:
        print(f"repasse_email: logo inline indisponivel: {exc}")
        return None
    if not logo_bytes:
        return None
    return {
        "content": base64.b64encode(logo_bytes).decode("ascii"),
        "filename": "logo-white.png",
        "disposition": "inline",
        "id": "consultare_logo",
    }


def _build_observations_html(observations: str) -> str:
    text = _clean(observations)
    if not text:
        return ""
    return f"""
                    <div class="obs-box">
                        <span class="obs-label">Observações</span>
                        <span class="obs-content">{html_lib.escape(text)}</span>
                    </div>
    """.strip()


def _stable_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _parse_money(value) -> float:
    raw = _clean(value).replace("R$", "").replace(" ", "")
    if not raw:
        return 0.0
    if "," in raw and "." in raw:
        if raw.rfind(",") > raw.rfind("."):
            raw = raw.replace(".", "").replace(",", ".")
        else:
            raw = raw.replace(",", "")
    elif "," in raw:
        raw = raw.replace(".", "").replace(",", ".")
    try:
        return round(float(raw), 2)
    except Exception:
        return 0.0


def _is_valid_email(value: str) -> bool:
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", _clean(value)))


def _ensure_tables(db: "DatabaseManager"):
    conn = db.get_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS repasse_email_batches (
              id VARCHAR(64) PRIMARY KEY,
              period_ref VARCHAR(7) NOT NULL,
              due_date_nf VARCHAR(32) NOT NULL,
              status VARCHAR(30) NOT NULL,
              total_recipients INTEGER NOT NULL DEFAULT 0,
              ready_count INTEGER NOT NULL DEFAULT 0,
              warning_count INTEGER NOT NULL DEFAULT 0,
              error_count INTEGER NOT NULL DEFAULT 0,
              accepted_count INTEGER NOT NULL DEFAULT 0,
              delivered_count INTEGER NOT NULL DEFAULT 0,
              failed_count INTEGER NOT NULL DEFAULT 0,
              requested_by VARCHAR(64),
              created_at VARCHAR(32) NOT NULL,
              updated_at VARCHAR(32) NOT NULL,
              started_at VARCHAR(32),
              finished_at VARCHAR(32),
              error TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS repasse_email_recipients (
              id VARCHAR(64) PRIMARY KEY,
              batch_id VARCHAR(64) NOT NULL,
              period_ref VARCHAR(7) NOT NULL,
              professional_id VARCHAR(64) NOT NULL,
              professional_name VARCHAR(180) NOT NULL,
              recipient_email VARCHAR(220) NOT NULL,
              amount_value DECIMAL(14,2) NOT NULL,
              due_date_nf VARCHAR(32) NOT NULL,
              pdf_artifact_id VARCHAR(64),
              storage_provider VARCHAR(30),
              storage_bucket VARCHAR(120),
              storage_key VARCHAR(255),
              drive_file_id VARCHAR(180),
              drive_file_url VARCHAR(500),
              file_name VARCHAR(255),
              validation_status VARCHAR(20) NOT NULL,
              validation_errors_json LONGTEXT,
              send_status VARCHAR(40) NOT NULL,
              last_message_id VARCHAR(128),
              last_provider_message_id VARCHAR(128),
              last_event_type VARCHAR(80),
              last_event_at VARCHAR(32),
              manual_confirmed_by VARCHAR(64),
              manual_confirmed_at VARCHAR(32),
              created_at VARCHAR(32) NOT NULL,
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS repasse_email_jobs (
              id VARCHAR(64) PRIMARY KEY,
              batch_id VARCHAR(64) NOT NULL,
              period_ref VARCHAR(7) NOT NULL,
              scope VARCHAR(30) NOT NULL,
              recipient_ids_json LONGTEXT,
              status VARCHAR(20) NOT NULL,
              requested_by VARCHAR(64) NOT NULL,
              started_at VARCHAR(32),
              finished_at VARCHAR(32),
              error TEXT,
              created_at VARCHAR(32) NOT NULL,
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS repasse_email_messages (
              id VARCHAR(64) PRIMARY KEY,
              batch_id VARCHAR(64) NOT NULL,
              recipient_id VARCHAR(64) NOT NULL,
              job_id VARCHAR(64),
              message_id VARCHAR(128) NOT NULL,
              provider VARCHAR(40) NOT NULL,
              provider_message_id VARCHAR(128),
              to_email VARCHAR(220) NOT NULL,
              from_email VARCHAR(220) NOT NULL,
              subject VARCHAR(255) NOT NULL,
              template_key VARCHAR(80),
              pdf_artifact_id VARCHAR(64),
              attachment_file_name VARCHAR(255),
              status VARCHAR(40) NOT NULL,
              request_payload_json LONGTEXT,
              response_payload_json LONGTEXT,
              error TEXT,
              created_at VARCHAR(32) NOT NULL,
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        for statement in (
            "ALTER TABLE repasse_email_recipients ADD COLUMN drive_file_id VARCHAR(180)",
            "ALTER TABLE repasse_email_recipients ADD COLUMN drive_file_url VARCHAR(500)",
            "ALTER TABLE repasse_email_recipients ADD COLUMN professional_match_status VARCHAR(40)",
            "ALTER TABLE repasse_email_recipients ADD COLUMN professional_match_score DECIMAL(8,4)",
            "ALTER TABLE repasse_email_recipients ADD COLUMN attachment_match_status VARCHAR(40)",
            "ALTER TABLE repasse_email_recipients ADD COLUMN attachment_source VARCHAR(40)",
            "ALTER TABLE repasse_email_recipients ADD COLUMN attachment_code VARCHAR(180)",
            "ALTER TABLE repasse_email_recipients ADD COLUMN original_sheet_row_json LONGTEXT",
            "ALTER TABLE repasse_email_recipients ADD COLUMN observations LONGTEXT",
            "ALTER TABLE repasse_email_recipients ADD COLUMN attachment_size_bytes INTEGER",
            "ALTER TABLE repasse_email_recipients ADD COLUMN attachment_content_type VARCHAR(120)",
        ):
            try:
                conn.execute(statement)
            except Exception:
                pass
        if not db.use_turso:
            conn.commit()
    finally:
        conn.close()


def _execute(db: "DatabaseManager", sql: str, params: Tuple = ()):
    conn = db.get_connection()
    try:
        conn.execute(sql, params)
        if not db.use_turso:
            conn.commit()
    finally:
        conn.close()


def _query(db: "DatabaseManager", sql: str, params: Tuple = ()):
    return db.execute_query(sql, params) or []


def _heartbeat(db: "DatabaseManager", status: str, details: str):
    db.update_heartbeat(SERVICE_NAME, status, details[:3500])


def _update_batch_counters(db: "DatabaseManager", batch_id: str):
    rows = _query(
        db,
        """
        SELECT
          COUNT(*) as total_recipients,
          COALESCE(SUM(CASE WHEN send_status = 'READY' THEN 1 ELSE 0 END), 0) as ready_count,
          COALESCE(SUM(CASE WHEN validation_status = 'WARNING' THEN 1 ELSE 0 END), 0) as warning_count,
          COALESCE(SUM(CASE WHEN validation_status = 'ERROR' THEN 1 ELSE 0 END), 0) as error_count,
          COALESCE(SUM(CASE WHEN send_status = 'ACCEPTED_PROVIDER' THEN 1 ELSE 0 END), 0) as accepted_count,
          COALESCE(SUM(CASE WHEN send_status = 'DELIVERED' THEN 1 ELSE 0 END), 0) as delivered_count,
          COALESCE(SUM(CASE WHEN send_status IN ('FAILED', 'SOFT_BOUNCE', 'HARD_BOUNCE', 'SPAM_COMPLAINT') THEN 1 ELSE 0 END), 0) as failed_count
        FROM repasse_email_recipients
        WHERE batch_id = ?
        """,
        (batch_id,),
    )
    row = rows[0] if rows else None
    vals = [_row_get(row, i, key) or 0 for i, key in enumerate([
        "total_recipients",
        "ready_count",
        "warning_count",
        "error_count",
        "accepted_count",
        "delivered_count",
        "failed_count",
    ])]
    _execute(
        db,
        """
        UPDATE repasse_email_batches
        SET total_recipients = ?,
            ready_count = ?,
            warning_count = ?,
            error_count = ?,
            accepted_count = ?,
            delivered_count = ?,
            failed_count = ?,
            updated_at = ?
        WHERE id = ?
        """,
        tuple(vals + [_now_iso(), batch_id]),
    )


def _get_next_pending_job(db: "DatabaseManager"):
    rows = _query(
        db,
        """
        SELECT id, batch_id, period_ref, scope, recipient_ids_json
        FROM repasse_email_jobs
        WHERE status = 'PENDING'
        ORDER BY created_at ASC
        LIMIT 1
        """,
    )
    return rows[0] if rows else None


def _mark_job_running(db: "DatabaseManager", job_id: str):
    now = _now_iso()
    _execute(
        db,
        """
        UPDATE repasse_email_jobs
        SET status = 'RUNNING',
            started_at = ?,
            finished_at = NULL,
            error = NULL,
            updated_at = ?
        WHERE id = ?
        """,
        (now, now, job_id),
    )


def _mark_job_finished(db: "DatabaseManager", job_id: str, status: str, error: Optional[str] = None):
    now = _now_iso()
    _execute(
        db,
        """
        UPDATE repasse_email_jobs
        SET status = ?,
            finished_at = ?,
            error = ?,
            updated_at = ?
        WHERE id = ?
        """,
        (status, now, error, now, job_id),
    )


def _get_batch(db: "DatabaseManager", batch_id: str):
    rows = _query(
        db,
        """
        SELECT id, period_ref, due_date_nf
        FROM repasse_email_batches
        WHERE id = ?
        LIMIT 1
        """,
        (batch_id,),
    )
    return rows[0] if rows else None


def _load_job_recipients(db: "DatabaseManager", job) -> List:
    batch_id = _clean(_row_get(job, 1, "batch_id"))
    recipient_ids = _json_list(_row_get(job, 4, "recipient_ids_json"))
    if not recipient_ids:
        return []
    placeholders = ",".join(["?"] * len(recipient_ids))
    return _query(
        db,
        f"""
        SELECT
          id,
          batch_id,
          period_ref,
          professional_id,
          professional_name,
          recipient_email,
          amount_value,
          due_date_nf,
          pdf_artifact_id,
          storage_provider,
          storage_bucket,
          storage_key,
          drive_file_id,
          drive_file_url,
          file_name,
          professional_match_status,
          professional_match_score,
          attachment_match_status,
          attachment_source,
          attachment_code,
          original_sheet_row_json,
          observations,
          attachment_size_bytes,
          attachment_content_type,
          validation_status,
          validation_errors_json,
          send_status,
          last_message_id,
          last_provider_message_id,
          last_event_type,
          last_event_at,
          manual_confirmed_by,
          manual_confirmed_at,
          created_at,
          updated_at
        FROM repasse_email_recipients
        WHERE batch_id = ?
          AND id IN ({placeholders})
          AND send_status = 'QUEUED'
        ORDER BY professional_name ASC
        """,
        tuple([batch_id] + recipient_ids),
    )


def _s3_get_pdf(bucket: str, key: str) -> bytes:
    if download_s3_object_bytes is None:
        raise RuntimeError("storage_s3 indisponivel para download do PDF.")
    if not key:
        raise RuntimeError("PDF sem storage_key.")
    pdf_bytes = download_s3_object_bytes(key, bucket or None)
    if not pdf_bytes:
        raise RuntimeError("PDF do S3 vazio.")
    return pdf_bytes


def _build_email_payload(recipient, pdf_bytes: Optional[bytes]) -> Tuple[Dict, Dict]:
    professional_name = _clean(_row_get(recipient, 4, "professional_name"))
    to_email = _clean(_row_get(recipient, 5, "recipient_email"))
    amount_value = _row_get(recipient, 6, "amount_value")
    due_date_nf = _clean(_row_get(recipient, 7, "due_date_nf"))
    file_name = _clean(_row_get(recipient, 14, "file_name")) or "repasse.pdf"
    observations = _clean(_row_get(recipient, 21, "observations"))
    period_ref = _clean(_row_get(recipient, 2, "period_ref"))
    from_email = _clean(os.getenv("MAILERSEND_FROM_EMAIL"))
    from_name = _clean(os.getenv("MAILERSEND_FROM_NAME", "Financeiro Consultare"))
    reply_to = _clean(os.getenv("MAILERSEND_REPLY_TO_EMAIL"))
    if not from_email:
        raise RuntimeError("MAILERSEND_FROM_EMAIL nao configurado.")

    period_text = _format_period_br(period_ref)
    due_date_text = _format_date_br(due_date_nf)
    subject = f"Fechamento Mensal {period_text} - CONSULTARE"
    amount_text = _format_brl(amount_value)
    has_attachment = bool(pdf_bytes)
    escaped_professional_name = html_lib.escape(professional_name)
    escaped_period_ref = html_lib.escape(period_text)
    escaped_due_date_nf = html_lib.escape(due_date_text)
    escaped_amount_text = html_lib.escape(amount_text)
    escaped_subject = html_lib.escape(subject)
    observations_html = _build_observations_html(observations)
    attachment_text = (
        "O relatório detalhado está anexado a este e-mail em formato PDF para sua conferência."
        if has_attachment
        else ""
    )
    attachment_html = (
        "<p>O relatório detalhado está anexado a este e-mail em formato PDF para sua conferência.</p>"
        if has_attachment
        else ""
    )
    text = (
        f"Ola, {professional_name}.\n\n"
        f"Esperamos que esteja bem. Segue o demonstrativo de atendimentos realizados no mes de {period_text} na Clinica Consultare.\n"
        f"Valor final: {amount_text}.\n"
        + (f"Observacoes: {observations}.\n" if observations else "")
        + (f"{attachment_text}\n" if attachment_text else "")
        + f"Solicitamos o envio da NF ate o dia {due_date_text} para processamento do pagamento no ciclo atual.\n\n"
        "Atenciosamente,\nFinanceiro Consultare"
    )
    html_body = f"""<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{escaped_subject}</title>
    <style>
        body {{ margin: 0; padding: 0; background-color: #f4f7f9; font-family: 'Segoe UI', Tahoma, sans-serif; }}
        table {{ border-spacing: 0; }}
        td {{ padding: 0; }}
        img {{ border: 0; }}
        .wrapper {{ width: 100%; table-layout: fixed; background-color: #f4f7f9; padding: 32px 0 40px; }}
        .main {{ background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-spacing: 0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }}
        .header {{ background-color: #053F74; padding: 36px 20px; text-align: center; }}
        .logo {{ width: 280px; max-width: 80%; height: auto; }}
        .content {{ padding: 40px 50px; color: #444444; font-size: 17px; line-height: 1.7; }}
        h1 {{ color: #053F74; font-size: 24px; line-height: 1.25; margin-top: 0; }}
        p {{ font-size: 17px; }}
        .value-box {{ background-color: #f0f9f8; border: 1px solid #229A8A; border-radius: 6px; padding: 20px; text-align: center; margin: 25px 0; }}
        .value-label {{ display: block; font-size: 15px; color: #666; text-transform: uppercase; letter-spacing: 1px; }}
        .value-amount {{ display: block; font-size: 32px; color: #229A8A; font-weight: bold; margin-top: 5px; }}
        .obs-box {{ background-color: #f0f4f8; border: 1px solid #053F74; border-radius: 6px; padding: 20px; text-align: left; margin: 25px 0; }}
        .obs-label {{ display: block; font-size: 13px; color: #053F74; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid #d1d9e0; padding-bottom: 5px; }}
        .obs-content {{ display: block; font-size: 16px; color: #444; line-height: 1.55; white-space: pre-line; }}
        .alert-section {{ border-left: 4px solid #3FBD80; background-color: #f9fdfb; padding: 15px 20px; margin-top: 25px; font-size: 16px; }}
        .alert-title {{ color: #259D89; font-weight: bold; display: block; margin-bottom: 5px; }}
        .footer {{ text-align: center; padding: 30px; font-size: 13px; color: #999999; }}
    </style>
</head>
<body>
    <div style="display:none; max-height:0px; max-width:0px; opacity:0; overflow:hidden;">
        Olá Dr(a). {escaped_professional_name}, o demonstrativo de atendimentos de {escaped_period_ref} está disponível para conferência.
    </div>
    <center class="wrapper">
        <table class="main" width="100%">
            <tr>
                <td class="header">
                    <img src="cid:consultare_logo" alt="Consultare" class="logo">
                </td>
            </tr>
            <tr>
                <td class="content">
                    <h1>Olá, Dr(a). {escaped_professional_name}!</h1>
                    <p>Esperamos que esteja bem. Segue o demonstrativo de atendimentos realizados no mês de <strong>{escaped_period_ref}</strong> na Clínica Consultare.</p>
                    <div class="value-box">
                        <span class="value-label">Valor Total a Receber</span>
                        <span class="value-amount">{escaped_amount_text}</span>
                    </div>
                    {observations_html}
                    {attachment_html}
                    <div class="alert-section">
                        <span class="alert-title">Prazo para Nota Fiscal</span>
                        Solicitamos o envio da NF até o dia <strong>{escaped_due_date_nf}</strong> para processamento do pagamento no ciclo atual.
                    </div>
                    <p style="font-size: 15px; color: #888; margin-top: 30px;">
                        Dúvidas sobre o fechamento? Responda a este e-mail e nossa equipe financeira entrará em contato.
                    </p>
                </td>
            </tr>
            <tr>
                <td class="footer">
                    <strong>Clínica Consultare</strong><br>
                    Rua Jacy Teixeira de Camargo, 940 - Campinas/SP<br>
                    Telefone: (19) 3500-1700<br>
                    <br>
                    <p style="font-size: 10px; color: #bbb;">
                        Caso não queira mais receber estes demonstrativos por e-mail, responda com o assunto "Unsubscribe".
                    </p>
                    &copy; 2026 Consultare - Centro Médico Acessível. Todos os direitos reservados.
                </td>
            </tr>
        </table>
    </center>
</body>
</html>
    """.strip()

    payload = {
        "from": {"email": from_email, "name": from_name},
        "to": [{"email": to_email, "name": professional_name}],
        "subject": subject,
        "text": text,
        "html": html_body,
        "tags": ["repasses", "fechamento"],
    }
    attachments_payload: List[Dict] = []
    attachments_audit: List[Dict] = []
    logo_attachment = _load_logo_attachment()
    if logo_attachment:
        attachments_payload.append(logo_attachment)
        attachments_audit.append(
            {
                "filename": logo_attachment["filename"],
                "disposition": "inline",
                "id": logo_attachment["id"],
            }
        )
    if pdf_bytes:
        attachments_payload.append(
            {
                "content": base64.b64encode(pdf_bytes).decode("ascii"),
                "filename": file_name,
                "disposition": "attachment",
            }
        )
        attachments_audit.append({"filename": file_name, "disposition": "attachment", "size_bytes": len(pdf_bytes)})
    if attachments_payload:
        payload["attachments"] = attachments_payload
    if reply_to:
        payload["reply_to"] = {"email": reply_to, "name": from_name}
    bcc_emails = _parse_email_list(os.getenv("REPASSE_EMAIL_BCC") or os.getenv("MAILERSEND_BCC") or "")
    bcc_emails = [email for email in bcc_emails if email.lower() != to_email.lower()]
    if bcc_emails:
        payload["bcc"] = [{"email": email, "name": from_name} for email in bcc_emails[:10]]

    audit_payload = dict(payload)
    audit_payload["attachments"] = attachments_audit
    return payload, audit_payload


def _insert_message(db: "DatabaseManager", recipient, job_id: str, subject: str, audit_payload: Dict) -> str:
    now = _now_iso()
    message_id = str(uuid.uuid4())
    attachments = audit_payload.get("attachments") or []
    attachment_file_name = None
    for attachment in attachments:
        if _clean(attachment.get("disposition")) == "attachment":
            attachment_file_name = _clean(attachment.get("filename")) or None
            break
    _execute(
        db,
        """
        INSERT INTO repasse_email_messages (
          id, batch_id, recipient_id, job_id, message_id, provider, provider_message_id,
          to_email, from_email, subject, template_key, pdf_artifact_id,
          attachment_file_name, status, request_payload_json, response_payload_json,
          error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 'SENDING', ?, NULL, NULL, ?, ?)
        """,
        (
            message_id,
            _clean(_row_get(recipient, 1, "batch_id")),
            _clean(_row_get(recipient, 0, "id")),
            job_id,
            message_id,
            PROVIDER,
            _clean(_row_get(recipient, 5, "recipient_email")),
            _clean(os.getenv("MAILERSEND_FROM_EMAIL")),
            subject,
            "repasse_fechamento_v1",
            _clean(_row_get(recipient, 8, "pdf_artifact_id")) or None,
            attachment_file_name,
            json.dumps(audit_payload, ensure_ascii=False),
            now,
            now,
        ),
    )
    return message_id


def _send_mailersend(payload: Dict, message_id: str) -> Tuple[str, Dict]:
    if _is_dry_run():
        return f"dryrun-{message_id}", {"dry_run": True, "status_code": 202}

    token = _clean(os.getenv("MAILERSEND_API_TOKEN"))
    if not token:
        raise RuntimeError("MAILERSEND_API_TOKEN nao configurado.")

    response = requests.post(
        "https://api.mailersend.com/v1/email",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=30,
    )
    response_payload = {
        "status_code": response.status_code,
        "body": response.text[:2000],
        "x_message_id": response.headers.get("x-message-id") or response.headers.get("X-Message-Id"),
    }
    if response.status_code >= 300:
        raise RuntimeError(f"MailerSend retornou HTTP {response.status_code}: {response.text[:500]}")
    provider_message_id = _clean(response_payload.get("x_message_id"))
    if not provider_message_id:
        provider_message_id = f"mailersend-{message_id}"
    return provider_message_id, response_payload


def _mark_message_result(
    db: "DatabaseManager",
    message_id: str,
    recipient_id: str,
    provider_message_id: Optional[str],
    status: str,
    response_payload: Optional[Dict] = None,
    error: Optional[str] = None,
):
    now = _now_iso()
    _execute(
        db,
        """
        UPDATE repasse_email_messages
        SET provider_message_id = ?,
            status = ?,
            response_payload_json = ?,
            error = ?,
            updated_at = ?
        WHERE id = ?
        """,
        (
            provider_message_id,
            status,
            json.dumps(response_payload or {}, ensure_ascii=False),
            error,
            now,
            message_id,
        ),
    )
    _execute(
        db,
        """
        UPDATE repasse_email_recipients
        SET send_status = ?,
            last_message_id = ?,
            last_provider_message_id = ?,
            last_event_type = ?,
            last_event_at = ?,
            updated_at = ?
        WHERE id = ?
        """,
        (status, message_id, provider_message_id, status.lower(), now, now, recipient_id),
    )


def _send_recipient(db: "DatabaseManager", job_id: str, recipient) -> bool:
    recipient_id = _clean(_row_get(recipient, 0, "id"))
    storage_bucket = _clean(_row_get(recipient, 10, "storage_bucket"))
    storage_key = _clean(_row_get(recipient, 11, "storage_key"))
    pdf_bytes = _s3_get_pdf(storage_bucket, storage_key) if storage_key else None
    payload, audit_payload = _build_email_payload(recipient, pdf_bytes)
    subject = _clean(payload.get("subject"))
    message_id = _insert_message(db, recipient, job_id, subject, audit_payload)
    try:
        provider_message_id, response_payload = _send_mailersend(payload, message_id)
        _mark_message_result(
            db,
            message_id,
            recipient_id,
            provider_message_id,
            "ACCEPTED_PROVIDER",
            response_payload=response_payload,
        )
        return True
    except Exception as exc:
        _mark_message_result(
            db,
            message_id,
            recipient_id,
            None,
            "FAILED",
            response_payload={},
            error=str(exc),
        )
        return False


def process_pending_repasse_email_jobs_once(max_jobs: int = 1, requested_by: str = "system_status") -> bool:
    if DatabaseManager is None:
        raise RuntimeError("DatabaseManager indisponivel.")
    db = DatabaseManager()
    _ensure_tables(db)
    processed_any = False
    max_jobs = max(1, int(max_jobs or 1))
    max_recipients = max(1, int(os.getenv("REPASSE_EMAIL_MAX_PER_RUN", "90") or "90"))

    for _ in range(max_jobs):
        job = _get_next_pending_job(db)
        if not job:
            if not processed_any:
                _heartbeat(db, STATUS_COMPLETED, "Sem jobs pendentes")
            break

        processed_any = True
        job_id = _clean(_row_get(job, 0, "id"))
        batch_id = _clean(_row_get(job, 1, "batch_id"))
        scope = _clean(_row_get(job, 3, "scope"))
        _mark_job_running(db, job_id)
        _execute(
            db,
            "UPDATE repasse_email_batches SET status = ?, started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?",
            ("SENDING", _now_iso(), _now_iso(), batch_id),
        )
        _heartbeat(db, STATUS_RUNNING, f"job={job_id} batch={batch_id} requested_by={requested_by}")

        if scope == "sheet_import":
            message = "Job sheet_import obsoleto. Importe a planilha pelo painel e envie PDFs para S3."
            _mark_job_finished(db, job_id, STATUS_FAILED, message)
            _execute(
                db,
                "UPDATE repasse_email_batches SET status = 'FAILED', error = ?, finished_at = ?, updated_at = ? WHERE id = ?",
                (message, _now_iso(), _now_iso(), batch_id),
            )
            _heartbeat(db, STATUS_FAILED, f"sheet_import job={job_id} obsoleto")
            continue

        recipients = _load_job_recipients(db, job)[:max_recipients]
        if not recipients:
            _mark_job_finished(db, job_id, STATUS_FAILED, "Nenhum destinatario em QUEUED para o job.")
            _heartbeat(db, STATUS_FAILED, f"job={job_id} sem destinatarios")
            _update_batch_counters(db, batch_id)
            continue

        sent = 0
        failed = 0
        for recipient in recipients:
            try:
                ok = _send_recipient(db, job_id, recipient)
                if ok:
                    sent += 1
                else:
                    failed += 1
            except Exception as exc:
                failed += 1
                recipient_id = _clean(_row_get(recipient, 0, "id"))
                _execute(
                    db,
                    """
                    UPDATE repasse_email_recipients
                    SET send_status = 'FAILED',
                        last_event_type = 'worker_failed',
                        last_event_at = ?,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (_now_iso(), _now_iso(), recipient_id),
                )
                print(f"repasse_email job={job_id} recipient={recipient_id} erro={exc}")
            _rate_limit_sleep()

        if sent > 0 and failed == 0:
            _mark_job_finished(db, job_id, STATUS_COMPLETED, None)
            _execute(
                db,
                "UPDATE repasse_email_batches SET status = 'COMPLETED', finished_at = ?, updated_at = ? WHERE id = ?",
                (_now_iso(), _now_iso(), batch_id),
            )
            _heartbeat(db, STATUS_COMPLETED, f"job={job_id} aceitos={sent}")
        elif sent > 0:
            _mark_job_finished(db, job_id, STATUS_PARTIAL, f"Aceitos {sent}, falhas {failed}.")
            _execute(
                db,
                "UPDATE repasse_email_batches SET status = 'PARTIAL', finished_at = ?, updated_at = ? WHERE id = ?",
                (_now_iso(), _now_iso(), batch_id),
            )
            _heartbeat(db, STATUS_PARTIAL, f"job={job_id} aceitos={sent} falhas={failed}")
        else:
            _mark_job_finished(db, job_id, STATUS_FAILED, f"Falhas {failed}; nenhum envio aceito.")
            _execute(
                db,
                "UPDATE repasse_email_batches SET status = 'FAILED', finished_at = ?, updated_at = ? WHERE id = ?",
                (_now_iso(), _now_iso(), batch_id),
            )
            _heartbeat(db, STATUS_FAILED, f"job={job_id} falhas={failed}")

        _update_batch_counters(db, batch_id)

    return processed_any


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--ensure", action="store_true")
    parser.add_argument("--max-jobs", type=int, default=1)
    args = parser.parse_args()

    if DatabaseManager is None:
        raise RuntimeError("DatabaseManager indisponivel.")
    db = DatabaseManager()
    _ensure_tables(db)
    if args.ensure:
        db.update_heartbeat(SERVICE_NAME, STATUS_COMPLETED, "Schema repasse_email validado")
        return
    process_pending_repasse_email_jobs_once(max_jobs=args.max_jobs)


if __name__ == "__main__":
    main()
