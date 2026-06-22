import json
import os
import ssl
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from database_manager import DatabaseManager


SERVICE_NAME = "payroll_point_sync"
STATUS_PENDING = "PENDING"
STATUS_RUNNING = "RUNNING"
STATUS_COMPLETED = "COMPLETED"
STATUS_FAILED = "FAILED"
SYNC_ACTOR = "system_sync_tangerino"
HTTP_TIMEOUT_SEC = max(15, int(os.getenv("SOLIDES_SYNC_TIMEOUT_SEC", "45")))


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


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _safe_json(value: Any) -> Optional[str]:
    if value is None:
        return None
    try:
        return json.dumps(value, ensure_ascii=False)
    except Exception:
        return None


def _normalize_cpf(value: Any) -> Optional[str]:
    digits = "".join(ch for ch in _clean(value) if ch.isdigit())[:11]
    return digits or None


def _normalize_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    raw = _clean(value).lower()
    return raw in ("1", "true", "yes", "sim")


def _ensure_int(value: Any, fallback: int = 0) -> int:
    try:
        if value is None or value == "":
            return fallback
        return int(float(value))
    except Exception:
        return fallback


def _ensure_float(value: Any, fallback: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return fallback
        return float(value)
    except Exception:
        return fallback


def _execute(db: DatabaseManager, sql: str, params=()):
    conn = db.get_connection()
    try:
        result = conn.execute(sql, params)
        if not db.use_turso:
            conn.commit()
        return result
    finally:
        conn.close()


def _parse_iso_datetime(value: Any) -> Optional[datetime]:
    raw = _clean(value)
    if not raw:
        return None
    normalized = raw.replace("Z", "+00:00")
    if raw.endswith("Z") and "." in raw:
        normalized = raw.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except Exception:
        pass
    for fmt in (
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
    ):
        try:
            parsed = datetime.strptime(raw, fmt)
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=timezone.utc)
            return parsed
        except Exception:
            continue
    return None


def _parse_date(value: Any) -> Optional[str]:
    parsed = _parse_iso_datetime(value)
    if parsed is not None:
        return parsed.date().isoformat()
    raw = _clean(value)
    if len(raw) >= 10 and raw[4:5] == "-" and raw[7:8] == "-":
        return raw[:10]
    return None


def _to_millis_from_date(date_iso: str, end_of_day: bool = False) -> int:
    base = datetime.strptime(date_iso, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    if end_of_day:
        base = base + timedelta(days=1) - timedelta(milliseconds=1)
    return int(base.timestamp() * 1000)


def _duration_minutes_from_range(start_date: Optional[str], end_date: Optional[str]) -> int:
    if not start_date:
        return 0
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date or start_date, "%Y-%m-%d")
    return max(0, (end_dt - start_dt).days + 1)


