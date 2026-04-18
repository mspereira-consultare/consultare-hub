import json
import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional

from database_manager import DatabaseManager
from payroll_parse_point_pdf import parse_pdf_file
from storage_s3 import download_s3_object_bytes


SERVICE_NAME = "payroll_point_import"
STATUS_PENDING = "PENDING"
STATUS_RUNNING = "RUNNING"
STATUS_COMPLETED = "COMPLETED"
STATUS_FAILED = "FAILED"


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _row_get(row, key: str, index: int = 0):
    if isinstance(row, dict):
        return row.get(key)
    if hasattr(row, key):
        return getattr(row, key)
    if isinstance(row, (list, tuple)):
        return row[index] if len(row) > index else None
    return None


def _clean(value) -> str:
    return str(value or "").strip()


def _normalize_cpf(value) -> Optional[str]:
    digits = "".join(ch for ch in _clean(value) if ch.isdigit())[:11]
    return digits or None


def _normalize_name(value) -> str:
    raw = _clean(value)
    try:
        import unicodedata

        raw = unicodedata.normalize("NFD", raw)
        raw = "".join(ch for ch in raw if not unicodedata.combining(ch))
    except Exception:
        pass
    return " ".join(raw.lower().split())


def _execute(db: DatabaseManager, sql: str, params=()):
    conn = db.get_connection()
    try:
        result = conn.execute(sql, params)
        if not db.use_turso:
            conn.commit()
        return result
    finally:
        conn.close()


def _ensure_tables(db: DatabaseManager):
    _execute(
        db,
        """
        CREATE TABLE IF NOT EXISTS payroll_point_import_jobs (
          id VARCHAR(64) PRIMARY KEY,
          period_id VARCHAR(64) NOT NULL,
          import_file_id VARCHAR(64) NOT NULL,
          status VARCHAR(20) NOT NULL,
          requested_by VARCHAR(64) NULL,
          error_message LONGTEXT NULL,
          created_at VARCHAR(32) NOT NULL,
          started_at VARCHAR(32) NULL,
          finished_at VARCHAR(32) NULL
        )
        """,
    )
    for sql in [
        "CREATE INDEX idx_payroll_point_import_jobs_status ON payroll_point_import_jobs (status, created_at)",
        "CREATE INDEX idx_payroll_point_import_jobs_period ON payroll_point_import_jobs (period_id, created_at)",
        "CREATE INDEX idx_payroll_point_import_jobs_import_file ON payroll_point_import_jobs (import_file_id)",
    ]:
        try:
            _execute(db, sql)
        except Exception as exc:
            message = str(exc or "")
            if "already exists" in message.lower() or "duplicate" in message.lower():
                continue
            raise


def _get_pending_job(db: DatabaseManager) -> Optional[Dict]:
    rows = db.execute_query(
        """
        SELECT
          j.id,
          j.period_id,
          j.import_file_id,
          j.requested_by,
          i.storage_provider,
          i.storage_bucket,
          i.storage_key,
          i.file_name,
          p.period_start,
          p.period_end
        FROM payroll_point_import_jobs j
        INNER JOIN payroll_import_files i ON i.id = j.import_file_id
        INNER JOIN payroll_periods p ON p.id = j.period_id
        WHERE j.status = ?
        ORDER BY j.created_at ASC
        LIMIT 1
        """,
        (STATUS_PENDING,),
    ) or []
    if not rows:
        return None

    row = rows[0]
    return {
        "id": _clean(_row_get(row, "id", 0)),
        "period_id": _clean(_row_get(row, "period_id", 1)),
        "import_file_id": _clean(_row_get(row, "import_file_id", 2)),
        "requested_by": _clean(_row_get(row, "requested_by", 3)) or "system_status",
        "storage_provider": _clean(_row_get(row, "storage_provider", 4)) or "s3",
        "storage_bucket": _clean(_row_get(row, "storage_bucket", 5)) or None,
        "storage_key": _clean(_row_get(row, "storage_key", 6)),
        "file_name": _clean(_row_get(row, "file_name", 7)) or "ponto.pdf",
        "period_start": _clean(_row_get(row, "period_start", 8)),
        "period_end": _clean(_row_get(row, "period_end", 9)),
    }


def _mark_job_running(db: DatabaseManager, job_id: str):
    now = _now_iso()
    _execute(
        db,
        "UPDATE payroll_point_import_jobs SET status = ?, error_message = NULL, started_at = ?, finished_at = NULL WHERE id = ?",
        (STATUS_RUNNING, now, job_id),
    )


