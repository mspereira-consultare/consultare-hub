import argparse
import base64
import hashlib
import json
import os
import re
import time
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import requests

try:
    from database_manager import DatabaseManager
except ImportError:
    DatabaseManager = None


SERVICE_NAME = "repasse_email"
PROVIDER = "mailersend"
STATUS_PENDING = "PENDING"
STATUS_RUNNING = "RUNNING"
STATUS_COMPLETED = "COMPLETED"
STATUS_PARTIAL = "PARTIAL"
STATUS_FAILED = "FAILED"
GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"


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


def _normalize_header(value: str) -> str:
    text = _clean(value).lower()
    replacements = {
        "á": "a", "à": "a", "ã": "a", "â": "a",
        "é": "e", "ê": "e",
        "í": "i",
        "ó": "o", "õ": "o", "ô": "o",
        "ú": "u",
        "ç": "c",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    return re.sub(r"[^a-z0-9]+", "_", text).strip("_")


def _extract_drive_file_id(value) -> str:
    raw = _clean(value)
    if not raw:
        return ""
    match = re.search(r"[-\w]{25,}", raw)
    return match.group(0) if match else ""


def _google_access_token() -> str:
    client_id = _clean(os.getenv("GOOGLE_OAUTH_CLIENT_ID"))
    client_secret = _clean(os.getenv("GOOGLE_OAUTH_CLIENT_SECRET"))
    refresh_token = _clean(os.getenv("GOOGLE_OAUTH_REFRESH_TOKEN"))
    if not client_id or not client_secret or not refresh_token:
        raise RuntimeError(
            "Credenciais OAuth Google ausentes. Configure GOOGLE_OAUTH_CLIENT_ID, "
            "GOOGLE_OAUTH_CLIENT_SECRET e GOOGLE_OAUTH_REFRESH_TOKEN."
        )
    response = requests.post(
        GOOGLE_OAUTH_TOKEN_URL,
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=30,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Falha OAuth Google ({response.status_code}): {response.text[:300]}")
    token = _clean((response.json() if response.content else {}).get("access_token"))
    if not token:
        raise RuntimeError("OAuth Google nao retornou access_token.")
    return token


def _google_headers(access_token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


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


def _sheet_row_value(row: Dict[str, str], keys: List[str]) -> str:
    for key in keys:
        value = _clean(row.get(key))
        if value:
            return value
    return ""


def _load_sheet_rows(access_token: str) -> List[Dict[str, str]]:
    spreadsheet_id = _clean(os.getenv("REPASSE_EMAIL_GOOGLE_SHEET_ID")) or _clean(
        os.getenv("GOOGLE_SHEETS_REPASSE_EMAIL_SPREADSHEET_ID")
    )
    range_name = _clean(os.getenv("REPASSE_EMAIL_GOOGLE_SHEET_RANGE", "Fechamento!A1:J"))
    if not spreadsheet_id:
        raise RuntimeError("REPASSE_EMAIL_GOOGLE_SHEET_ID nao configurado.")
    url = (
        "https://sheets.googleapis.com/v4/spreadsheets/"
        f"{spreadsheet_id}/values/{requests.utils.quote(range_name, safe='')}"
    )
    response = requests.get(url, headers=_google_headers(access_token), timeout=30)
    if response.status_code >= 400:
        raise RuntimeError(f"Falha ao ler Google Sheets ({response.status_code}): {response.text[:500]}")
    values = (response.json() if response.content else {}).get("values") or []
    if len(values) < 2:
        return []
    headers = [_normalize_header(value) for value in values[0]]
    rows: List[Dict[str, str]] = []
    for raw in values[1:]:
        row = {}
        for index, header in enumerate(headers):
            row[header] = _clean(raw[index] if index < len(raw) else "")
        rows.append(row)
    return rows


def _period_matches(row: Dict[str, str], period_ref: str) -> bool:
    month_raw = _sheet_row_value(row, ["mes_referencia", "mes", "competencia"])
    year_raw = _sheet_row_value(row, ["ano_referencia", "ano"])
    if not month_raw and not year_raw:
        return True
    if re.match(r"^\d{4}-\d{2}$", month_raw):
        return month_raw == period_ref
    if year_raw and month_raw:
        months = {
            "janeiro": "01", "jan": "01",
            "fevereiro": "02", "fev": "02",
            "marco": "03", "mar": "03",
            "abril": "04", "abr": "04",
            "maio": "05", "mai": "05",
            "junho": "06", "jun": "06",
            "julho": "07", "jul": "07",
            "agosto": "08", "ago": "08",
            "setembro": "09", "set": "09",
            "outubro": "10", "out": "10",
            "novembro": "11", "nov": "11",
            "dezembro": "12", "dez": "12",
        }
        month_key = _normalize_header(month_raw).replace("_", "")
        month = months.get(month_key) or month_raw.zfill(2)
        return f"{year_raw}-{month}" == period_ref
    return True


def _upsert_sheet_recipient(
    db: "DatabaseManager",
    batch_id: str,
    period_ref: str,
    default_due_date_nf: str,
    row: Dict[str, str],
    row_index: int,
) -> Tuple[bool, bool]:
    status_envio = _sheet_row_value(row, ["status_envio", "status"])
    if _clean(status_envio).upper() == "ENVIADO":
        return False, False

    professional_name = _sheet_row_value(row, ["nome_profissional", "professional_name", "profissional", "nome"])
    recipient_email = _sheet_row_value(row, ["email", "recipient_email", "e_mail"])
    amount_value = _parse_money(_sheet_row_value(row, ["valor", "amount_value", "valor_final", "repasse"]))
    drive_url = _sheet_row_value(row, ["arquivo", "drive_file_url", "drive_url", "link_pdf", "pdf_url", "link"])
    drive_file_id = _sheet_row_value(row, ["drive_file_id", "file_id", "id_arquivo"]) or _extract_drive_file_id(drive_url)
    due_date_nf = _sheet_row_value(row, ["data_limite_nf", "due_date_nf", "prazo_nf"]) or default_due_date_nf
    professional_id = _sheet_row_value(row, ["professional_id", "id_profissional", "profissional_id"]) or _stable_hash(
        f"{professional_name}|{recipient_email}|{drive_file_id}|{row_index}"
    )[:24]
    file_name = _sheet_row_value(row, ["file_name", "nome_arquivo", "pdf"]) or f"Relatorio_{professional_name.replace(' ', '_')}.pdf"

    errors: List[str] = []
    warnings: List[str] = []
    if not professional_name:
        errors.append("Nome do profissional ausente na planilha.")
    if not recipient_email:
        errors.append("E-mail ausente na planilha.")
    elif not _is_valid_email(recipient_email):
        errors.append("E-mail invalido na planilha.")
    if not drive_file_id:
        errors.append("Arquivo do Google Drive ausente ou invalido na planilha.")
    if amount_value <= 0:
        warnings.append("Valor informado na planilha zerado ou negativo.")

    validation_status = "ERROR" if errors else "WARNING" if warnings else "VALID"
    send_status = "SKIPPED" if errors else "READY"
    recipient_id = _stable_hash(f"repasse-email-recipient|{batch_id}|{professional_id}|{recipient_email}|{drive_file_id}")
    now = _now_iso()

    _execute(
        db,
        """
        INSERT INTO repasse_email_recipients (
          id, batch_id, period_ref, professional_id, professional_name, recipient_email,
          amount_value, due_date_nf, pdf_artifact_id, storage_provider, storage_bucket, storage_key,
          drive_file_id, drive_file_url, file_name, validation_status, validation_errors_json,
          send_status, last_message_id, last_provider_message_id, last_event_type, last_event_at,
          manual_confirmed_by, manual_confirmed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'google_drive', NULL, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)
        ON DUPLICATE KEY UPDATE
          professional_name = ?,
          recipient_email = ?,
          amount_value = ?,
          due_date_nf = ?,
          storage_provider = 'google_drive',
          storage_key = ?,
          drive_file_id = ?,
          drive_file_url = ?,
          file_name = ?,
          validation_status = ?,
          validation_errors_json = ?,
          send_status = CASE
            WHEN send_status IN ('IMPORTED', 'READY', 'SKIPPED', 'FAILED', 'SOFT_BOUNCE', 'DEFERRED') THEN ?
            ELSE send_status
          END,
          updated_at = ?
        """,
        (
            recipient_id,
            batch_id,
            period_ref,
            professional_id,
            professional_name,
            recipient_email,
            amount_value,
            due_date_nf,
            drive_file_id,
            drive_file_id,
            drive_url,
            file_name,
            validation_status,
            json.dumps(errors + warnings, ensure_ascii=False),
            send_status,
            now,
            now,
            professional_name,
            recipient_email,
            amount_value,
            due_date_nf,
            drive_file_id,
            drive_file_id,
            drive_url,
            file_name,
            validation_status,
            json.dumps(errors + warnings, ensure_ascii=False),
            send_status,
            now,
        ),
    )
    return True, validation_status == "ERROR"


def _process_sheet_import_job(db: "DatabaseManager", job, access_token: str) -> bool:
    job_id = _clean(_row_get(job, 0, "id"))
    batch_id = _clean(_row_get(job, 1, "batch_id"))
    batch = _get_batch(db, batch_id)
    if not batch:
        raise RuntimeError("Lote de importacao nao encontrado.")
    period_ref = _clean(_row_get(batch, 1, "period_ref"))
    due_date_nf = _clean(_row_get(batch, 2, "due_date_nf"))

    rows = _load_sheet_rows(access_token)
    imported = 0
    errors = 0
    for index, row in enumerate(rows, start=2):
        if not _period_matches(row, period_ref):
            continue
        did_import, has_error = _upsert_sheet_recipient(db, batch_id, period_ref, due_date_nf, row, index)
        if did_import:
            imported += 1
        if has_error:
            errors += 1

    _update_batch_counters(db, batch_id)
    counters = _query(
        db,
        "SELECT ready_count FROM repasse_email_batches WHERE id = ? LIMIT 1",
        (batch_id,),
    )
    ready_count = int(_row_get(counters[0], 0, "ready_count") or 0) if counters else 0
    batch_status = "READY" if ready_count > 0 else "FAILED"
    _execute(
        db,
        "UPDATE repasse_email_batches SET status = ?, error = ?, updated_at = ? WHERE id = ?",
        (
            batch_status,
            None if ready_count > 0 else "Nenhum destinatario pronto importado do Google Sheets.",
            _now_iso(),
            batch_id,
        ),
    )
    _mark_job_finished(
        db,
        job_id,
        STATUS_COMPLETED if ready_count > 0 else STATUS_FAILED,
        None if ready_count > 0 else "Nenhum destinatario pronto importado.",
    )
    _heartbeat(db, STATUS_COMPLETED if ready_count > 0 else STATUS_FAILED, f"sheet_import batch={batch_id} importados={imported} erros={errors} prontos={ready_count}")
    return ready_count > 0


def _load_job_recipients(db: "DatabaseManager", job) -> List:
    batch_id = _clean(_row_get(job, 1, "batch_id"))
    recipient_ids = _json_list(_row_get(job, 4, "recipient_ids_json"))
    if not recipient_ids:
        return []
    placeholders = ",".join(["?"] * len(recipient_ids))
    return _query(
        db,
        f"""
        SELECT *
        FROM repasse_email_recipients
        WHERE batch_id = ?
          AND id IN ({placeholders})
          AND send_status = 'QUEUED'
        ORDER BY professional_name ASC
        """,
        tuple([batch_id] + recipient_ids),
    )


def _drive_get_pdf(access_token: str, file_id: str) -> bytes:
    if not file_id:
        raise RuntimeError("PDF sem drive_file_id.")
    response = requests.get(
        f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media",
        headers=_google_headers(access_token),
        timeout=60,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Falha ao baixar PDF do Drive ({response.status_code}): {response.text[:300]}")
    if not response.content:
        raise RuntimeError("PDF do Drive vazio.")
    return response.content


def _build_email_payload(recipient, pdf_bytes: bytes) -> Tuple[Dict, Dict]:
    professional_name = _clean(_row_get(recipient, 4, "professional_name"))
    to_email = _clean(_row_get(recipient, 5, "recipient_email"))
    amount_value = _row_get(recipient, 6, "amount_value")
    due_date_nf = _clean(_row_get(recipient, 7, "due_date_nf"))
    file_name = _clean(_row_get(recipient, 14, "file_name")) or "repasse.pdf"
    period_ref = _clean(_row_get(recipient, 2, "period_ref"))
    from_email = _clean(os.getenv("MAILERSEND_FROM_EMAIL"))
    from_name = _clean(os.getenv("MAILERSEND_FROM_NAME", "Financeiro Consultare"))
    reply_to = _clean(os.getenv("MAILERSEND_REPLY_TO_EMAIL"))
    if not from_email:
        raise RuntimeError("MAILERSEND_FROM_EMAIL nao configurado.")

    subject = f"Fechamento Mensal {period_ref} - CONSULTARE"
    amount_text = _format_brl(amount_value)
    text = (
        f"Ola, {professional_name}.\n\n"
        f"Segue em anexo o fechamento mensal de repasses referente a {period_ref}.\n"
        f"Valor final: {amount_text}.\n"
        f"Data limite para envio da NF: {due_date_nf}.\n\n"
        "Atenciosamente,\nFinanceiro Consultare"
    )
    html = f"""
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <p>Ola, <strong>{professional_name}</strong>.</p>
      <p>Segue em anexo o fechamento mensal de repasses referente a <strong>{period_ref}</strong>.</p>
      <p><strong>Valor final:</strong> {amount_text}<br />
      <strong>Data limite para envio da NF:</strong> {due_date_nf}</p>
      <p>Atenciosamente,<br />Financeiro Consultare</p>
    </div>
    """.strip()

    payload = {
        "from": {"email": from_email, "name": from_name},
        "to": [{"email": to_email, "name": professional_name}],
        "subject": subject,
        "text": text,
        "html": html,
        "attachments": [
            {
                "content": base64.b64encode(pdf_bytes).decode("ascii"),
                "filename": file_name,
                "disposition": "attachment",
            }
        ],
        "tags": ["repasses", "fechamento"],
    }
    if reply_to:
        payload["reply_to"] = {"email": reply_to, "name": from_name}

    audit_payload = dict(payload)
    audit_payload["attachments"] = [
        {"filename": file_name, "disposition": "attachment", "size_bytes": len(pdf_bytes)}
    ]
    return payload, audit_payload


def _insert_message(db: "DatabaseManager", recipient, job_id: str, subject: str, audit_payload: Dict) -> str:
    now = _now_iso()
    message_id = str(uuid.uuid4())
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
            _clean(_row_get(recipient, 14, "file_name")) or "repasse.pdf",
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


def _send_recipient(db: "DatabaseManager", job_id: str, recipient, access_token: str) -> bool:
    recipient_id = _clean(_row_get(recipient, 0, "id"))
    drive_file_id = _clean(_row_get(recipient, 12, "drive_file_id")) or _extract_drive_file_id(
        _row_get(recipient, 13, "drive_file_url")
    )
    pdf_bytes = _drive_get_pdf(access_token, drive_file_id)
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
            ("QUEUED" if scope == "sheet_import" else "SENDING", _now_iso(), _now_iso(), batch_id),
        )
        _heartbeat(db, STATUS_RUNNING, f"job={job_id} batch={batch_id} requested_by={requested_by}")

        if scope == "sheet_import":
            try:
                _process_sheet_import_job(db, job, _google_access_token())
            except Exception as exc:
                _mark_job_finished(db, job_id, STATUS_FAILED, str(exc))
                _execute(
                    db,
                    "UPDATE repasse_email_batches SET status = 'FAILED', error = ?, finished_at = ?, updated_at = ? WHERE id = ?",
                    (str(exc), _now_iso(), _now_iso(), batch_id),
                )
                _heartbeat(db, STATUS_FAILED, f"sheet_import job={job_id} erro={exc}")
            continue

        recipients = _load_job_recipients(db, job)[:max_recipients]
        if not recipients:
            _mark_job_finished(db, job_id, STATUS_FAILED, "Nenhum destinatario em QUEUED para o job.")
            _heartbeat(db, STATUS_FAILED, f"job={job_id} sem destinatarios")
            _update_batch_counters(db, batch_id)
            continue

        sent = 0
        failed = 0
        access_token = _google_access_token()
        for recipient in recipients:
            try:
                ok = _send_recipient(db, job_id, recipient, access_token)
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
