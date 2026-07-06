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
PROVIDER = (os.getenv("REPASSE_EMAIL_PROVIDER", "sendpulse").strip().lower() or "sendpulse")
SENDPULSE_API_BASE_URL = "https://api.sendpulse.com"
STATUS_PENDING = "PENDING"
STATUS_RUNNING = "RUNNING"
STATUS_COMPLETED = "COMPLETED"
STATUS_PARTIAL = "PARTIAL"
STATUS_FAILED = "FAILED"
_SENDPULSE_TOKEN_CACHE: Dict[str, object] = {"token": "", "expires_at": 0.0}
CONSULTARE_LOGO_WHITE_BASE64 = (
    "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"
    "AGDs+L8AAwBopTagwDcV5gAAAABJRU5ErkJggg=="
)


def _now_iso() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _clean(value) -> str:
    return str(value or "").strip()


def _env_first(*names: str, default: str = "") -> str:
    for name in names:
        value = _clean(os.getenv(name))
        if value:
            return value
    return default


def _professional_display_name(value: str) -> str:
    parts = [part for part in re.split(r"\s+", _clean(value)) if part]
    if not parts:
        return "profissional"
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1]}"


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


def _resolve_logo_src() -> str:
    explicit = _clean(os.getenv("REPASSE_EMAIL_LOGO_URL"))
    if explicit:
        return explicit
    base_url = _env_first("NEXTAUTH_URL", "AUTH_URL")
    if base_url:
        return base_url.rstrip("/") + "/logo-white.png"
    if PROVIDER == "mailersend":
        return "cid:consultare_logo"
    return "https://painel-gerencial.consultare.com.br/logo-white.png"


def _load_logo_attachment() -> Optional[Dict]:
    logo_base64 = _clean(os.getenv("REPASSE_EMAIL_LOGO_BASE64"))
    try:
        if logo_base64:
            logo_bytes = base64.b64decode(logo_base64)
        else:
            logo_bytes = _resolve_logo_path().read_bytes()
    except Exception as exc:
        print(f"repasse_email: usando fallback embutido do logo: {exc}")
        logo_base64 = CONSULTARE_LOGO_WHITE_BASE64
        logo_bytes = base64.b64decode(logo_base64)
    if not logo_bytes:
        logo_base64 = CONSULTARE_LOGO_WHITE_BASE64
        logo_bytes = base64.b64decode(logo_base64)
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
    professional_display_name = _professional_display_name(professional_name)
    to_email = _clean(_row_get(recipient, 5, "recipient_email"))
    amount_value = _row_get(recipient, 6, "amount_value")
    due_date_nf = _clean(_row_get(recipient, 7, "due_date_nf"))
    file_name = _clean(_row_get(recipient, 14, "file_name")) or "repasse.pdf"
    observations = _clean(_row_get(recipient, 21, "observations"))
    period_ref = _clean(_row_get(recipient, 2, "period_ref"))
    from_email = _env_first("REPASSE_EMAIL_FROM_EMAIL", "SENDPULSE_FROM_EMAIL", "MAILERSEND_FROM_EMAIL")
    from_name = _env_first(
        "REPASSE_EMAIL_FROM_NAME",
        "SENDPULSE_FROM_NAME",
        "MAILERSEND_FROM_NAME",
        default="Financeiro Consultare",
    )
    reply_to = _env_first("REPASSE_EMAIL_REPLY_TO_EMAIL", "SENDPULSE_REPLY_TO_EMAIL", "MAILERSEND_REPLY_TO_EMAIL")
    if not from_email:
        raise RuntimeError("Remetente do e-mail de repasse nao configurado.")

    period_text = _format_period_br(period_ref)
    due_date_text = _format_date_br(due_date_nf)
    subject = f"Fechamento Mensal {period_text} - CONSULTARE"
    amount_text = _format_brl(amount_value)
    has_attachment = bool(pdf_bytes)
    escaped_professional_name = html_lib.escape(professional_display_name)
    escaped_period_ref = html_lib.escape(period_text)
    escaped_due_date_nf = html_lib.escape(due_date_text)
    escaped_amount_text = html_lib.escape(amount_text)
    escaped_subject = html_lib.escape(subject)
    escaped_logo_src = html_lib.escape(_resolve_logo_src())
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
        f"Ola, {professional_display_name}.\n\n"
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
                    <img src="{escaped_logo_src}" alt="Consultare" class="logo">
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

    email_payload = {
        "from": {"email": from_email, "name": from_name},
        "to": [{"email": to_email, "name": professional_name}],
        "subject": subject,
        "text": text,
        "html": base64.b64encode(html_body.encode("utf-8")).decode("ascii"),
    }
    attachments_binary: Dict[str, str] = {}
    attachments_audit: List[Dict] = []
    if PROVIDER == "mailersend" and _resolve_logo_src() == "cid:consultare_logo":
        logo_attachment = _load_logo_attachment()
        if logo_attachment:
            attachments_audit.append(
                {
                    "filename": logo_attachment["filename"],
                    "disposition": "inline",
                    "id": logo_attachment["id"],
                }
            )
    if pdf_bytes:
        attachments_binary[file_name] = base64.b64encode(pdf_bytes).decode("ascii")
        attachments_audit.append({"filename": file_name, "disposition": "attachment", "size_bytes": len(pdf_bytes)})
    if attachments_binary:
        email_payload["attachments_binary"] = attachments_binary
    if reply_to:
        email_payload["reply_to"] = {"email": reply_to, "name": from_name}
    bcc_emails = _parse_email_list(os.getenv("REPASSE_EMAIL_BCC") or os.getenv("SENDPULSE_BCC") or "")
    bcc_emails = [email for email in bcc_emails if email.lower() != to_email.lower()]
    if bcc_emails:
        email_payload["bcc"] = [{"email": email, "name": from_name} for email in bcc_emails[:10]]

    payload = {"email": email_payload}
    audit_email_payload = dict(email_payload)
    audit_email_payload["html"] = html_body
    audit_email_payload.pop("attachments_binary", None)
    audit_payload = {"email": audit_email_payload, "attachments": attachments_audit}
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
            _env_first("REPASSE_EMAIL_FROM_EMAIL", "SENDPULSE_FROM_EMAIL", "MAILERSEND_FROM_EMAIL"),
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


