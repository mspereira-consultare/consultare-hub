
import argparse
import hashlib
import json
import os
import re
import sys
import time
import uuid
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Dict, List, Optional, Tuple

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database_manager import DatabaseManager
    from worker_auth_clinia import CliniaCookieRenewer
except ImportError:
    DatabaseManager = None
    CliniaCookieRenewer = None


SERVICE_NAME = "clinia_crm"

STATUS_PENDING = "PENDING"
STATUS_RUNNING = "RUNNING"
STATUS_COMPLETED = "COMPLETED"
STATUS_FAILED = "FAILED"
STATUS_PARTIAL = "PARTIAL"

ITEM_SUCCESS = "SUCCESS"
ITEM_EMPTY = "EMPTY"
ITEM_ERROR = "ERROR"
ITEM_PARTIAL = "PARTIAL"

CLINIA_CRM_URL = "https://dashboard.clinia.io/api/crm"
CLINIA_CRM_BOARD_URL = "https://dashboard.clinia.io/api/crm/boards/{board_id}"
CLINIA_CRM_COLUMN_ITEMS_URL = "https://dashboard.clinia.io/api/crm/columns/{column_id}/items"

API_TIMEOUT_SEC = max(15, int(os.getenv("CLINIA_CRM_API_TIMEOUT_SEC", "45")))
RETRY_TOTAL = max(1, int(os.getenv("CLINIA_CRM_RETRY_TOTAL", "3")))
RETRY_BACKOFF = max(0.1, float(os.getenv("CLINIA_CRM_RETRY_BACKOFF_SEC", "0.5")))
POLL_SEC = max(10, int(os.getenv("CLINIA_CRM_SYNC_POLL_SEC", "120")))
PAGE_SIZE = 20
DB_BATCH_SIZE = max(50, int(os.getenv("CLINIA_CRM_DB_BATCH_SIZE", "250")))
MAX_PAGES_PER_COLUMN = max(10, int(os.getenv("CLINIA_CRM_MAX_PAGES_PER_COLUMN", "500")))
EMPTY_PAGES_STOP = max(1, int(os.getenv("CLINIA_CRM_EMPTY_PAGES_STOP", "1")))