def _ms_of_day_to_hhmm(value: Any) -> Optional[str]:
    if value is None or value == "":
        return None
    total_ms = _ensure_int(value, -1)
    if total_ms < 0:
        return None
    total_minutes = total_ms // 60000
    hours = (total_minutes // 60) % 24
    minutes = total_minutes % 60
    return f"{hours:02d}:{minutes:02d}"


def _ms_of_day_to_minutes(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    total_ms = _ensure_int(value, -1)
    if total_ms < 0:
        return None
    return total_ms // 60000


def _minutes_between(start: Optional[int], end: Optional[int]) -> int:
    if start is None or end is None:
        return 0
    return max(0, end - start)


def _minutes_from_hhmm(value: Optional[str]) -> Optional[int]:
    raw = _clean(value)
    if not raw or ":" not in raw:
        return None
    try:
        parts = raw.split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except Exception:
        return None


def _format_minutes_as_hhmm(total_minutes: int) -> str:
    sign = "-" if total_minutes < 0 else ""
    minutes = abs(int(total_minutes))
    return f"{sign}{minutes // 60:02d}:{minutes % 60:02d}"


def _extract_marks(records: Iterable[Dict[str, Any]]) -> List[str]:
    marks: List[Tuple[int, str]] = []
    for record in records or []:
        raw_long = record.get("startDateLong")
        raw_date = record.get("startDate") or record.get("date")
        dt = _parse_iso_datetime(raw_date)
        order_key = _ensure_int(raw_long, 0) if raw_long is not None else int(dt.timestamp()) if dt else 0
        if dt is None and raw_date:
            date_text = _clean(raw_date)
            normalized = date_text[11:16] if len(date_text) >= 16 else date_text
        else:
            normalized = dt.strftime("%H:%M") if dt else ""
        if normalized:
            marks.append((order_key, normalized))
    marks.sort(key=lambda item: (item[0], item[1]))
    return [item[1] for item in marks]


def _compute_break_minutes(mark_times: List[str]) -> int:
    total = 0
    minute_marks = [_minutes_from_hhmm(item) for item in mark_times]
    clean_marks = [item for item in minute_marks if item is not None]
    for index in range(1, len(clean_marks) - 1, 2):
        total += max(0, clean_marks[index + 1] - clean_marks[index])
    return total


def _resolve_schedule_timetable(work_schedule: Optional[Dict[str, Any]], point_date: str) -> Dict[str, Any]:
    if not work_schedule:
        return {}
    try:
        weekday = datetime.strptime(point_date, "%Y-%m-%d").weekday()
        day_code = ((weekday + 1) % 7) + 1
    except Exception:
        day_code = None
    timetable_list = work_schedule.get("workScheduleTimetableList") or []
    for timetable in timetable_list:
        if day_code is not None and _ensure_int(timetable.get("day"), -1) == day_code:
            return timetable
    return {}


def _compute_schedule_metrics(work_schedule: Optional[Dict[str, Any]], point_date: str) -> Dict[str, Any]:
    timetable = _resolve_schedule_timetable(work_schedule, point_date)
    if not timetable:
        return {
            "label": _clean((work_schedule or {}).get("name")) or None,
            "start": None,
            "end": None,
            "planned_minutes": 0,
            "expected_break_minutes": 0,
        }

    shift_ranges = []
    for index in range(1, 7):
        start = _ms_of_day_to_minutes(timetable.get(f"startShift{index}"))
        end = _ms_of_day_to_minutes(timetable.get(f"endShift{index}"))
        if start is None or end is None:
            continue
        shift_ranges.append((start, end))

    planned_minutes = sum(_minutes_between(start, end) for start, end in shift_ranges)
    expected_break_minutes = 0
    if len(shift_ranges) >= 2:
        expected_break_minutes = sum(
            max(0, shift_ranges[index + 1][0] - shift_ranges[index][1]) for index in range(len(shift_ranges) - 1)
        )
    else:
        expected_break_minutes = _minutes_between(
            _ms_of_day_to_minutes(timetable.get("startMainInterval")),
            _ms_of_day_to_minutes(timetable.get("endMainInterval")),
        )

    start_hhmm = _ms_of_day_to_hhmm(shift_ranges[0][0] * 60000) if shift_ranges else None
    end_hhmm = _ms_of_day_to_hhmm(shift_ranges[-1][1] * 60000) if shift_ranges else None
    return {
        "label": _clean((work_schedule or {}).get("name")) or None,
        "start": start_hhmm,
        "end": end_hhmm,
        "planned_minutes": planned_minutes,
        "expected_break_minutes": expected_break_minutes,
    }


class SolidesApiError(RuntimeError):
    pass


class SolidesClient:
    def __init__(self):
        self.token = (
            _clean(os.getenv("TANGERINO_INTEGRATION_TOKEN"))
            or _clean(os.getenv("SOLIDES_TANGERINO_INTEGRATION_TOKEN"))
            or _clean(os.getenv("SOLIDES_INTEGRATION_TOKEN"))
            or _clean(os.getenv("TANGERINO_AUTH_TOKEN"))
        )
        if not self.token:
            raise SolidesApiError(
                "Token da integração Sólides/Tangerino não encontrado. Configure TANGERINO_INTEGRATION_TOKEN ou SOLIDES_TANGERINO_INTEGRATION_TOKEN."
            )
        self.punch_base = _clean(os.getenv("TANGERINO_PUNCH_API_BASE")) or "https://api.tangerino.com.br/api/punch"
        self.employer_base = _clean(os.getenv("TANGERINO_EMPLOYER_API_BASE")) or "https://api.tangerino.com.br/api/employer"
        self._ssl_context = ssl.create_default_context()

    def _paginate(self, path: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        page = 0
        size = 200
        while True:
            payload = self._request_json(
                self.employer_base,
                path,
                {
                    **(params or {}),
                    "page": page,
                    "size": size,
                },
            ) or {}
            content = payload.get("content") if isinstance(payload, dict) else payload if isinstance(payload, list) else []
            if not content:
                break
            items.extend(content)
            total_pages = _ensure_int(payload.get("totalPages"), page + 1) if isinstance(payload, dict) else page + 1
            page += 1
            if page >= total_pages:
                break
        return items

    def _request_json(self, base_url: str, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        query_params = {}
        for key, value in (params or {}).items():
            if value is None or value == "":
                continue
            query_params[key] = value
        query = f"?{urlencode(query_params, doseq=True)}" if query_params else ""
        url = f"{base_url.rstrip('/')}{path}{query}"
        request = Request(
            url,
            headers={
                "Authorization": f"Basic {self.token}",
                "Accept": "application/json",
                "User-Agent": "consultare-hub/solides-sync",
            },
            method="GET",
        )
        try:
            with urlopen(request, timeout=HTTP_TIMEOUT_SEC, context=self._ssl_context) as response:
                content = response.read().decode("utf-8")
                if not content:
                    return None
                return json.loads(content)
        except HTTPError as exc:
            body = exc.read().decode("utf-8", "ignore")
            if exc.code == 404:
                return None
            raise SolidesApiError(f"Erro HTTP {exc.code} em {path}: {body[:300] or exc.reason}") from exc
        except URLError as exc:
            raise SolidesApiError(f"Falha de rede ao acessar {path}: {exc}") from exc

    def list_employees(self) -> List[Dict[str, Any]]:
        direct_items = self._paginate("/employee/find-all", {"showFired": 1})
        if direct_items:
            return direct_items

        electronic_watch_items = self._request_json(
            self.employer_base,
            "/electronic-watch/employees",
            {"page": 0, "size": 1000},
        ) or []
        if not isinstance(electronic_watch_items, list):
            return []

        items: List[Dict[str, Any]] = []
        seen_ids = set()
        for base_item in electronic_watch_items:
            tangerino_id = _clean(base_item.get("code") or base_item.get("id"))
            if not tangerino_id:
                continue
            detail = self._request_json(
                self.employer_base,
                "/employee/find",
                {"tangerinoId": tangerino_id},
            ) or {}
            if not isinstance(detail, dict):
                detail = {}

            merged = dict(base_item)
            merged.update(detail)
            merged["id"] = detail.get("id") or base_item.get("code") or base_item.get("id")
            merged["externalId"] = detail.get("externalId") if detail.get("externalId") not in (None, "") else base_item.get("externalId")
            merged["cpf"] = detail.get("cpf") or base_item.get("cpf")
            merged["name"] = detail.get("name") or base_item.get("name")
            merged["fired"] = detail.get("fired") if detail.get("fired") is not None else _normalize_bool(base_item.get("demitido"))
            merged["_employee_source"] = "electronic-watch+employee-find"

            merged_id = _clean(merged.get("id"))
            if not merged_id or merged_id in seen_ids:
                continue
            seen_ids.add(merged_id)
            items.append(merged)
        return items

    def list_work_schedules(self) -> Dict[str, Dict[str, Any]]:
        items: Dict[str, Dict[str, Any]] = {}
        for item in self._paginate("/work-schedule"):
            item_id = _clean(item.get("id"))
            if item_id:
                items[item_id] = item
        return items

    def get_daily_activity(self, employee_id: str, start_ms: int, end_ms: int) -> List[Dict[str, Any]]:
        payload = self._request_json(
            self.punch_base,
            "/daily-activity",
            {
                "employeeId": employee_id,
                "startDate": start_ms,
                "endDate": end_ms,
                "punchList": "true",
                "adjustmentList": "true",
                "pendingList": "true",
                "showFired": "true",
            },
        )
        if not isinstance(payload, list):
            return []

        day_map: Dict[str, Dict[str, Any]] = {}
        for employee_payload in payload:
            for list_key, field_name in (
                ("punchs", "records"),
                ("adjustments", "adjustments"),
                ("pendingPunchs", "pending_records"),
            ):
                for item in employee_payload.get(list_key) or []:
                    date_iso = _parse_date(item.get("date"))
                    if not date_iso:
                        continue
                    bucket = day_map.setdefault(
                        date_iso,
                        {
                            "date": date_iso,
                            "records": [],
                            "adjustments": [],
                            "pending_records": [],
                            "pendingsCount": 0,
                            "markings": item.get("markings"),
                            "holiday": item.get("holiday"),
                            "totalWorkedHoursInSeconds": item.get("totalWorkedHoursInSeconds"),
                        },
                    )
                    values = item.get(field_name) or []
                    if isinstance(values, list):
                        bucket[field_name].extend(values)
                    if list_key == "pendingPunchs":
                        bucket["pendingsCount"] = max(bucket["pendingsCount"], _ensure_int(item.get("pendingsCount")))
                    if item.get("markings") and not bucket.get("markings"):
                        bucket["markings"] = item.get("markings")
                    if item.get("holiday") is not None:
                        bucket["holiday"] = item.get("holiday")
                    if item.get("totalWorkedHoursInSeconds") is not None:
                        bucket["totalWorkedHoursInSeconds"] = item.get("totalWorkedHoursInSeconds")

        for bucket in day_map.values():
            if bucket.get("pending_records"):
                bucket["pendingsCount"] = max(bucket["pendingsCount"], len(bucket["pending_records"]))
        return list(day_map.values())

    def get_hours_balance(self, employee_id: Optional[str], external_id: Optional[str], start_ms: int, end_ms: int) -> Optional[Dict[str, Any]]:
        payload = self._request_json(
            self.punch_base,
            "/hoursBalance",
            {
                "employeeId": employee_id,
                "externalId": external_id,
                "startDate": start_ms,
                "endDate": end_ms,
            },
        )
        if isinstance(payload, list):
            return payload[0] if payload else None
        return payload if isinstance(payload, dict) else None

    def get_adjustments(self, employee_id: str, start_ms: int, end_ms: int) -> List[Dict[str, Any]]:
        payload = self._request_json(
            self.employer_base,
            f"/v2/adjustments/employees/{employee_id}",
            {"startDate": start_ms, "endDate": end_ms},
        )
        return payload if isinstance(payload, list) else []

    def get_last_signature(self, employee_id: str) -> Optional[Dict[str, Any]]:
        payload = self._request_json(
            self.employer_base,
            "/digital-signature/get-last-pending",
            {"employeeId": employee_id, "page": 0, "size": 1},
        )
        if isinstance(payload, list):
            return payload[0] if payload else None
        return payload if isinstance(payload, dict) else None

    def get_signature_params(self) -> Optional[Dict[str, Any]]:
        payload = self._request_json(self.employer_base, "/employer/params")
        return payload if isinstance(payload, dict) else None


def _ensure_tables(db: DatabaseManager):
    _execute(
        db,
        """
        CREATE TABLE IF NOT EXISTS payroll_point_sync_jobs (
          id VARCHAR(64) PRIMARY KEY,
          period_id VARCHAR(64) NOT NULL,
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
        CREATE TABLE IF NOT EXISTS payroll_point_sync_runs (
          id VARCHAR(64) PRIMARY KEY,
          period_id VARCHAR(64) NOT NULL,
          job_id VARCHAR(64) NULL,
          status VARCHAR(20) NOT NULL,
          source_label VARCHAR(120) NOT NULL,
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


def _get_pending_job(db: DatabaseManager) -> Optional[Dict[str, Any]]:
    rows = db.execute_query(
        """
        SELECT
          j.id,
          j.period_id,
          j.requested_by,
          p.month_ref,
          p.period_start,
          p.period_end,
          r.id AS run_id
        FROM payroll_point_sync_jobs j
        INNER JOIN payroll_periods p ON p.id = j.period_id
        LEFT JOIN payroll_point_sync_runs r ON r.job_id = j.id
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
        "requested_by": _clean(_row_get(row, "requested_by", 2)) or "system_status",
        "month_ref": _clean(_row_get(row, "month_ref", 3)),
        "period_start": _clean(_row_get(row, "period_start", 4)),
        "period_end": _clean(_row_get(row, "period_end", 5)),
        "run_id": _clean(_row_get(row, "run_id", 6)),
    }


def _mark_job_running(db: DatabaseManager, job_id: str):
    now = _now_iso()
    _execute(
        db,
        "UPDATE payroll_point_sync_jobs SET status = ?, error_message = NULL, started_at = ?, finished_at = NULL WHERE id = ?",
        (STATUS_RUNNING, now, job_id),
    )


def _mark_job_done(db: DatabaseManager, job_id: str, status: str, error_message: Optional[str] = None):
    now = _now_iso()
    _execute(
        db,
        "UPDATE payroll_point_sync_jobs SET status = ?, error_message = ?, finished_at = ? WHERE id = ?",
        (status, _clean(error_message) or None, now, job_id),
    )


def _mark_run_running(db: DatabaseManager, run_id: Optional[str], details: Optional[str] = None):
    if not run_id:
        return
    now = _now_iso()
    _execute(
        db,
        "UPDATE payroll_point_sync_runs SET status = ?, details = ?, started_at = ?, finished_at = NULL WHERE id = ?",
        (STATUS_RUNNING, details, now, run_id),
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
):
    if not run_id:
        return
    now = _now_iso()
    _execute(
        db,
        """
        UPDATE payroll_point_sync_runs
        SET status = ?, details = ?, synchronized_employees = ?, synchronized_days = ?,
            unmatched_employees = ?, pending_adjustments = ?, pending_signatures = ?,
            finished_at = ?
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
            now,
            run_id,
        ),
    )


def _load_local_employees(db: DatabaseManager, period_start: str, period_end: str) -> List[Dict[str, Any]]:
    rows = db.execute_query(
        """
        SELECT
          id,
          full_name,
          cpf,
          employment_regime,
          solides_employee_id,
          solides_external_id,
          admission_date,
          termination_date
        FROM employees
        WHERE (admission_date IS NULL OR admission_date <= ?)
          AND (termination_date IS NULL OR termination_date >= ?)
        ORDER BY full_name ASC
        """,
        (period_end, period_start),
    ) or []
    items = []
    for row in rows:
        items.append(
            {
                "id": _clean(_row_get(row, "id", 0)),
                "full_name": _clean(_row_get(row, "full_name", 1)),
                "cpf": _normalize_cpf(_row_get(row, "cpf", 2)),
                "employment_regime": _clean(_row_get(row, "employment_regime", 3)).upper(),
                "solides_employee_id": _clean(_row_get(row, "solides_employee_id", 4)),
                "solides_external_id": _clean(_row_get(row, "solides_external_id", 5)),
                "admission_date": _parse_date(_row_get(row, "admission_date", 6)),
                "termination_date": _parse_date(_row_get(row, "termination_date", 7)),
            }
        )
    return items


def _build_local_lookup(local_employees: List[Dict[str, Any]]) -> Dict[str, Dict[str, Dict[str, Any]]]:
    by_solides_id: Dict[str, Dict[str, Any]] = {}
    by_external_id: Dict[str, Dict[str, Any]] = {}
    for employee in local_employees:
        solids_id = _clean(employee.get("solides_employee_id"))
        external_id = _clean(employee.get("solides_external_id"))
        if solids_id and solids_id not in by_solides_id:
            by_solides_id[solids_id] = employee
        if external_id and external_id not in by_external_id:
            by_external_id[external_id] = employee
    return {"by_solides_id": by_solides_id, "by_external_id": by_external_id}


def _resolve_local_employee(remote_employee: Dict[str, Any], local_lookup: Dict[str, Dict[str, Dict[str, Any]]]) -> Optional[Dict[str, Any]]:
    remote_id = _clean(remote_employee.get("id"))
    if remote_id and remote_id in local_lookup["by_solides_id"]:
        return local_lookup["by_solides_id"][remote_id]
    external_id = _clean(remote_employee.get("externalId"))
    if external_id and external_id in local_lookup["by_external_id"]:
        return local_lookup["by_external_id"][external_id]
    return None


def _build_remote_employees_by_id(remote_items: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    result: Dict[str, Dict[str, Any]] = {}
    for item in remote_items:
        item_id = _clean(item.get("id"))
        if item_id:
            result[item_id] = item
    return result


def _build_adjustment_maps(adjustments: List[Dict[str, Any]]) -> Dict[str, Any]:
    by_date: Dict[str, List[Dict[str, Any]]] = {}
    pending_count = 0
    for item in adjustments or []:
        status = _clean(item.get("status")).upper()
        if status == "PENDENTE":
            pending_count += 1
        start_date = _parse_date(item.get("startDate")) or _parse_date(item.get("recordDate"))
        end_date = _parse_date(item.get("endDate")) or start_date
        if not start_date:
            continue
        current = datetime.strptime(start_date, "%Y-%m-%d")
        last = datetime.strptime(end_date or start_date, "%Y-%m-%d")
        while current <= last:
            key = current.date().isoformat()
            by_date.setdefault(key, []).append(item)
            current += timedelta(days=1)
    return {"by_date": by_date, "pending_count": pending_count}


def _normalize_occurrence_type(adjustment: Dict[str, Any]) -> str:
    reason = _clean(adjustment.get("reason")).upper()
    adjustment_type = _clean(adjustment.get("type")).upper()
    combined = f"{adjustment_type} {reason}"
    if "FER" in combined:
        return "FERIAS"
    if "ATEST" in combined:
        return "ATESTADO"
    if "DECLAR" in combined:
        return "DECLARACAO"
    if "FALTA" in combined:
        return "AUSENCIA_AUTORIZADA"
    return "AJUSTE_BATIDA"


def _replace_period_occurrences(db: DatabaseManager, period_id: str, occurrence_rows: List[Dict[str, Any]]):
    _execute(
        db,
        "DELETE FROM payroll_occurrences WHERE period_id = ? AND created_by = ?",
        (period_id, SYNC_ACTOR),
    )
    now = _now_iso()
    for item in occurrence_rows:
        _execute(
            db,
            """
            INSERT INTO payroll_occurrences (
              id, period_id, employee_id, occurrence_type, date_start, date_end, effect_code, notes,
              storage_provider, storage_bucket, storage_key, original_name, mime_type, size_bytes,
              created_by, updated_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?)
            """,
            (
                item["id"],
                period_id,
                item["employee_id"],
                item["occurrence_type"],
                item["date_start"],
                item["date_end"],
                item.get("effect_code"),
                item.get("notes"),
                SYNC_ACTOR,
                SYNC_ACTOR,
                now,
                now,
            ),
        )


def _replace_point_rows(db: DatabaseManager, period_id: str, point_rows: List[Dict[str, Any]]):
    _execute(db, "DELETE FROM payroll_point_daily WHERE period_id = ?", (period_id,))
    now = _now_iso()
    for row in point_rows:
        _execute(
            db,
            """
            INSERT INTO payroll_point_daily (
              id, period_id, employee_id, solides_employee_id, employee_code, employee_name, employee_cpf, point_date,
              department, schedule_label, schedule_start, schedule_end, marks_json, raw_day_text,
              planned_minutes, worked_minutes, late_minutes, day_balance_minutes, break_minutes, expected_break_minutes, break_overrun_minutes,
              absence_flag, inconsistency_flag, justification_text, source_file_id, source_payload_json, sync_run_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
            """,
            (
                row["id"],
                period_id,
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
                1 if row.get("absence_flag") else 0,
                1 if row.get("inconsistency_flag") else 0,
                row.get("justification_text"),
                row.get("source_payload_json"),
                row.get("sync_run_id"),
                now,
                now,
            ),
        )


def _replace_hours_balances(db: DatabaseManager, period_id: str, items: List[Dict[str, Any]]):
    _execute(db, "DELETE FROM payroll_hours_balance_monthly WHERE period_id = ?", (period_id,))
    now = _now_iso()
    for item in items:
        _execute(
            db,
            """
            INSERT INTO payroll_hours_balance_monthly (
              id, period_id, employee_id, solides_employee_id, employee_name, employee_cpf,
              balance_minutes, reference_start, reference_end, source_payload_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item["id"],
                period_id,
                item.get("employee_id"),
                item.get("solides_employee_id"),
                item["employee_name"],
                item.get("employee_cpf"),
                item.get("balance_minutes", 0),
                item.get("reference_start"),
                item.get("reference_end"),
                item.get("source_payload_json"),
                now,
                now,
            ),
        )


def _replace_signatures(db: DatabaseManager, period_id: str, items: List[Dict[str, Any]]):
    _execute(db, "DELETE FROM payroll_signature_monthly WHERE period_id = ?", (period_id,))
    now = _now_iso()
    for item in items:
        _execute(
            db,
            """
            INSERT INTO payroll_signature_monthly (
              id, period_id, employee_id, solides_employee_id, employee_name, employee_cpf,
              status, document_type, document_date, start_date, end_date, signed_at, message, source_payload_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item["id"],
                period_id,
                item.get("employee_id"),
                item.get("solides_employee_id"),
                item["employee_name"],
                item.get("employee_cpf"),
                item.get("status"),
                item.get("document_type"),
                item.get("document_date"),
                item.get("start_date"),
                item.get("end_date"),
                item.get("signed_at"),
                item.get("message"),
                item.get("source_payload_json"),
                now,
                now,
            ),
        )


def _build_signature_row(period_start: str, period_end: str, remote_employee: Dict[str, Any], local_employee: Optional[Dict[str, Any]], payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not payload:
        return None
    start_date = _parse_date(payload.get("startDate"))
    end_date = _parse_date(payload.get("endDate"))
    document_date = _parse_date(payload.get("documentDate"))
    signed_at = _parse_date(payload.get("signatureDate"))
    if start_date and start_date > period_end:
        return None
    if end_date and end_date < period_start:
        return None
    return {
        "id": str(uuid.uuid4()),
        "employee_id": (local_employee or {}).get("id"),
        "solides_employee_id": _clean(remote_employee.get("id")) or (local_employee or {}).get("solides_employee_id"),
        "employee_name": (local_employee or {}).get("full_name") or _clean(remote_employee.get("name")) or "Sem nome",
        "employee_cpf": (local_employee or {}).get("cpf") or _normalize_cpf(remote_employee.get("cpf")),
        "status": _clean(payload.get("status")).upper() or "PENDENTE",
        "document_type": _clean(payload.get("type")) or "FOLHA_PONTO",
        "document_date": document_date,
        "start_date": start_date,
        "end_date": end_date,
        "signed_at": signed_at,
        "message": _clean(payload.get("message")) or _clean(payload.get("contestation")) or None,
        "source_payload_json": _safe_json(payload),
    }


def _build_occurrence_rows(period_start: str, period_end: str, local_employee: Dict[str, Any], adjustments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for adjustment in adjustments or []:
        status = _clean(adjustment.get("status")).upper()
        if status != "APROVADO":
            continue
        start_date = _parse_date(adjustment.get("startDate")) or _parse_date(adjustment.get("recordDate"))
        end_date = _parse_date(adjustment.get("endDate")) or start_date
        if not start_date:
            continue
        if end_date and end_date < period_start:
            continue
        if start_date > period_end:
            continue
        items.append(
            {
                "id": str(uuid.uuid4()),
                "employee_id": local_employee["id"],
                "occurrence_type": _normalize_occurrence_type(adjustment),
                "date_start": start_date,
                "date_end": end_date or start_date,
                "effect_code": status,
                "notes": _clean(adjustment.get("reason")) or _clean(adjustment.get("justification")) or None,
            }
        )
    return items


def _build_daily_rows_for_employee(
    period_start: str,
    period_end: str,
    remote_employee: Dict[str, Any],
    local_employee: Optional[Dict[str, Any]],
    work_schedule: Optional[Dict[str, Any]],
    daily_activity: List[Dict[str, Any]],
    sync_run_id: Optional[str],
) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    date_cursor = datetime.strptime(period_start, "%Y-%m-%d")
    end_cursor = datetime.strptime(period_end, "%Y-%m-%d")
    activity_by_date: Dict[str, Dict[str, Any]] = {}
    while date_cursor <= end_cursor:
        date_iso = date_cursor.date().isoformat()
        activity_by_date[date_iso] = {"date": date_iso, "records": [], "adjustments": [], "pendingsCount": 0}
        date_cursor += timedelta(days=1)

    for entry in daily_activity or []:
        date_iso = _parse_date(entry.get("date"))
        if not date_iso or date_iso < period_start or date_iso > period_end:
            continue
        activity_by_date[date_iso] = entry

    for point_date, activity in sorted(activity_by_date.items()):
        schedule_metrics = _compute_schedule_metrics(work_schedule, point_date)
        records = activity.get("records") or []
        marks = _extract_marks(records)
        worked_minutes = int(round(_ensure_float(activity.get("totalWorkedHoursInSeconds")) / 60.0))
        expected_break_minutes = schedule_metrics["expected_break_minutes"]
        break_minutes = _compute_break_minutes(marks)
        first_mark_minutes = _minutes_from_hhmm(marks[0]) if marks else None
        schedule_start_minutes = _minutes_from_hhmm(schedule_metrics["start"])
        late_minutes = 0
        if first_mark_minutes is not None and schedule_start_minutes is not None:
            late_minutes = max(0, first_mark_minutes - schedule_start_minutes)

        adjustments = activity.get("adjustments") or []
        approved_adjustments = [item for item in adjustments if _clean(item.get("status")).upper() == "APROVADO"]
        absence_flag = bool(schedule_metrics["planned_minutes"] > 0 and not marks and not approved_adjustments)
        justifications = [_clean(item.get("justification")) or _clean(item.get("adjustmentReason")) for item in adjustments]
        justifications = [item for item in justifications if item]
        day_balance_minutes = worked_minutes - schedule_metrics["planned_minutes"]
        items.append(
            {
                "id": str(uuid.uuid4()),
                "employee_id": (local_employee or {}).get("id"),
                "solides_employee_id": _clean(remote_employee.get("id")) or (local_employee or {}).get("solides_employee_id"),
                "employee_code": _clean(remote_employee.get("externalId")) or None,
                "employee_name": (local_employee or {}).get("full_name") or _clean(remote_employee.get("name")) or "Sem nome",
                "employee_cpf": (local_employee or {}).get("cpf") or _normalize_cpf(remote_employee.get("cpf")),
                "point_date": point_date,
                "department": _clean(((remote_employee.get("currentWorkplaceDTO") or {}).get("name"))) or None,
                "schedule_label": schedule_metrics["label"],
                "schedule_start": schedule_metrics["start"],
                "schedule_end": schedule_metrics["end"],
                "marks": marks,
                "raw_day_text": _clean(activity.get("markings")) or None,
                "planned_minutes": schedule_metrics["planned_minutes"],
                "worked_minutes": worked_minutes,
                "late_minutes": late_minutes,
                "day_balance_minutes": day_balance_minutes,
                "break_minutes": break_minutes,
                "expected_break_minutes": expected_break_minutes,
                "break_overrun_minutes": max(0, break_minutes - expected_break_minutes),
                "absence_flag": absence_flag,
                "inconsistency_flag": _ensure_int(activity.get("pendingsCount"), 0) > 0,
                "justification_text": "; ".join(justifications) if justifications else None,
                "source_payload_json": _safe_json(
                    {
                        "pendingsCount": activity.get("pendingsCount"),
                        "records": records,
                        "adjustments": adjustments,
                        "holiday": activity.get("holiday"),
                    }
                ),
                "sync_run_id": sync_run_id,
            }
        )
    return items


def _process_job(db: DatabaseManager, job: Dict[str, Any]):
    client = SolidesClient()
    db.update_heartbeat(SERVICE_NAME, STATUS_RUNNING, f"job={job['id']} competencia={job['month_ref']}")
    _mark_run_running(db, job.get("run_id"), "Sincronização com a API Sólides/Tangerino em andamento.")

    start_ms = _to_millis_from_date(job["period_start"])
    end_ms = _to_millis_from_date(job["period_end"], end_of_day=True)
    local_employees = _load_local_employees(db, job["period_start"], job["period_end"])
    local_lookup = _build_local_lookup(local_employees)

    remote_employees = client.list_employees()
    remote_employees_by_id = _build_remote_employees_by_id(remote_employees)

    point_rows: List[Dict[str, Any]] = []
    hours_balance_rows: List[Dict[str, Any]] = []
    signature_rows: List[Dict[str, Any]] = []
    occurrence_rows: List[Dict[str, Any]] = []

    synchronized_employee_keys = set()
    unmatched_local_links = []
    pending_adjustments = 0
    pending_signatures = 0

    ged_signature_enabled = None
    try:
        signature_params = client.get_signature_params() or {}
        ged_signature_enabled = signature_params.get("gedSignature")
    except Exception:
        ged_signature_enabled = None

    for local_employee in local_employees:
        linked_id = _clean(local_employee.get("solides_employee_id"))
        if not linked_id:
            continue
        remote_employee = remote_employees_by_id.get(linked_id)
        if remote_employee is None:
            unmatched_local_links.append(local_employee)
            continue

        synchronized_employee_keys.add(linked_id)
        work_schedule = remote_employee.get("currentWorkSchedule") or {}

        daily_activity = client.get_daily_activity(linked_id, start_ms, end_ms)
        point_rows.extend(
            _build_daily_rows_for_employee(
                job["period_start"],
                job["period_end"],
                remote_employee,
                local_employee,
                work_schedule,
                daily_activity,
                job.get("run_id"),
            )
        )

        hours_balance = client.get_hours_balance(linked_id, _clean(remote_employee.get("externalId")) or None, start_ms, end_ms)
        if hours_balance:
            hours_balance_rows.append(
                {
                    "id": str(uuid.uuid4()),
                    "employee_id": local_employee["id"],
                    "solides_employee_id": linked_id,
                    "employee_name": local_employee["full_name"],
                    "employee_cpf": local_employee["cpf"],
                    "balance_minutes": _ensure_int(hours_balance.get("hoursBalanceInMinutes")),
                    "reference_start": job["period_start"],
                    "reference_end": job["period_end"],
                    "source_payload_json": _safe_json(hours_balance),
                }
            )

        adjustments = client.get_adjustments(linked_id, start_ms, end_ms)
        pending_adjustments += _build_adjustment_maps(adjustments)["pending_count"]
        occurrence_rows.extend(_build_occurrence_rows(job["period_start"], job["period_end"], local_employee, adjustments))

        try:
            signature_payload = client.get_last_signature(linked_id)
        except Exception as exc:
            signature_payload = None
            print(f"[payroll_point_sync] aviso ao consultar assinatura do colaborador {linked_id}: {exc}")
        signature_row = _build_signature_row(job["period_start"], job["period_end"], remote_employee, local_employee, signature_payload or {})
        if signature_row:
            signature_rows.append(signature_row)
            if signature_row["status"] in ("PENDENTE", "PROCESSANDO"):
                pending_signatures += 1

    # Registros remotos sem vínculo local explícito continuam visíveis na prontidão.
    for remote_employee in remote_employees:
        remote_id = _clean(remote_employee.get("id"))
        if not remote_id or remote_id in synchronized_employee_keys:
            continue
        local_employee = _resolve_local_employee(remote_employee, local_lookup)
        if local_employee is not None:
            continue
        daily_activity = client.get_daily_activity(remote_id, start_ms, end_ms)
        if not daily_activity:
            continue
        work_schedule = remote_employee.get("currentWorkSchedule") or {}
        point_rows.extend(
            _build_daily_rows_for_employee(
                job["period_start"],
                job["period_end"],
                remote_employee,
                None,
                work_schedule,
                daily_activity,
                job.get("run_id"),
            )
        )

    _replace_point_rows(db, job["period_id"], point_rows)
    _replace_hours_balances(db, job["period_id"], hours_balance_rows)
    _replace_signatures(db, job["period_id"], signature_rows)
    _replace_period_occurrences(db, job["period_id"], occurrence_rows)

    remote_unmatched_keys = {
        f"{item.get('solides_employee_id')}::{item.get('employee_name')}::{item.get('employee_cpf')}"
        for item in point_rows
        if not item.get("employee_id")
    }
    unmatched_count = len(unmatched_local_links) + len(remote_unmatched_keys)
    details_parts = [
        f"{len(point_rows)} registro(s) diário(s) sincronizado(s).",
        f"{len(hours_balance_rows)} saldo(s) de banco de horas.",
        f"{len(signature_rows)} registro(s) de assinatura.",
        f"{len(occurrence_rows)} ocorrência(s) sincronizada(s).",
    ]
    if unmatched_local_links:
        sample_names = ", ".join(item["full_name"] for item in unmatched_local_links[:5])
        details_parts.append(f"Vínculos Sólides sem retorno: {len(unmatched_local_links)} ({sample_names}).")
    if ged_signature_enabled is False:
        details_parts.append("Assinatura digital desabilitada no empregador; estado mantido apenas como informativo.")
    details = " ".join(details_parts)

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
    )
    db.update_heartbeat(
        SERVICE_NAME,
        STATUS_COMPLETED,
        (
            f"job={job['id']} competencia={job['month_ref']} empregados={len(synchronized_employee_keys)} "
            f"dias={len(point_rows)} banco_horas={len(hours_balance_rows)} assinaturas={len(signature_rows)} "
            f"pendencias={pending_adjustments} assinaturas_pendentes={pending_signatures} nao_vinculados={unmatched_count}"
        ),
    )
    print(
        "[payroll_point_sync] job concluido | "
        f"id={job['id']} periodo={job['month_ref']} empregados={len(synchronized_employee_keys)} "
        f"dias={len(point_rows)} banco_horas={len(hours_balance_rows)} assinaturas={len(signature_rows)} "
        f"nao_vinculados={unmatched_count}"
    )


def process_pending_payroll_point_sync_jobs_once() -> bool:
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
        error_message = str(exc or "Falha na sincronização da Sólides/Tangerino.")
        _mark_job_done(db, job["id"], STATUS_FAILED, error_message)
        _mark_run_done(db, job.get("run_id"), STATUS_FAILED, error_message)
        db.update_heartbeat(SERVICE_NAME, STATUS_FAILED, f"job={job['id']} erro={error_message}")
        print(f"[payroll_point_sync] erro fatal no job {job['id']}: {error_message}")
    return True


def run_payroll_point_sync_loop(poll_interval_sec: int = 30):
    print(f"[payroll_point_sync] worker loop iniciado. poll={poll_interval_sec}s")
    while True:
        try:
            process_pending_payroll_point_sync_jobs_once()
        except Exception as exc:
            try:
                db = DatabaseManager()
                db.update_heartbeat(SERVICE_NAME, STATUS_FAILED, str(exc))
            except Exception:
                pass
            print(f"[payroll_point_sync] erro inesperado no loop: {exc}")
        finally:
            import time

            time.sleep(max(5, int(poll_interval_sec)))


if __name__ == "__main__":
    drained = 0
    while process_pending_payroll_point_sync_jobs_once():
        drained += 1
    print(f"[payroll_point_sync] jobs drenados={drained}")
