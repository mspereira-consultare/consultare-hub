import os
import unicodedata
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from database_manager import DatabaseManager
from storage_s3 import upload_s3_object_bytes
from worker_payroll_point_sync import (
    SolidesClient,
    _build_adjustment_maps,
    _build_daily_rows_for_employee,
    _build_local_lookup,
    _build_remote_employees_by_id,
    _build_signature_row,
    _clean,
    _ensure_int,
    _execute,
    _infer_extension_from_content_type,
    _load_local_employees,
    _normalize_cpf,
    _now_iso,
    _parse_date,
    _persist_local_employee_link,
    _resolve_local_employee,
    _safe_json,
    _to_millis_from_date,
)


SERVICE_NAME = "point_sync"
STATUS_PENDING = "PENDING"
STATUS_RUNNING = "RUNNING"
STATUS_COMPLETED = "COMPLETED"
STATUS_FAILED = "FAILED"
SYNC_ACTOR = "system_sync_solides_point"
MAX_SYNC_WORKERS = max(2, int(os.getenv("POINT_SYNC_MAX_WORKERS", os.getenv("SOLIDES_SYNC_MAX_WORKERS", "6"))))
STAGE_DISCOVERING_EMPLOYEES = "DISCOVERING_EMPLOYEES"
STAGE_SYNCING_DAILY_ACTIVITY = "SYNCING_DAILY_ACTIVITY"
STAGE_SYNCING_BALANCES_AND_SIGNATURES = "SYNCING_BALANCES_AND_SIGNATURES"
STAGE_PERSISTING_DATA = "PERSISTING_DATA"
STAGE_FINALIZING = "FINALIZING"


def _build_artifact_storage_key(window_start: str, window_end: str, extension: str) -> str:
    prefix = (_clean(os.getenv("AWS_S3_PREFIX")) or "ponto").strip("/")
    stamp = _now_iso().replace(":", "-").replace(".", "-")
    return f"{prefix}/point-sync/{window_start}_{window_end}/{stamp}-espelho-solides.{extension}"


def _bulk_execute(db: DatabaseManager, statements: List[Tuple[str, Tuple[Any, ...]]]):
    if not statements:
        return
    conn = db.get_connection()
    try:
        for sql, params in statements:
            conn.execute(sql, params)
        if not db.use_turso:
            conn.commit()
    finally:
        conn.close()


def _safe_execute(db: DatabaseManager, sql: str, params=()):
    try:
        _execute(db, sql, params)
    except Exception as exc:
        message = _clean(exc)
        if "Duplicate column name" in message or "duplicate column name" in message:
            return
        raise


def _normalize_match_text(value: Any) -> str:
    return (
        unicodedata.normalize("NFD", _clean(value))
        .encode("ascii", "ignore")
        .decode("ascii")
        .upper()
    )


def _get_progress_stage_weight_bounds(stage: Optional[str]) -> Tuple[float, float]:
    bounds = {
        STAGE_DISCOVERING_EMPLOYEES: (0.02, 0.10),
        STAGE_SYNCING_DAILY_ACTIVITY: (0.10, 0.78),
        STAGE_SYNCING_BALANCES_AND_SIGNATURES: (0.78, 0.90),
        STAGE_PERSISTING_DATA: (0.90, 0.98),
        STAGE_FINALIZING: (0.98, 1.00),
    }
    return bounds.get(_clean(stage), (0.0, 1.0))


def _compute_progress_percent(stage: Optional[str], processed_employees: int, total_employees: int) -> float:
    stage_key = _clean(stage)
    if stage_key == STAGE_FINALIZING:
        return 100.0
    start_weight, end_weight = _get_progress_stage_weight_bounds(stage_key)
    if total_employees <= 0:
        return round(start_weight * 100, 2)
    ratio = min(1.0, max(0.0, processed_employees / float(total_employees)))
    return round((start_weight + ((end_weight - start_weight) * ratio)) * 100, 2)


def _estimate_remaining_seconds(started_at: Optional[str], processed_employees: int, total_employees: int) -> Optional[int]:
    if processed_employees <= 1 or total_employees <= processed_employees:
        return None
    started_dt = datetime.fromisoformat(str(started_at).replace("Z", "+00:00")) if started_at else None
    if started_dt is None:
        return None
    elapsed = (datetime.now(timezone.utc) - started_dt).total_seconds()
    if elapsed <= 0:
        return None
    average_per_employee = elapsed / float(processed_employees)
    remaining_employees = max(0, total_employees - processed_employees)
    estimate = int(round(average_per_employee * remaining_employees))
    return estimate if estimate > 0 else None