def _mark_job_done(db: DatabaseManager, job_id: str, status: str, error_message: Optional[str] = None):
    now = _now_iso()
    _execute(
        db,
        "UPDATE payroll_point_import_jobs SET status = ?, error_message = ?, finished_at = ? WHERE id = ?",
        (status, _clean(error_message) or None, now, job_id),
    )


def _update_import_status(db: DatabaseManager, import_file_id: str, status: str, log_message: str):
    processed_at = _now_iso() if status in {STATUS_COMPLETED, STATUS_FAILED} else None
    _execute(
        db,
        "UPDATE payroll_import_files SET processing_status = ?, processing_log = ?, processed_at = ? WHERE id = ?",
        (status, _clean(log_message), processed_at, import_file_id),
    )


def _load_employee_lookup(db: DatabaseManager, period_start: str, period_end: str):
    rows = db.execute_query(
        """
        SELECT id, full_name, cpf
        FROM employees
        WHERE (admission_date IS NULL OR admission_date <= ?)
          AND (termination_date IS NULL OR termination_date >= ?)
        ORDER BY full_name ASC
        """,
        (period_end, period_start),
    ) or []

    by_cpf: Dict[str, Dict] = {}
    by_name: Dict[str, Dict] = {}
    for row in rows:
        employee = {
            "id": _clean(_row_get(row, "id", 0)),
            "full_name": _clean(_row_get(row, "full_name", 1)),
            "cpf": _normalize_cpf(_row_get(row, "cpf", 2)),
        }
        if employee["cpf"] and employee["cpf"] not in by_cpf:
            by_cpf[employee["cpf"]] = employee
        normalized_name = _normalize_name(employee["full_name"])
        if normalized_name and normalized_name not in by_name:
            by_name[normalized_name] = employee
    return by_cpf, by_name


def _download_pdf_to_tempfile(storage_key: str, storage_bucket: Optional[str], file_name: str) -> Path:
    payload = download_s3_object_bytes(storage_key, storage_bucket)
    suffix = Path(file_name or "ponto.pdf").suffix or ".pdf"
    temp_dir = Path(tempfile.mkdtemp(prefix="hub-payroll-point-"))
    target_path = temp_dir / f"point{suffix}"
    target_path.write_bytes(payload)
    return target_path


def _build_parsed_employee_key(parsed_employee: Dict) -> str:
    cpf = _normalize_cpf(parsed_employee.get("employeeCpf"))
    if cpf:
        return f"cpf:{cpf}"
    name = _normalize_name(parsed_employee.get("employeeName"))
    if name:
        return f"name:{name}"
    code = _clean(parsed_employee.get("employeeCode"))
    if code:
        return f"code:{code}"
    return uuid.uuid4().hex


