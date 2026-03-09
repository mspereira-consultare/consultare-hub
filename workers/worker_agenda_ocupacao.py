import os
import sys
import re
import json
import uuid
import time
import calendar
from datetime import date, datetime, timedelta
from collections import defaultdict
from typing import Dict, Iterable, List, Optional, Set, Tuple
from urllib.parse import unquote

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database_manager import DatabaseManager
except ImportError:
    DatabaseManager = None


SERVICE_NAME = "agenda_occupancy"
STATUS_PENDING = "PENDING"
STATUS_RUNNING = "RUNNING"
STATUS_COMPLETED = "COMPLETED"
STATUS_FAILED = "FAILED"

DEFAULT_UNITS = [2, 3, 12]
APPOINTMENT_STATUSES = {1, 2, 3, 4, 7}
API_BASE_URL = "https://api.feegow.com/v1/api"

SLOT_MINUTES = max(5, int(os.getenv("AGENDA_OCCUPANCY_SLOT_MINUTES", "10")))
API_TIMEOUT_SEC = max(10, int(os.getenv("AGENDA_OCCUPANCY_API_TIMEOUT_SEC", "60")))
API_SLEEP_SEC = max(0.0, float(os.getenv("AGENDA_OCCUPANCY_API_SLEEP_SEC", "0")))
POLL_INTERVAL_SEC = max(10, int(os.getenv("AGENDA_OCCUPANCY_POLL_SEC", "30")))