def _ensure_tables(db: DatabaseManager):
    _execute(
        db,
        """
        CREATE TABLE IF NOT EXISTS point_sync_jobs (
          id VARCHAR(64) PRIMARY KEY,
          window_start DATE NOT NULL,
          window_end DATE NOT NULL,
          status VARCHAR(20) NOT NULL,
          requested_by VARCHAR(64) NULL,
          error_message LONGTEXT NULL,
          created_at VARCHAR(32) NOT NULL,
          started_at VARCHAR(32) NULL,
          finished_at VARCHAR(32) NULL
        )
        """,
    )
    _execute(
        db,
        """
        CREATE TABLE IF NOT EXISTS point_sync_runs (
          id VARCHAR(64) PRIMARY KEY,
          job_id VARCHAR(64) NULL,
          status VARCHAR(20) NOT NULL,
          source_label VARCHAR(120) NOT NULL,
          window_start DATE NOT NULL,
          window_end DATE NOT NULL,
          total_employees INTEGER NOT NULL DEFAULT 0,
          processed_employees INTEGER NOT NULL DEFAULT 0,
          processed_days INTEGER NOT NULL DEFAULT 0,
          current_stage VARCHAR(40) NULL,
          progress_percent DECIMAL(5,2) NULL,
          last_progress_at VARCHAR(32) NULL,
          estimated_remaining_seconds INTEGER NULL,
          synchronized_employees INTEGER NOT NULL DEFAULT 0,
          synchronized_days INTEGER NOT NULL DEFAULT 0,
          unmatched_employees INTEGER NOT NULL DEFAULT 0,
          pending_adjustments INTEGER NOT NULL DEFAULT 0,
          pending_signatures INTEGER NOT NULL DEFAULT 0,
          details LONGTEXT NULL,
          started_at VARCHAR(32) NULL,
          finished_at VARCHAR(32) NULL,
          created_at VARCHAR(32) NOT NULL
        )
        """,
    )
    _execute(
        db,
        """
        CREATE TABLE IF NOT EXISTS point_daily (
          id VARCHAR(64) PRIMARY KEY,
          employee_id VARCHAR(64) NULL,
          solides_employee_id VARCHAR(80) NULL,
          employee_code VARCHAR(120) NULL,
          employee_name VARCHAR(180) NOT NULL,
          employee_cpf VARCHAR(14) NULL,
          point_date DATE NOT NULL,
          department VARCHAR(180) NULL,
          schedule_label VARCHAR(180) NULL,
          schedule_start VARCHAR(10) NULL,
          schedule_end VARCHAR(10) NULL,
          marks_json LONGTEXT NULL,
          raw_day_text TEXT NULL,
          planned_minutes INTEGER NOT NULL DEFAULT 0,
          worked_minutes INTEGER NOT NULL DEFAULT 0,
          late_minutes INTEGER NOT NULL DEFAULT 0,
          day_balance_minutes INTEGER NOT NULL DEFAULT 0,
          break_minutes INTEGER NOT NULL DEFAULT 0,
          expected_break_minutes INTEGER NOT NULL DEFAULT 0,
          break_overrun_minutes INTEGER NOT NULL DEFAULT 0,
          pending_adjustments_count INTEGER NOT NULL DEFAULT 0,
          absence_flag INTEGER NOT NULL DEFAULT 0,
          inconsistency_flag INTEGER NOT NULL DEFAULT 0,
          justification_text TEXT NULL,
          source_payload_json LONGTEXT NULL,
          last_sync_run_id VARCHAR(64) NULL,
          created_at VARCHAR(32) NOT NULL,
          updated_at VARCHAR(32) NOT NULL
        )
        """,
    )
    _execute(
        db,
        """
        CREATE TABLE IF NOT EXISTS point_occurrences (
          id VARCHAR(64) PRIMARY KEY,
          employee_id VARCHAR(64) NULL,
          solides_employee_id VARCHAR(80) NULL,
          employee_name VARCHAR(180) NOT NULL,
          employee_cpf VARCHAR(14) NULL,
          occurrence_type VARCHAR(30) NOT NULL,
          date_start DATE NOT NULL,
          date_end DATE NULL,
          effect_code VARCHAR(40) NULL,
          notes TEXT NULL,
          source_payload_json LONGTEXT NULL,
          last_sync_run_id VARCHAR(64) NULL,
          created_at VARCHAR(32) NOT NULL,
          updated_at VARCHAR(32) NOT NULL
        )
        """,
    )
    _execute(
        db,
        """
        CREATE TABLE IF NOT EXISTS point_hours_balance_monthly (
          id VARCHAR(64) PRIMARY KEY,
          reference_month VARCHAR(7) NOT NULL,
          employee_id VARCHAR(64) NULL,
          solides_employee_id VARCHAR(80) NULL,
          employee_name VARCHAR(180) NOT NULL,
          employee_cpf VARCHAR(14) NULL,
          balance_minutes INTEGER NOT NULL DEFAULT 0,
          reference_start DATE NULL,
          reference_end DATE NULL,
          source_payload_json LONGTEXT NULL,
          last_sync_run_id VARCHAR(64) NULL,
          created_at VARCHAR(32) NOT NULL,
          updated_at VARCHAR(32) NOT NULL
        )
        """,
    )
    _execute(
        db,
        """
        CREATE TABLE IF NOT EXISTS point_signature_monthly (
          id VARCHAR(64) PRIMARY KEY,
          reference_month VARCHAR(7) NOT NULL,
          employee_id VARCHAR(64) NULL,
          solides_employee_id VARCHAR(80) NULL,
          employee_name VARCHAR(180) NOT NULL,
          employee_cpf VARCHAR(14) NULL,
          status VARCHAR(30) NOT NULL,
          document_type VARCHAR(120) NULL,
          document_date DATE NULL,
          start_date DATE NULL,
          end_date DATE NULL,
          signed_at VARCHAR(32) NULL,
          message TEXT NULL,
          source_payload_json LONGTEXT NULL,
          last_sync_run_id VARCHAR(64) NULL,
          created_at VARCHAR(32) NOT NULL,
          updated_at VARCHAR(32) NOT NULL
        )
        """,
    )
    _execute(
        db,
        """
        CREATE TABLE IF NOT EXISTS point_artifacts (
          id VARCHAR(64) PRIMARY KEY,
          sync_run_id VARCHAR(64) NULL,
          artifact_type VARCHAR(40) NOT NULL,
          file_name VARCHAR(255) NOT NULL,
          mime_type VARCHAR(120) NOT NULL,
          size_bytes BIGINT NOT NULL,
          storage_provider VARCHAR(30) NOT NULL,
          storage_bucket VARCHAR(120) NULL,
          storage_key VARCHAR(255) NOT NULL,
          window_start DATE NOT NULL,
          window_end DATE NOT NULL,
          created_at VARCHAR(32) NOT NULL
        )
        """,
    )
    _safe_execute(db, "ALTER TABLE point_sync_runs ADD COLUMN total_employees INTEGER NOT NULL DEFAULT 0")
    _safe_execute(db, "ALTER TABLE point_sync_runs ADD COLUMN processed_employees INTEGER NOT NULL DEFAULT 0")
    _safe_execute(db, "ALTER TABLE point_sync_runs ADD COLUMN processed_days INTEGER NOT NULL DEFAULT 0")
    _safe_execute(db, "ALTER TABLE point_sync_runs ADD COLUMN current_stage VARCHAR(40) NULL")
    _safe_execute(db, "ALTER TABLE point_sync_runs ADD COLUMN progress_percent DECIMAL(5,2) NULL")
    _safe_execute(db, "ALTER TABLE point_sync_runs ADD COLUMN last_progress_at VARCHAR(32) NULL")
    _safe_execute(db, "ALTER TABLE point_sync_runs ADD COLUMN estimated_remaining_seconds INTEGER NULL")