def _now_ts() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _today_iso() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _json_dump(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


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


def _normalize_text(value: str) -> str:
    raw = str(value or "").strip().lower()
    raw = re.sub(r"\s+", " ", raw)
    return raw


def _normalize_key(value: str) -> str:
    raw = _normalize_text(value)
    raw = re.sub(r"[^a-z0-9]+", "_", raw)
    raw = re.sub(r"_+", "_", raw).strip("_")
    return raw or "unknown"


def _stable_hash(*parts: str) -> str:
    base = "||".join(str(part or "").strip() for part in parts)
    return hashlib.md5(base.encode("utf-8")).hexdigest()


def _to_int(value, default=0) -> int:
    try:
        return int(float(str(value).strip()))
    except Exception:
        return default


def _to_bool_int(value) -> int:
    return 1 if bool(value) else 0


def _to_decimal(value, default="0") -> Decimal:
    if isinstance(value, Decimal):
        return value
    raw = str(value or "").strip()
    if not raw:
        return Decimal(default)
    raw = raw.replace(",", ".")
    try:
        return Decimal(raw)
    except InvalidOperation:
        return Decimal(default)


def _to_float2(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.01")))


def _chunked(seq: List[Tuple], size: int):
    if size <= 0:
        size = 100
    for idx in range(0, len(seq), size):
        yield seq[idx:idx + size]


def _safe_str(value) -> str:
    return str(value or "").strip()


def _normalize_source_key(raw_source: str) -> str:
    value = _normalize_key(raw_source)
    mapping = {
        "google": "google",
        "instagram": "instagram",
        "facebook": "facebook",
        "site": "site",
        "recommendation": "recommendation",
        "referral": "recommendation",
        "other": "other",
        "unknown": "unknown",
    }
    return mapping.get(value, value or "unknown")


def _client_contact_jid(client: Dict) -> str:
    try:
        return _safe_str((((client or {}).get("contact") or {}).get("contact") or {}).get("jid"))
    except Exception:
        return ""


def _client_contact_name(client: Dict) -> str:
    try:
        return _safe_str((((client or {}).get("contact") or {}).get("contact") or {}).get("name"))
    except Exception:
        return ""


def _client_verified_name(client: Dict) -> str:
    try:
        return _safe_str((((client or {}).get("contact") or {}).get("contact") or {}).get("verified_name"))
    except Exception:
        return ""


def _client_personal_name(client: Dict) -> str:
    try:
        return _safe_str((((client or {}).get("contact") or {}).get("contact") or {}).get("personal_name"))
    except Exception:
        return ""


def _query_rows(db: "DatabaseManager", sql: str, params=()) -> List:
    conn = db.get_connection()
    try:
        rs = conn.execute(sql, params)
        return _fetch_rows(rs)
    finally:
        conn.close()


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


def _ensure_unique_index(db: "DatabaseManager", conn, table_name: str, index_name: str, columns_sql: str):
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
            conn.execute(f"CREATE UNIQUE INDEX {index_name} ON {table_name} ({columns_sql})")
        return
    conn.execute(f"CREATE UNIQUE INDEX IF NOT EXISTS {index_name} ON {table_name} ({columns_sql})")


def _heartbeat(db: "DatabaseManager", status: str, details: str):
    try:
        db.update_heartbeat(SERVICE_NAME, status, details[:3500])
    except Exception:
        pass


def ensure_clinia_crm_tables(db: "DatabaseManager"):
    conn = db.get_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS clinia_crm_boards (
              id VARCHAR(64) PRIMARY KEY,
              brand_id VARCHAR(64),
              title VARCHAR(255) NOT NULL,
              board_key VARCHAR(160) NOT NULL,
              is_deleted INTEGER NOT NULL DEFAULT 0,
              columns_count INTEGER NOT NULL DEFAULT 0,
              payload_json TEXT,
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        _ensure_index(db, conn, "clinia_crm_boards", "idx_clinia_crm_boards_key", "board_key")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS clinia_crm_columns (
              id VARCHAR(64) PRIMARY KEY,
              board_id VARCHAR(64) NOT NULL,
              title VARCHAR(255) NOT NULL,
              column_key VARCHAR(160) NOT NULL,
              position INTEGER NOT NULL DEFAULT 0,
              is_deleted INTEGER NOT NULL DEFAULT 0,
              trigger_confirmation INTEGER NOT NULL DEFAULT 0,
              required_fields_json TEXT,
              meta_total INTEGER DEFAULT 0,
              meta_total_amount DECIMAL(14,2) DEFAULT 0,
              meta_has_more INTEGER DEFAULT 0,
              meta_page INTEGER DEFAULT 0,
              meta_page_size INTEGER DEFAULT 0,
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        _ensure_index(db, conn, "clinia_crm_columns", "idx_clinia_crm_columns_board", "board_id")
        _ensure_index(db, conn, "clinia_crm_columns", "idx_clinia_crm_columns_key", "column_key")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS clinia_crm_jobs (
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
        _ensure_index(db, conn, "clinia_crm_jobs", "idx_clinia_crm_jobs_status", "status")
        _ensure_index(db, conn, "clinia_crm_jobs", "idx_clinia_crm_jobs_created", "created_at")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS clinia_crm_job_items (
              id VARCHAR(64) PRIMARY KEY,
              job_id VARCHAR(64) NOT NULL,
              board_id VARCHAR(64) NOT NULL,
              board_title VARCHAR(255),
              status VARCHAR(30) NOT NULL,
              records_read INTEGER NOT NULL DEFAULT 0,
              records_written INTEGER NOT NULL DEFAULT 0,
              error_message TEXT,
              duration_ms INTEGER,
              created_at VARCHAR(32) NOT NULL,
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        _ensure_index(db, conn, "clinia_crm_job_items", "idx_clinia_crm_job_items_job", "job_id")
        _ensure_index(db, conn, "clinia_crm_job_items", "idx_clinia_crm_job_items_status", "status")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS clinia_crm_items_current (
              crm_item_id VARCHAR(64) PRIMARY KEY,
              board_id VARCHAR(64) NOT NULL,
              board_title VARCHAR(255),
              column_id VARCHAR(64) NOT NULL,
              column_title VARCHAR(255),
              client_id VARCHAR(64),
              client_name VARCHAR(255),
              client_phone VARCHAR(80),
              client_email VARCHAR(255),
              client_source_raw VARCHAR(120),
              crm_source_key VARCHAR(120),
              service VARCHAR(255),
              service_key VARCHAR(160),
              price DECIMAL(14,2) NOT NULL DEFAULT 0,
              description TEXT,
              state VARCHAR(40),
              created_at VARCHAR(32),
              column_entered_at VARCHAR(32),
              assigned_user_id VARCHAR(64),
              assigned_user_name VARCHAR(255),
              contact_jid VARCHAR(160),
              contact_name VARCHAR(255),
              verified_name VARCHAR(255),
              personal_name VARCHAR(255),
              tags_json TEXT,
              state_changes_json TEXT,
              payload_json TEXT,
              payload_hash VARCHAR(64),
              is_current_visible INTEGER NOT NULL DEFAULT 1,
              is_open_current INTEGER NOT NULL DEFAULT 0,
              first_seen_at VARCHAR(32) NOT NULL,
              last_seen_at VARCHAR(32) NOT NULL,
              last_job_id VARCHAR(64),
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        _ensure_index(db, conn, "clinia_crm_items_current", "idx_clinia_crm_items_current_board", "board_id")
        _ensure_index(db, conn, "clinia_crm_items_current", "idx_clinia_crm_items_current_column", "column_id")
        _ensure_index(db, conn, "clinia_crm_items_current", "idx_clinia_crm_items_current_source", "crm_source_key")
        _ensure_index(db, conn, "clinia_crm_items_current", "idx_clinia_crm_items_current_service", "service_key")
        _ensure_index(db, conn, "clinia_crm_items_current", "idx_clinia_crm_items_current_created", "created_at")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS clinia_crm_item_snapshots (
              id VARCHAR(64) PRIMARY KEY,
              snapshot_date VARCHAR(10) NOT NULL,
              crm_item_id VARCHAR(64) NOT NULL,
              board_id VARCHAR(64) NOT NULL,
              board_title VARCHAR(255),
              column_id VARCHAR(64) NOT NULL,
              column_title VARCHAR(255),
              client_id VARCHAR(64),
              client_name VARCHAR(255),
              client_phone VARCHAR(80),
              client_email VARCHAR(255),
              client_source_raw VARCHAR(120),
              crm_source_key VARCHAR(120),
              service VARCHAR(255),
              service_key VARCHAR(160),
              price DECIMAL(14,2) NOT NULL DEFAULT 0,
              description TEXT,
              state VARCHAR(40),
              created_at VARCHAR(32),
              column_entered_at VARCHAR(32),
              assigned_user_id VARCHAR(64),
              assigned_user_name VARCHAR(255),
              contact_jid VARCHAR(160),
              contact_name VARCHAR(255),
              verified_name VARCHAR(255),
              personal_name VARCHAR(255),
              tags_json TEXT,
              state_changes_json TEXT,
              payload_json TEXT,
              payload_hash VARCHAR(64),
              collected_at VARCHAR(32) NOT NULL,
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        _ensure_unique_index(
            db,
            conn,
            "clinia_crm_item_snapshots",
            "ux_clinia_crm_item_snapshot_day",
            "snapshot_date, crm_item_id",
        )
        _ensure_index(
            db,
            conn,
            "clinia_crm_item_snapshots",
            "idx_clinia_crm_item_snapshots_board_day",
            "board_id, snapshot_date",
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS fact_clinia_crm_pipeline_daily (
              id VARCHAR(64) PRIMARY KEY,
              snapshot_date VARCHAR(10) NOT NULL,
              board_id VARCHAR(64) NOT NULL,
              board_title VARCHAR(255),
              column_id VARCHAR(64) NOT NULL,
              column_title VARCHAR(255),
              crm_source_key VARCHAR(120) NOT NULL,
              service_key VARCHAR(160) NOT NULL,
              open_items_count INTEGER NOT NULL DEFAULT 0,
              open_items_value DECIMAL(14,2) NOT NULL DEFAULT 0,
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        _ensure_unique_index(
            db,
            conn,
            "fact_clinia_crm_pipeline_daily",
            "ux_fact_clinia_crm_pipeline_daily",
            "snapshot_date, board_id, column_id, crm_source_key, service_key",
        )
        _ensure_index(
            db,
            conn,
            "fact_clinia_crm_pipeline_daily",
            "idx_fact_clinia_crm_pipeline_board_day",
            "board_id, snapshot_date",
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS fact_clinia_crm_lead_created_daily (
              id VARCHAR(64) PRIMARY KEY,
              created_date VARCHAR(10) NOT NULL,
              board_id VARCHAR(64) NOT NULL,
              board_title VARCHAR(255),
              crm_source_key VARCHAR(120) NOT NULL,
              service_key VARCHAR(160) NOT NULL,
              items_created_count INTEGER NOT NULL DEFAULT 0,
              items_created_value DECIMAL(14,2) NOT NULL DEFAULT 0,
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        _ensure_unique_index(
            db,
            conn,
            "fact_clinia_crm_lead_created_daily",
            "ux_fact_clinia_crm_lead_created_daily",
            "created_date, board_id, crm_source_key, service_key",
        )
        _ensure_index(
            db,
            conn,
            "fact_clinia_crm_lead_created_daily",
            "idx_fact_clinia_crm_lead_created_board_day",
            "board_id, created_date",
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS clinia_crm_funnel_mapping (
              id VARCHAR(64) PRIMARY KEY,
              board_id VARCHAR(64) NOT NULL,
              column_id VARCHAR(64),
              stage_key VARCHAR(120),
              stage_label VARCHAR(255),
              is_funil_relevant INTEGER NOT NULL DEFAULT 0,
              brand_slug VARCHAR(64),
              unit_key VARCHAR(80),
              specialty_key VARCHAR(80),
              is_active INTEGER NOT NULL DEFAULT 1,
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        _ensure_index(db, conn, "clinia_crm_funnel_mapping", "idx_clinia_crm_map_board", "board_id")
        _ensure_index(db, conn, "clinia_crm_funnel_mapping", "idx_clinia_crm_map_active", "is_active")

        if not db.use_turso:
            conn.commit()
    finally:
        conn.close()


def _build_headers(cookie: str) -> Dict[str, str]:
    headers = {
        "accept": "application/json, text/plain, */*",
        "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "referer": "https://dashboard.clinia.io/",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    }
    if cookie:
        headers["cookie"] = cookie
    return headers


def _get_cookie_from_db(db: "DatabaseManager") -> str:
    rows = db.execute_query(
        "SELECT token FROM integrations_config WHERE service = 'clinia' ORDER BY updated_at DESC LIMIT 1"
    )
    if not rows:
        return ""
    return _safe_str(_row_get(rows[0], 0, "token"))


def _renew_cookie(db: "DatabaseManager") -> str:
    if not CliniaCookieRenewer:
        raise RuntimeError("CliniaCookieRenewer indisponivel.")
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
            raise RuntimeError(f"Clinia CRM retornou {resp.status_code} em {url}")
        new_cookie = _renew_cookie(db)
        if not new_cookie:
            raise RuntimeError(f"Clinia CRM sem autenticacao valida ({resp.status_code})")
        headers = _build_headers(new_cookie)
        resp = session.get(url, params=params, headers=headers, timeout=API_TIMEOUT_SEC)
        if resp.status_code in (401, 403):
            raise RuntimeError(f"Clinia CRM retornou {resp.status_code} apos renovar cookie: {url}")
        cookie = new_cookie

    if resp.status_code >= 400:
        raise RuntimeError(f"Clinia CRM falhou ({resp.status_code}) em {url}: {resp.text[:280]}")

    ctype = str(resp.headers.get("content-type") or "").lower()
    if "json" not in ctype:
        raise RuntimeError(f"Clinia CRM retornou content-type nao JSON ({ctype}) em {url}")

    try:
        data = resp.json()
    except Exception as exc:
        raise RuntimeError(f"Clinia CRM retornou JSON invalido em {url}: {exc}") from exc

    return data, cookie


def _fetch_boards_catalog(
    session: requests.Session,
    db: "DatabaseManager",
    cookie: str,
) -> Tuple[List[Dict], str]:
    data, cookie = _request_json(session, db, cookie, CLINIA_CRM_URL, params=None)
    boards = data.get("boards") if isinstance(data, dict) else []
    if not isinstance(boards, list):
        raise RuntimeError("Clinia CRM /api/crm nao retornou boards[]")
    return boards, cookie


def _fetch_board_snapshot(
    session: requests.Session,
    db: "DatabaseManager",
    cookie: str,
    board_id: str,
) -> Tuple[Dict, str]:
    data, cookie = _request_json(
        session,
        db,
        cookie,
        CLINIA_CRM_BOARD_URL.format(board_id=board_id),
        params={"show_deleted": "false"},
    )
    if not isinstance(data, dict):
        raise RuntimeError(f"Board {board_id} retornou payload invalido")
    return data, cookie


def _fetch_all_column_items(
    session: requests.Session,
    db: "DatabaseManager",
    cookie: str,
    column_id: str,
) -> Tuple[List[Dict], Dict[str, object], str]:
    all_items: List[Dict] = []
    seen_ids = set()
    page = 1
    empty_pages = 0
    pages_fetched = 0
    raw_items_seen = 0
    duplicate_items = 0
    last_reported_total = 0
    while True:
        if page > MAX_PAGES_PER_COLUMN:
            return all_items, {
                "pagesFetched": pages_fetched,
                "reportedTotal": last_reported_total,
                "rawItemsSeen": raw_items_seen,
                "uniqueItems": len(all_items),
                "duplicateItems": duplicate_items,
                "stopReason": "max_pages_reached",
            }, cookie

        data, cookie = _request_json(
            session,
            db,
            cookie,
            CLINIA_CRM_COLUMN_ITEMS_URL.format(column_id=column_id),
            params={
                "page": page,
                "pageSize": PAGE_SIZE,
                "show_deleted": "false",
            },
        )
        if not isinstance(data, dict):
            raise RuntimeError(f"Coluna {column_id} retornou payload invalido na pagina {page}")
        items = data.get("items")
        if not isinstance(items, list):
            raise RuntimeError(f"Coluna {column_id} nao retornou items[] na pagina {page}")
        pages_fetched += 1
        last_reported_total = _to_int(data.get("total"), last_reported_total)
        if not items:
            empty_pages += 1
        else:
            empty_pages = 0
        for item in items:
            crm_item_id = _safe_str((item or {}).get("id"))
            raw_items_seen += 1
            if crm_item_id and crm_item_id in seen_ids:
                duplicate_items += 1
                continue
            if crm_item_id:
                seen_ids.add(crm_item_id)
            all_items.append(item)
        if empty_pages >= EMPTY_PAGES_STOP:
            break
        page += 1
    return all_items, {
        "pagesFetched": pages_fetched,
        "reportedTotal": last_reported_total,
        "rawItemsSeen": raw_items_seen,
        "uniqueItems": len(all_items),
        "duplicateItems": duplicate_items,
        "stopReason": "empty_page",
    }, cookie


def _persist_boards_and_columns(db: "DatabaseManager", board_catalog: Dict, board_snapshot: Dict, sync_ts: str):
    conn = db.get_connection()
    try:
        board_id = _safe_str(board_snapshot.get("id") or board_catalog.get("id"))
        board_title = _safe_str(board_snapshot.get("title") or board_catalog.get("title"))
        brand_id = _safe_str(board_snapshot.get("brand_id") or board_catalog.get("brand_id"))
        columns = board_snapshot.get("crm_columns") if isinstance(board_snapshot.get("crm_columns"), list) else []
        board_payload = {
            "id": board_id,
            "brand_id": brand_id,
            "title": board_title,
            "crm_columns": [
                {
                    "id": _safe_str(col.get("id")),
                    "title": _safe_str(col.get("title")),
                    "position": _to_int(col.get("position"), 0),
                    "deleted": bool(col.get("deleted")),
                    "trigger_confirmation": bool(col.get("trigger_confirmation")),
                    "_meta": col.get("_meta"),
                }
                for col in columns
            ],
        }

        conn.execute(
            """
            INSERT INTO clinia_crm_boards (
              id, brand_id, title, board_key, is_deleted, columns_count, payload_json, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              brand_id = excluded.brand_id,
              title = excluded.title,
              board_key = excluded.board_key,
              is_deleted = excluded.is_deleted,
              columns_count = excluded.columns_count,
              payload_json = excluded.payload_json,
              updated_at = excluded.updated_at
            """,
            (
                board_id,
                brand_id,
                board_title,
                _normalize_key(board_title),
                _to_bool_int(board_catalog.get("deleted")),
                len(columns),
                _json_dump(board_payload),
                sync_ts,
            ),
        )

        if columns:
            column_rows = []
            for col in columns:
                meta = col.get("_meta") or {}
                column_rows.append(
                    (
                        _safe_str(col.get("id")),
                        board_id,
                        _safe_str(col.get("title")),
                        _normalize_key(_safe_str(col.get("title"))),
                        _to_int(col.get("position"), 0),
                        _to_bool_int(col.get("deleted")),
                        _to_bool_int(col.get("trigger_confirmation")),
                        _json_dump(col.get("required_fields")) if col.get("required_fields") is not None else None,
                        _to_int(meta.get("total"), 0),
                        _to_float2(_to_decimal(meta.get("totalAmount"), "0")),
                        _to_bool_int(meta.get("hasMore")),
                        _to_int(meta.get("page"), 0),
                        _to_int(meta.get("pageSize"), 0),
                        sync_ts,
                    )
                )
            for chunk in _chunked(column_rows, DB_BATCH_SIZE):
                conn.executemany(
                    """
                    INSERT INTO clinia_crm_columns (
                      id, board_id, title, column_key, position, is_deleted, trigger_confirmation,
                      required_fields_json, meta_total, meta_total_amount, meta_has_more,
                      meta_page, meta_page_size, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                      board_id = excluded.board_id,
                      title = excluded.title,
                      column_key = excluded.column_key,
                      position = excluded.position,
                      is_deleted = excluded.is_deleted,
                      trigger_confirmation = excluded.trigger_confirmation,
                      required_fields_json = excluded.required_fields_json,
                      meta_total = excluded.meta_total,
                      meta_total_amount = excluded.meta_total_amount,
                      meta_has_more = excluded.meta_has_more,
                      meta_page = excluded.meta_page,
                      meta_page_size = excluded.meta_page_size,
                      updated_at = excluded.updated_at
                    """,
                    chunk,
                )

        if not db.use_turso:
            conn.commit()
    finally:
        conn.close()


def _prepare_item_rows(
    board_id: str,
    board_title: str,
    column_id: str,
    column_title: str,
    items: List[Dict],
    sync_ts: str,
    job_id: str,
) -> Tuple[List[Tuple], List[Tuple]]:
    current_rows: List[Tuple] = []
    snapshot_rows: List[Tuple] = []
    snapshot_date = _today_iso()

    for item in items:
        client = item.get("client") or {}
        user = item.get("user") or {}
        client_source = _safe_str(client.get("source"))
        payload_json = _json_dump(item)
        payload_hash = _stable_hash(payload_json)
        price_val = _to_float2(_to_decimal(item.get("price"), "0"))
        state = _safe_str(item.get("state"))
        service = _safe_str(item.get("service"))
        service_key = _normalize_key(service)
        crm_source_key = _normalize_source_key(client_source)
        base_tuple = (
            _safe_str(item.get("id")),
            board_id,
            board_title,
            column_id,
            column_title,
            _safe_str(client.get("id")),
            _safe_str(client.get("name")),
            _safe_str(client.get("phone")),
            _safe_str(client.get("email")),
            client_source,
            crm_source_key,
            service,
            service_key,
            price_val,
            _safe_str(item.get("description")),
            state,
            _safe_str(item.get("created_at")),
            _safe_str(item.get("column_entered_at")),
            _safe_str(user.get("id")),
            _safe_str(user.get("name")),
            _client_contact_jid(client),
            _client_contact_name(client),
            _client_verified_name(client),
            _client_personal_name(client),
            _json_dump(client.get("tags") or []),
            _json_dump(item.get("state_changes") or []),
            payload_json,
            payload_hash,
        )
        current_rows.append(
            base_tuple
            + (
                1,
                1 if state.upper() == "OPEN" else 0,
                sync_ts,
                sync_ts,
                job_id,
                sync_ts,
            )
        )
        snapshot_rows.append(base_tuple + (snapshot_date, sync_ts, sync_ts))
    return current_rows, snapshot_rows


def _persist_board_items(
    db: "DatabaseManager",
    job_id: str,
    board_id: str,
    board_title: str,
    board_snapshot: Dict,
    all_items_by_column: Dict[str, List[Dict]],
    sync_ts: str,
) -> Dict[str, int]:
    current_rows: List[Tuple] = []
    snapshot_rows: List[Tuple] = []
    columns = board_snapshot.get("crm_columns") if isinstance(board_snapshot.get("crm_columns"), list) else []
    for col in columns:
        column_id = _safe_str(col.get("id"))
        column_title = _safe_str(col.get("title"))
        items = all_items_by_column.get(column_id) or []
        cur_rows, snap_rows = _prepare_item_rows(board_id, board_title, column_id, column_title, items, sync_ts, job_id)
        current_rows.extend(cur_rows)
        snapshot_rows.extend(snap_rows)

    conn = db.get_connection()
    try:
        conn.execute(
            """
            UPDATE clinia_crm_items_current
            SET is_current_visible = 0, last_job_id = ?, updated_at = ?
            WHERE board_id = ?
            """,
            (job_id, sync_ts, board_id),
        )

        for chunk in _chunked(current_rows, DB_BATCH_SIZE):
            conn.executemany(
                """
                INSERT INTO clinia_crm_items_current (
                  crm_item_id, board_id, board_title, column_id, column_title,
                  client_id, client_name, client_phone, client_email, client_source_raw, crm_source_key,
                  service, service_key, price, description, state, created_at, column_entered_at,
                  assigned_user_id, assigned_user_name, contact_jid, contact_name, verified_name,
                  personal_name, tags_json, state_changes_json, payload_json, payload_hash,
                  is_current_visible, is_open_current, first_seen_at, last_seen_at, last_job_id, updated_at
                ) VALUES (
                  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
                ON CONFLICT(crm_item_id) DO UPDATE SET
                  board_id = excluded.board_id,
                  board_title = excluded.board_title,
                  column_id = excluded.column_id,
                  column_title = excluded.column_title,
                  client_id = excluded.client_id,
                  client_name = excluded.client_name,
                  client_phone = excluded.client_phone,
                  client_email = excluded.client_email,
                  client_source_raw = excluded.client_source_raw,
                  crm_source_key = excluded.crm_source_key,
                  service = excluded.service,
                  service_key = excluded.service_key,
                  price = excluded.price,
                  description = excluded.description,
                  state = excluded.state,
                  created_at = excluded.created_at,
                  column_entered_at = excluded.column_entered_at,
                  assigned_user_id = excluded.assigned_user_id,
                  assigned_user_name = excluded.assigned_user_name,
                  contact_jid = excluded.contact_jid,
                  contact_name = excluded.contact_name,
                  verified_name = excluded.verified_name,
                  personal_name = excluded.personal_name,
                  tags_json = excluded.tags_json,
                  state_changes_json = excluded.state_changes_json,
                  payload_json = excluded.payload_json,
                  payload_hash = excluded.payload_hash,
                  is_current_visible = excluded.is_current_visible,
                  is_open_current = excluded.is_open_current,
                  last_seen_at = excluded.last_seen_at,
                  last_job_id = excluded.last_job_id,
                  updated_at = excluded.updated_at
                """,
                chunk,
            )

        for chunk in _chunked(snapshot_rows, DB_BATCH_SIZE):
            snapshot_insert_rows = [
                row[:-3] + (row[-3], row[-2], row[-1], _stable_hash(row[-3], row[0]))
                for row in chunk
            ]
            conn.executemany(
                """
                INSERT INTO clinia_crm_item_snapshots (
                  crm_item_id, board_id, board_title, column_id, column_title,
                  client_id, client_name, client_phone, client_email, client_source_raw, crm_source_key,
                  service, service_key, price, description, state, created_at, column_entered_at,
                  assigned_user_id, assigned_user_name, contact_jid, contact_name, verified_name,
                  personal_name, tags_json, state_changes_json, payload_json, payload_hash,
                  snapshot_date, collected_at, updated_at, id
                ) VALUES (
                  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
                ON CONFLICT(snapshot_date, crm_item_id) DO UPDATE SET
                  board_id = excluded.board_id,
                  board_title = excluded.board_title,
                  column_id = excluded.column_id,
                  column_title = excluded.column_title,
                  client_id = excluded.client_id,
                  client_name = excluded.client_name,
                  client_phone = excluded.client_phone,
                  client_email = excluded.client_email,
                  client_source_raw = excluded.client_source_raw,
                  crm_source_key = excluded.crm_source_key,
                  service = excluded.service,
                  service_key = excluded.service_key,
                  price = excluded.price,
                  description = excluded.description,
                  state = excluded.state,
                  created_at = excluded.created_at,
                  column_entered_at = excluded.column_entered_at,
                  assigned_user_id = excluded.assigned_user_id,
                  assigned_user_name = excluded.assigned_user_name,
                  contact_jid = excluded.contact_jid,
                  contact_name = excluded.contact_name,
                  verified_name = excluded.verified_name,
                  personal_name = excluded.personal_name,
                  tags_json = excluded.tags_json,
                  state_changes_json = excluded.state_changes_json,
                  payload_json = excluded.payload_json,
                  payload_hash = excluded.payload_hash,
                  collected_at = excluded.collected_at,
                  updated_at = excluded.updated_at
                """,
                snapshot_insert_rows,
            )

        snapshot_date = _today_iso()
        conn.execute(
            "DELETE FROM fact_clinia_crm_pipeline_daily WHERE snapshot_date = ? AND board_id = ?",
            (snapshot_date, board_id),
        )
        pipeline_rs = conn.execute(
            """
            SELECT
              snapshot_date,
              board_id,
              MAX(board_title) AS board_title,
              column_id,
              MAX(column_title) AS column_title,
              COALESCE(NULLIF(TRIM(crm_source_key), ''), 'unknown') AS crm_source_key,
              COALESCE(NULLIF(TRIM(service_key), ''), 'unknown') AS service_key,
              COUNT(1) AS open_items_count,
              COALESCE(SUM(price), 0) AS open_items_value
            FROM clinia_crm_item_snapshots
            WHERE snapshot_date = ? AND board_id = ?
            GROUP BY snapshot_date, board_id, column_id, crm_source_key, service_key
            """,
            (snapshot_date, board_id),
        )
        pipeline_rows = _fetch_rows(pipeline_rs)
        pipeline_insert_rows = []
        for row in pipeline_rows:
            row_snapshot_date = _safe_str(_row_get(row, 0, "snapshot_date"))
            row_board_id = _safe_str(_row_get(row, 1, "board_id"))
            row_board_title = _safe_str(_row_get(row, 2, "board_title"))
            row_column_id = _safe_str(_row_get(row, 3, "column_id"))
            row_column_title = _safe_str(_row_get(row, 4, "column_title"))
            row_source = _safe_str(_row_get(row, 5, "crm_source_key")) or "unknown"
            row_service = _safe_str(_row_get(row, 6, "service_key")) or "unknown"
            row_count = _to_int(_row_get(row, 7, "open_items_count"), 0)
            row_value = _to_float2(_to_decimal(_row_get(row, 8, "open_items_value"), "0"))
            pipeline_insert_rows.append(
                (
                    _stable_hash("pipeline", row_snapshot_date, row_board_id, row_column_id, row_source, row_service),
                    row_snapshot_date,
                    row_board_id,
                    row_board_title,
                    row_column_id,
                    row_column_title,
                    row_source,
                    row_service,
                    row_count,
                    row_value,
                    sync_ts,
                )
            )
        for chunk in _chunked(pipeline_insert_rows, DB_BATCH_SIZE):
            conn.executemany(
                """
                INSERT INTO fact_clinia_crm_pipeline_daily (
                  id, snapshot_date, board_id, board_title, column_id, column_title,
                  crm_source_key, service_key, open_items_count, open_items_value, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  snapshot_date = excluded.snapshot_date,
                  board_id = excluded.board_id,
                  board_title = excluded.board_title,
                  column_id = excluded.column_id,
                  column_title = excluded.column_title,
                  crm_source_key = excluded.crm_source_key,
                  service_key = excluded.service_key,
                  open_items_count = excluded.open_items_count,
                  open_items_value = excluded.open_items_value,
                  updated_at = excluded.updated_at
                """,
                chunk,
            )

        conn.execute(
            "DELETE FROM fact_clinia_crm_lead_created_daily WHERE board_id = ?",
            (board_id,),
        )
        lead_rs = conn.execute(
            """
            SELECT
              SUBSTR(created_at, 1, 10) AS created_date,
              board_id,
              MAX(board_title) AS board_title,
              COALESCE(NULLIF(TRIM(crm_source_key), ''), 'unknown') AS crm_source_key,
              COALESCE(NULLIF(TRIM(service_key), ''), 'unknown') AS service_key,
              COUNT(1) AS items_created_count,
              COALESCE(SUM(price), 0) AS items_created_value
            FROM clinia_crm_items_current
            WHERE board_id = ? AND created_at IS NOT NULL AND created_at <> ''
            GROUP BY SUBSTR(created_at, 1, 10), board_id, crm_source_key, service_key
            """,
            (board_id,),
        )
        lead_rows = _fetch_rows(lead_rs)
        lead_insert_rows = []
        for row in lead_rows:
            row_created_date = _safe_str(_row_get(row, 0, "created_date"))
            row_board_id = _safe_str(_row_get(row, 1, "board_id"))
            row_board_title = _safe_str(_row_get(row, 2, "board_title"))
            row_source = _safe_str(_row_get(row, 3, "crm_source_key")) or "unknown"
            row_service = _safe_str(_row_get(row, 4, "service_key")) or "unknown"
            row_count = _to_int(_row_get(row, 5, "items_created_count"), 0)
            row_value = _to_float2(_to_decimal(_row_get(row, 6, "items_created_value"), "0"))
            lead_insert_rows.append(
                (
                    _stable_hash("lead_created", row_created_date, row_board_id, row_source, row_service),
                    row_created_date,
                    row_board_id,
                    row_board_title,
                    row_source,
                    row_service,
                    row_count,
                    row_value,
                    sync_ts,
                )
            )
        for chunk in _chunked(lead_insert_rows, DB_BATCH_SIZE):
            conn.executemany(
                """
                INSERT INTO fact_clinia_crm_lead_created_daily (
                  id, created_date, board_id, board_title, crm_source_key, service_key,
                  items_created_count, items_created_value, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  created_date = excluded.created_date,
                  board_id = excluded.board_id,
                  board_title = excluded.board_title,
                  crm_source_key = excluded.crm_source_key,
                  service_key = excluded.service_key,
                  items_created_count = excluded.items_created_count,
                  items_created_value = excluded.items_created_value,
                  updated_at = excluded.updated_at
                """,
                chunk,
            )

        if not db.use_turso:
            conn.commit()
    finally:
        conn.close()

    return {
        "current_rows": len(current_rows),
        "snapshot_rows": len(snapshot_rows),
    }


def _make_scope_json(board_id: Optional[str]) -> str:
    return _json_dump({"board_id": _safe_str(board_id) or None})


def enqueue_clinia_crm_job(
    db: "DatabaseManager",
    board_id: Optional[str] = None,
    requested_by: str = "manual",
    initial_status: str = STATUS_PENDING,
) -> Dict:
    now_ts = _now_ts()
    job_id = uuid.uuid4().hex
    scope_json = _make_scope_json(board_id)
    db.execute_query(
        """
        INSERT INTO clinia_crm_jobs (
          id, status, scope_json, requested_by, error_message, created_at, started_at, finished_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, ?, NULL, NULL, ?)
        """,
        (job_id, initial_status, scope_json, _safe_str(requested_by) or "manual", now_ts, now_ts),
    )
    print(f"Job Clinia CRM criado | id={job_id} scope={{board_id={board_id or 'all'}}}")
    return {
        "id": job_id,
        "status": initial_status,
        "scope_json": scope_json,
        "requested_by": requested_by,
    }


def _get_pending_job(db: "DatabaseManager") -> Optional[Dict]:
    rows = _query_rows(
        db,
        """
        SELECT id, status, scope_json, requested_by
        FROM clinia_crm_jobs
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
            UPDATE clinia_crm_jobs
            SET status = ?, started_at = ?, updated_at = ?, error_message = NULL
            WHERE id = ?
            """,
            (status, now_ts, now_ts, job_id),
        )
        return

    finished_at = now_ts if status in (STATUS_COMPLETED, STATUS_FAILED, STATUS_PARTIAL) else None
    db.execute_query(
        """
        UPDATE clinia_crm_jobs
        SET status = ?, finished_at = ?, updated_at = ?, error_message = ?
        WHERE id = ?
        """,
        (status, finished_at, now_ts, _safe_str(error_message) or None, job_id),
    )


def _insert_job_item(
    db: "DatabaseManager",
    job_id: str,
    board_id: str,
    board_title: str,
    status: str,
    records_read: int,
    records_written: int,
    error_message: Optional[str],
    duration_ms: int,
):
    now_ts = _now_ts()
    db.execute_query(
        """
        INSERT INTO clinia_crm_job_items (
          id, job_id, board_id, board_title, status, records_read, records_written,
          error_message, duration_ms, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            uuid.uuid4().hex,
            job_id,
            board_id,
            board_title,
            status,
            int(records_read or 0),
            int(records_written or 0),
            _safe_str(error_message) or None,
            int(duration_ms or 0),
            now_ts,
            now_ts,
        ),
    )


def _parse_scope(scope_json: str) -> Optional[str]:
    raw = _safe_str(scope_json)
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except Exception:
        return None
    return _safe_str(data.get("board_id")) or None


def _select_boards(catalog: List[Dict], board_id_scope: Optional[str]) -> List[Dict]:
    if not board_id_scope:
        return catalog
    selected = [board for board in catalog if _safe_str(board.get("id")) == board_id_scope]
    if not selected:
        raise RuntimeError(f"Board Clinia nao encontrado para o scope informado: {board_id_scope}")
    return selected


def _run_job(db: "DatabaseManager", job: Dict) -> Dict:
    job_id = _safe_str(job.get("id"))
    board_scope = _parse_scope(_safe_str(job.get("scope_json")))
    _update_job_status(db, job_id, STATUS_RUNNING)
    _heartbeat(db, STATUS_RUNNING, f"job={job_id} stage=boards carregando catalogo")

    session = _make_http_session()
    cookie = _get_cookie_from_db(db)
    if not cookie:
        cookie = _renew_cookie(db)
    if not cookie:
        msg = "Cookie Clinia ausente e nao foi possivel renovar."
        _update_job_status(db, job_id, STATUS_FAILED, msg)
        _heartbeat(db, STATUS_FAILED, f"job={job_id} {msg}")
        return {"status": STATUS_FAILED, "items": 0, "error": 1}

    catalog, cookie = _fetch_boards_catalog(session, db, cookie)
    boards = _select_boards(catalog, board_scope)
    sync_ts = _now_ts()

    ok_count = 0
    partial_count = 0
    empty_count = 0
    error_count = 0
    total_read = 0
    total_written = 0

    for idx, board in enumerate(boards, start=1):
        t0 = time.time()
        board_id = _safe_str(board.get("id"))
        board_title = _safe_str(board.get("title"))
        try:
            _heartbeat(
                db,
                STATUS_RUNNING,
                f"job={job_id} stage=board {idx}/{len(boards)} board={board_title or board_id}",
            )
            snapshot, cookie = _fetch_board_snapshot(session, db, cookie, board_id)
            _persist_boards_and_columns(db, board, snapshot, sync_ts)

            warnings: List[str] = []
            notes: List[str] = []
            all_items_by_column: Dict[str, List[Dict]] = {}
            board_read = 0
            columns = snapshot.get("crm_columns") if isinstance(snapshot.get("crm_columns"), list) else []
            for col_idx, col in enumerate(columns, start=1):
                column_id = _safe_str(col.get("id"))
                column_title = _safe_str(col.get("title"))
                _heartbeat(
                    db,
                    STATUS_RUNNING,
                    f"job={job_id} stage=items board={board_title or board_id} col={col_idx}/{len(columns)} {column_title or column_id}",
                )
                items, fetch_meta, cookie = _fetch_all_column_items(session, db, cookie, column_id)
                all_items_by_column[column_id] = items
                board_read += len(items)
                meta = col.get("_meta") or {}
                meta_total = _to_int(meta.get("total"), 0)
                reported_total = _to_int(fetch_meta.get("reportedTotal"), 0)
                stop_reason = _safe_str(fetch_meta.get("stopReason")) or "unknown"
                duplicate_items = _to_int(fetch_meta.get("duplicateItems"), 0)
                if stop_reason == "max_pages_reached":
                    warnings.append(
                        f"coluna {column_title or column_id}: paginação interrompida no limite={MAX_PAGES_PER_COLUMN}"
                    )
                elif meta_total and meta_total != len(items):
                    notes.append(
                        f"coluna {column_title or column_id}: meta_total={meta_total} coletado={len(items)}"
                    )
                elif reported_total and reported_total != len(items):
                    notes.append(
                        f"coluna {column_title or column_id}: api_total={reported_total} coletado={len(items)}"
                    )
                if duplicate_items:
                    notes.append(
                        f"coluna {column_title or column_id}: duplicados_descartados={duplicate_items}"
                    )

            persist_stats = _persist_board_items(db, job_id, board_id, board_title, snapshot, all_items_by_column, sync_ts)
            records_written = persist_stats["current_rows"] + persist_stats["snapshot_rows"]
            total_read += board_read
            total_written += records_written

            if board_read == 0:
                status = ITEM_EMPTY
                empty_count += 1
            elif warnings:
                status = ITEM_PARTIAL
                partial_count += 1
            else:
                status = ITEM_SUCCESS
                ok_count += 1

            _insert_job_item(
                db,
                job_id,
                board_id,
                board_title,
                status,
                board_read,
                records_written,
                " | ".join(warnings or notes) if (warnings or notes) else None,
                int((time.time() - t0) * 1000),
            )
            print(
                f"[{idx}/{len(boards)}] Clinia CRM {board_title or board_id} "
                f"status={status} read={board_read} written={records_written}"
            )
        except Exception as exc:
            error_count += 1
            msg = str(exc)[:1000]
            _insert_job_item(
                db,
                job_id,
                board_id,
                board_title,
                ITEM_ERROR,
                0,
                0,
                msg,
                int((time.time() - t0) * 1000),
            )
            print(f"[{idx}/{len(boards)}] ERRO Clinia CRM {board_title or board_id}: {msg}")

    if error_count == 0 and partial_count == 0:
        final_status = STATUS_COMPLETED
        final_error = None
    elif error_count == 0:
        final_status = STATUS_PARTIAL
        final_error = f"partial: ok={ok_count} empty={empty_count} partial={partial_count}"
    elif ok_count > 0 or partial_count > 0 or empty_count > 0:
        final_status = STATUS_PARTIAL
        final_error = f"partial: ok={ok_count} empty={empty_count} partial={partial_count} erro={error_count}"
    else:
        final_status = STATUS_FAILED
        final_error = f"failed: erro={error_count}"

    _update_job_status(db, job_id, final_status, final_error)
    _heartbeat(
        db,
        final_status if final_status != STATUS_PARTIAL else "WARNING",
        f"job={job_id} done status={final_status} ok={ok_count} empty={empty_count} "
        f"partial={partial_count} erro={error_count} read={total_read} written={total_written}",
    )
    return {
        "status": final_status,
        "ok": ok_count,
        "empty": empty_count,
        "partial": partial_count,
        "error": error_count,
        "read": total_read,
        "written": total_written,
    }


def process_pending_clinia_crm_jobs_once(
    auto_enqueue_if_empty: bool = False,
    requested_by: str = "system_status",
    board_id: Optional[str] = None,
) -> bool:
    if not DatabaseManager:
        raise RuntimeError("DatabaseManager indisponivel.")
    db = DatabaseManager()
    ensure_clinia_crm_tables(db)

    pending = _get_pending_job(db)
    if not pending and auto_enqueue_if_empty:
        pending = enqueue_clinia_crm_job(
            db=db,
            board_id=board_id,
            requested_by=requested_by,
            initial_status=STATUS_RUNNING,
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


def _connection_smoke_test(board_id: Optional[str]):
    if not DatabaseManager:
        raise RuntimeError("DatabaseManager indisponivel.")
    db = DatabaseManager()
    ensure_clinia_crm_tables(db)
    session = _make_http_session()
    cookie = _get_cookie_from_db(db)
    if not cookie:
        cookie = _renew_cookie(db)
    if not cookie:
        raise RuntimeError("Cookie Clinia ausente e nao foi possivel renovar.")

    catalog, cookie = _fetch_boards_catalog(session, db, cookie)
    boards = _select_boards(catalog, board_id)
    print(f"Clinia CRM OK. Boards selecionados: {len(boards)}")
    if boards:
        snapshot, cookie = _fetch_board_snapshot(session, db, cookie, _safe_str(boards[0].get("id")))
        cols = snapshot.get("crm_columns") if isinstance(snapshot.get("crm_columns"), list) else []
        print(f"Board OK: {_safe_str(snapshot.get('title'))} colunas={len(cols)}")
        if cols:
            first_col = cols[0]
            first_page, _ = _request_json(
                session,
                db,
                cookie,
                CLINIA_CRM_COLUMN_ITEMS_URL.format(column_id=_safe_str(first_col.get("id"))),
                params={"page": 1, "pageSize": PAGE_SIZE, "show_deleted": "false"},
            )
            print(
                f"Primeira coluna OK: {_safe_str(first_col.get('title'))} "
                f"items_page1={len((first_page.get('items') or []))} total={first_page.get('total')}"
            )


def run_loop_forever():
    if not DatabaseManager:
        raise RuntimeError("DatabaseManager indisponivel.")
    db = DatabaseManager()
    ensure_clinia_crm_tables(db)
    _heartbeat(db, STATUS_COMPLETED, "Worker Clinia CRM iniciado")
    while True:
        try:
            had = process_pending_clinia_crm_jobs_once(auto_enqueue_if_empty=False, requested_by="orchestrator")
            if not had:
                time.sleep(POLL_SEC)
        except Exception as exc:
            _heartbeat(db, STATUS_FAILED, f"Loop error: {exc}")
            time.sleep(POLL_SEC)


def main():
    parser = argparse.ArgumentParser(description="Worker Clinia CRM")
    parser.add_argument("--once", action="store_true", help="Processa um ciclo unico.")
    parser.add_argument("--enqueue", action="store_true", help="Apenas enfileira um job e sai.")
    parser.add_argument("--board", type=str, default="", help="Filtra por board_id.")
    parser.add_argument("--requested-by", type=str, default="manual_cli", help="Identificador do solicitante.")
    parser.add_argument("--test-connections", action="store_true", help="Testa autenticacao e endpoints CRM.")
    parser.add_argument("--ensure-only", action="store_true", help="Cria/valida schema e encerra.")
    args = parser.parse_args()

    if not DatabaseManager:
        raise RuntimeError("DatabaseManager indisponivel.")

    db = DatabaseManager()
    ensure_clinia_crm_tables(db)

    board_id = _safe_str(args.board) or None
    requested_by = _safe_str(args.requested_by) or "manual_cli"

    if args.ensure_only:
        _heartbeat(db, STATUS_COMPLETED, "Schema Clinia CRM validado")
        print("Schema Clinia CRM validado.")
        return

    if args.test_connections:
        _connection_smoke_test(board_id)
        _heartbeat(db, STATUS_COMPLETED, "Teste de conexao Clinia CRM concluido")
        return

    if args.enqueue:
        enqueue_clinia_crm_job(
            db=db,
            board_id=board_id,
            requested_by=requested_by,
            initial_status=STATUS_PENDING,
        )
        _heartbeat(db, STATUS_PENDING, "Job Clinia CRM enfileirado via CLI")
        return

    if args.once:
        processed = process_pending_clinia_crm_jobs_once(
            auto_enqueue_if_empty=True,
            requested_by=requested_by,
            board_id=board_id,
        )
        if not processed:
            print("Sem jobs pendentes.")
        return

    run_loop_forever()


if __name__ == "__main__":
    main()