def _get_sendpulse_bearer_token() -> str:
    static_token = _clean(os.getenv("SENDPULSE_API_TOKEN"))
    if static_token:
        return static_token

    now = time.time()
    cached_token = _clean(_SENDPULSE_TOKEN_CACHE.get("token"))
    cached_expires_at = float(_SENDPULSE_TOKEN_CACHE.get("expires_at") or 0)
    if cached_token and cached_expires_at > now + 60:
        return cached_token

    client_id = _clean(os.getenv("SENDPULSE_CLIENT_ID"))
    client_secret = _clean(os.getenv("SENDPULSE_CLIENT_SECRET"))
    if not client_id or not client_secret:
        raise RuntimeError(
            "Credenciais do SendPulse nao configuradas. Defina SENDPULSE_API_TOKEN ou SENDPULSE_CLIENT_ID/SENDPULSE_CLIENT_SECRET."
        )

    response = requests.post(
        f"{SENDPULSE_API_BASE_URL}/oauth/access_token",
        headers={"Content-Type": "application/json"},
        json={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
        },
        timeout=30,
    )
    response_payload = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
    token = _clean(response_payload.get("access_token"))
    if response.status_code >= 300 or not token:
        raise RuntimeError(f"SendPulse auth retornou HTTP {response.status_code}: {response.text[:500]}")

    expires_in = int(response_payload.get("expires_in") or 3600)
    _SENDPULSE_TOKEN_CACHE["token"] = token
    _SENDPULSE_TOKEN_CACHE["expires_at"] = now + max(300, expires_in - 60)
    return token


def _send_sendpulse(payload: Dict, message_id: str) -> Tuple[str, Dict]:
    if _is_dry_run():
        return f"dryrun-{message_id}", {"dry_run": True, "status_code": 202}

    if PROVIDER != "sendpulse":
        raise RuntimeError(f"Provedor de e-mail de repasse nao suportado neste worker: {PROVIDER}")

    response = requests.post(
        f"{SENDPULSE_API_BASE_URL}/smtp/emails",
        headers={
            "Authorization": f"Bearer {_get_sendpulse_bearer_token()}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=30,
    )
    try:
        response_body = response.json()
    except Exception:
        response_body = {"raw": response.text[:2000]}
    response_payload = {
        "status_code": response.status_code,
        "body": response_body,
    }
    if response.status_code >= 300:
        raise RuntimeError(f"SendPulse retornou HTTP {response.status_code}: {response.text[:500]}")
    if not response_body.get("result"):
        raise RuntimeError(f"SendPulse nao confirmou o envio: {response.text[:500]}")
    provider_message_id = _clean(response_body.get("id"))
    if not provider_message_id:
        provider_message_id = f"sendpulse-{message_id}"
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
    subject = _clean((payload.get("email") or {}).get("subject"))
    message_id = _insert_message(db, recipient, job_id, subject, audit_payload)
    try:
        provider_message_id, response_payload = _send_sendpulse(payload, message_id)
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