def _get_pending_job(db: DatabaseManager) -> Optional[Dict[str, Any]]:
    rows = db.execute_query(
        """
        SELECT
          j.id,
          j.window_start,
          j.window_end,
          j.requested_by,
          r.id AS run_id
        FROM point_sync_jobs j
        LEFT JOIN point_sync_runs r ON r.job_id = j.id
        WHERE j.status = ?
        ORDER BY j.created_at ASC
        LIMIT 1
        """,
        (STATUS_PENDING,),
    ) or []
    if not rows:
      return None
    row = rows[0]
    if isinstance(row, dict):
      return {
          "id": _clean(row.get("id")),
          "window_start": _clean(row.get("window_start")),
          "window_end": _clean(row.get("window_end")),
          "requested_by": _clean(row.get("requested_by")) or "system_status",
          "run_id": _clean(row.get("run_id")),
      }
    return {
        "id": _clean(row[0]),
        "window_start": _clean(row[1]),
        "window_end": _clean(row[2]),
        "requested_by": _clean(row[3]) or "system_status",
        "run_id": _clean(row[4]),
    }


def _mark_job_running(db: DatabaseManager, job_id: str):
    now = _now_iso()
    _execute(
        db,
        "UPDATE point_sync_jobs SET status = ?, error_message = NULL, started_at = ?, finished_at = NULL WHERE id = ?",
        (STATUS_RUNNING, now, job_id),
    )


def _mark_job_done(db: DatabaseManager, job_id: str, status: str, error_message: Optional[str] = None):
    now = _now_iso()
    _execute(
        db,
        "UPDATE point_sync_jobs SET status = ?, error_message = ?, finished_at = ? WHERE id = ?",
        (status, _clean(error_message) or None, now, job_id),
    )


def _mark_run_running(db: DatabaseManager, run_id: Optional[str], details: Optional[str] = None):
    if not run_id:
        return
    now = _now_iso()
    _execute(
        db,
        """
        UPDATE point_sync_runs
        SET status = ?, details = ?, started_at = ?, finished_at = NULL,
            current_stage = ?, progress_percent = 0, last_progress_at = ?, estimated_remaining_seconds = NULL
        WHERE id = ?
        """,
        (STATUS_RUNNING, details, now, STAGE_DISCOVERING_EMPLOYEES, now, run_id),
    )


def _update_run_progress(
    db: DatabaseManager,
    run_id: Optional[str],
    started_at: Optional[str],
    stage: str,
    details: Optional[str],
    total_employees: int,
    processed_employees: int,
    processed_days: int,
    synchronized_employees: int = 0,
    synchronized_days: int = 0,
    unmatched_employees: int = 0,
    pending_adjustments: int = 0,
    pending_signatures: int = 0,
):
    if not run_id:
        return
    now = _now_iso()
    progress_percent = _compute_progress_percent(stage, processed_employees, total_employees)
    estimated_remaining_seconds = _estimate_remaining_seconds(started_at, processed_employees, total_employees)
    _execute(
        db,
        """
        UPDATE point_sync_runs
        SET details = ?, total_employees = ?, processed_employees = ?, processed_days = ?,
            current_stage = ?, progress_percent = ?, last_progress_at = ?, estimated_remaining_seconds = ?,
            synchronized_employees = ?, synchronized_days = ?, unmatched_employees = ?,
            pending_adjustments = ?, pending_signatures = ?
        WHERE id = ?
        """,
        (
            details,
            total_employees,
            processed_employees,
            processed_days,
            stage,
            progress_percent,
            now,
            estimated_remaining_seconds,
            synchronized_employees,
            synchronized_days,
            unmatched_employees,
            pending_adjustments,
            pending_signatures,
            run_id,
        ),
    )


