import base64
import json
import os
import ssl
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from database_manager import DatabaseManager
from storage_s3 import upload_s3_object_bytes


SERVICE_NAME = "payroll_point_sync"
STATUS_PENDING = "PENDING"
STATUS_RUNNING = "RUNNING"
STATUS_COMPLETED = "COMPLETED"
STATUS_FAILED = "FAILED"
SYNC_ACTOR = "system_sync_solides"
HTTP_TIMEOUT_SEC = max(15, int(os.getenv("SOLIDES_SYNC_TIMEOUT_SEC", "45")))
STAGE_DISCOVERING_EMPLOYEES = "DISCOVERING_EMPLOYEES"
STAGE_SYNCING_DAILY_ACTIVITY = "SYNCING_DAILY_ACTIVITY"
STAGE_SYNCING_BALANCES_AND_SIGNATURES = "SYNCING_BALANCES_AND_SIGNATURES"
STAGE_PERSISTING_DATA = "PERSISTING_DATA"
STAGE_FINALIZING = "FINALIZING"


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


def _infer_extension_from_content_type(content_type: str) -> str:
    normalized = _clean(content_type).lower()
    if "pdf" in normalized:
        return "pdf"
    if "spreadsheetml" in normalized or "xlsx" in normalized:
        return "xlsx"
    if "excel" in normalized or "xls" in normalized:
        return "xls"
    if "zip" in normalized:
        return "zip"
    if "json" in normalized:
        return "json"
    return "bin"


def _build_timesheet_storage_key(period_id: str, extension: str) -> str:
    prefix = (_clean(os.getenv("AWS_S3_PREFIX")) or "folha-pagamento").strip("/")
    stamp = _now_iso().replace(":", "-").replace(".", "-")
    return f"{prefix}/{period_id}/ponto/{stamp}-espelho-solides.{extension}"


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


def _safe_execute(db: DatabaseManager, sql: str, params=()):
    try:
        _execute(db, sql, params)
    except Exception as exc:
        message = _clean(exc)
        if "Duplicate column name" in message or "duplicate column name" in message:
            return
        raise


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
    if len(raw) >= 10 and raw[2:3] == "/" and raw[5:6] == "/":
        try:
            return datetime.strptime(raw[:10], "%d/%m/%Y").date().isoformat()
        except Exception:
            return None
    return None


