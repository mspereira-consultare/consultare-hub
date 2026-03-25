import argparse
import hashlib
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Dict, List, Optional, Tuple

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True, encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(line_buffering=True, encoding="utf-8", errors="replace")

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database_manager import DatabaseManager
    from worker_auth_clinia import CliniaCookieRenewer
except ImportError:
    DatabaseManager = None
    CliniaCookieRenewer = None


SERVICE_NAME = "clinia_ads"
CLINIA_ADS_URL = "https://dashboard.clinia.io/api/statistics/ads"

STATUS_PENDING = "PENDING"
STATUS_RUNNING = "RUNNING"
STATUS_COMPLETED = "COMPLETED"
STATUS_FAILED = "FAILED"
STATUS_PARTIAL = "PARTIAL"

ITEM_SUCCESS = "SUCCESS"
ITEM_EMPTY = "EMPTY"
ITEM_ERROR = "ERROR"

API_TIMEOUT_SEC = max(15, int(os.getenv("CLINIA_ADS_API_TIMEOUT_SEC", "45")))
RETRY_TOTAL = max(1, int(os.getenv("CLINIA_ADS_RETRY_TOTAL", "3")))
RETRY_BACKOFF = max(0.1, float(os.getenv("CLINIA_ADS_RETRY_BACKOFF_SEC", "0.5")))
POLL_SEC = max(10, int(os.getenv("CLINIA_ADS_SYNC_POLL_SEC", "120")))
DB_BATCH_SIZE = max(50, int(os.getenv("CLINIA_ADS_DB_BATCH_SIZE", "500")))

BRAND_SLUG = "consultare"
VALID_STAGES = {"INTERESTED", "APPOINTMENT"}


def _now_ts() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _month_ref(dt: datetime) -> str:
    return dt.strftime("%Y-%m")


def _previous_month_ref(anchor: datetime) -> str:
    year = anchor.year
    month = anchor.month - 1
    if month <= 0:
        month = 12
        year -= 1
    return f"{year}-{str(month).zfill(2)}"


def _request_anchor_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


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


def _chunked(seq: List[Tuple], size: int):
    if size <= 0:
        size = 100
    for idx in range(0, len(seq), size):
        yield seq[idx: idx + size]


def _safe_str(value) -> str:
    return str(value or "").strip()


def _to_int(value, default=0) -> int:
    try:
        return int(float(str(value).strip()))
    except Exception:
        return default


def _to_decimal(value, default="0") -> Decimal:
    if isinstance(value, Decimal):
        return value
    raw = _safe_str(value).replace(",", ".")
    if not raw:
        return Decimal(default)
    try:
        return Decimal(raw)
    except InvalidOperation:
        return Decimal(default)