def _mark_run_done(
    db: DatabaseManager,
    run_id: Optional[str],
    status: str,
    details: Optional[str],
    synchronized_employees: int = 0,
    synchronized_days: int = 0,
    unmatched_employees: int = 0,
    pending_adjustments: int = 0,
    pending_signatures: int = 0,
    total_employees: Optional[int] = None,
    processed_employees: Optional[int] = None,
    processed_days: Optional[int] = None,
):
    if not run_id:
        return
    now = _now_iso()
    final_progress = 100.0 if status == STATUS_COMPLETED else None
    _execute(
        db,
        """
        UPDATE point_sync_runs
        SET status = ?, details = ?, synchronized_employees = ?, synchronized_days = ?,
            unmatched_employees = ?, pending_adjustments = ?, pending_signatures = ?,
            total_employees = COALESCE(?, total_employees),
            processed_employees = COALESCE(?, processed_employees),
            processed_days = COALESCE(?, processed_days),
            current_stage = ?, progress_percent = COALESCE(?, progress_percent),
            last_progress_at = ?, estimated_remaining_seconds = NULL, finished_at = ?
        WHERE id = ?
        """,
        (
            status,
            details,
            synchronized_employees,
            synchronized_days,
            unmatched_employees,
            pending_adjustments,
            pending_signatures,
            total_employees,
            processed_employees,
            processed_days,
            STAGE_FINALIZING if status == STATUS_COMPLETED else None,
            final_progress,
            now,
            now,
            run_id,
        ),
    )


def _list_month_windows(start_date: str, end_date: str) -> List[Tuple[str, str, str]]:
    items: List[Tuple[str, str, str]] = []
    cursor = datetime.strptime(start_date[:7] + "-01", "%Y-%m-%d")
    last = datetime.strptime(end_date[:7] + "-01", "%Y-%m-%d")
    while cursor <= last:
        month_ref = cursor.strftime("%Y-%m")
        next_cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)
        month_start = max(start_date, cursor.date().isoformat())
        month_end = min(end_date, (next_cursor - timedelta(days=1)).date().isoformat())
        items.append((month_ref, month_start, month_end))
        cursor = next_cursor
    return items


def _replace_point_rows(db: DatabaseManager, window_start: str, window_end: str, point_rows: List[Dict[str, Any]]):
    now = _now_iso()
    statements: List[Tuple[str, Tuple[Any, ...]]] = [
        ("DELETE FROM point_daily WHERE point_date >= ? AND point_date <= ?", (window_start, window_end))
    ]
    for row in point_rows:
        statements.append((
            """
            INSERT INTO point_daily (
              id, employee_id, solides_employee_id, employee_code, employee_name, employee_cpf, point_date,
              department, schedule_label, schedule_start, schedule_end, marks_json, raw_day_text,
              planned_minutes, worked_minutes, late_minutes, day_balance_minutes, break_minutes, expected_break_minutes, break_overrun_minutes,
              pending_adjustments_count, absence_flag, inconsistency_flag, justification_text, source_payload_json, last_sync_run_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["id"],
                row.get("employee_id"),
                row.get("solides_employee_id"),
                row.get("employee_code"),
                row["employee_name"],
                row.get("employee_cpf"),
                row["point_date"],
                row.get("department"),
                row.get("schedule_label"),
                row.get("schedule_start"),
                row.get("schedule_end"),
                _safe_json(row.get("marks") or []),
                row.get("raw_day_text"),
                row.get("planned_minutes", 0),
                row.get("worked_minutes", 0),
                row.get("late_minutes", 0),
                row.get("day_balance_minutes", 0),
                row.get("break_minutes", 0),
                row.get("expected_break_minutes", 0),
                row.get("break_overrun_minutes", 0),
                row.get("pending_adjustments_count", 0),
                1 if row.get("absence_flag") else 0,
                1 if row.get("inconsistency_flag") else 0,
                row.get("justification_text"),
                row.get("source_payload_json"),
                row.get("sync_run_id"),
                now,
                now,
            ),
        ))
    _bulk_execute(db, statements)


def _replace_occurrences(db: DatabaseManager, window_start: str, window_end: str, rows: List[Dict[str, Any]]):
    now = _now_iso()
    statements: List[Tuple[str, Tuple[Any, ...]]] = [(
        """
        DELETE FROM point_occurrences
        WHERE date_start <= ?
          AND COALESCE(date_end, date_start) >= ?
        """,
        (window_end, window_start),
    )]
    for row in rows:
        statements.append((
            """
            INSERT INTO point_occurrences (
              id, employee_id, solides_employee_id, employee_name, employee_cpf, occurrence_type,
              date_start, date_end, effect_code, notes, source_payload_json, last_sync_run_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["id"],
                row.get("employee_id"),
                row.get("solides_employee_id"),
                row["employee_name"],
                row.get("employee_cpf"),
                row["occurrence_type"],
                row["date_start"],
                row.get("date_end"),
                row.get("effect_code"),
                row.get("notes"),
                row.get("source_payload_json"),
                row.get("last_sync_run_id"),
                now,
                now,
            ),
        ))
    _bulk_execute(db, statements)