def _rebuild_point_rows(db: DatabaseManager, job: Dict):
    by_cpf, by_name = _load_employee_lookup(db, job["period_start"], job["period_end"])
    pdf_path = _download_pdf_to_tempfile(job["storage_key"], job["storage_bucket"], job["file_name"])
    try:
        parsed_employees = parse_pdf_file(pdf_path)
    finally:
        try:
            pdf_path.unlink(missing_ok=True)
        except Exception:
            pass
        try:
            pdf_path.parent.rmdir()
        except Exception:
            pass

    _execute(db, "DELETE FROM payroll_point_daily WHERE period_id = ?", (job["period_id"],))

    inserted_days = 0
    matched_keys = set()
    unmatched_keys = set()
    unmatched_samples = []
    for parsed_employee in parsed_employees:
        matched_employee = None
        employee_cpf = _normalize_cpf(parsed_employee.get("employeeCpf"))
        if employee_cpf:
            matched_employee = by_cpf.get(employee_cpf)
        if matched_employee is None:
            matched_employee = by_name.get(_normalize_name(parsed_employee.get("employeeName")))

        parsed_key = _build_parsed_employee_key(parsed_employee)
        if matched_employee is not None:
            matched_keys.add(parsed_key)
        elif parsed_key not in unmatched_keys:
            unmatched_keys.add(parsed_key)
            sample_name = _clean(parsed_employee.get("employeeName")) or _clean(parsed_employee.get("employeeCode")) or "sem identificação"
            sample_cpf = employee_cpf or "sem cpf"
            unmatched_samples.append(f"{sample_name} ({sample_cpf})")

        for day in parsed_employee.get("days", []):
            point_date = _clean(day.get("pointDate"))
            if not point_date:
                continue
            if point_date < job["period_start"] or point_date > job["period_end"]:
                continue

            now = _now_iso()
            _execute(
                db,
                """
                INSERT INTO payroll_point_daily (
                  id, period_id, employee_id, employee_code, employee_name, employee_cpf, point_date,
                  department, schedule_label, schedule_start, schedule_end, marks_json, raw_day_text,
                  worked_minutes, late_minutes, absence_flag, inconsistency_flag, justification_text,
                  source_file_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    uuid.uuid4().hex,
                    job["period_id"],
                    matched_employee.get("id") if matched_employee else None,
                    _clean(parsed_employee.get("employeeCode")) or None,
                    _clean(parsed_employee.get("employeeName")),
                    employee_cpf,
                    point_date,
                    _clean(parsed_employee.get("department")) or None,
                    _clean(parsed_employee.get("scheduleLabel")) or None,
                    _clean(parsed_employee.get("scheduleStart")) or None,
                    _clean(parsed_employee.get("scheduleEnd")) or None,
                    json.dumps(day.get("marks") or [], ensure_ascii=False),
                    _clean(day.get("rawDayText")) or None,
                    int(day.get("workedMinutes") or 0),
                    int(day.get("lateMinutes") or 0),
                    1 if day.get("absenceFlag") else 0,
                    1 if day.get("inconsistencyFlag") else 0,
                    _clean(day.get("justificationText")) or None,
                    job["import_file_id"],
                    now,
                    now,
                ),
            )
            inserted_days += 1

    return {
        "parsed_employees": len(parsed_employees),
        "inserted_days": inserted_days,
        "matched_employees": len(matched_keys),
        "unmatched_employees": len(unmatched_keys),
        "unmatched_samples": unmatched_samples[:5],
    }


def _process_job(db: DatabaseManager, job: Dict):
    _update_import_status(db, job["import_file_id"], "PROCESSING", "Processamento iniciado pelo worker da folha.")
    db.update_heartbeat(SERVICE_NAME, STATUS_RUNNING, f"job={job['id']} import={job['import_file_id']}")

    result = _rebuild_point_rows(db, job)
    employees_count = result["parsed_employees"]
    inserted_days = result["inserted_days"]
    matched_employees = result["matched_employees"]
    unmatched_employees = result["unmatched_employees"]
    unmatched_suffix = ""
    if unmatched_employees:
        unmatched_suffix = f" Não vinculados: {unmatched_employees}."
        if result["unmatched_samples"]:
            unmatched_suffix += f" Exemplos: {', '.join(result['unmatched_samples'])}."
    log_message = (
        f"Relatório de ponto processado com {employees_count} colaboradores/páginas, "
        f"{inserted_days} registros diários e {matched_employees} vínculos com cadastro.{unmatched_suffix}"
    )
    _update_import_status(db, job["import_file_id"], STATUS_COMPLETED, log_message)
    _mark_job_done(db, job["id"], STATUS_COMPLETED)
    db.update_heartbeat(
        SERVICE_NAME,
        STATUS_COMPLETED,
        (
            f"job={job['id']} import={job['import_file_id']} colaboradores={employees_count} "
            f"registros={inserted_days} vinculados={matched_employees} nao_vinculados={unmatched_employees}"
        ),
    )
    print(
        "[payroll_point_import] job concluido | "
        f"id={job['id']} colaboradores={employees_count} registros={inserted_days} "
        f"vinculados={matched_employees} nao_vinculados={unmatched_employees}"
    )


def process_pending_payroll_point_jobs_once() -> bool:
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
        error_message = str(exc or "Falha no processamento do PDF da folha.")
        _mark_job_done(db, job["id"], STATUS_FAILED, error_message)
        _update_import_status(db, job["import_file_id"], STATUS_FAILED, error_message)
        db.update_heartbeat(SERVICE_NAME, STATUS_FAILED, f"job={job['id']} erro={error_message}")
        print(f"[payroll_point_import] erro fatal no job {job['id']}: {error_message}")
    return True


def run_payroll_point_import_loop(poll_interval_sec: int = 15):
    print(f"[payroll_point_import] worker loop iniciado. poll={poll_interval_sec}s")
    while True:
        try:
            process_pending_payroll_point_jobs_once()
        except Exception as exc:
            try:
                db = DatabaseManager()
                db.update_heartbeat(SERVICE_NAME, STATUS_FAILED, str(exc))
            except Exception:
                pass
            print(f"[payroll_point_import] erro inesperado no loop: {exc}")
        finally:
            import time

            time.sleep(max(5, int(poll_interval_sec)))


if __name__ == "__main__":
    drained = 0
    while process_pending_payroll_point_jobs_once():
        drained += 1
    print(f"[payroll_point_import] jobs drenados={drained}")
