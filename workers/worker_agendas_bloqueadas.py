import json
import os
import sys
import time
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from urllib.parse import unquote

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database_manager import DatabaseManager
except ImportError:
    DatabaseManager = None


SERVICE_NAME = "blocked_agendas"
STATUS_PENDING = "PENDING"
STATUS_RUNNING = "RUNNING"
STATUS_COMPLETED = "COMPLETED"
STATUS_FAILED = "FAILED"

DEFAULT_UNITS = [2, 3, 12]
API_BASE_URL = "https://api.feegow.com/v1/api"
API_TIMEOUT_SEC = max(10, int(os.getenv("BLOCKED_AGENDAS_API_TIMEOUT_SEC", "60")))
POLL_INTERVAL_SEC = max(10, int(os.getenv("BLOCKED_AGENDAS_POLL_SEC", "30")))

UNIT_NAME_MAP = {
    0: "GLOBAL",
    2: "OURO VERDE",
    3: "CENTRO CAMBUI",
    12: "CAMPINAS SHOPPING",
}


def _now_iso() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _to_int(value, default=0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _clean(value) -> str:
    return str(value or "").strip()


def _fetch_rows(result) -> List:
    if result is None:
        return []
    if hasattr(result, "fetchall"):
        try:
            return result.fetchall() or []
        except Exception:
            return []
    try:
        return list(result)
    except Exception:
        return []


def _row_get(row, idx: int, key: str):
    if isinstance(row, (tuple, list)):
        return row[idx] if 0 <= idx < len(row) else None
    if isinstance(row, dict):
        return row.get(key)
    if hasattr(row, key):
        return getattr(row, key)
    try:
        return row[key]
    except Exception:
        return None


def _normalize_unit_scope(raw_units) -> List[int]:
    if raw_units is None:
        return list(DEFAULT_UNITS)

    units: List[int] = []
    if isinstance(raw_units, (list, tuple, set)):
        for item in raw_units:
            num = _to_int(item, -1)
            if num in DEFAULT_UNITS and num not in units:
                units.append(num)
    else:
        text = str(raw_units).strip().lower()
        if text in ("", "all", "todos"):
            return list(DEFAULT_UNITS)
        for part in text.split(","):
            num = _to_int(part.strip(), -1)
            if num in DEFAULT_UNITS and num not in units:
                units.append(num)

    return sorted(units) if units else list(DEFAULT_UNITS)


def _parse_iso_date(raw_value: str) -> Optional[datetime.date]:
    raw = str(raw_value or "").strip()
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(raw, fmt).date()
        except Exception:
            continue
    return None


def _to_iso_date(raw_value: str) -> Optional[str]:
    dt = _parse_iso_date(raw_value)
    if not dt:
        return None
    return dt.strftime("%Y-%m-%d")


def _make_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=0.5,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def _get_api_token() -> str:
    raw = os.getenv("FEEGOW_ACCESS_TOKEN") or os.getenv("FEEGOW_ACCESS_TOKEN_2") or ""
    token = unquote(str(raw).strip())
    if not token:
        raise RuntimeError("FEEGOW_ACCESS_TOKEN nao configurado para worker_agendas_bloqueadas.")
    return token


def _api_get(session: requests.Session, token: str, endpoint: str, params: dict) -> dict:
    url = f"{API_BASE_URL}/{endpoint}"
    headers = {
        "x-access-token": token,
        "Content-Type": "application/json",
    }
    resp = session.get(url, headers=headers, params=params, timeout=API_TIMEOUT_SEC)
    resp.raise_for_status()
    data = resp.json()
    if not isinstance(data, dict):
        return {}
    return data


def _ensure_index(db: "DatabaseManager", conn, table_name: str, index_name: str, columns_sql: str):
    if db.use_mysql:
        rs = conn.execute(
            """
            SELECT COUNT(1)
            FROM information_schema.statistics
            WHERE table_schema = DATABASE()
              AND table_name = ?
              AND index_name = ?
            """,
            (table_name, index_name),
        )
        rows = _fetch_rows(rs)
        exists_count = 0
        if rows:
            row = rows[0]
            exists_count = int(_row_get(row, 0, "COUNT(1)") or _row_get(row, 0, "count(1)") or 0)
        if exists_count == 0:
            conn.execute(f"CREATE INDEX {index_name} ON {table_name} ({columns_sql})")
        return

    conn.execute(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} ({columns_sql})")


def _ensure_tables(db: "DatabaseManager"):
    conn = db.get_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS agenda_blocked_report_jobs (
              id VARCHAR(64) PRIMARY KEY,
              status VARCHAR(20) NOT NULL,
              start_date VARCHAR(10) NOT NULL,
              end_date VARCHAR(10) NOT NULL,
              unit_scope_json LONGTEXT,
              requested_by VARCHAR(64) NOT NULL,
              error_message TEXT,
              created_at VARCHAR(32) NOT NULL,
              started_at VARCHAR(32),
              finished_at VARCHAR(32),
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS agenda_blocked_report_items (
              job_id VARCHAR(64) NOT NULL,
              block_id INTEGER NOT NULL,
              date_start VARCHAR(10) NOT NULL,
              date_end VARCHAR(10) NOT NULL,
              time_start VARCHAR(8) NOT NULL,
              time_end VARCHAR(8) NOT NULL,
              professional_id INTEGER NOT NULL,
              professional_name VARCHAR(180) NOT NULL,
              professional_source_status VARCHAR(20) NOT NULL,
              unit_ids_json LONGTEXT NOT NULL,
              unit_names_text TEXT NOT NULL,
              unit_scope_key VARCHAR(120) NOT NULL,
              week_days_json LONGTEXT NOT NULL,
              description TEXT,
              is_active_in_range INTEGER NOT NULL DEFAULT 0,
              is_recurring INTEGER NOT NULL DEFAULT 0,
              is_multi_unit INTEGER NOT NULL DEFAULT 0,
              last_synced_at VARCHAR(32) NOT NULL,
              PRIMARY KEY (job_id, block_id)
            )
            """
        )

        _ensure_index(db, conn, "agenda_blocked_report_jobs", "idx_agenda_blocked_jobs_status", "status")
        _ensure_index(db, conn, "agenda_blocked_report_jobs", "idx_agenda_blocked_jobs_created", "created_at")
        _ensure_index(db, conn, "agenda_blocked_report_items", "idx_agenda_blocked_items_job_prof", "job_id, professional_id")
        _ensure_index(db, conn, "agenda_blocked_report_items", "idx_agenda_blocked_items_job_dates", "job_id, date_start, date_end")

        if db.use_mysql:
            conn.commit()
    finally:
        conn.close()


def enqueue_blocked_agendas_job(
    start_date: str,
    end_date: str,
    unit_scope=None,
    requested_by: str = "system_status",
    db: Optional["DatabaseManager"] = None,
    initial_status: str = STATUS_PENDING,
):
    own_db = False
    if db is None:
      db = DatabaseManager()
      own_db = True

    _ensure_tables(db)
    start_iso = _to_iso_date(start_date)
    end_iso = _to_iso_date(end_date)
    if not start_iso or not end_iso:
        raise RuntimeError("Datas invalidas para enqueue de agendas_bloqueadas.")
    if start_iso > end_iso:
        raise RuntimeError("Data inicial nao pode ser maior que data final.")

    units = _normalize_unit_scope(unit_scope)
    now = _now_iso()
    job_id = uuid.uuid4().hex

    conn = db.get_connection()
    try:
        conn.execute(
            """
            INSERT INTO agenda_blocked_report_jobs (
              id, status, start_date, end_date, unit_scope_json, requested_by,
              error_message, created_at, started_at, finished_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job_id,
                initial_status,
                start_iso,
                end_iso,
                json.dumps(units),
                _clean(requested_by) or "unknown",
                None,
                now,
                now if initial_status == STATUS_RUNNING else None,
                None,
                now,
            ),
        )
        if db.use_mysql:
            conn.commit()
    finally:
        conn.close()
        if own_db:
            del db

    return {
        "id": job_id,
        "status": initial_status,
        "start_date": start_iso,
        "end_date": end_iso,
        "unit_scope": units,
        "requested_by": _clean(requested_by) or "unknown",
        "updated_at": now,
    }


def _get_pending_job(db: "DatabaseManager"):
    rows = db.execute_query(
        """
        SELECT id, start_date, end_date, unit_scope_json, requested_by
        FROM agenda_blocked_report_jobs
        WHERE status = ?
        ORDER BY created_at ASC
        LIMIT 1
        """,
        (STATUS_PENDING,),
    )
    if not rows:
        return None

    row = rows[0]
    try:
        units = json.loads(_clean(_row_get(row, 3, "unit_scope_json")) or "[]")
    except Exception:
        units = []
    return {
        "id": _clean(_row_get(row, 0, "id")),
        "start_date": _clean(_row_get(row, 1, "start_date")),
        "end_date": _clean(_row_get(row, 2, "end_date")),
        "units": _normalize_unit_scope(units),
        "requested_by": _clean(_row_get(row, 4, "requested_by")) or "unknown",
    }


def _mark_job_running(db: "DatabaseManager", job_id: str):
    conn = db.get_connection()
    try:
        now = _now_iso()
        conn.execute(
            """
            UPDATE agenda_blocked_report_jobs
            SET status = ?, started_at = COALESCE(started_at, ?), updated_at = ?, error_message = NULL
            WHERE id = ?
            """,
            (STATUS_RUNNING, now, now, job_id),
        )
        if db.use_mysql:
            conn.commit()
    finally:
        conn.close()


def _mark_job_done(db: "DatabaseManager", job_id: str, status: str, error_message: str = ""):
    conn = db.get_connection()
    try:
        now = _now_iso()
        conn.execute(
            """
            UPDATE agenda_blocked_report_jobs
            SET status = ?, finished_at = ?, updated_at = ?, error_message = ?
            WHERE id = ?
            """,
            (status, now, now, str(error_message or "") or None, job_id),
        )
        if db.use_mysql:
            conn.commit()
    finally:
        conn.close()


def _list_feegow_professionals(session: requests.Session, token: str) -> Dict[int, str]:
    data = _api_get(session, token, "professional/list", {})
    items = data.get("content") if isinstance(data, dict) else []
    if not isinstance(items, list):
        return {}

    mapping: Dict[int, str] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        prof_id = _to_int(item.get("profissional_id"), 0)
        if prof_id <= 0:
            continue
        name = _clean(item.get("nome") or item.get("nome_profissional") or item.get("professional_name"))
        if not name:
            continue
        mapping[prof_id] = name
    return mapping


def _list_local_professionals(db: "DatabaseManager") -> Dict[int, str]:
    rows = db.execute_query(
        """
        SELECT id, name
        FROM professionals
        WHERE id LIKE 'feegow:%'
        """
    )
    mapping: Dict[int, str] = {}
    for row in rows or []:
        raw_id = _clean(_row_get(row, 0, "id"))
        name = _clean(_row_get(row, 1, "name"))
        if not raw_id or not name:
            continue
        try:
            prof_id = int(raw_id.split(":", 1)[1])
        except Exception:
            continue
        mapping[prof_id] = name
    return mapping


def _resolve_professional_name(professional_id: int, feegow_names: Dict[int, str], local_names: Dict[int, str]) -> Tuple[str, str]:
    if professional_id > 0 and professional_id in feegow_names:
        return feegow_names[professional_id], "FEEGOW"
    if professional_id > 0 and professional_id in local_names:
        return local_names[professional_id], "LOCAL"
    if professional_id > 0:
        return f"Profissional {professional_id}", "FALLBACK"
    return "Profissional nao informado", "FALLBACK"


def _compute_flags(block: dict, start_iso: str, end_iso: str) -> Tuple[int, int, int]:
    block_start = _parse_iso_date(_clean(block.get("date_start")) or "")
    block_end = _parse_iso_date(_clean(block.get("date_end")) or "")
    start_dt = _parse_iso_date(start_iso)
    end_dt = _parse_iso_date(end_iso)

    is_active = 0
    if block_start and block_end and start_dt and end_dt and block_end >= start_dt and block_start <= end_dt:
        is_active = 1

    week_days = [
        _to_int(item, 0)
        for item in (block.get("week_day") or [])
        if _to_int(item, 0) > 0
    ]
    is_recurring = 1 if (block_start and block_end and block_start != block_end) or len(week_days) > 1 else 0

    units = [u for u in (block.get("units") or [])]
    is_multi_unit = 1 if len(units) > 1 else 0
    return is_active, is_recurring, is_multi_unit


def _normalize_units_for_display(units_raw) -> Tuple[List[int], List[int], str]:
    raw_units: List[int] = []
    for item in units_raw or []:
        num = _to_int(item, -1)
        if num >= 0 and num not in raw_units:
            raw_units.append(num)

    display_units = raw_units or [0]
    filter_units = list(display_units)
    if 0 in filter_units:
        for unit_id in DEFAULT_UNITS:
            if unit_id not in filter_units:
                filter_units.append(unit_id)

    names = [UNIT_NAME_MAP.get(unit_id, f"UNIDADE {unit_id}") for unit_id in display_units]
    return display_units, sorted(filter_units), " | ".join(names)


def _fetch_blocks_for_units(session: requests.Session, token: str, units: List[int], start_iso: str, end_iso: str) -> List[dict]:
    blocks_by_id: Dict[int, dict] = {}

    for unit_id in units:
        data = _api_get(
            session,
            token,
            "lock/list",
            {
                "date_start": start_iso,
                "date_end": end_iso,
                "unidade_id": unit_id,
            },
        )
        items = data.get("content") if isinstance(data, dict) else []
        if not isinstance(items, list):
            continue

        for item in items:
            if not isinstance(item, dict):
                continue
            block_id = _to_int(item.get("id"), 0)
            if block_id <= 0:
                continue
            if block_id not in blocks_by_id:
                blocks_by_id[block_id] = item

    return list(blocks_by_id.values())


def _save_items(db: "DatabaseManager", job_id: str, rows: List[Tuple]):
    conn = db.get_connection()
    try:
        conn.execute("DELETE FROM agenda_blocked_report_items WHERE job_id = ?", (job_id,))
        if rows:
            conn.executemany(
                """
                INSERT INTO agenda_blocked_report_items (
                  job_id, block_id, date_start, date_end, time_start, time_end,
                  professional_id, professional_name, professional_source_status,
                  unit_ids_json, unit_names_text, unit_scope_key, week_days_json,
                  description, is_active_in_range, is_recurring, is_multi_unit, last_synced_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows,
            )
        if db.use_mysql:
            conn.commit()
    finally:
        conn.close()


def _process_job(db: "DatabaseManager", job: dict):
    job_id = _clean(job.get("id"))
    start_iso = _clean(job.get("start_date"))
    end_iso = _clean(job.get("end_date"))
    units = _normalize_unit_scope(job.get("units"))
    if not job_id or not start_iso or not end_iso:
        raise RuntimeError("Job de agendas bloqueadas invalido.")

    print(
        f"--- Processando agendas bloqueadas | job={job_id} "
        f"| periodo={start_iso}..{end_iso} | units={units} ---"
    )

    session = _make_session()
    token = _get_api_token()
    blocks = _fetch_blocks_for_units(session, token, units, start_iso, end_iso)
    feegow_names = _list_feegow_professionals(session, token)
    local_names = _list_local_professionals(db)
    last_synced_at = _now_iso()

    rows: List[Tuple] = []
    for block in blocks:
        block_id = _to_int(block.get("id"), 0)
        if block_id <= 0:
            continue

        professional_id = _to_int(block.get("professional_id"), 0)
        professional_name, source_status = _resolve_professional_name(professional_id, feegow_names, local_names)
        display_units, filter_units, unit_names_text = _normalize_units_for_display(block.get("units"))
        week_days = [
            _to_int(item, 0)
            for item in (block.get("week_day") or [])
            if _to_int(item, 0) > 0
        ]
        is_active, is_recurring, is_multi_unit = _compute_flags(block, start_iso, end_iso)

        rows.append(
            (
                job_id,
                block_id,
                _clean(block.get("date_start")),
                _clean(block.get("date_end")),
                _clean(block.get("time_start")) or "00:00:00",
                _clean(block.get("time_end")) or "23:59:00",
                professional_id,
                professional_name,
                source_status,
                json.dumps(display_units),
                unit_names_text,
                "|" + "|".join(str(unit_id) for unit_id in filter_units) + "|",
                json.dumps(week_days),
                _clean(block.get("description")),
                is_active,
                is_recurring,
                is_multi_unit,
                last_synced_at,
            )
        )

    _save_items(db, job_id, rows)

    details = f"job={job_id} blocks={len(rows)} periodo={start_iso}..{end_iso}"
    _mark_job_done(db, job_id, STATUS_COMPLETED, "")
    db.update_heartbeat(SERVICE_NAME, STATUS_COMPLETED, details)
    print(f"--- Agendas bloqueadas finalizado | job={job_id} | rows={len(rows)} ---")


def process_pending_blocked_agendas_jobs_once() -> bool:
    db = DatabaseManager()
    _ensure_tables(db)

    job = _get_pending_job(db)
    if not job:
        db.update_heartbeat(SERVICE_NAME, STATUS_COMPLETED, "Sem jobs pendentes")
        return False

    _mark_job_running(db, _clean(job.get("id")))

    try:
        _process_job(db, job)
    except Exception as exc:
        error_msg = str(exc)
        _mark_job_done(db, _clean(job.get("id")), STATUS_FAILED, error_msg)
        db.update_heartbeat(SERVICE_NAME, STATUS_FAILED, f"job={job.get('id')} erro={error_msg}")
        print(f"[blocked_agendas] erro fatal no job {job.get('id')}: {error_msg}")
    return True


def run_blocked_agendas_loop():
    print(f"[blocked_agendas] worker loop iniciado. poll={POLL_INTERVAL_SEC}s")
    while True:
        try:
            process_pending_blocked_agendas_jobs_once()
        except Exception as exc:
            try:
                db = DatabaseManager()
                db.update_heartbeat(SERVICE_NAME, STATUS_FAILED, f"loop_error={exc}")
            except Exception:
                pass
            print(f"[blocked_agendas] loop error: {exc}")
        time.sleep(POLL_INTERVAL_SEC)


def _cli():
    args = sys.argv[1:]
    start_arg = ""
    end_arg = ""
    units_arg = ""
    requested_by_arg = "manual_cli"

    for i, token in enumerate(args):
        if token.startswith("--start="):
            start_arg = token.split("=", 1)[1].strip()
        elif token == "--start" and i + 1 < len(args):
            start_arg = str(args[i + 1] or "").strip()
        elif token.startswith("--end="):
            end_arg = token.split("=", 1)[1].strip()
        elif token == "--end" and i + 1 < len(args):
            end_arg = str(args[i + 1] or "").strip()
        elif token.startswith("--units="):
            units_arg = token.split("=", 1)[1].strip()
        elif token == "--units" and i + 1 < len(args):
            units_arg = str(args[i + 1] or "").strip()
        elif token.startswith("--requested-by="):
            requested_by_arg = token.split("=", 1)[1].strip() or "manual_cli"
        elif token == "--requested-by" and i + 1 < len(args):
            requested_by_arg = str(args[i + 1] or "").strip() or "manual_cli"

    units = _normalize_unit_scope(units_arg)

    if "--enqueue" in args:
        job = enqueue_blocked_agendas_job(
            start_date=start_arg,
            end_date=end_arg,
            unit_scope=units,
            requested_by=requested_by_arg,
        )
        print(
            f"Job enfileirado: id={job['id']} periodo={job['start_date']}..{job['end_date']} "
            f"units={','.join(map(str, job['unit_scope']))}"
        )
        if "--once" in args:
            process_pending_blocked_agendas_jobs_once()
        return

    if "--once" in args:
        had_job = process_pending_blocked_agendas_jobs_once()
        if not had_job:
            print("Sem jobs pendentes.")
        return

    run_blocked_agendas_loop()


if __name__ == "__main__":
    _cli()