def _replace_hours_balance(db: DatabaseManager, month_refs: List[str], rows: List[Dict[str, Any]]):
    statements: List[Tuple[str, Tuple[Any, ...]]] = []
    if month_refs:
        placeholders = ", ".join(["?"] * len(month_refs))
        statements.append((f"DELETE FROM point_hours_balance_monthly WHERE reference_month IN ({placeholders})", tuple(month_refs)))
    now = _now_iso()
    for row in rows:
        statements.append((
            """
            INSERT INTO point_hours_balance_monthly (
              id, reference_month, employee_id, solides_employee_id, employee_name, employee_cpf,
              balance_minutes, reference_start, reference_end, source_payload_json, last_sync_run_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["id"],
                row["reference_month"],
                row.get("employee_id"),
                row.get("solides_employee_id"),
                row["employee_name"],
                row.get("employee_cpf"),
                row.get("balance_minutes", 0),
                row.get("reference_start"),
                row.get("reference_end"),
                row.get("source_payload_json"),
                row.get("last_sync_run_id"),
                now,
                now,
            ),
        ))
    _bulk_execute(db, statements)


def _replace_signatures(db: DatabaseManager, month_refs: List[str], rows: List[Dict[str, Any]]):
    statements: List[Tuple[str, Tuple[Any, ...]]] = []
    if month_refs:
        placeholders = ", ".join(["?"] * len(month_refs))
        statements.append((f"DELETE FROM point_signature_monthly WHERE reference_month IN ({placeholders})", tuple(month_refs)))
    now = _now_iso()
    for row in rows:
        statements.append((
            """
            INSERT INTO point_signature_monthly (
              id, reference_month, employee_id, solides_employee_id, employee_name, employee_cpf,
              status, document_type, document_date, start_date, end_date, signed_at, message,
              source_payload_json, last_sync_run_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["id"],
                row["reference_month"],
                row.get("employee_id"),
                row.get("solides_employee_id"),
                row["employee_name"],
                row.get("employee_cpf"),
                row.get("status"),
                row.get("document_type"),
                row.get("document_date"),
                row.get("start_date"),
                row.get("end_date"),
                row.get("signed_at"),
                row.get("message"),
                row.get("source_payload_json"),
                row.get("last_sync_run_id"),
                now,
                now,
            ),
        ))
    _bulk_execute(db, statements)