UNIT_NAME_MAP = {
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


def _normalize_period_ref(period_ref: Optional[str]) -> str:
    raw = str(period_ref or "").strip()
    if not raw:
        now = datetime.now()
        year = now.year
        month = now.month - 1
        if month <= 0:
            year -= 1
            month = 12
        return f"{year:04d}-{month:02d}"

    if not re.match(r"^\d{4}-\d{2}$", raw):
        raise RuntimeError("period_ref invalido. Use formato YYYY-MM.")
    year = int(raw[:4])
    month = int(raw[5:7])
    if month < 1 or month > 12:
        raise RuntimeError("period_ref invalido. Mes deve estar entre 01 e 12.")
    return f"{year:04d}-{month:02d}"


def _period_to_range(period_ref: str) -> Tuple[str, str]:
    year = int(period_ref[:4])
    month = int(period_ref[5:7])
    last_day = calendar.monthrange(year, month)[1]
    return f"{year:04d}-{month:02d}-01", f"{year:04d}-{month:02d}-{last_day:02d}"


def _parse_iso_date(raw_value: str) -> Optional[date]:
    raw = str(raw_value or "").strip()
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y"):
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


def _to_br_date(iso_date: str) -> str:
    return datetime.strptime(iso_date, "%Y-%m-%d").strftime("%d-%m-%Y")


def _daterange(start_date: date, end_date: date) -> Iterable[date]:
    current = start_date
    while current <= end_date:
        yield current
        current += timedelta(days=1)


def _parse_time_to_minutes(raw_value: str) -> Optional[int]:
    raw = str(raw_value or "").strip()
    if not raw:
        return None
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            t = datetime.strptime(raw, fmt).time()
            return (t.hour * 60) + t.minute
        except Exception:
            continue
    return None


def _blocked_slots_count(time_start: str, time_end: str, slot_minutes: int) -> int:
    start_min = _parse_time_to_minutes(time_start)
    end_min = _parse_time_to_minutes(time_end)
    if start_min is None or end_min is None:
        return 0
    if end_min < start_min:
        end_min = start_min
    duration = end_min - start_min
    # Ex.: 08:00-08:10 com slot de 10 => 2 slots (08:00 e 08:10)
    return max(1, (duration // slot_minutes) + 1)


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
        raise RuntimeError("FEEGOW_ACCESS_TOKEN nao configurado para worker_agenda_ocupacao.")
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
            CREATE TABLE IF NOT EXISTS agenda_occupancy_daily (
              data_ref VARCHAR(10) NOT NULL,
              unidade_id INTEGER NOT NULL,
              unidade_nome VARCHAR(120) NOT NULL,
              especialidade_id INTEGER NOT NULL,
              especialidade_nome VARCHAR(180) NOT NULL,
              agendamentos_count INTEGER NOT NULL,
              horarios_disponiveis_count INTEGER NOT NULL,
              horarios_bloqueados_count INTEGER NOT NULL,
              capacidade_liquida_count INTEGER NOT NULL,
              taxa_confirmacao_pct DECIMAL(10,4) NOT NULL,
              updated_at VARCHAR(32) NOT NULL,
              PRIMARY KEY (data_ref, unidade_id, especialidade_id)
            )
            """
        )

        _ensure_index(
            db,
            conn,
            "agenda_occupancy_daily",
            "idx_agenda_occ_daily_unit_date",
            "unidade_id, data_ref",
        )
        _ensure_index(
            db,
            conn,
            "agenda_occupancy_daily",
            "idx_agenda_occ_daily_spec_date",
            "especialidade_id, data_ref",
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS agenda_occupancy_jobs (
              id VARCHAR(64) PRIMARY KEY,
              status VARCHAR(20) NOT NULL,
              start_date VARCHAR(10) NOT NULL,
              end_date VARCHAR(10) NOT NULL,
              unit_scope_json TEXT,
              requested_by VARCHAR(64) NOT NULL,
              error_message TEXT,
              created_at VARCHAR(32) NOT NULL,
              started_at VARCHAR(32),
              finished_at VARCHAR(32),
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        _ensure_index(
            db,
            conn,
            "agenda_occupancy_jobs",
            "idx_agenda_occ_jobs_status",
            "status",
        )
        _ensure_index(
            db,
            conn,
            "agenda_occupancy_jobs",
            "idx_agenda_occ_jobs_created",
            "created_at",
        )

        if not db.use_turso:
            conn.commit()
    finally:
        conn.close()


def enqueue_agenda_occupancy_job(
    start_date: str,
    end_date: str,
    unit_scope: Optional[List[int]] = None,
    requested_by: str = "manual",
    db: Optional["DatabaseManager"] = None,
    initial_status: str = STATUS_PENDING,
) -> Dict:
    own_db = db is None
    dbm = db or DatabaseManager()
    _ensure_tables(dbm)

    units = _normalize_unit_scope(unit_scope)
    start_iso = _to_iso_date(start_date)
    end_iso = _to_iso_date(end_date)
    if not start_iso or not end_iso:
        raise RuntimeError("Datas invalidas para enqueue de agenda_occupancy.")
    if start_iso > end_iso:
        raise RuntimeError("Data inicial nao pode ser maior que data final.")

    now = _now_iso()
    job_id = uuid.uuid4().hex

    conn = dbm.get_connection()
    try:
        conn.execute(
            """
            INSERT INTO agenda_occupancy_jobs (
              id, status, start_date, end_date, unit_scope_json,
              requested_by, error_message, created_at, started_at, finished_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job_id,
                initial_status,
                start_iso,
                end_iso,
                json.dumps(units, ensure_ascii=False),
                str(requested_by or "manual"),
                None,
                now,
                now if initial_status == STATUS_RUNNING else None,
                None,
                now,
            ),
        )
        if not dbm.use_turso:
            conn.commit()
    finally:
        conn.close()

    if own_db:
        dbm = None

    return {
        "id": job_id,
        "status": initial_status,
        "start_date": start_iso,
        "end_date": end_iso,
        "unit_scope": units,
        "requested_by": requested_by,
    }


def _get_pending_job(db: "DatabaseManager") -> Optional[Dict]:
    rows = db.execute_query(
        """
        SELECT id, start_date, end_date, unit_scope_json, requested_by
        FROM agenda_occupancy_jobs
        WHERE status = ?
        ORDER BY created_at ASC
        LIMIT 1
        """,
        (STATUS_PENDING,),
    ) or []
    if not rows:
        return None

    row = rows[0]
    raw_units = _row_get(row, 3, "unit_scope_json")
    units = _normalize_unit_scope([])
    try:
        parsed = json.loads(str(raw_units or "[]"))
        units = _normalize_unit_scope(parsed)
    except Exception:
        units = _normalize_unit_scope([])

    return {
        "id": str(_row_get(row, 0, "id")),
        "start_date": str(_row_get(row, 1, "start_date")),
        "end_date": str(_row_get(row, 2, "end_date")),
        "units": units,
        "requested_by": str(_row_get(row, 4, "requested_by") or "manual"),
    }


def _mark_job_running(db: "DatabaseManager", job_id: str):
    now = _now_iso()
    db.execute_query(
        """
        UPDATE agenda_occupancy_jobs
        SET status = ?, started_at = ?, updated_at = ?, error_message = NULL
        WHERE id = ?
        """,
        (STATUS_RUNNING, now, now, job_id),
    )


def _mark_job_done(db: "DatabaseManager", job_id: str, status: str, error_message: str = ""):
    now = _now_iso()
    db.execute_query(
        """
        UPDATE agenda_occupancy_jobs
        SET status = ?, finished_at = ?, updated_at = ?, error_message = ?
        WHERE id = ?
        """,
        (status, now, now, str(error_message or "") or None, job_id),
    )


def _list_specialties(session: requests.Session, token: str) -> Dict[int, str]:
    data = _api_get(session, token, "specialties/list", {})
    items = data.get("content") if isinstance(data, dict) else []
    if not isinstance(items, list):
        return {}

    mapping: Dict[int, str] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        sid = _to_int(item.get("especialidade_id"), 0)
        if sid <= 0:
            continue
        name = str(item.get("nome") or "").strip()
        if not name:
            continue
        mapping[sid] = name
    return mapping


def _list_professionals_by_unit(
    session: requests.Session,
    token: str,
    unit_id: int,
) -> Tuple[Dict[int, Set[int]], Dict[int, str]]:
    data = _api_get(
        session,
        token,
        "professional/list",
        {"ativo": 1, "unidade_id": unit_id},
    )
    items = data.get("content") if isinstance(data, dict) else []
    if not isinstance(items, list):
        return {}, {}

    prof_specs: Dict[int, Set[int]] = {}
    spec_names: Dict[int, str] = {}

    for item in items:
        if not isinstance(item, dict):
            continue
        prof_id = _to_int(item.get("profissional_id"), 0)
        if prof_id <= 0:
            continue
        specialties = item.get("especialidades")
        if not isinstance(specialties, list):
            continue
        spec_set: Set[int] = set()
        for spec in specialties:
            if not isinstance(spec, dict):
                continue
            sid = _to_int(spec.get("especialidade_id"), 0)
            if sid <= 0:
                continue
            spec_set.add(sid)
            sp_name = str(spec.get("nome_especialidade") or "").strip()
            if sp_name and sid not in spec_names:
                spec_names[sid] = sp_name
        if spec_set:
            prof_specs[prof_id] = spec_set

    return prof_specs, spec_names


def _aggregate_appointments(
    session: requests.Session,
    token: str,
    unit_id: int,
    start_iso: str,
    end_iso: str,
) -> Tuple[Dict[Tuple[str, int, int], int], Dict[int, Set[int]]]:
    params = {
        "data_start": _to_br_date(start_iso),
        "data_end": _to_br_date(end_iso),
        "list_procedures": 0,
    }
    data = _api_get(session, token, "appoints/search", params)
    items = data.get("content") if isinstance(data, dict) else []
    if not isinstance(items, list):
        return {}, {}

    agg: Dict[Tuple[str, int, int], int] = defaultdict(int)
    active_prof_by_spec: Dict[int, Set[int]] = defaultdict(set)
    for row in items:
        if not isinstance(row, dict):
            continue
        status_id = _to_int(row.get("status_id"), -1)
        if status_id not in APPOINTMENT_STATUSES:
            continue
        row_unit = _to_int(row.get("unidade_id"), 0)
        if row_unit != unit_id:
            continue
        spec_id = _to_int(row.get("especialidade_id"), 0)
        if spec_id <= 0:
            continue
        data_raw = row.get("data") or row.get("date")
        data_iso = _to_iso_date(str(data_raw or ""))
        if not data_iso:
            continue
        if data_iso < start_iso or data_iso > end_iso:
            continue
        agg[(data_iso, unit_id, spec_id)] += 1
        prof_id = _to_int(row.get("profissional_id"), 0)
        if prof_id > 0:
            active_prof_by_spec[spec_id].add(prof_id)
    return dict(agg), dict(active_prof_by_spec)


def _extract_available_details(content: object) -> Tuple[Dict[str, int], Set[int]]:
    daily: Dict[str, int] = defaultdict(int)
    active_prof_ids: Set[int] = set()

    if isinstance(content, list):
        # Formato alternativo: lista simples de slots
        for item in content:
            if not isinstance(item, dict):
                continue
            pid = _to_int(item.get("profissional_id") or item.get("professional_id"), 0)
            if pid > 0:
                active_prof_ids.add(pid)
            data_iso = _to_iso_date(str(item.get("data") or item.get("date") or ""))
            if not data_iso:
                continue
            if isinstance(item.get("horarios"), list):
                daily[data_iso] += len(item.get("horarios") or [])
            elif item.get("horario"):
                daily[data_iso] += 1
        return dict(daily), active_prof_ids

    if not isinstance(content, dict):
        return {}, active_prof_ids

    prof_map = content.get("profissional_id")
    if not isinstance(prof_map, dict):
        return {}, active_prof_ids

    for raw_prof_id, prof_data in prof_map.items():
        prof_id = _to_int(raw_prof_id, 0)
        if prof_id > 0:
            active_prof_ids.add(prof_id)
        if not isinstance(prof_data, dict):
            continue
        local_map = prof_data.get("local_id")
        if not isinstance(local_map, dict):
            continue
        for _, dates_map in local_map.items():
            if not isinstance(dates_map, dict):
                continue
            for data_key, times in dates_map.items():
                data_iso = _to_iso_date(str(data_key or ""))
                if not data_iso:
                    continue
                if isinstance(times, list):
                    daily[data_iso] += len(times)

    return dict(daily), active_prof_ids


def _extract_available_counts(content: object) -> Dict[str, int]:
    daily, _ = _extract_available_details(content)
    return daily


def _aggregate_available_slots(
    session: requests.Session,
    token: str,
    unit_id: int,
    start_iso: str,
    end_iso: str,
    unit_specialties: Set[int],
    prof_specs: Optional[Dict[int, Set[int]]] = None,
) -> Tuple[Dict[Tuple[str, int, int], int], Dict[int, Set[int]]]:
    """
    Agrega slots disponíveis por unidade+especialidade.

    Abordagem principal:
      - chama /appoints/available-schedule por ESPECIALIDADE (sem profissional_id),
        para evitar subcontagem quando há inconsistência no vínculo profissional-especialidade.

    Fallback:
      - se a chamada por especialidade falhar, tenta por profissional para a mesma especialidade.
    """
    agg: Dict[Tuple[str, int, int], int] = defaultdict(int)
    active_prof_by_spec: Dict[int, Set[int]] = defaultdict(set)
    start_br = _to_br_date(start_iso)
    end_br = _to_br_date(end_iso)

    specialties = sorted(int(s) for s in (unit_specialties or set()) if int(s) > 0)
    total_calls = len(specialties)
    done_calls = 0
    prof_specs = prof_specs or {}

    # Índice reverso para fallback
    spec_to_profs: Dict[int, List[int]] = defaultdict(list)
    for prof_id, specs in prof_specs.items():
        for sid in specs:
            sid_int = int(sid or 0)
            if sid_int > 0:
                spec_to_profs[sid_int].append(int(prof_id))

    for spec_id in specialties:
        params = {
            "unidade_id": unit_id,
            "data_start": start_br,
            "data_end": end_br,
            "tipo": "E",
            "especialidade_id": spec_id,
        }

        used_fallback = False
        try:
            data = _api_get(session, token, "appoints/available-schedule", params)
            content = data.get("content") if isinstance(data, dict) else []
            daily_counts, active_prof_ids = _extract_available_details(content)
            for pid in active_prof_ids:
                active_prof_by_spec[spec_id].add(pid)
            for data_iso, count in daily_counts.items():
                if data_iso < start_iso or data_iso > end_iso:
                    continue
                agg[(data_iso, unit_id, spec_id)] += int(count or 0)
        except Exception as exc:
            used_fallback = True
            profs = spec_to_profs.get(spec_id) or []
            print(
                f"[agenda_occupancy] aviso available-schedule unidade={unit_id} "
                f"especialidade={spec_id} (modo agregado) falhou: {exc} | fallback_profissionais={len(profs)}"
            )
            for prof_id in profs:
                prof_params = {
                    "unidade_id": unit_id,
                    "profissional_id": prof_id,
                    "data_start": start_br,
                    "data_end": end_br,
                    "tipo": "E",
                    "especialidade_id": spec_id,
                }
                try:
                    data = _api_get(session, token, "appoints/available-schedule", prof_params)
                    content = data.get("content") if isinstance(data, dict) else []
                    daily_counts, active_prof_ids = _extract_available_details(content)
                    for pid in active_prof_ids:
                        active_prof_by_spec[spec_id].add(pid)
                    for data_iso, count in daily_counts.items():
                        if data_iso < start_iso or data_iso > end_iso:
                            continue
                        agg[(data_iso, unit_id, spec_id)] += int(count or 0)
                except Exception as inner_exc:
                    print(
                        f"[agenda_occupancy] aviso fallback available-schedule unidade={unit_id} "
                        f"profissional={prof_id} especialidade={spec_id}: {inner_exc}"
                    )
                if API_SLEEP_SEC > 0:
                    time.sleep(API_SLEEP_SEC)

        done_calls += 1
        if API_SLEEP_SEC > 0 and not used_fallback:
            time.sleep(API_SLEEP_SEC)
        if done_calls % 25 == 0 or done_calls == total_calls:
            print(f"[agenda_occupancy] available-schedule progresso: {done_calls}/{total_calls} (unidade={unit_id})")

    return dict(agg), dict(active_prof_by_spec)


def _aggregate_blocked_slots(
    session: requests.Session,
    token: str,
    unit_id: int,
    start_iso: str,
    end_iso: str,
    prof_specs: Dict[int, Set[int]],
    unit_specialties: Set[int],
    allowed_prof_by_spec: Optional[Dict[int, Set[int]]] = None,
) -> Dict[Tuple[str, int, int], int]:
    start_dt = datetime.strptime(start_iso, "%Y-%m-%d").date()
    end_dt = datetime.strptime(end_iso, "%Y-%m-%d").date()

    params = {
        "date_start": start_iso,
        "date_end": end_iso,
        "unidade_id": unit_id,
    }
    data = _api_get(session, token, "lock/list", params)
    blocks = data.get("content") if isinstance(data, dict) else []
    if not isinstance(blocks, list):
        return {}

    agg: Dict[Tuple[str, int, int], int] = defaultdict(int)

    for block in blocks:
        if not isinstance(block, dict):
            continue
        block_start = _parse_iso_date(str(block.get("date_start") or ""))
        block_end = _parse_iso_date(str(block.get("date_end") or ""))
        if not block_start or not block_end:
            continue

        inter_start = max(block_start, start_dt)
        inter_end = min(block_end, end_dt)
        if inter_end < inter_start:
            continue

        units_raw = block.get("units")
        units_in_block: Set[int] = set()
        if isinstance(units_raw, list):
            for u in units_raw:
                units_in_block.add(_to_int(u, -1))

        if units_in_block and 0 not in units_in_block and unit_id not in units_in_block:
            continue

        week_days_raw = block.get("week_day")
        week_days: Set[int] = set()
        if isinstance(week_days_raw, list):
            for wd in week_days_raw:
                val = _to_int(wd, 0)
                if 1 <= val <= 7:
                    week_days.add(val)

        prof_id = _to_int(block.get("professional_id"), 0)
        if prof_id > 0:
            target_specs = set(prof_specs.get(prof_id) or [])
            if allowed_prof_by_spec:
                target_specs = {
                    sid for sid in target_specs
                    if prof_id in (allowed_prof_by_spec.get(sid) or set())
                }
        else:
            if allowed_prof_by_spec:
                target_specs = {
                    sid for sid, profs in allowed_prof_by_spec.items()
                    if sid in unit_specialties and bool(profs)
                }
            else:
                target_specs = set(unit_specialties)
        if not target_specs:
            continue

        for day in _daterange(inter_start, inter_end):
            # Feegow usa 1..7 (segunda..domingo).
            weekday_feegow = day.weekday() + 1
            if week_days and weekday_feegow not in week_days:
                continue
            day_iso = day.strftime("%Y-%m-%d")
            for spec_id in target_specs:
                if spec_id <= 0:
                    continue
                # lock/list não expõe duracao de slot por especialidade.
                # Evita inflacao artificial de bloqueios usando peso 1 por dia.
                agg[(day_iso, unit_id, spec_id)] += 1

    return dict(agg)


def _build_daily_rows(
    start_iso: str,
    end_iso: str,
    units: List[int],
    specialty_names: Dict[int, str],
    unit_specialties: Dict[int, Set[int]],
    agendamentos: Dict[Tuple[str, int, int], int],
    disponiveis: Dict[Tuple[str, int, int], int],
    bloqueados: Dict[Tuple[str, int, int], int],
) -> Tuple[List[Tuple], int]:
    start_dt = datetime.strptime(start_iso, "%Y-%m-%d").date()
    end_dt = datetime.strptime(end_iso, "%Y-%m-%d").date()

    all_keys: Set[Tuple[str, int, int]] = set(agendamentos.keys()) | set(disponiveis.keys()) | set(bloqueados.keys())
    for unit_id in units:
        specs = unit_specialties.get(unit_id) or set()
        if not specs:
            continue
        for day in _daterange(start_dt, end_dt):
            day_iso = day.strftime("%Y-%m-%d")
            for spec_id in specs:
                all_keys.add((day_iso, unit_id, int(spec_id)))

    rows: List[Tuple] = []
    anomalies = 0
    now_iso = _now_iso()

    for day_iso, unit_id, spec_id in sorted(all_keys, key=lambda x: (x[0], x[1], x[2])):
        ag = int(agendamentos.get((day_iso, unit_id, spec_id), 0) or 0)
        disp = int(disponiveis.get((day_iso, unit_id, spec_id), 0) or 0)
        bloq = int(bloqueados.get((day_iso, unit_id, spec_id), 0) or 0)
        capacidade_raw = disp + ag - bloq
        if capacidade_raw <= 0:
            capacidade = 0
            taxa = 0.0
            anomalies += 1
        else:
            # Regra de sanidade: denominador não pode ficar menor que agendamentos.
            # Evita taxas >100% quando bloqueios superam "livres" no mesmo dia.
            capacidade = capacidade_raw if capacidade_raw >= ag else ag
            taxa = round((ag * 100.0) / capacidade_raw, 4)
            if capacidade != capacidade_raw:
                anomalies += 1
                taxa = round((ag * 100.0) / capacidade, 4)

        unidade_nome = UNIT_NAME_MAP.get(unit_id, f"UNIDADE {unit_id}")
        especialidade_nome = specialty_names.get(spec_id) or f"Especialidade {spec_id}"

        rows.append(
            (
                day_iso,
                unit_id,
                unidade_nome,
                spec_id,
                especialidade_nome,
                ag,
                disp,
                bloq,
                capacidade,
                taxa,
                now_iso,
            )
        )

    return rows, anomalies


def _replace_rows_for_period(
    db: "DatabaseManager",
    start_iso: str,
    end_iso: str,
    units: List[int],
    rows: List[Tuple],
):
    conn = db.get_connection()
    try:
        placeholders = ", ".join(["?"] * len(units))
        conn.execute(
            f"""
            DELETE FROM agenda_occupancy_daily
            WHERE data_ref >= ?
              AND data_ref <= ?
              AND unidade_id IN ({placeholders})
            """,
            tuple([start_iso, end_iso] + [int(u) for u in units]),
        )

        if rows:
            sql = """
                INSERT INTO agenda_occupancy_daily (
                  data_ref, unidade_id, unidade_nome, especialidade_id, especialidade_nome,
                  agendamentos_count, horarios_disponiveis_count, horarios_bloqueados_count,
                  capacidade_liquida_count, taxa_confirmacao_pct, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(data_ref, unidade_id, especialidade_id) DO UPDATE SET
                  unidade_nome = excluded.unidade_nome,
                  especialidade_nome = excluded.especialidade_nome,
                  agendamentos_count = excluded.agendamentos_count,
                  horarios_disponiveis_count = excluded.horarios_disponiveis_count,
                  horarios_bloqueados_count = excluded.horarios_bloqueados_count,
                  capacidade_liquida_count = excluded.capacidade_liquida_count,
                  taxa_confirmacao_pct = excluded.taxa_confirmacao_pct,
                  updated_at = excluded.updated_at
            """
            if hasattr(conn, "executemany"):
                conn.executemany(sql, rows)
            else:
                for item in rows:
                    conn.execute(sql, item)

        if not db.use_turso:
            conn.commit()
    finally:
        conn.close()


def _process_job(db: "DatabaseManager", job: Dict):
    job_id = str(job.get("id"))
    start_iso = str(job.get("start_date"))
    end_iso = str(job.get("end_date"))
    units = _normalize_unit_scope(job.get("units"))
    requested_by = str(job.get("requested_by") or "manual")

    print(
        f"--- Agenda Occupancy | job={job_id} | periodo={start_iso}..{end_iso} "
        f"| unidades={','.join(map(str, units))} | requested_by={requested_by} ---"
    )
    db.update_heartbeat(
        SERVICE_NAME,
        STATUS_RUNNING,
        f"job={job_id} periodo={start_iso}..{end_iso} unidades={','.join(map(str, units))}",
    )

    token = _get_api_token()
    session = _make_session()

    specialty_names = _list_specialties(session, token)
    unit_prof_specs: Dict[int, Dict[int, Set[int]]] = {}
    unit_specialties: Dict[int, Set[int]] = {}

    agendamentos: Dict[Tuple[str, int, int], int] = defaultdict(int)
    disponiveis: Dict[Tuple[str, int, int], int] = defaultdict(int)
    bloqueados: Dict[Tuple[str, int, int], int] = defaultdict(int)

    for unit_id in units:
        prof_specs, specialty_names_from_prof = _list_professionals_by_unit(session, token, unit_id)
        unit_prof_specs[unit_id] = prof_specs
        unit_specialties[unit_id] = set()
        for sid, sname in specialty_names_from_prof.items():
            if sid > 0 and sid not in specialty_names:
                specialty_names[sid] = sname
        for specs in prof_specs.values():
            for sid in specs:
                if sid > 0:
                    unit_specialties[unit_id].add(sid)

        print(
            f"[agenda_occupancy] unidade={unit_id} profissionais={len(prof_specs)} "
            f"especialidades={len(unit_specialties[unit_id])}"
        )

        agg_ag, appt_active_prof_by_spec = _aggregate_appointments(session, token, unit_id, start_iso, end_iso)
        for k, v in agg_ag.items():
            agendamentos[k] += int(v or 0)
            unit_specialties[unit_id].add(k[2])

        agg_disp, avail_active_prof_by_spec = _aggregate_available_slots(
            session=session,
            token=token,
            unit_id=unit_id,
            start_iso=start_iso,
            end_iso=end_iso,
            unit_specialties=unit_specialties[unit_id],
            prof_specs=prof_specs,
        )
        for k, v in agg_disp.items():
            disponiveis[k] += int(v or 0)
            unit_specialties[unit_id].add(k[2])

        active_prof_by_spec: Dict[int, Set[int]] = defaultdict(set)
        for source in (appt_active_prof_by_spec, avail_active_prof_by_spec):
            for sid, pset in (source or {}).items():
                sid_int = int(sid or 0)
                if sid_int <= 0:
                    continue
                for pid in (pset or set()):
                    pid_int = int(pid or 0)
                    if pid_int > 0:
                        active_prof_by_spec[sid_int].add(pid_int)

        agg_bloq = _aggregate_blocked_slots(
            session=session,
            token=token,
            unit_id=unit_id,
            start_iso=start_iso,
            end_iso=end_iso,
            prof_specs=prof_specs,
            unit_specialties=unit_specialties[unit_id],
            allowed_prof_by_spec=dict(active_prof_by_spec),
        )
        for k, v in agg_bloq.items():
            bloqueados[k] += int(v or 0)
            unit_specialties[unit_id].add(k[2])

    rows, anomaly_count = _build_daily_rows(
        start_iso=start_iso,
        end_iso=end_iso,
        units=units,
        specialty_names=specialty_names,
        unit_specialties=unit_specialties,
        agendamentos=dict(agendamentos),
        disponiveis=dict(disponiveis),
        bloqueados=dict(bloqueados),
    )

    _replace_rows_for_period(
        db=db,
        start_iso=start_iso,
        end_iso=end_iso,
        units=units,
        rows=rows,
    )

    details = (
        f"job={job_id} rows={len(rows)} anomalias_capacidade={anomaly_count} "
        f"periodo={start_iso}..{end_iso}"
    )
    _mark_job_done(db, job_id, STATUS_COMPLETED, "")
    db.update_heartbeat(SERVICE_NAME, STATUS_COMPLETED, details)
    print(f"--- Agenda Occupancy finalizado | job={job_id} | rows={len(rows)} ---")


def process_pending_agenda_occupancy_jobs_once(
    auto_enqueue_if_empty: bool = False,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    unit_scope: Optional[List[int]] = None,
    requested_by: str = "system_status",
) -> bool:
    db = DatabaseManager()
    _ensure_tables(db)

    job = _get_pending_job(db)
    if not job and auto_enqueue_if_empty:
        if start_date and end_date:
            start_iso = _to_iso_date(start_date)
            end_iso = _to_iso_date(end_date)
        else:
            period_ref = _normalize_period_ref(None)
            start_iso, end_iso = _period_to_range(period_ref)
        if not start_iso or not end_iso:
            raise RuntimeError("Nao foi possivel determinar periodo para auto enqueue.")

        created = enqueue_agenda_occupancy_job(
            start_date=start_iso,
            end_date=end_iso,
            unit_scope=unit_scope,
            requested_by=requested_by,
            db=db,
            initial_status=STATUS_RUNNING,
        )
        print(
            f"Job agenda_occupancy criado automaticamente | id={created['id']} "
            f"periodo={created['start_date']}..{created['end_date']}"
        )
        job = {
            "id": created["id"],
            "start_date": created["start_date"],
            "end_date": created["end_date"],
            "units": created["unit_scope"],
            "requested_by": created["requested_by"],
        }
        preclaimed = True
    else:
        preclaimed = False

    if not job:
        db.update_heartbeat(SERVICE_NAME, STATUS_COMPLETED, "Sem jobs pendentes")
        return False

    if not preclaimed:
        _mark_job_running(db, str(job.get("id")))

    try:
        _process_job(db, job)
    except Exception as exc:
        error_msg = str(exc)
        _mark_job_done(db, str(job.get("id")), STATUS_FAILED, error_msg)
        db.update_heartbeat(SERVICE_NAME, STATUS_FAILED, f"job={job.get('id')} erro={error_msg}")
        print(f"[agenda_occupancy] erro fatal no job {job.get('id')}: {error_msg}")
    return True


def run_agenda_occupancy_loop():
    print(f"[agenda_occupancy] worker loop iniciado. poll={POLL_INTERVAL_SEC}s")
    while True:
        try:
            process_pending_agenda_occupancy_jobs_once()
        except Exception as exc:
            try:
                db = DatabaseManager()
                db.update_heartbeat(SERVICE_NAME, STATUS_FAILED, f"loop_error={exc}")
            except Exception:
                pass
            print(f"[agenda_occupancy] loop error: {exc}")
        time.sleep(POLL_INTERVAL_SEC)


def _cli():
    args = sys.argv[1:]
    start_arg = ""
    end_arg = ""
    period_arg = ""
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
        elif token.startswith("--period="):
            period_arg = token.split("=", 1)[1].strip()
        elif token == "--period" and i + 1 < len(args):
            period_arg = str(args[i + 1] or "").strip()
        elif token.startswith("--units="):
            units_arg = token.split("=", 1)[1].strip()
        elif token == "--units" and i + 1 < len(args):
            units_arg = str(args[i + 1] or "").strip()
        elif token.startswith("--requested-by="):
            requested_by_arg = token.split("=", 1)[1].strip() or "manual_cli"
        elif token == "--requested-by" and i + 1 < len(args):
            requested_by_arg = str(args[i + 1] or "").strip() or "manual_cli"

    units = _normalize_unit_scope(units_arg)

    if period_arg and not (start_arg and end_arg):
        period_ref = _normalize_period_ref(period_arg)
        start_arg, end_arg = _period_to_range(period_ref)

    if "--enqueue" in args:
        if not start_arg or not end_arg:
            period_ref = _normalize_period_ref(None)
            start_arg, end_arg = _period_to_range(period_ref)
        job = enqueue_agenda_occupancy_job(
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
            process_pending_agenda_occupancy_jobs_once()
        return

    if "--once" in args:
        had_job = process_pending_agenda_occupancy_jobs_once(
            auto_enqueue_if_empty=bool(start_arg and end_arg),
            start_date=start_arg or None,
            end_date=end_arg or None,
            unit_scope=units,
            requested_by=requested_by_arg,
        )
        if not had_job:
            print("Sem jobs pendentes.")
        return

    run_agenda_occupancy_loop()


if __name__ == "__main__":
    _cli()