def _to_float2(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.01")))


def _stable_hash(*parts: str) -> str:
    base = "||".join(_safe_str(part) for part in parts)
    return hashlib.md5(base.encode("utf-8")).hexdigest()


def _json_dump(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _normalize_origin(value: str) -> str:
    raw = _safe_str(value).lower()
    return raw or "unknown"


def _normalize_stage(value: str) -> str:
    raw = _safe_str(value).upper()
    return raw or "UNKNOWN"


def _build_headers(cookie: str) -> Dict[str, str]:
    headers = {
        "accept": "application/json, text/plain, */*",
        "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "referer": "https://dashboard.clinia.io/statistics",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    }
    if cookie:
        headers["cookie"] = cookie
    return headers


def _make_http_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=RETRY_TOTAL,
        backoff_factor=RETRY_BACKOFF,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def _get_cookie_from_db(db: "DatabaseManager") -> str:
    rows = db.execute_query(
        "SELECT token FROM integrations_config WHERE service = 'clinia' ORDER BY updated_at DESC LIMIT 1"
    )
    if not rows:
        return ""
    return _safe_str(_row_get(rows[0], 0, "token"))


def _renew_cookie(db: "DatabaseManager") -> str:
    if not CliniaCookieRenewer:
        raise RuntimeError("CliniaCookieRenewer indisponível.")
    renewer = CliniaCookieRenewer(db=db)
    cookie = renewer.renew_cookie()
    return _safe_str(cookie)


def _request_json(
    session: requests.Session,
    db: "DatabaseManager",
    cookie: str,
    url: str,
    params: Optional[Dict] = None,
    allow_renew: bool = True,
):
    headers = _build_headers(cookie)
    resp = session.get(url, params=params, headers=headers, timeout=API_TIMEOUT_SEC)
    if resp.status_code in (401, 403):
        if not allow_renew:
            raise RuntimeError(f"Clinia Ads retornou {resp.status_code} em {url}")
        new_cookie = _renew_cookie(db)
        if not new_cookie:
            raise RuntimeError(f"Clinia Ads sem autenticação válida ({resp.status_code})")
        headers = _build_headers(new_cookie)
        resp = session.get(url, params=params, headers=headers, timeout=API_TIMEOUT_SEC)
        if resp.status_code in (401, 403):
            raise RuntimeError(f"Clinia Ads retornou {resp.status_code} após renovar cookie: {url}")
        cookie = new_cookie

    if resp.status_code >= 400:
        raise RuntimeError(f"Clinia Ads falhou ({resp.status_code}) em {url}: {resp.text[:280]}")

    ctype = str(resp.headers.get("content-type") or "").lower()
    if "json" not in ctype:
        raise RuntimeError(f"Clinia Ads retornou content-type não JSON ({ctype}) em {url}")

    try:
        data = resp.json()
    except Exception as exc:
        raise RuntimeError(f"Clinia Ads retornou JSON inválido em {url}: {exc}") from exc

    return data, cookie


def _fetch_ads_payload(
    session: requests.Session,
    db: "DatabaseManager",
    cookie: str,
) -> Tuple[Dict, str, Dict]:
    anchor = _request_anchor_iso()
    params = {
        "type": "this-month",
        "startDate": anchor,
        "endDate": anchor,
    }
    data, cookie = _request_json(session, db, cookie, CLINIA_ADS_URL, params=params)
    if not isinstance(data, dict):
        raise RuntimeError("Clinia Ads não retornou payload compatível.")
    current = data.get("current")
    last = data.get("last")
    if not isinstance(current, dict) or not isinstance(last, dict):
        raise RuntimeError("Clinia Ads não retornou blocos current/last válidos.")
    return data, cookie, params


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
        count_val = 0
        if rows:
            count_val = int(_row_get(rows[0], 0, "COUNT(1)") or _row_get(rows[0], 0, "count(1)") or 0)
        if count_val == 0:
            conn.execute(f"CREATE INDEX {index_name} ON {table_name} ({columns_sql})")
        return
    conn.execute(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} ({columns_sql})")


def _heartbeat(db: "DatabaseManager", status: str, details: str):
    db.update_heartbeat(SERVICE_NAME, status, details)


def ensure_clinia_ads_tables(db: "DatabaseManager"):
    conn = db.get_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS clinia_ads_jobs (
              id VARCHAR(64) PRIMARY KEY,
              status VARCHAR(20) NOT NULL,
              scope_json TEXT,
              requested_by VARCHAR(64) NOT NULL,
              error_message TEXT,
              created_at VARCHAR(32) NOT NULL,
              started_at VARCHAR(32),
              finished_at VARCHAR(32),
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        _ensure_index(db, conn, "clinia_ads_jobs", "idx_clinia_ads_jobs_status", "status")
        _ensure_index(db, conn, "clinia_ads_jobs", "idx_clinia_ads_jobs_created", "created_at")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS clinia_ads_job_items (
              id VARCHAR(64) PRIMARY KEY,
              job_id VARCHAR(64) NOT NULL,
              source_period VARCHAR(16) NOT NULL,
              status VARCHAR(20) NOT NULL,
              records_read INTEGER NOT NULL DEFAULT 0,
              records_written INTEGER NOT NULL DEFAULT 0,
              error_message TEXT,
              duration_ms INTEGER NOT NULL DEFAULT 0,
              created_at VARCHAR(32) NOT NULL,
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        _ensure_index(db, conn, "clinia_ads_job_items", "idx_clinia_ads_job_item_job", "job_id")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS raw_clinia_ads_contacts (
              event_hash VARCHAR(64) PRIMARY KEY,
              sync_job_id VARCHAR(64) NOT NULL,
              brand_slug VARCHAR(64) NOT NULL,
              source_period VARCHAR(16) NOT NULL,
              date_ref VARCHAR(10) NOT NULL,
              jid VARCHAR(80) NOT NULL,
              origin VARCHAR(64),
              source_id VARCHAR(255),
              source_url TEXT,
              source_url_hash VARCHAR(64) NOT NULL,
              title VARCHAR(255),
              stage VARCHAR(40) NOT NULL,
              created_at VARCHAR(32),
              conversion_time_sec INTEGER NOT NULL DEFAULT 0,
              name VARCHAR(255),
              personal_name VARCHAR(255),
              verified_name VARCHAR(255),
              organization_id VARCHAR(64),
              payload_json LONGTEXT,
              synced_at VARCHAR(32) NOT NULL,
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        _ensure_index(db, conn, "raw_clinia_ads_contacts", "idx_clinia_ads_raw_date_brand", "date_ref, brand_slug")
        _ensure_index(db, conn, "raw_clinia_ads_contacts", "idx_clinia_ads_raw_origin", "origin")
        _ensure_index(db, conn, "raw_clinia_ads_contacts", "idx_clinia_ads_raw_source", "source_id")
        _ensure_index(db, conn, "raw_clinia_ads_contacts", "idx_clinia_ads_raw_stage", "stage")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS fact_clinia_ads_daily (
              id VARCHAR(64) PRIMARY KEY,
              date_ref VARCHAR(10) NOT NULL,
              brand_slug VARCHAR(64) NOT NULL,
              origin VARCHAR(64) NOT NULL,
              source_id VARCHAR(255),
              source_url TEXT,
              source_url_hash VARCHAR(64) NOT NULL,
              title VARCHAR(255),
              contacts_received INTEGER NOT NULL DEFAULT 0,
              new_contacts_received INTEGER NOT NULL DEFAULT 0,
              appointments_converted INTEGER NOT NULL DEFAULT 0,
              conversion_rate DECIMAL(10,4) NOT NULL DEFAULT 0,
              avg_conversion_time_sec DECIMAL(14,2) NOT NULL DEFAULT 0,
              source_last_sync_at VARCHAR(32) NOT NULL,
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        _ensure_index(db, conn, "fact_clinia_ads_daily", "idx_clinia_ads_fact_date_brand", "date_ref, brand_slug")
        _ensure_index(db, conn, "fact_clinia_ads_daily", "idx_clinia_ads_fact_origin", "origin")
        _ensure_index(db, conn, "fact_clinia_ads_daily", "idx_clinia_ads_fact_source", "source_id")

        if not db.use_turso:
            conn.commit()
    finally:
        conn.close()


def _parse_ads_rows(payload: Dict, period_key: str) -> Tuple[List[Tuple], int]:
    section = payload.get(period_key)
    if not isinstance(section, dict):
        return [], 0

    ads = section.get("ads")
    if not isinstance(ads, list):
        return [], 0

    sync_ts = _now_ts()
    output: List[Tuple] = []
    skipped = 0
    for item in ads:
        if not isinstance(item, dict):
            skipped += 1
            continue
        created_at = _safe_str(item.get("created_at"))
        date_ref = created_at[:10] if len(created_at) >= 10 else ""
        if not date_ref:
            skipped += 1
            continue
        origin = _normalize_origin(item.get("origin"))
        stage = _normalize_stage(item.get("stage"))
        source_id = _safe_str(item.get("source_id"))
        source_url = _safe_str(item.get("source_url"))
        title = _safe_str(item.get("title"))
        jid = _safe_str(item.get("jid"))
        if not jid:
            skipped += 1
            continue
        event_hash = _stable_hash(
            BRAND_SLUG,
            jid,
            stage,
            created_at,
            origin,
            source_id,
            source_url,
        )
        output.append(
            (
                event_hash,
                BRAND_SLUG,
                period_key,
                date_ref,
                jid,
                origin,
                source_id or None,
                source_url or None,
                _stable_hash(source_url),
                title or None,
                stage,
                created_at,
                _to_int(item.get("conversion_time"), 0),
                _safe_str(item.get("name")) or None,
                _safe_str(item.get("personal_name")) or None,
                _safe_str(item.get("verified_name")) or None,
                _safe_str(item.get("organization_id")) or None,
                _json_dump(item),
                sync_ts,
                sync_ts,
            )
        )
    return output, skipped


def _covered_month_refs(anchor: datetime) -> List[str]:
    return [_month_ref(anchor), _previous_month_ref(anchor)]


def _persist_snapshot(
    db: "DatabaseManager",
    job_id: str,
    raw_rows_by_period: Dict[str, List[Tuple]],
    covered_month_refs: List[str],
    sync_ts: str,
) -> Dict[str, int]:
    conn = db.get_connection()
    try:
        month_placeholders = ", ".join("?" for _ in covered_month_refs)
        conn.execute(
            f"""
            DELETE FROM raw_clinia_ads_contacts
            WHERE brand_slug = ?
              AND SUBSTR(date_ref, 1, 7) IN ({month_placeholders})
            """,
            (BRAND_SLUG, *covered_month_refs),
        )
        conn.execute(
            f"""
            DELETE FROM fact_clinia_ads_daily
            WHERE brand_slug = ?
              AND SUBSTR(date_ref, 1, 7) IN ({month_placeholders})
            """,
            (BRAND_SLUG, *covered_month_refs),
        )

        insert_rows: List[Tuple] = []
        for rows in raw_rows_by_period.values():
            for row in rows:
                insert_rows.append((job_id,) + row)

        for chunk in _chunked(insert_rows, DB_BATCH_SIZE):
            conn.executemany(
                """
                INSERT INTO raw_clinia_ads_contacts (
                  sync_job_id, event_hash, brand_slug, source_period, date_ref, jid, origin,
                  source_id, source_url, source_url_hash, title, stage, created_at,
                  conversion_time_sec, name, personal_name, verified_name, organization_id,
                  payload_json, synced_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(event_hash) DO UPDATE SET
                  sync_job_id = excluded.sync_job_id,
                  brand_slug = excluded.brand_slug,
                  source_period = excluded.source_period,
                  date_ref = excluded.date_ref,
                  jid = excluded.jid,
                  origin = excluded.origin,
                  source_id = excluded.source_id,
                  source_url = excluded.source_url,
                  source_url_hash = excluded.source_url_hash,
                  title = excluded.title,
                  stage = excluded.stage,
                  created_at = excluded.created_at,
                  conversion_time_sec = excluded.conversion_time_sec,
                  name = excluded.name,
                  personal_name = excluded.personal_name,
                  verified_name = excluded.verified_name,
                  organization_id = excluded.organization_id,
                  payload_json = excluded.payload_json,
                  synced_at = excluded.synced_at,
                  updated_at = excluded.updated_at
                """,
                chunk,
            )

        rs = conn.execute(
            f"""
            SELECT
              date_ref,
              brand_slug,
              COALESCE(NULLIF(TRIM(origin), ''), 'unknown') AS origin_key,
              COALESCE(NULLIF(TRIM(source_id), ''), '') AS source_id,
              COALESCE(NULLIF(TRIM(source_url_hash), ''), '') AS source_url_hash,
              MAX(source_url) AS source_url,
              MAX(COALESCE(title, '')) AS title,
              SUM(CASE WHEN stage = 'INTERESTED' THEN 1 ELSE 0 END) AS contacts_received,
              COUNT(DISTINCT CASE WHEN stage = 'INTERESTED' THEN jid ELSE NULL END) AS new_contacts_received,
              SUM(CASE WHEN stage = 'APPOINTMENT' THEN 1 ELSE 0 END) AS appointments_converted,
              AVG(CASE WHEN conversion_time_sec > 0 THEN conversion_time_sec ELSE NULL END) AS avg_conversion_time_sec,
              MAX(synced_at) AS last_sync_at
            FROM raw_clinia_ads_contacts
            WHERE brand_slug = ?
              AND SUBSTR(date_ref, 1, 7) IN ({month_placeholders})
            GROUP BY date_ref, brand_slug, origin_key, source_id, source_url_hash
            """,
            (BRAND_SLUG, *covered_month_refs),
        )
        fact_rows = _fetch_rows(rs)
        fact_inserts: List[Tuple] = []
        for row in fact_rows:
            row_date_ref = _safe_str(_row_get(row, 0, "date_ref"))
            row_brand = _safe_str(_row_get(row, 1, "brand_slug")) or BRAND_SLUG
            row_origin = _safe_str(_row_get(row, 2, "origin_key")) or "unknown"
            row_source_id = _safe_str(_row_get(row, 3, "source_id"))
            row_source_url_hash = _safe_str(_row_get(row, 4, "source_url_hash"))
            row_source_url = _safe_str(_row_get(row, 5, "source_url"))
            row_title = _safe_str(_row_get(row, 6, "title"))
            row_contacts = _to_int(_row_get(row, 7, "contacts_received"), 0)
            row_new_contacts = _to_int(_row_get(row, 8, "new_contacts_received"), 0)
            row_appointments = _to_int(_row_get(row, 9, "appointments_converted"), 0)
            row_avg = _to_float2(_to_decimal(_row_get(row, 10, "avg_conversion_time_sec"), "0"))
            row_last_sync = _safe_str(_row_get(row, 11, "last_sync_at")) or sync_ts
            row_conversion = (row_appointments * 100.0 / row_contacts) if row_contacts > 0 else 0.0
            fact_inserts.append(
                (
                    _stable_hash("fact_clinia_ads", row_date_ref, row_brand, row_origin, row_source_id, row_source_url_hash),
                    row_date_ref,
                    row_brand,
                    row_origin,
                    row_source_id or None,
                    row_source_url or None,
                    row_source_url_hash,
                    row_title or None,
                    row_contacts,
                    row_new_contacts,
                    row_appointments,
                    row_conversion,
                    row_avg,
                    row_last_sync,
                    sync_ts,
                )
            )

        for chunk in _chunked(fact_inserts, DB_BATCH_SIZE):
            conn.executemany(
                """
                INSERT INTO fact_clinia_ads_daily (
                  id, date_ref, brand_slug, origin, source_id, source_url, source_url_hash,
                  title, contacts_received, new_contacts_received, appointments_converted,
                  conversion_rate, avg_conversion_time_sec, source_last_sync_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  date_ref = excluded.date_ref,
                  brand_slug = excluded.brand_slug,
                  origin = excluded.origin,
                  source_id = excluded.source_id,
                  source_url = excluded.source_url,
                  source_url_hash = excluded.source_url_hash,
                  title = excluded.title,
                  contacts_received = excluded.contacts_received,
                  new_contacts_received = excluded.new_contacts_received,
                  appointments_converted = excluded.appointments_converted,
                  conversion_rate = excluded.conversion_rate,
                  avg_conversion_time_sec = excluded.avg_conversion_time_sec,
                  source_last_sync_at = excluded.source_last_sync_at,
                  updated_at = excluded.updated_at
                """,
                chunk,
            )

        if not db.use_turso:
            conn.commit()
    finally:
        conn.close()

    return {
        "raw_rows": len(insert_rows),
        "fact_rows": len(fact_inserts),
    }


def enqueue_clinia_ads_job(
    db: "DatabaseManager",
    requested_by: str = "manual",
    initial_status: str = STATUS_PENDING,
) -> Dict:
    now_ts = _now_ts()
    job_id = uuid.uuid4().hex
    scope_json = _json_dump({"type": "this-month"})
    db.execute_query(
        """
        INSERT INTO clinia_ads_jobs (
          id, status, scope_json, requested_by, error_message, created_at, started_at, finished_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, ?, NULL, NULL, ?)
        """,
        (job_id, initial_status, scope_json, _safe_str(requested_by) or "manual", now_ts, now_ts),
    )
    print(f"Job Clinia Ads criado | id={job_id}")
    return {
        "id": job_id,
        "status": initial_status,
        "scope_json": scope_json,
        "requested_by": requested_by,
    }


def _get_pending_job(db: "DatabaseManager") -> Optional[Dict]:
    rows = db.execute_query(
        """
        SELECT id, status, scope_json, requested_by
        FROM clinia_ads_jobs
        WHERE status = ?
        ORDER BY created_at ASC
        LIMIT 1
        """,
        (STATUS_PENDING,),
    )
    if not rows:
        return None
    row = rows[0]
    return {
        "id": _row_get(row, 0, "id"),
        "status": _row_get(row, 1, "status"),
        "scope_json": _row_get(row, 2, "scope_json"),
        "requested_by": _row_get(row, 3, "requested_by"),
    }


def _update_job_status(db: "DatabaseManager", job_id: str, status: str, error_message: Optional[str] = None):
    now_ts = _now_ts()
    if status == STATUS_RUNNING:
        db.execute_query(
            """
            UPDATE clinia_ads_jobs
            SET status = ?, started_at = ?, updated_at = ?, error_message = NULL
            WHERE id = ?
            """,
            (status, now_ts, now_ts, job_id),
        )
        return

    finished_at = now_ts if status in (STATUS_COMPLETED, STATUS_FAILED, STATUS_PARTIAL) else None
    db.execute_query(
        """
        UPDATE clinia_ads_jobs
        SET status = ?, finished_at = ?, updated_at = ?, error_message = ?
        WHERE id = ?
        """,
        (status, finished_at, now_ts, _safe_str(error_message) or None, job_id),
    )


def _insert_job_item(
    db: "DatabaseManager",
    job_id: str,
    source_period: str,
    status: str,
    records_read: int,
    records_written: int,
    error_message: Optional[str],
    duration_ms: int,
):
    now_ts = _now_ts()
    db.execute_query(
        """
        INSERT INTO clinia_ads_job_items (
          id, job_id, source_period, status, records_read, records_written,
          error_message, duration_ms, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            uuid.uuid4().hex,
            job_id,
            source_period,
            status,
            int(records_read or 0),
            int(records_written or 0),
            _safe_str(error_message) or None,
            int(duration_ms or 0),
            now_ts,
            now_ts,
        ),
    )


def _run_job(db: "DatabaseManager", job: Dict) -> Dict:
    job_id = _safe_str(job.get("id"))
    _update_job_status(db, job_id, STATUS_RUNNING)
    _heartbeat(db, STATUS_RUNNING, f"job={job_id} stage=fetch")

    session = _make_http_session()
    cookie = _get_cookie_from_db(db)
    if not cookie:
        cookie = _renew_cookie(db)
    if not cookie:
        msg = "Cookie Clinia ausente e não foi possível renovar."
        _update_job_status(db, job_id, STATUS_FAILED, msg)
        _heartbeat(db, STATUS_FAILED, f"job={job_id} {msg}")
        return {"status": STATUS_FAILED, "read": 0, "written": 0}

    anchor_dt = datetime.now()
    payload, cookie, request_params = _fetch_ads_payload(session, db, cookie)
    _heartbeat(db, STATUS_RUNNING, f"job={job_id} stage=persist_raw params={request_params}")

    raw_rows_by_period: Dict[str, List[Tuple]] = {}
    total_read = 0
    for period_key in ("current", "last"):
        t0 = time.time()
        rows, skipped = _parse_ads_rows(payload, period_key)
        raw_rows_by_period[period_key] = rows
        total_read += len(rows)
        status = ITEM_EMPTY if not rows else ITEM_SUCCESS
        _insert_job_item(
            db,
            job_id,
            period_key,
            status,
            len(rows),
            0,
            f"skipped={skipped}" if skipped else None,
            int((time.time() - t0) * 1000),
        )

    _heartbeat(db, STATUS_RUNNING, f"job={job_id} stage=rebuild_fact")
    covered_month_refs = _covered_month_refs(anchor_dt)
    persist_stats = _persist_snapshot(
        db=db,
        job_id=job_id,
        raw_rows_by_period=raw_rows_by_period,
        covered_month_refs=covered_month_refs,
        sync_ts=_now_ts(),
    )

    written = persist_stats["raw_rows"] + persist_stats["fact_rows"]
    final_status = STATUS_COMPLETED
    final_error = None
    if total_read == 0:
        final_status = STATUS_PARTIAL
        final_error = "Nenhum registro Clinia Ads retornado nos blocos current/last."

    _update_job_status(db, job_id, final_status, final_error)
    _heartbeat(
        db,
        final_status if final_status != STATUS_PARTIAL else "WARNING",
        (
            f"job={job_id} stage=done status={final_status} "
            f"read={total_read} raw={persist_stats['raw_rows']} fact={persist_stats['fact_rows']}"
        ),
    )
    return {
        "status": final_status,
        "read": total_read,
        "written": written,
    }


def process_pending_clinia_ads_jobs_once(
    auto_enqueue_if_empty: bool = False,
    requested_by: str = "system_status",
) -> bool:
    if not DatabaseManager:
        raise RuntimeError("DatabaseManager indisponível.")
    db = DatabaseManager()
    ensure_clinia_ads_tables(db)

    pending = _get_pending_job(db)
    if not pending and auto_enqueue_if_empty:
        pending = enqueue_clinia_ads_job(
            db=db,
            requested_by=requested_by,
            initial_status=STATUS_PENDING,
        )

    if not pending:
        _heartbeat(db, STATUS_COMPLETED, "Sem jobs pendentes")
        return False

    try:
        _run_job(db, pending)
        return True
    except Exception as exc:
        msg = str(exc)[:1000]
        _update_job_status(db, _safe_str(pending.get("id")), STATUS_FAILED, msg)
        _heartbeat(db, STATUS_FAILED, f"job={pending.get('id')} erro={msg}")
        return True


def _connection_smoke_test():
    if not DatabaseManager:
        raise RuntimeError("DatabaseManager indisponível.")
    db = DatabaseManager()
    ensure_clinia_ads_tables(db)
    session = _make_http_session()
    cookie = _get_cookie_from_db(db)
    if not cookie:
        cookie = _renew_cookie(db)
    if not cookie:
        raise RuntimeError("Cookie Clinia ausente e não foi possível renovar.")

    data, _, params = _fetch_ads_payload(session, db, cookie)
    current = data.get("current") or {}
    last = data.get("last") or {}
    print(f"Clinia Ads OK | params={params}")
    print(
        f"current.contacts={_to_int(current.get('contactsCount'), 0)} "
        f"current.ads={len((current.get('ads') or []))}"
    )
    print(
        f"last.contacts={_to_int(last.get('contactsCount'), 0)} "
        f"last.ads={len((last.get('ads') or []))}"
    )


def run_loop_forever():
    if not DatabaseManager:
        raise RuntimeError("DatabaseManager indisponível.")
    db = DatabaseManager()
    ensure_clinia_ads_tables(db)
    _heartbeat(db, STATUS_COMPLETED, "Worker Clinia Ads iniciado")
    while True:
        try:
            had = process_pending_clinia_ads_jobs_once(auto_enqueue_if_empty=False, requested_by="orchestrator")
            if not had:
                time.sleep(POLL_SEC)
        except Exception as exc:
            _heartbeat(db, STATUS_FAILED, f"Loop error: {exc}")
            time.sleep(POLL_SEC)


def main():
    parser = argparse.ArgumentParser(description="Worker Clinia Ads")
    parser.add_argument("--once", action="store_true", help="Processa um ciclo único.")
    parser.add_argument("--enqueue", action="store_true", help="Apenas enfileira um job e sai.")
    parser.add_argument("--requested-by", type=str, default="manual_cli", help="Identificador do solicitante.")
    parser.add_argument("--test-connections", action="store_true", help="Testa autenticação e endpoint Clinia Ads.")
    parser.add_argument("--ensure-only", action="store_true", help="Cria/valida schema e encerra.")
    args = parser.parse_args()

    if not DatabaseManager:
        raise RuntimeError("DatabaseManager indisponível.")

    db = DatabaseManager()
    ensure_clinia_ads_tables(db)
    requested_by = _safe_str(args.requested_by) or "manual_cli"

    if args.ensure_only:
        _heartbeat(db, STATUS_COMPLETED, "Schema Clinia Ads validado")
        print("Schema Clinia Ads validado.")
        return

    if args.test_connections:
        _connection_smoke_test()
        _heartbeat(db, STATUS_COMPLETED, "Teste de conexão Clinia Ads concluído")
        return

    if args.enqueue:
        enqueue_clinia_ads_job(
            db=db,
            requested_by=requested_by,
            initial_status=STATUS_PENDING,
        )
        _heartbeat(db, STATUS_PENDING, "Job Clinia Ads enfileirado via CLI")
        return

    if args.once:
        processed = process_pending_clinia_ads_jobs_once(
            auto_enqueue_if_empty=True,
            requested_by=requested_by,
        )
        if not processed:
            print("Sem jobs pendentes.")
        return

    run_loop_forever()


if __name__ == "__main__":
    main()