def _persist_timesheet_artifact(
    db: DatabaseManager,
    sync_run_id: Optional[str],
    requested_by: str,
    window_start: str,
    window_end: str,
    artifact: Dict[str, Any],
):
    content = artifact.get("content") or b""
    if not content:
        return None
    content_type = _clean(artifact.get("content_type")) or "application/octet-stream"
    extension = _infer_extension_from_content_type(content_type)
    file_name = _clean(artifact.get("file_name")) or f"espelho-solides.{extension}"
    storage_key = _build_artifact_storage_key(window_start, window_end, extension)
    upload = upload_s3_object_bytes(
        storage_key,
        content,
        content_type,
        metadata={"syncRunId": sync_run_id or "", "artifactType": "TIMESHEET_REPORT", "requestedBy": requested_by or SYNC_ACTOR},
    )
    artifact_id = str(uuid.uuid4())
    _execute(
        db,
        """
        INSERT INTO point_artifacts (
          id, sync_run_id, artifact_type, file_name, mime_type, size_bytes,
          storage_provider, storage_bucket, storage_key, window_start, window_end, created_at
        ) VALUES (?, ?, 'TIMESHEET_REPORT', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            artifact_id,
            sync_run_id,
            file_name,
            content_type,
            len(content),
            upload.get("provider"),
            upload.get("bucket"),
            upload.get("key"),
            window_start,
            window_end,
            _now_iso(),
        ),
    )
    return {"id": artifact_id, "file_name": file_name, "size_bytes": len(content)}


def _sync_linked_employee(
    job: Dict[str, Any],
    remote_employee: Dict[str, Any],
    local_employee: Dict[str, Any],
    work_schedule: Optional[Dict[str, Any]],
    month_windows: List[Tuple[str, str, str]],
):
    client = SolidesClient()
    window_start = job["window_start"]
    window_end = job["window_end"]
    linked_id = _clean(local_employee.get("solides_employee_id"))
    start_ms = _to_millis_from_date(window_start)
    end_ms = _to_millis_from_date(window_end, end_of_day=True)
    adjustments = client.get_adjustments(linked_id, start_ms, end_ms)
    adjustment_maps = _build_adjustment_maps(adjustments)
    daily_activity = client.get_daily_activity(linked_id, start_ms, end_ms)
    point_rows = _build_daily_rows_for_employee(
        window_start,
        window_end,
        remote_employee,
        local_employee,
        work_schedule,
        daily_activity,
        adjustment_maps,
        job.get("run_id"),
    )

    hours_balance_rows: List[Dict[str, Any]] = []
    for month_ref, month_start, month_end in month_windows:
        month_start_ms = _to_millis_from_date(month_start)
        month_end_ms = _to_millis_from_date(month_end, end_of_day=True)
        hours_balance = client.get_hours_balance(linked_id, _clean(remote_employee.get("externalId")) or None, month_start_ms, month_end_ms)
        if not hours_balance:
            continue
        hours_balance_rows.append(
            {
                "id": str(uuid.uuid4()),
                "reference_month": month_ref,
                "employee_id": local_employee["id"],
                "solides_employee_id": linked_id,
                "employee_name": local_employee["full_name"],
                "employee_cpf": local_employee["cpf"],
                "balance_minutes": _ensure_int(hours_balance.get("hoursBalanceInMinutes")),
                "reference_start": month_start,
                "reference_end": month_end,
                "source_payload_json": _safe_json(hours_balance),
                "last_sync_run_id": job.get("run_id"),
            }
        )

    occurrence_rows = _build_occurrence_rows(
        window_start,
        window_end,
        linked_id,
        remote_employee,
        local_employee,
        adjustments,
        job.get("run_id"),
    )

    try:
        signature_payload = client.get_last_signature(linked_id)
    except Exception as exc:
        signature_payload = None
        print(f"[point_sync] aviso ao consultar assinatura do colaborador {linked_id}: {exc}")

    signature_rows: List[Dict[str, Any]] = []
    signature_row = _build_signature_row(window_start, window_end, remote_employee, local_employee, signature_payload or {})
    if signature_row:
        reference_month = _derive_signature_reference_month(signature_row, window_end)
        if reference_month in {item[0] for item in month_windows}:
            signature_row["reference_month"] = reference_month
            signature_row["last_sync_run_id"] = job.get("run_id")
            signature_rows.append(signature_row)

    return {
        "linked_id": linked_id,
        "point_rows": point_rows,
        "hours_balance_rows": hours_balance_rows,
        "occurrence_rows": occurrence_rows,
        "signature_rows": signature_rows,
        "pending_adjustments": adjustment_maps["pending_count"],
        "pending_signatures": sum(1 for item in signature_rows if item["status"] in ("PENDENTE", "PROCESSANDO")),
    }


def _sync_unmatched_remote_employee(job: Dict[str, Any], remote_employee: Dict[str, Any], work_schedule: Optional[Dict[str, Any]]):
    client = SolidesClient()
    window_start = job["window_start"]
    window_end = job["window_end"]
    remote_id = _clean(remote_employee.get("id"))
    start_ms = _to_millis_from_date(window_start)
    end_ms = _to_millis_from_date(window_end, end_of_day=True)
    daily_activity = client.get_daily_activity(remote_id, start_ms, end_ms)
    if not daily_activity:
        return []
    return _build_daily_rows_for_employee(
        window_start,
        window_end,
        remote_employee,
        None,
        work_schedule,
        daily_activity,
        {"pending_by_date": {}},
        job.get("run_id"),
    )


def _build_occurrence_rows(
    window_start: str,
    window_end: str,
    linked_id: str,
    remote_employee: Dict[str, Any],
    local_employee: Optional[Dict[str, Any]],
    adjustments: List[Dict[str, Any]],
    sync_run_id: Optional[str],
) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for adjustment in adjustments or []:
        status = _clean(adjustment.get("status")).upper()
        if status != "APROVADO":
            continue
        start_date = _parse_date(adjustment.get("startDate")) or _parse_date(adjustment.get("recordDate"))
        end_date = _parse_date(adjustment.get("endDate")) or start_date
        if not start_date:
            continue
        if end_date and end_date < window_start:
            continue
        if start_date > window_end:
            continue
        combined = " ".join(
            filter(
                None,
                [
                    _normalize_match_text(adjustment.get("type")),
                    _normalize_match_text(adjustment.get("reason")),
                    _normalize_match_text(adjustment.get("adjustmentReason")),
                    _normalize_match_text(adjustment.get("justification")),
                ],
            )
        )
        if "FER" in combined:
            occurrence_type = "FERIAS"
        elif "ATEST" in combined:
            occurrence_type = "ATESTADO"
        elif "DECLAR" in combined:
            occurrence_type = "DECLARACAO"
        elif "FALTA" in combined:
            occurrence_type = "AUSENCIA_AUTORIZADA"
        else:
            occurrence_type = "AJUSTE_BATIDA"
        items.append(
            {
                "id": str(uuid.uuid4()),
                "employee_id": (local_employee or {}).get("id"),
                "solides_employee_id": linked_id,
                "employee_name": (local_employee or {}).get("full_name") or _clean(remote_employee.get("name")) or "Sem nome",
                "employee_cpf": (local_employee or {}).get("cpf") or _normalize_cpf(remote_employee.get("cpf")),
                "occurrence_type": occurrence_type,
                "date_start": start_date,
                "date_end": end_date or start_date,
                "effect_code": status,
                "notes": _clean(adjustment.get("reason")) or _clean(adjustment.get("justification")) or None,
                "source_payload_json": _safe_json(adjustment),
                "last_sync_run_id": sync_run_id,
            }
        )
    return items


def _derive_signature_reference_month(signature_row: Dict[str, Any], fallback_date: str) -> str:
    return (
        (_parse_date(signature_row.get("document_date")) or "")[:7]
        or (_parse_date(signature_row.get("start_date")) or "")[:7]
        or (_parse_date(signature_row.get("end_date")) or "")[:7]
        or fallback_date[:7]
    )


def _process_job(db: DatabaseManager, job: Dict[str, Any]):
    client = SolidesClient()
    window_start = job["window_start"]
    window_end = job["window_end"]
    started_at = _now_iso()
    db.update_heartbeat(SERVICE_NAME, STATUS_RUNNING, f"job={job['id']} janela={window_start}..{window_end}")
    _mark_run_running(db, job.get("run_id"), "Sincronização da base de ponto com a API da Sólides em andamento.")
    _update_run_progress(
        db,
        job.get("run_id"),
        started_at,
        STAGE_DISCOVERING_EMPLOYEES,
        "Carregando colaboradores, escalas e vínculos da Sólides.",
        0,
        0,
        0,
    )

    start_ms = _to_millis_from_date(window_start)
    end_ms = _to_millis_from_date(window_end, end_of_day=True)
    month_windows = _list_month_windows(window_start, window_end)
    month_refs = [item[0] for item in month_windows]
    local_employees = _load_local_employees(db, window_start, window_end)
    local_lookup = _build_local_lookup(local_employees)
    work_schedules = client.list_work_schedules()

    remote_employees = client.list_employees()
    remote_employees_by_id = _build_remote_employees_by_id(remote_employees)
    auto_linked_employees = 0
    for remote_employee in remote_employees:
        local_employee = _resolve_local_employee(remote_employee, local_lookup)
        if local_employee is None:
            continue
        if _persist_local_employee_link(db, local_employee, remote_employee, local_lookup):
            auto_linked_employees += 1

    point_rows: List[Dict[str, Any]] = []
    hours_balance_rows: List[Dict[str, Any]] = []
    signature_rows: List[Dict[str, Any]] = []
    occurrence_rows: List[Dict[str, Any]] = []
    sync_warnings: List[str] = []

    synchronized_employee_keys = set()
    unmatched_local_links = []
    pending_adjustments = 0
    pending_signatures = 0
    processed_employees = 0

    ged_signature_enabled = None
    try:
        signature_params = client.get_signature_params() or {}
        ged_signature_enabled = signature_params.get("gedSignature")
    except Exception:
        ged_signature_enabled = None

    linked_sync_inputs = []
    for local_employee in local_employees:
        linked_id = _clean(local_employee.get("solides_employee_id"))
        if not linked_id:
            continue
        remote_employee = remote_employees_by_id.get(linked_id)
        if remote_employee is None:
            unmatched_local_links.append(local_employee)
            continue
        schedule_ref = remote_employee.get("currentWorkSchedule") or {}
        schedule_id = _clean(schedule_ref.get("id"))
        work_schedule = work_schedules.get(schedule_id) if schedule_id else None
        synchronized_employee_keys.add(linked_id)
        linked_sync_inputs.append((remote_employee, local_employee, work_schedule))

    total_employees = len(linked_sync_inputs)
    _update_run_progress(
        db,
        job.get("run_id"),
        started_at,
        STAGE_SYNCING_DAILY_ACTIVITY,
        f"Sincronizando ponto diário de 0 de {total_employees} colaborador(es).",
        total_employees,
        0,
        0,
    )

    with ThreadPoolExecutor(max_workers=MAX_SYNC_WORKERS) as executor:
        future_map = {
            executor.submit(_sync_linked_employee, job, remote_employee, local_employee, work_schedule, month_windows): (remote_employee, local_employee)
            for remote_employee, local_employee, work_schedule in linked_sync_inputs
        }
        for future in as_completed(future_map):
            remote_employee, local_employee = future_map[future]
            linked_id = _clean(local_employee.get("solides_employee_id"))
            try:
                result = future.result()
            except Exception as exc:
                raise RuntimeError(f"Falha ao sincronizar colaborador {linked_id} ({_clean(remote_employee.get('name'))}): {exc}") from exc
            point_rows.extend(result["point_rows"])
            hours_balance_rows.extend(result["hours_balance_rows"])
            occurrence_rows.extend(result["occurrence_rows"])
            signature_rows.extend(result["signature_rows"])
            pending_adjustments += result["pending_adjustments"]
            pending_signatures += result["pending_signatures"]
            processed_employees += 1
            _update_run_progress(
                db,
                job.get("run_id"),
                started_at,
                STAGE_SYNCING_DAILY_ACTIVITY,
                f"Sincronizando ponto diário de {processed_employees} de {total_employees} colaborador(es).",
                total_employees,
                processed_employees,
                len(point_rows),
                synchronized_employees=processed_employees,
                synchronized_days=len(point_rows),
                unmatched_employees=len(unmatched_local_links),
                pending_adjustments=pending_adjustments,
                pending_signatures=pending_signatures,
            )

    unmatched_remote_inputs = []
    for remote_employee in remote_employees:
        remote_id = _clean(remote_employee.get("id"))
        if not remote_id or remote_id in synchronized_employee_keys:
            continue
        local_employee = _resolve_local_employee(remote_employee, local_lookup)
        if local_employee is not None:
            continue
        schedule_ref = remote_employee.get("currentWorkSchedule") or {}
        schedule_id = _clean(schedule_ref.get("id"))
        work_schedule = work_schedules.get(schedule_id) if schedule_id else None
        unmatched_remote_inputs.append((remote_employee, work_schedule))

    _update_run_progress(
        db,
        job.get("run_id"),
        started_at,
        STAGE_SYNCING_BALANCES_AND_SIGNATURES,
        "Consolidando banco de horas, assinaturas e registros sem vínculo local.",
        total_employees,
        processed_employees,
        len(point_rows),
        synchronized_employees=processed_employees,
        synchronized_days=len(point_rows),
        unmatched_employees=len(unmatched_local_links),
        pending_adjustments=pending_adjustments,
        pending_signatures=pending_signatures,
    )
    if unmatched_remote_inputs:
        with ThreadPoolExecutor(max_workers=MAX_SYNC_WORKERS) as executor:
            future_map = {
                executor.submit(_sync_unmatched_remote_employee, job, remote_employee, work_schedule): remote_employee
                for remote_employee, work_schedule in unmatched_remote_inputs
            }
            for future in as_completed(future_map):
                remote_employee = future_map[future]
                try:
                    rows = future.result()
                except Exception as exc:
                    raise RuntimeError(f"Falha ao sincronizar colaborador sem vínculo {_clean(remote_employee.get('id'))} ({_clean(remote_employee.get('name'))}): {exc}") from exc
                point_rows.extend(rows)

    _update_run_progress(
        db,
        job.get("run_id"),
        started_at,
        STAGE_PERSISTING_DATA,
        "Persistindo os dados sincronizados no painel.",
        total_employees,
        processed_employees,
        len(point_rows),
        synchronized_employees=processed_employees,
        synchronized_days=len(point_rows),
        unmatched_employees=len(unmatched_local_links),
        pending_adjustments=pending_adjustments,
        pending_signatures=pending_signatures,
    )
    _replace_point_rows(db, window_start, window_end, point_rows)
    _replace_hours_balance(db, month_refs, hours_balance_rows)
    _replace_signatures(db, month_refs, signature_rows)
    _replace_occurrences(db, window_start, window_end, occurrence_rows)

    try:
        timesheet_artifact = client.fetch_timesheet_report(window_start, window_end)
        if timesheet_artifact:
            persisted_artifact = _persist_timesheet_artifact(
                db,
                job.get("run_id"),
                job.get("requested_by") or SYNC_ACTOR,
                window_start,
                window_end,
                timesheet_artifact,
            )
            if persisted_artifact:
                sync_warnings.append(f"Espelho oficial disponível: {persisted_artifact['file_name']}.")
    except Exception as exc:
        sync_warnings.append(f"Espelho oficial indisponível nesta execução: {exc}")

    remote_unmatched_keys = {
        f"{item.get('solides_employee_id')}::{item.get('employee_name')}::{item.get('employee_cpf')}"
        for item in point_rows
        if not item.get("employee_id")
    }
    unmatched_count = len(unmatched_local_links) + len(remote_unmatched_keys)
    details_parts = [
        f"{len(point_rows)} registro(s) diário(s) sincronizado(s).",
        f"{len(hours_balance_rows)} snapshot(s) de banco de horas.",
        f"{len(signature_rows)} registro(s) de assinatura.",
        f"{len(occurrence_rows)} ocorrência(s) sincronizada(s).",
    ]
    if auto_linked_employees:
        details_parts.append(f"{auto_linked_employees} vínculo(s) com a Sólides atualizado(s) automaticamente por CPF.")
    if unmatched_local_links:
        sample_names = ", ".join(item["full_name"] for item in unmatched_local_links[:5])
        details_parts.append(f"Vínculos Sólides sem retorno: {len(unmatched_local_links)} ({sample_names}).")
    if ged_signature_enabled is False:
        details_parts.append("Assinatura digital desabilitada no empregador; estado mantido apenas como informativo.")
    details_parts.extend(sync_warnings[:2])
    details = " ".join(details_parts)

    _update_run_progress(
        db,
        job.get("run_id"),
        started_at,
        STAGE_FINALIZING,
        "Finalizando a sincronização da base de ponto.",
        total_employees,
        processed_employees,
        len(point_rows),
        synchronized_employees=processed_employees,
        synchronized_days=len(point_rows),
        unmatched_employees=unmatched_count,
        pending_adjustments=pending_adjustments,
        pending_signatures=pending_signatures,
    )
    _mark_job_done(db, job["id"], STATUS_COMPLETED)
    _mark_run_done(
        db,
        job.get("run_id"),
        STATUS_COMPLETED,
        details,
        synchronized_employees=len(synchronized_employee_keys),
        synchronized_days=len(point_rows),
        unmatched_employees=unmatched_count,
        pending_adjustments=pending_adjustments,
        pending_signatures=pending_signatures,
        total_employees=total_employees,
        processed_employees=processed_employees,
        processed_days=len(point_rows),
    )
    db.update_heartbeat(
        SERVICE_NAME,
        STATUS_COMPLETED,
        (
            f"job={job['id']} janela={window_start}..{window_end} empregados={len(synchronized_employee_keys)} "
            f"dias={len(point_rows)} banco_horas={len(hours_balance_rows)} assinaturas={len(signature_rows)} "
            f"pendencias={pending_adjustments} assinaturas_pendentes={pending_signatures} nao_vinculados={unmatched_count}"
        ),
    )
    print(
        "[point_sync] job concluido | "
        f"id={job['id']} janela={window_start}..{window_end} empregados={len(synchronized_employee_keys)} "
        f"dias={len(point_rows)} banco_horas={len(hours_balance_rows)} assinaturas={len(signature_rows)} "
        f"nao_vinculados={unmatched_count}"
    )


def process_pending_point_sync_jobs_once() -> bool:
    db = DatabaseManager()
    _ensure_tables(db)

    job = _get_pending_job(db)
    if not job:
        db.update_heartbeat(SERVICE_NAME, STATUS_COMPLETED, "Sem jobs pendentes")
        return False

    _mark_job_running(db, job["id"])

    try:
        _process_job(db, job)
    except Exception as exc:
        error_message = str(exc or "Falha na sincronização da Sólides.")
        _mark_job_done(db, job["id"], STATUS_FAILED, error_message)
        _mark_run_done(db, job.get("run_id"), STATUS_FAILED, error_message)
        db.update_heartbeat(SERVICE_NAME, STATUS_FAILED, f"job={job['id']} erro={error_message}")
        print(f"[point_sync] erro fatal no job {job['id']}: {error_message}")
    return True


if __name__ == "__main__":
    drained = 0
    while process_pending_point_sync_jobs_once():
        drained += 1
    print(f"[point_sync] jobs drenados={drained}")