def _to_millis_from_date(date_iso: str, end_of_day: bool = False) -> int:
    base = datetime.strptime(date_iso, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    if end_of_day:
        base = base + timedelta(days=1) - timedelta(milliseconds=1)
    return int(base.timestamp() * 1000)


def _date_range_iter(start_ms: int, end_ms: int):
    start_dt = datetime.fromtimestamp(start_ms / 1000, tz=timezone.utc)
    end_dt = datetime.fromtimestamp(end_ms / 1000, tz=timezone.utc)
    current = datetime(start_dt.year, start_dt.month, start_dt.day, tzinfo=timezone.utc)
    last = datetime(end_dt.year, end_dt.month, end_dt.day, tzinfo=timezone.utc)
    while current <= last:
        yield current.date().isoformat()
        current += timedelta(days=1)


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
    started_dt = _parse_iso_datetime(started_at)
    if started_dt is None:
        return None
    elapsed = (datetime.now(timezone.utc) - started_dt).total_seconds()
    if elapsed <= 0:
        return None
    average_per_employee = elapsed / float(processed_employees)
    remaining_employees = max(0, total_employees - processed_employees)
    estimate = int(round(average_per_employee * remaining_employees))
    return estimate if estimate > 0 else None


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
                "Token da integração Sólides não encontrado. Configure TANGERINO_INTEGRATION_TOKEN ou SOLIDES_TANGERINO_INTEGRATION_TOKEN."
            )
        self.punch_base = _clean(os.getenv("TANGERINO_PUNCH_API_BASE")) or "https://api.tangerino.com.br/api/punch"
        self.employer_base = _clean(os.getenv("TANGERINO_EMPLOYER_API_BASE")) or "https://api.tangerino.com.br/api/employer"
        self.reports_base = _clean(os.getenv("TANGERINO_REPORTS_API_BASE")) or "https://api.tangerino.com.br/api/time-sheet"
        self._ssl_context = ssl.create_default_context()

    def _request_raw(
        self,
        base_url: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        absolute_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        query_params = {}
        for key, value in (params or {}).items():
            if value is None or value == "":
                continue
            query_params[key] = value
        query = f"?{urlencode(query_params, doseq=True)}" if query_params else ""
        url = absolute_url or f"{base_url.rstrip('/')}{path}{query}"
        request = Request(
            url,
            headers={
                "Authorization": f"Basic {self.token}",
                "Accept": "*/*",
                "User-Agent": "consultare-hub/solides-sync",
            },
            method="GET",
        )
        try:
            with urlopen(request, timeout=HTTP_TIMEOUT_SEC, context=self._ssl_context) as response:
                return {
                    "url": url,
                    "body": response.read(),
                    "content_type": _clean(response.headers.get("Content-Type")),
                    "content_disposition": _clean(response.headers.get("Content-Disposition")),
                }
        except HTTPError as exc:
            body = exc.read().decode("utf-8", "ignore")
            if exc.code == 404:
                return {"url": url, "not_found": True, "body": body.encode("utf-8")}
            raise SolidesApiError(f"Erro HTTP {exc.code} em {path or url}: {body[:300] or exc.reason}") from exc
        except URLError as exc:
            raise SolidesApiError(f"Falha de rede ao acessar {path or url}: {exc}") from exc

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
        response = self._request_raw(base_url, path, params=params)
        if response.get("not_found"):
            return None
        content = (response.get("body") or b"").decode("utf-8", "ignore")
        if not content:
            return None
        return json.loads(content)

    def list_employees(self) -> List[Dict[str, Any]]:
        direct_items = self._paginate("/employee/find-all", {"page": 0, "size": 200})
        direct_by_id: Dict[str, Dict[str, Any]] = {}
        for item in direct_items or []:
            item_id = _clean(item.get("id"))
            if item_id:
                direct_by_id[item_id] = item

        electronic_watch_items = self._request_json(
            self.employer_base,
            "/electronic-watch/employees",
            {"page": 0, "size": 1000},
        ) or []
        if not isinstance(electronic_watch_items, list):
            return list(direct_by_id.values())

        merged_items: List[Dict[str, Any]] = []
        seen_ids = set()
        for base_item in electronic_watch_items:
            tangerino_id = _clean(base_item.get("code") or base_item.get("id"))
            if not tangerino_id:
                continue

            direct_item = direct_by_id.get(tangerino_id)
            detail = direct_item or {}
            if not detail:
                try:
                    payload = self._request_json(
                        self.employer_base,
                        "/employee/find",
                        {"tangerinoId": tangerino_id},
                    ) or {}
                    if isinstance(payload, dict):
                        detail = payload
                except Exception:
                    detail = {}

            merged = dict(base_item)
            if isinstance(detail, dict):
                merged.update(detail)
            merged["id"] = (detail or {}).get("id") or base_item.get("code") or base_item.get("id")
            merged["externalId"] = (detail or {}).get("externalId") if (detail or {}).get("externalId") not in (None, "") else base_item.get("externalId")
            merged["cpf"] = (detail or {}).get("cpf") or base_item.get("cpf")
            merged["name"] = (detail or {}).get("name") or base_item.get("name")
            merged["fired"] = (detail or {}).get("fired") if (detail or {}).get("fired") is not None else _normalize_bool(base_item.get("demitido"))
            merged["_employee_source"] = "employee-find-all+electronic-watch"

            merged_id = _clean(merged.get("id"))
            if not merged_id or merged_id in seen_ids:
                continue
            seen_ids.add(merged_id)
            merged_items.append(merged)

        for item_id, item in direct_by_id.items():
            if item_id in seen_ids:
                continue
            seen_ids.add(item_id)
            copy_item = dict(item)
            copy_item["_employee_source"] = "employee-find-all"
            merged_items.append(copy_item)
        return merged_items

    def list_work_schedules(self) -> Dict[str, Dict[str, Any]]:
        items: Dict[str, Dict[str, Any]] = {}
        for item in self._paginate("/work-schedule"):
            item_id = _clean(item.get("id"))
            if item_id:
                items[item_id] = item
        return items

    def get_daily_activity(self, employee_id: str, start_ms: int, end_ms: int) -> List[Dict[str, Any]]:
        day_map: Dict[str, Dict[str, Any]] = {}
        for day_iso in _date_range_iter(start_ms, end_ms):
            day_start_ms = _to_millis_from_date(day_iso)
            day_end_ms = _to_millis_from_date(day_iso, end_of_day=True)
            payload = self._request_json(
                self.punch_base,
                "/daily-activity",
                {
                    "employeeId": employee_id,
                    "startDate": day_start_ms,
                    "endDate": day_end_ms,
                    "punchList": "true",
                    "adjustmentList": "true",
                    "pendingList": "true",
                    "showFired": "true",
                },
            )
            if not isinstance(payload, list):
                continue

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

    def fetch_timesheet_report(self, period_start: str, period_end: str) -> Optional[Dict[str, Any]]:
        start_ms = _to_millis_from_date(period_start)
        end_ms = _to_millis_from_date(period_end, end_of_day=True)
        candidates = [
            ("", {"startDate": start_ms, "endDate": end_ms}),
            ("/report", {"startDate": start_ms, "endDate": end_ms}),
            ("", {"initialDate": start_ms, "finalDate": end_ms}),
            ("/report", {"initialDate": start_ms, "finalDate": end_ms}),
            ("/time-sheet", {"startDate": start_ms, "endDate": end_ms}),
            ("/time-sheet/report", {"startDate": start_ms, "endDate": end_ms}),
        ]
        errors: List[str] = []
        for path, params in candidates:
            try:
                response = self._request_raw(self.reports_base, path, params=params)
            except Exception as exc:
                errors.append(str(exc))
                continue
            if response.get("not_found"):
                errors.append(f"{path or '/'} 404")
                continue
            artifact = self._extract_artifact_response(response)
            if artifact:
                return artifact
            errors.append(f"{path or '/'} respondeu sem artefato utilizável")
        if errors:
            raise SolidesApiError(" | ".join(errors[:4]))
        return None

    def _extract_artifact_response(self, response: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        body = response.get("body") or b""
        content_type = _clean(response.get("content_type")) or "application/octet-stream"
        content_disposition = _clean(response.get("content_disposition"))
        if not body:
            return None

        if body.startswith(b"%PDF") or "pdf" in content_type.lower():
            return {
                "content": body,
                "content_type": "application/pdf",
                "file_name": self._resolve_file_name(content_disposition, "espelho-solides.pdf"),
            }

        if any(token in content_type.lower() for token in ("spreadsheet", "excel", "sheet", "zip", "octet-stream")):
            extension = _infer_extension_from_content_type(content_type)
            return {
                "content": body,
                "content_type": content_type,
                "file_name": self._resolve_file_name(content_disposition, f"espelho-solides.{extension}"),
            }

        try:
            payload = json.loads(body.decode("utf-8"))
        except Exception:
            return None
        if not isinstance(payload, dict):
            return None

        direct_url = (
            _clean(payload.get("url"))
            or _clean(payload.get("downloadUrl"))
            or _clean(payload.get("fileUrl"))
            or _clean((payload.get("data") or {}).get("url") if isinstance(payload.get("data"), dict) else None)
        )
        if direct_url:
            absolute_url = direct_url if bool(urlparse(direct_url).scheme) else f"{self.reports_base.rstrip('/')}/{direct_url.lstrip('/')}"
            nested_response = self._request_raw(self.reports_base, "", absolute_url=absolute_url)
            return self._extract_artifact_response(nested_response)

        for key in ("base64", "contentBase64", "pdfBase64", "reportBase64", "fileBase64"):
            encoded = payload.get(key)
            if isinstance(encoded, str) and encoded.strip():
                try:
                    decoded = base64.b64decode(encoded)
                except Exception:
                    continue
                extension = _infer_extension_from_content_type(content_type)
                return {
                    "content": decoded,
                    "content_type": content_type if content_type != "application/octet-stream" else "application/pdf",
                    "file_name": self._resolve_file_name(content_disposition, f"espelho-solides.{extension}"),
                }
        return None

    def _resolve_file_name(self, content_disposition: str, fallback: str) -> str:
        raw = _clean(content_disposition)
        if "filename*=" in raw:
            try:
                return raw.split("filename*=", 1)[1].split("''", 1)[1].strip().strip('"')
            except Exception:
                pass
        if "filename=" in raw:
            try:
                return raw.split("filename=", 1)[1].strip().strip('"')
            except Exception:
                pass
        return fallback


def _ensure_tables(db: DatabaseManager):
    _execute(
        db,
        """
        CREATE TABLE IF NOT EXISTS payroll_import_files (
          id VARCHAR(64) PRIMARY KEY,
          period_id VARCHAR(64) NOT NULL,
          file_type VARCHAR(30) NOT NULL,
          file_name VARCHAR(255) NOT NULL,
          mime_type VARCHAR(120) NOT NULL,
          size_bytes BIGINT NOT NULL,
          storage_provider VARCHAR(30) NOT NULL,
          storage_bucket VARCHAR(120) NULL,
          storage_key VARCHAR(255) NOT NULL,
          processing_status VARCHAR(20) NOT NULL,
          processing_log LONGTEXT NULL,
          uploaded_by VARCHAR(64) NULL,
          created_at VARCHAR(32) NOT NULL,
          processed_at VARCHAR(32) NULL
        )
        """,
    )
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
    _safe_execute(
        db,
        "ALTER TABLE payroll_point_daily ADD COLUMN pending_adjustments_count INTEGER NOT NULL DEFAULT 0",
    )
    _safe_execute(
        db,
        "ALTER TABLE payroll_point_sync_runs ADD COLUMN total_employees INTEGER NOT NULL DEFAULT 0",
    )
    _safe_execute(
        db,
        "ALTER TABLE payroll_point_sync_runs ADD COLUMN processed_employees INTEGER NOT NULL DEFAULT 0",
    )
    _safe_execute(
        db,
        "ALTER TABLE payroll_point_sync_runs ADD COLUMN processed_days INTEGER NOT NULL DEFAULT 0",
    )
    _safe_execute(
        db,
        "ALTER TABLE payroll_point_sync_runs ADD COLUMN current_stage VARCHAR(40) NULL",
    )
    _safe_execute(
        db,
        "ALTER TABLE payroll_point_sync_runs ADD COLUMN progress_percent DECIMAL(5,2) NULL",
    )
    _safe_execute(
        db,
        "ALTER TABLE payroll_point_sync_runs ADD COLUMN last_progress_at VARCHAR(32) NULL",
    )
    _safe_execute(
        db,
        "ALTER TABLE payroll_point_sync_runs ADD COLUMN estimated_remaining_seconds INTEGER NULL",
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
        """
        UPDATE payroll_point_sync_runs
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
        UPDATE payroll_point_sync_runs
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
        UPDATE payroll_point_sync_runs
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
    by_cpf: Dict[str, Dict[str, Any]] = {}
    duplicate_cpfs = set()
    for employee in local_employees:
        solids_id = _clean(employee.get("solides_employee_id"))
        external_id = _clean(employee.get("solides_external_id"))
        cpf = _normalize_cpf(employee.get("cpf"))
        if solids_id and solids_id not in by_solides_id:
            by_solides_id[solids_id] = employee
        if external_id and external_id not in by_external_id:
            by_external_id[external_id] = employee
        if cpf:
            if cpf in by_cpf:
                duplicate_cpfs.add(cpf)
            else:
                by_cpf[cpf] = employee
    for cpf in duplicate_cpfs:
        by_cpf.pop(cpf, None)
    return {"by_solides_id": by_solides_id, "by_external_id": by_external_id, "by_cpf": by_cpf}


def _resolve_local_employee(remote_employee: Dict[str, Any], local_lookup: Dict[str, Dict[str, Dict[str, Any]]]) -> Optional[Dict[str, Any]]:
    remote_id = _clean(remote_employee.get("id"))
    if remote_id and remote_id in local_lookup["by_solides_id"]:
        return local_lookup["by_solides_id"][remote_id]
    external_id = _clean(remote_employee.get("externalId"))
    if external_id and external_id in local_lookup["by_external_id"]:
        return local_lookup["by_external_id"][external_id]
    cpf = _normalize_cpf(remote_employee.get("cpf"))
    if cpf and cpf in local_lookup["by_cpf"]:
        return local_lookup["by_cpf"][cpf]
    return None


def _persist_local_employee_link(
    db: DatabaseManager,
    local_employee: Dict[str, Any],
    remote_employee: Dict[str, Any],
    local_lookup: Dict[str, Dict[str, Dict[str, Any]]],
) -> bool:
    local_employee_id = _clean(local_employee.get("id"))
    remote_id = _clean(remote_employee.get("id"))
    remote_external_id = _clean(remote_employee.get("externalId"))
    if not local_employee_id or not remote_id:
        return False

    current_remote_id = _clean(local_employee.get("solides_employee_id"))
    current_external_id = _clean(local_employee.get("solides_external_id"))
    if current_remote_id == remote_id and current_external_id == remote_external_id:
        return False

    _execute(
        db,
        """
        UPDATE employees
        SET solides_employee_id = ?, solides_external_id = ?, updated_at = ?
        WHERE id = ?
        """,
        (
            remote_id,
            remote_external_id or None,
            _now_iso(),
            local_employee_id,
        ),
    )

    local_employee["solides_employee_id"] = remote_id
    local_employee["solides_external_id"] = remote_external_id or None
    local_lookup["by_solides_id"][remote_id] = local_employee
    if remote_external_id:
        local_lookup["by_external_id"][remote_external_id] = local_employee
    cpf = _normalize_cpf(local_employee.get("cpf")) or _normalize_cpf(remote_employee.get("cpf"))
    if cpf:
        local_lookup["by_cpf"][cpf] = local_employee
    return True


def _build_remote_employees_by_id(remote_items: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    result: Dict[str, Dict[str, Any]] = {}
    for item in remote_items:
        item_id = _clean(item.get("id"))
        if item_id:
            result[item_id] = item
    return result


def _build_adjustment_maps(adjustments: List[Dict[str, Any]]) -> Dict[str, Any]:
    by_date: Dict[str, List[Dict[str, Any]]] = {}
    pending_by_date: Dict[str, int] = {}
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
            if status == "PENDENTE":
                pending_by_date[key] = pending_by_date.get(key, 0) + 1
            current += timedelta(days=1)
    return {"by_date": by_date, "pending_count": pending_count, "pending_by_date": pending_by_date}


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
              pending_adjustments_count, absence_flag, inconsistency_flag, justification_text, source_file_id, source_payload_json, sync_run_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
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
                row.get("pending_adjustments_count", 0),
                1 if row.get("absence_flag") else 0,
                1 if row.get("inconsistency_flag") else 0,
                row.get("justification_text"),
                row.get("source_payload_json"),
                row.get("sync_run_id"),
                now,
                now,
            ),
        )


def _persist_timesheet_artifact(
    db: DatabaseManager,
    period_id: str,
    requested_by: str,
    artifact: Dict[str, Any],
):
    content = artifact.get("content") or b""
    if not content:
        return None
    content_type = _clean(artifact.get("content_type")) or "application/octet-stream"
    extension = _infer_extension_from_content_type(content_type)
    file_name = _clean(artifact.get("file_name")) or f"espelho-solides.{extension}"
    storage_key = _build_timesheet_storage_key(period_id, extension)
    upload = upload_s3_object_bytes(
        storage_key,
        content,
        content_type,
        metadata={"periodId": period_id, "fileType": "SYNC_TIMESHEET"},
    )
    now = _now_iso()
    _execute(db, "DELETE FROM payroll_import_files WHERE period_id = ? AND file_type = 'SYNC_TIMESHEET'", (period_id,))
    import_id = str(uuid.uuid4())
    _execute(
        db,
        """
        INSERT INTO payroll_import_files (
          id, period_id, file_type, file_name, mime_type, size_bytes, storage_provider,
          storage_bucket, storage_key, processing_status, processing_log, uploaded_by, created_at, processed_at
        ) VALUES (?, ?, 'SYNC_TIMESHEET', ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?)
        """,
        (
            import_id,
            period_id,
            file_name,
            content_type,
            len(content),
            upload.get("provider"),
            upload.get("bucket"),
            upload.get("key"),
            "Espelho oficial sincronizado via API da Sólides.",
            requested_by or SYNC_ACTOR,
            now,
            now,
        ),
    )
    return {
        "id": import_id,
        "file_name": file_name,
        "size_bytes": len(content),
    }


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
    adjustment_maps: Dict[str, Any],
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
                "pending_adjustments_count": _ensure_int((adjustment_maps.get("pending_by_date") or {}).get(point_date), 0),
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
    started_at = _now_iso()
    db.update_heartbeat(SERVICE_NAME, STATUS_RUNNING, f"job={job['id']} competencia={job['month_ref']}")
    _mark_run_running(db, job.get("run_id"), "Sincronização com a API da Sólides em andamento.")
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

    start_ms = _to_millis_from_date(job["period_start"])
    end_ms = _to_millis_from_date(job["period_end"], end_of_day=True)
    local_employees = _load_local_employees(db, job["period_start"], job["period_end"])
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

    total_employees = sum(1 for local_employee in local_employees if _clean(local_employee.get("solides_employee_id")))
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

    for local_employee in local_employees:
        linked_id = _clean(local_employee.get("solides_employee_id"))
        if not linked_id:
            continue
        remote_employee = remote_employees_by_id.get(linked_id)
        if remote_employee is None:
            unmatched_local_links.append(local_employee)
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
                synchronized_employees=len(synchronized_employee_keys),
                synchronized_days=len(point_rows),
                unmatched_employees=len(unmatched_local_links),
                pending_adjustments=pending_adjustments,
                pending_signatures=pending_signatures,
            )
            continue

        synchronized_employee_keys.add(linked_id)
        schedule_ref = remote_employee.get("currentWorkSchedule") or {}
        schedule_id = _clean(schedule_ref.get("id"))
        work_schedule = work_schedules.get(schedule_id) if schedule_id else None
        adjustments = client.get_adjustments(linked_id, start_ms, end_ms)
        adjustment_maps = _build_adjustment_maps(adjustments)

        daily_activity = client.get_daily_activity(linked_id, start_ms, end_ms)
        point_rows.extend(
            _build_daily_rows_for_employee(
                job["period_start"],
                job["period_end"],
                remote_employee,
                local_employee,
                work_schedule,
                daily_activity,
                adjustment_maps,
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

        pending_adjustments += adjustment_maps["pending_count"]
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
            synchronized_employees=len(synchronized_employee_keys),
            synchronized_days=len(point_rows),
            unmatched_employees=len(unmatched_local_links),
            pending_adjustments=pending_adjustments,
            pending_signatures=pending_signatures,
        )

    # Registros remotos sem vínculo local explícito continuam visíveis na prontidão.
    _update_run_progress(
        db,
        job.get("run_id"),
        started_at,
        STAGE_SYNCING_BALANCES_AND_SIGNATURES,
        "Consolidando banco de horas, assinaturas e registros sem vínculo local.",
        total_employees,
        processed_employees,
        len(point_rows),
        synchronized_employees=len(synchronized_employee_keys),
        synchronized_days=len(point_rows),
        unmatched_employees=len(unmatched_local_links),
        pending_adjustments=pending_adjustments,
        pending_signatures=pending_signatures,
    )
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
        schedule_ref = remote_employee.get("currentWorkSchedule") or {}
        schedule_id = _clean(schedule_ref.get("id"))
        work_schedule = work_schedules.get(schedule_id) if schedule_id else None
        point_rows.extend(
            _build_daily_rows_for_employee(
                job["period_start"],
                job["period_end"],
                remote_employee,
                None,
                work_schedule,
                daily_activity,
                {"pending_by_date": {}},
                job.get("run_id"),
            )
        )

    _update_run_progress(
        db,
        job.get("run_id"),
        started_at,
        STAGE_PERSISTING_DATA,
        "Persistindo os dados sincronizados no painel.",
        total_employees,
        processed_employees,
        len(point_rows),
        synchronized_employees=len(synchronized_employee_keys),
        synchronized_days=len(point_rows),
        unmatched_employees=len(unmatched_local_links),
        pending_adjustments=pending_adjustments,
        pending_signatures=pending_signatures,
    )
    _replace_point_rows(db, job["period_id"], point_rows)
    _replace_hours_balances(db, job["period_id"], hours_balance_rows)
    _replace_signatures(db, job["period_id"], signature_rows)
    _replace_period_occurrences(db, job["period_id"], occurrence_rows)
    try:
        timesheet_artifact = client.fetch_timesheet_report(job["period_start"], job["period_end"])
        if timesheet_artifact:
            persisted_artifact = _persist_timesheet_artifact(db, job["period_id"], job.get("requested_by") or SYNC_ACTOR, timesheet_artifact)
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
        f"{len(hours_balance_rows)} saldo(s) de banco de horas.",
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
        "Finalizando a sincronização da competência.",
        total_employees,
        processed_employees,
        len(point_rows),
        synchronized_employees=len(synchronized_employee_keys),
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
        error_message = str(exc or "Falha na sincronização da Sólides.")
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
