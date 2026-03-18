import argparse
import calendar
import hashlib
import json
import os
import re
import sys
import time
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Dict, List, Optional, Tuple

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database_manager import DatabaseManager
except ImportError:
    DatabaseManager = None


SERVICE_NAME = "marketing_funnel"

STATUS_PENDING = "PENDING"
STATUS_RUNNING = "RUNNING"
STATUS_COMPLETED = "COMPLETED"
STATUS_FAILED = "FAILED"
STATUS_PARTIAL = "PARTIAL"

ITEM_SUCCESS = "SUCCESS"
ITEM_ERROR = "ERROR"
ITEM_SKIPPED = "SKIPPED"

GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_ADS_API_VERSION = str(os.getenv("GOOGLE_ADS_API_VERSION") or "v22").strip().lower()
if not re.match(r"^v\d+$", GOOGLE_ADS_API_VERSION):
    GOOGLE_ADS_API_VERSION = "v22"
GOOGLE_ADS_SEARCH_STREAM_URL = (
    f"https://googleads.googleapis.com/{GOOGLE_ADS_API_VERSION}/customers/{{customer_id}}/googleAds:searchStream"
)
GA4_RUN_REPORT_URL = "https://analyticsdata.googleapis.com/v1beta/properties/{property_id}:runReport"

ATTRIBUTION_RULE = "LAST_VALID_SOURCE_CAMPAIGN"

API_TIMEOUT_SEC = max(15, int(os.getenv("MARKETING_FUNNEL_API_TIMEOUT_SEC", "60")))
RETRY_TOTAL = max(1, int(os.getenv("MARKETING_FUNNEL_RETRY_TOTAL", "3")))
RETRY_BACKOFF = max(0.1, float(os.getenv("MARKETING_FUNNEL_RETRY_BACKOFF_SEC", "0.5")))
POLL_SEC = max(10, int(os.getenv("MARKETING_FUNNEL_SYNC_POLL_SEC", "60")))
AUTO_PERIOD_DEFAULT = os.getenv("MARKETING_FUNNEL_DEFAULT_PERIOD", "previous_month").strip().lower()
DB_BATCH_SIZE = max(50, int(os.getenv("MARKETING_FUNNEL_DB_BATCH_SIZE", "500")))


def _now_ts() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _json_dump(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _to_int(value, default=0) -> int:
    try:
        return int(float(str(value).strip()))
    except Exception:
        return default


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
        size = 500
    for idx in range(0, len(seq), size):
        yield seq[idx:idx + size]


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
    base = "||".join(str(p or "").strip() for p in parts)
    return hashlib.md5(base.encode("utf-8")).hexdigest()


def _period_previous_month() -> str:
    now = datetime.now()
    year = now.year
    month = now.month - 1
    if month <= 0:
        year -= 1
        month = 12
    return f"{year:04d}-{month:02d}"


def _period_to_range(period_ref: str) -> Tuple[str, str]:
    m = re.match(r"^(\d{4})-(\d{2})$", str(period_ref or "").strip())
    if not m:
        raise RuntimeError("period_ref invalido. Use formato YYYY-MM.")
    year = int(m.group(1))
    month = int(m.group(2))
    if month < 1 or month > 12:
        raise RuntimeError("period_ref invalido. Mes deve estar entre 01 e 12.")
    last_day = calendar.monthrange(year, month)[1]
    return f"{year:04d}-{month:02d}-01", f"{year:04d}-{month:02d}-{last_day:02d}"


def _parse_date(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        raise RuntimeError("data vazia")
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            dt = datetime.strptime(raw, fmt)
            return dt.strftime("%Y-%m-%d")
        except Exception:
            continue
    raise RuntimeError(f"data invalida: {raw}")


def _resolve_period_range(period_ref: Optional[str], start_date: Optional[str], end_date: Optional[str]) -> Tuple[str, str, str]:
    start_raw = str(start_date or "").strip()
    end_raw = str(end_date or "").strip()
    if start_raw and end_raw:
        start_iso = _parse_date(start_raw)
        end_iso = _parse_date(end_raw)
        if start_iso > end_iso:
            raise RuntimeError("intervalo invalido: start_date > end_date")
        return f"{start_iso[:7]}", start_iso, end_iso

    if str(period_ref or "").strip():
        ref = str(period_ref).strip()
    else:
        ref = _period_previous_month() if AUTO_PERIOD_DEFAULT == "previous_month" else datetime.now().strftime("%Y-%m")

    start_iso, end_iso = _period_to_range(ref)
    return ref, start_iso, end_iso


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
        allowed_methods=["GET", "POST"],
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def _get_google_access_token(session: requests.Session) -> str:
    client_id = str(os.getenv("GOOGLE_OAUTH_CLIENT_ID") or "").strip()
    client_secret = str(os.getenv("GOOGLE_OAUTH_CLIENT_SECRET") or "").strip()
    refresh_token = str(os.getenv("GOOGLE_OAUTH_REFRESH_TOKEN") or "").strip()

    if not client_id or not client_secret or not refresh_token:
        raise RuntimeError(
            "Credenciais OAuth Google ausentes. Configure GOOGLE_OAUTH_CLIENT_ID, "
            "GOOGLE_OAUTH_CLIENT_SECRET e GOOGLE_OAUTH_REFRESH_TOKEN."
        )

    payload = {
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }
    resp = session.post(GOOGLE_OAUTH_TOKEN_URL, data=payload, timeout=API_TIMEOUT_SEC)
    if resp.status_code >= 400:
        raise RuntimeError(f"Falha OAuth Google ({resp.status_code}): {resp.text[:300]}")
    data = resp.json() if resp.content else {}
    access_token = str(data.get("access_token") or "").strip()
    if not access_token:
        raise RuntimeError("OAuth Google nao retornou access_token.")
    return access_token


def _ads_headers(access_token: str) -> Dict[str, str]:
    developer_token = str(os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN") or "").strip()
    if not developer_token:
        raise RuntimeError("GOOGLE_ADS_DEVELOPER_TOKEN nao configurado.")
    headers = {
        "Authorization": f"Bearer {access_token}",
        "developer-token": developer_token,
        "Content-Type": "application/json",
    }
    login_customer_id = str(os.getenv("GOOGLE_ADS_LOGIN_CUSTOMER_ID") or "").strip()
    if login_customer_id:
        headers["login-customer-id"] = login_customer_id.replace("-", "")
    return headers


def _fetch_google_ads_rows(
    session: requests.Session,
    access_token: str,
    ads_customer_id: str,
    start_date: str,
    end_date: str,
) -> List[Dict]:
    customer_id = str(ads_customer_id or "").replace("-", "").strip()
    if not customer_id:
        return []

    query = f"""
      SELECT
        segments.date,
        campaign.id,
        campaign.name,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros
      FROM campaign
      WHERE segments.date BETWEEN '{start_date}' AND '{end_date}'
    """.strip()

    url = GOOGLE_ADS_SEARCH_STREAM_URL.format(customer_id=customer_id)
    headers = _ads_headers(access_token)
    resp = session.post(url, headers=headers, json={"query": query}, timeout=API_TIMEOUT_SEC)
    if resp.status_code >= 400:
        raise RuntimeError(f"Google Ads searchStream falhou ({resp.status_code}): {resp.text[:400]}")

    payload = resp.json() if resp.content else []
    rows: List[Dict] = []

    for chunk in payload if isinstance(payload, list) else []:
        for result in chunk.get("results", []) or []:
            seg = result.get("segments", {}) or {}
            camp = result.get("campaign", {}) or {}
            metrics = result.get("metrics", {}) or {}

            date_ref = str(seg.get("date") or "").strip()
            campaign_id = str(camp.get("id") or "").strip()
            campaign_name = str(camp.get("name") or "").strip()
            impressions = _to_int(metrics.get("impressions"), 0)
            clicks = _to_int(metrics.get("clicks"), 0)
            cost_micros = _to_decimal(metrics.get("costMicros"), "0")
            spend = cost_micros / Decimal("1000000")

            if not date_ref:
                continue
            rows.append(
                {
                    "date_ref": date_ref,
                    "campaign_id": campaign_id,
                    "campaign_name": campaign_name,
                    "impressions": impressions,
                    "clicks": clicks,
                    "spend": spend,
                    "payload": result,
                }
            )
    return rows


def _format_ga4_date(raw: str) -> Optional[str]:
    val = str(raw or "").strip()
    if not val:
        return None
    if re.match(r"^\d{8}$", val):
        return f"{val[0:4]}-{val[4:6]}-{val[6:8]}"
    if re.match(r"^\d{4}-\d{2}-\d{2}$", val):
        return val
    return None


def _fetch_ga4_rows(
    session: requests.Session,
    access_token: str,
    ga4_property_id: str,
    start_date: str,
    end_date: str,
) -> List[Dict]:
    property_id = str(ga4_property_id or "").strip()
    if not property_id:
        return []

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    url = GA4_RUN_REPORT_URL.format(property_id=property_id)

    offset = 0
    limit = 100000
    all_rows: List[Dict] = []
    while True:
        body = {
            "dateRanges": [{"startDate": start_date, "endDate": end_date}],
            "dimensions": [
                {"name": "date"},
                {"name": "sessionCampaignName"},
                {"name": "sessionSource"},
                {"name": "sessionMedium"},
            ],
            "metrics": [
                {"name": "sessions"},
                {"name": "totalUsers"},
                {"name": "keyEvents"},
            ],
            "limit": str(limit),
            "offset": str(offset),
        }
        resp = session.post(url, headers=headers, json=body, timeout=API_TIMEOUT_SEC)
        if resp.status_code >= 400:
            raise RuntimeError(f"GA4 runReport falhou ({resp.status_code}): {resp.text[:400]}")
        payload = resp.json() if resp.content else {}
        rows = payload.get("rows", []) or []
        if not rows:
            break

        for row in rows:
            dims = row.get("dimensionValues", []) or []
            mets = row.get("metricValues", []) or []
            date_ref = _format_ga4_date((dims[0] or {}).get("value") if len(dims) > 0 else "")
            if not date_ref:
                continue
            campaign_name = str((dims[1] or {}).get("value") if len(dims) > 1 else "").strip()
            source = str((dims[2] or {}).get("value") if len(dims) > 2 else "").strip()
            medium = str((dims[3] or {}).get("value") if len(dims) > 3 else "").strip()
            sessions = _to_int((mets[0] or {}).get("value") if len(mets) > 0 else 0, 0)
            total_users = _to_int((mets[1] or {}).get("value") if len(mets) > 1 else 0, 0)
            key_events = _to_int((mets[2] or {}).get("value") if len(mets) > 2 else 0, 0)
            all_rows.append(
                {
                    "date_ref": date_ref,
                    "campaign_name": campaign_name,
                    "source": source,
                    "medium": medium,
                    "sessions": sessions,
                    "total_users": total_users,
                    "leads": key_events,
                    "payload": row,
                }
            )

        if len(rows) < limit:
            break
        offset += limit
    return all_rows


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


def ensure_marketing_funnel_tables(db: "DatabaseManager"):
    conn = db.get_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS marketing_google_accounts (
              id VARCHAR(64) PRIMARY KEY,
              brand_slug VARCHAR(64) NOT NULL,
              ads_customer_id VARCHAR(64),
              ga4_property_id VARCHAR(64),
              is_active INTEGER NOT NULL DEFAULT 1,
              notes TEXT,
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        _ensure_index(db, conn, "marketing_google_accounts", "idx_mkt_google_accounts_brand", "brand_slug")
        _ensure_index(db, conn, "marketing_google_accounts", "idx_mkt_google_accounts_active", "is_active")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS marketing_campaign_mapping (
              id VARCHAR(64) PRIMARY KEY,
              brand_slug VARCHAR(64) NOT NULL,
              campaign_match_type VARCHAR(20) NOT NULL,
              campaign_match_value VARCHAR(255) NOT NULL,
              unit_key VARCHAR(80),
              specialty_key VARCHAR(80),
              channel_key VARCHAR(120),
              priority INTEGER NOT NULL DEFAULT 0,
              is_active INTEGER NOT NULL DEFAULT 1,
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        _ensure_index(db, conn, "marketing_campaign_mapping", "idx_mkt_map_brand_active", "brand_slug, is_active")
        _ensure_index(db, conn, "marketing_campaign_mapping", "idx_mkt_map_priority", "priority")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS marketing_funnel_jobs (
              id VARCHAR(64) PRIMARY KEY,
              status VARCHAR(20) NOT NULL,
              period_ref VARCHAR(7) NOT NULL,
              start_date VARCHAR(10) NOT NULL,
              end_date VARCHAR(10) NOT NULL,
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
        _ensure_index(db, conn, "marketing_funnel_jobs", "idx_mkt_funnel_jobs_status", "status")
        _ensure_index(db, conn, "marketing_funnel_jobs", "idx_mkt_funnel_jobs_created", "created_at")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS marketing_funnel_job_items (
              id VARCHAR(64) PRIMARY KEY,
              job_id VARCHAR(64) NOT NULL,
              brand_slug VARCHAR(64) NOT NULL,
              ads_customer_id VARCHAR(64),
              ga4_property_id VARCHAR(64),
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
        _ensure_index(db, conn, "marketing_funnel_job_items", "idx_mkt_funnel_item_job", "job_id")
        _ensure_index(db, conn, "marketing_funnel_job_items", "idx_mkt_funnel_item_status", "status")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS raw_google_ads_campaign_daily (
              id VARCHAR(64) PRIMARY KEY,
              row_hash VARCHAR(64) NOT NULL,
              sync_job_id VARCHAR(64) NOT NULL,
              date_ref VARCHAR(10) NOT NULL,
              brand_slug VARCHAR(64) NOT NULL,
              ads_customer_id VARCHAR(64) NOT NULL,
              campaign_id VARCHAR(64),
              campaign_name VARCHAR(255),
              impressions INTEGER NOT NULL DEFAULT 0,
              clicks INTEGER NOT NULL DEFAULT 0,
              spend DECIMAL(14,2) NOT NULL DEFAULT 0,
              payload_json TEXT,
              payload_hash VARCHAR(64),
              collected_at VARCHAR(32) NOT NULL,
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        _ensure_unique_index(db, conn, "raw_google_ads_campaign_daily", "ux_raw_ads_row_hash", "row_hash")
        _ensure_index(db, conn, "raw_google_ads_campaign_daily", "idx_raw_ads_date_brand", "date_ref, brand_slug")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS raw_ga4_campaign_daily (
              id VARCHAR(64) PRIMARY KEY,
              row_hash VARCHAR(64) NOT NULL,
              sync_job_id VARCHAR(64) NOT NULL,
              date_ref VARCHAR(10) NOT NULL,
              brand_slug VARCHAR(64) NOT NULL,
              ga4_property_id VARCHAR(64) NOT NULL,
              source VARCHAR(120),
              medium VARCHAR(120),
              campaign_name VARCHAR(255),
              sessions INTEGER NOT NULL DEFAULT 0,
              total_users INTEGER NOT NULL DEFAULT 0,
              leads INTEGER NOT NULL DEFAULT 0,
              payload_json TEXT,
              payload_hash VARCHAR(64),
              collected_at VARCHAR(32) NOT NULL,
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        _ensure_unique_index(db, conn, "raw_ga4_campaign_daily", "ux_raw_ga4_row_hash", "row_hash")
        _ensure_index(db, conn, "raw_ga4_campaign_daily", "idx_raw_ga4_date_brand", "date_ref, brand_slug")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS fact_marketing_funnel_daily (
              id VARCHAR(64) PRIMARY KEY,
              date_ref VARCHAR(10) NOT NULL,
              brand_slug VARCHAR(64) NOT NULL,
              unit_key VARCHAR(80) NOT NULL,
              specialty_key VARCHAR(80) NOT NULL,
              channel_key VARCHAR(120) NOT NULL,
              campaign_key VARCHAR(160) NOT NULL,
              campaign_name VARCHAR(255),
              source VARCHAR(120),
              medium VARCHAR(120),
              attribution_rule VARCHAR(80) NOT NULL,
              spend DECIMAL(14,2) NOT NULL DEFAULT 0,
              impressions INTEGER NOT NULL DEFAULT 0,
              clicks INTEGER NOT NULL DEFAULT 0,
              ctr DECIMAL(10,4) NOT NULL DEFAULT 0,
              cpc DECIMAL(14,4) NOT NULL DEFAULT 0,
              leads INTEGER NOT NULL DEFAULT 0,
              cpl DECIMAL(14,4) NOT NULL DEFAULT 0,
              appointments INTEGER,
              revenue DECIMAL(14,2),
              show_rate DECIMAL(10,4),
              source_last_sync_at VARCHAR(32) NOT NULL,
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        _ensure_unique_index(
            db,
            conn,
            "fact_marketing_funnel_daily",
            "ux_fact_mkt_funnel_key",
            "date_ref, brand_slug, unit_key, specialty_key, channel_key, campaign_key",
        )
        _ensure_index(db, conn, "fact_marketing_funnel_daily", "idx_fact_mkt_date_brand", "date_ref, brand_slug")

        if not db.use_turso:
            conn.commit()
    finally:
        conn.close()


def _query_rows(db: "DatabaseManager", sql: str, params: Tuple = ()) -> List:
    rows = db.execute_query(sql, params)
    return rows or []


def _row_to_dict(row, columns: List[str]) -> Dict:
    out: Dict = {}
    for idx, key in enumerate(columns):
        out[key] = _row_get(row, idx, key)
    return out


def _load_accounts(db: "DatabaseManager", brand: Optional[str], account: Optional[str]) -> List[Dict]:
    sql = """
      SELECT id, brand_slug, ads_customer_id, ga4_property_id
      FROM marketing_google_accounts
      WHERE is_active = 1
    """
    params: List = []
    if str(brand or "").strip():
        sql += " AND LOWER(brand_slug) = LOWER(?)"
        params.append(str(brand).strip())
    if str(account or "").strip():
        sql += " AND REPLACE(ads_customer_id, '-', '') = REPLACE(?, '-', '')"
        params.append(str(account).strip())
    sql += " ORDER BY brand_slug, ads_customer_id"
    rows = _query_rows(db, sql, tuple(params))
    columns = ["id", "brand_slug", "ads_customer_id", "ga4_property_id"]
    return [_row_to_dict(row, columns) for row in rows]


def _load_campaign_mappings(db: "DatabaseManager") -> Dict[str, List[Dict]]:
    rows = _query_rows(
        db,
        """
        SELECT brand_slug, campaign_match_type, campaign_match_value, unit_key, specialty_key, channel_key, priority
        FROM marketing_campaign_mapping
        WHERE is_active = 1
        ORDER BY brand_slug, priority DESC, campaign_match_type, campaign_match_value
        """,
    )
    columns = ["brand_slug", "campaign_match_type", "campaign_match_value", "unit_key", "specialty_key", "channel_key", "priority"]
    grouped: Dict[str, List[Dict]] = {}
    for row in rows:
        rec = _row_to_dict(row, columns)
        slug = str(rec.get("brand_slug") or "").strip().lower()
        if not slug:
            continue
        grouped.setdefault(slug, []).append(rec)
    return grouped


def _match_mapping(brand_slug: str, campaign_name: str, mappings_by_brand: Dict[str, List[Dict]]) -> Dict:
    rules = mappings_by_brand.get(str(brand_slug or "").strip().lower(), [])
    campaign_norm = _normalize_text(campaign_name)
    for rule in rules:
        match_type = str(rule.get("campaign_match_type") or "").strip().lower()
        match_value = str(rule.get("campaign_match_value") or "").strip()
        if not match_type or not match_value:
            continue
        match_norm = _normalize_text(match_value)
        try:
            if match_type == "exact" and campaign_norm == match_norm:
                return rule
            if match_type == "contains" and match_norm in campaign_norm:
                return rule
            if match_type == "regex" and re.search(match_value, campaign_name or "", flags=re.IGNORECASE):
                return rule
        except Exception:
            continue
    return {}


def _merge_ads_ga4_rows(
    brand_slug: str,
    ads_rows: List[Dict],
    ga4_rows: List[Dict],
    mappings_by_brand: Dict[str, List[Dict]],
    sync_ts: str,
) -> List[Dict]:
    merged: Dict[Tuple[str, str], Dict] = {}

    for row in ads_rows:
        date_ref = str(row.get("date_ref") or "").strip()
        campaign_name = str(row.get("campaign_name") or "").strip()
        campaign_key = _normalize_key(campaign_name)
        key = (date_ref, campaign_key)
        item = merged.get(key)
        if not item:
            item = {
                "date_ref": date_ref,
                "brand_slug": brand_slug,
                "campaign_key": campaign_key,
                "campaign_name": campaign_name,
                "source": "",
                "medium": "",
                "spend": Decimal("0"),
                "impressions": 0,
                "clicks": 0,
                "leads": 0,
                "unit_key": "nd",
                "specialty_key": "nd",
                "channel_key": "unknown",
                "attribution_rule": ATTRIBUTION_RULE,
                "source_last_sync_at": sync_ts,
            }
            merged[key] = item
        item["spend"] += _to_decimal(row.get("spend"), "0")
        item["impressions"] += _to_int(row.get("impressions"), 0)
        item["clicks"] += _to_int(row.get("clicks"), 0)
        if not item["campaign_name"] and campaign_name:
            item["campaign_name"] = campaign_name

    for row in ga4_rows:
        date_ref = str(row.get("date_ref") or "").strip()
        campaign_name = str(row.get("campaign_name") or "").strip()
        campaign_key = _normalize_key(campaign_name)
        key = (date_ref, campaign_key)
        item = merged.get(key)
        if not item:
            item = {
                "date_ref": date_ref,
                "brand_slug": brand_slug,
                "campaign_key": campaign_key,
                "campaign_name": campaign_name,
                "source": "",
                "medium": "",
                "spend": Decimal("0"),
                "impressions": 0,
                "clicks": 0,
                "leads": 0,
                "unit_key": "nd",
                "specialty_key": "nd",
                "channel_key": "unknown",
                "attribution_rule": ATTRIBUTION_RULE,
                "source_last_sync_at": sync_ts,
            }
            merged[key] = item
        item["leads"] += _to_int(row.get("leads"), 0)
        source = str(row.get("source") or "").strip()
        medium = str(row.get("medium") or "").strip()
        if source and not item.get("source"):
            item["source"] = source
        if medium and not item.get("medium"):
            item["medium"] = medium
        if not item["campaign_name"] and campaign_name:
            item["campaign_name"] = campaign_name

    output: List[Dict] = []
    for item in merged.values():
        mapping = _match_mapping(brand_slug, item.get("campaign_name") or "", mappings_by_brand)
        unit_key = str(mapping.get("unit_key") or "").strip()
        specialty_key = str(mapping.get("specialty_key") or "").strip()
        channel_key = str(mapping.get("channel_key") or "").strip()
        if not channel_key:
            source = str(item.get("source") or "").strip()
            medium = str(item.get("medium") or "").strip()
            channel_key = _normalize_key(f"{source}/{medium}") if (source or medium) else "unknown"

        impressions = int(item["impressions"])
        clicks = int(item["clicks"])
        leads = int(item["leads"])
        spend = _to_decimal(item["spend"], "0")
        ctr = Decimal("0")
        cpc = Decimal("0")
        cpl = Decimal("0")
        if impressions > 0:
            ctr = (Decimal(clicks) / Decimal(impressions)) * Decimal("100")
        if clicks > 0:
            cpc = spend / Decimal(clicks)
        if leads > 0:
            cpl = spend / Decimal(leads)

        output.append(
            {
                "date_ref": item["date_ref"],
                "brand_slug": brand_slug,
                "unit_key": unit_key or "nd",
                "specialty_key": specialty_key or "nd",
                "channel_key": channel_key or "unknown",
                "campaign_key": item["campaign_key"] or "unknown",
                "campaign_name": item.get("campaign_name") or "",
                "source": item.get("source") or "",
                "medium": item.get("medium") or "",
                "attribution_rule": ATTRIBUTION_RULE,
                "spend": spend,
                "impressions": impressions,
                "clicks": clicks,
                "ctr": ctr,
                "cpc": cpc,
                "leads": leads,
                "cpl": cpl,
                "source_last_sync_at": item["source_last_sync_at"],
            }
        )

    return output


def _execute_batch(db: "DatabaseManager", sql: str, params_rows: List[Tuple]) -> int:
    if not params_rows:
        return 0
    conn = db.get_connection()
    total = 0
    try:
        for chunk in _chunked(params_rows, DB_BATCH_SIZE):
            if hasattr(conn, "executemany"):
                conn.executemany(sql, chunk)
            else:
                for params in chunk:
                    conn.execute(sql, params)
            total += len(chunk)
        if not db.use_turso:
            conn.commit()
        return total
    finally:
        conn.close()


def _persist_raw_ads(db: "DatabaseManager", sync_job_id: str, brand_slug: str, ads_customer_id: str, rows: List[Dict]) -> int:
    if not rows:
        return 0
    now_ts = _now_ts()
    params_rows: List[Tuple] = []
    for row in rows:
        row_hash = _stable_hash(
            "ads",
            brand_slug,
            ads_customer_id,
            row.get("date_ref"),
            row.get("campaign_id"),
            row.get("campaign_name"),
            row.get("impressions"),
            row.get("clicks"),
            _to_float2(_to_decimal(row.get("spend"), "0")),
        )
        payload_json = _json_dump(row.get("payload") or {})
        payload_hash = _stable_hash(payload_json)
        params_rows.append(
            (
                uuid.uuid4().hex,
                row_hash,
                sync_job_id,
                row.get("date_ref"),
                brand_slug,
                ads_customer_id,
                row.get("campaign_id"),
                row.get("campaign_name"),
                int(row.get("impressions") or 0),
                int(row.get("clicks") or 0),
                _to_float2(_to_decimal(row.get("spend"), "0")),
                payload_json,
                payload_hash,
                now_ts,
                now_ts,
            )
        )
    return _execute_batch(
        db,
        """
        INSERT INTO raw_google_ads_campaign_daily (
          id, row_hash, sync_job_id, date_ref, brand_slug, ads_customer_id, campaign_id, campaign_name,
          impressions, clicks, spend, payload_json, payload_hash, collected_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(row_hash) DO UPDATE SET
          sync_job_id = excluded.sync_job_id,
          impressions = excluded.impressions,
          clicks = excluded.clicks,
          spend = excluded.spend,
          payload_json = excluded.payload_json,
          payload_hash = excluded.payload_hash,
          updated_at = excluded.updated_at
        """,
        params_rows,
    )


def _persist_raw_ga4(db: "DatabaseManager", sync_job_id: str, brand_slug: str, ga4_property_id: str, rows: List[Dict]) -> int:
    if not rows:
        return 0
    now_ts = _now_ts()
    params_rows: List[Tuple] = []
    for row in rows:
        row_hash = _stable_hash(
            "ga4",
            brand_slug,
            ga4_property_id,
            row.get("date_ref"),
            row.get("source"),
            row.get("medium"),
            row.get("campaign_name"),
            row.get("sessions"),
            row.get("leads"),
        )
        payload_json = _json_dump(row.get("payload") or {})
        payload_hash = _stable_hash(payload_json)
        params_rows.append(
            (
                uuid.uuid4().hex,
                row_hash,
                sync_job_id,
                row.get("date_ref"),
                brand_slug,
                ga4_property_id,
                row.get("source"),
                row.get("medium"),
                row.get("campaign_name"),
                int(row.get("sessions") or 0),
                int(row.get("total_users") or 0),
                int(row.get("leads") or 0),
                payload_json,
                payload_hash,
                now_ts,
                now_ts,
            )
        )
    return _execute_batch(
        db,
        """
        INSERT INTO raw_ga4_campaign_daily (
          id, row_hash, sync_job_id, date_ref, brand_slug, ga4_property_id, source, medium, campaign_name,
          sessions, total_users, leads, payload_json, payload_hash, collected_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(row_hash) DO UPDATE SET
          sync_job_id = excluded.sync_job_id,
          sessions = excluded.sessions,
          total_users = excluded.total_users,
          leads = excluded.leads,
          payload_json = excluded.payload_json,
          payload_hash = excluded.payload_hash,
          updated_at = excluded.updated_at
        """,
        params_rows,
    )


def _persist_fact_rows(db: "DatabaseManager", rows: List[Dict]) -> int:
    if not rows:
        return 0
    now_ts = _now_ts()
    params_rows: List[Tuple] = []
    for row in rows:
        pk_hash = _stable_hash(
            row.get("date_ref"),
            row.get("brand_slug"),
            row.get("unit_key"),
            row.get("specialty_key"),
            row.get("channel_key"),
            row.get("campaign_key"),
        )
        params_rows.append(
            (
                pk_hash,
                row.get("date_ref"),
                row.get("brand_slug"),
                row.get("unit_key"),
                row.get("specialty_key"),
                row.get("channel_key"),
                row.get("campaign_key"),
                row.get("campaign_name"),
                row.get("source"),
                row.get("medium"),
                row.get("attribution_rule"),
                _to_float2(_to_decimal(row.get("spend"), "0")),
                int(row.get("impressions") or 0),
                int(row.get("clicks") or 0),
                float(_to_decimal(row.get("ctr"), "0")),
                float(_to_decimal(row.get("cpc"), "0")),
                int(row.get("leads") or 0),
                float(_to_decimal(row.get("cpl"), "0")),
                row.get("source_last_sync_at") or now_ts,
                now_ts,
            )
        )
    return _execute_batch(
        db,
        """
        INSERT INTO fact_marketing_funnel_daily (
          id, date_ref, brand_slug, unit_key, specialty_key, channel_key, campaign_key, campaign_name,
          source, medium, attribution_rule, spend, impressions, clicks, ctr, cpc, leads, cpl,
          appointments, revenue, show_rate, source_last_sync_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
        ON CONFLICT(date_ref, brand_slug, unit_key, specialty_key, channel_key, campaign_key) DO UPDATE SET
          campaign_name = excluded.campaign_name,
          source = excluded.source,
          medium = excluded.medium,
          attribution_rule = excluded.attribution_rule,
          spend = excluded.spend,
          impressions = excluded.impressions,
          clicks = excluded.clicks,
          ctr = excluded.ctr,
          cpc = excluded.cpc,
          leads = excluded.leads,
          cpl = excluded.cpl,
          source_last_sync_at = excluded.source_last_sync_at,
          updated_at = excluded.updated_at
        """,
        params_rows,
    )


def _make_scope_json(brand: Optional[str], account: Optional[str]) -> str:
    scope = {"brand": str(brand or "").strip() or None, "account": str(account or "").strip() or None}
    return _json_dump(scope)


def enqueue_marketing_funnel_job(
    db: "DatabaseManager",
    period_ref: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    brand: Optional[str] = None,
    account: Optional[str] = None,
    requested_by: str = "manual",
    initial_status: str = STATUS_PENDING,
) -> Dict:
    ref, start_iso, end_iso = _resolve_period_range(period_ref, start_date, end_date)
    now_ts = _now_ts()
    job_id = uuid.uuid4().hex
    db.execute_query(
        """
        INSERT INTO marketing_funnel_jobs (
          id, status, period_ref, start_date, end_date, scope_json, requested_by,
          error_message, created_at, started_at, finished_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, ?)
        """,
        (
            job_id,
            initial_status,
            ref,
            start_iso,
            end_iso,
            _make_scope_json(brand, account),
            str(requested_by or "manual"),
            now_ts,
            now_ts,
        ),
    )
    print(
        f"Job marketing funnel criado | id={job_id} periodo={ref} "
        f"range={start_iso}..{end_iso} scope={{brand={brand or 'all'},account={account or 'all'}}}"
    )
    return {
        "id": job_id,
        "status": initial_status,
        "period_ref": ref,
        "start_date": start_iso,
        "end_date": end_iso,
        "scope_json": _make_scope_json(brand, account),
        "requested_by": requested_by,
    }


def _get_pending_job(db: "DatabaseManager") -> Optional[Dict]:
    rows = _query_rows(
        db,
        """
        SELECT id, status, period_ref, start_date, end_date, scope_json, requested_by
        FROM marketing_funnel_jobs
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
        "period_ref": _row_get(row, 2, "period_ref"),
        "start_date": _row_get(row, 3, "start_date"),
        "end_date": _row_get(row, 4, "end_date"),
        "scope_json": _row_get(row, 5, "scope_json"),
        "requested_by": _row_get(row, 6, "requested_by"),
    }


def _update_job_status(db: "DatabaseManager", job_id: str, status: str, error_message: Optional[str] = None):
    now_ts = _now_ts()
    if status == STATUS_RUNNING:
        db.execute_query(
            """
            UPDATE marketing_funnel_jobs
            SET status = ?, started_at = ?, updated_at = ?, error_message = NULL
            WHERE id = ?
            """,
            (status, now_ts, now_ts, job_id),
        )
        return

    finished_at = now_ts if status in (STATUS_COMPLETED, STATUS_FAILED, STATUS_PARTIAL) else None
    db.execute_query(
        """
        UPDATE marketing_funnel_jobs
        SET status = ?, finished_at = ?, updated_at = ?, error_message = ?
        WHERE id = ?
        """,
        (status, finished_at, now_ts, str(error_message or "") if error_message else None, job_id),
    )


def _insert_job_item(
    db: "DatabaseManager",
    job_id: str,
    brand_slug: str,
    ads_customer_id: str,
    ga4_property_id: str,
    status: str,
    records_read: int,
    records_written: int,
    error_message: Optional[str],
    duration_ms: int,
):
    now_ts = _now_ts()
    db.execute_query(
        """
        INSERT INTO marketing_funnel_job_items (
          id, job_id, brand_slug, ads_customer_id, ga4_property_id, status,
          records_read, records_written, error_message, duration_ms, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            uuid.uuid4().hex,
            job_id,
            brand_slug,
            ads_customer_id,
            ga4_property_id,
            status,
            int(records_read or 0),
            int(records_written or 0),
            str(error_message or "") if error_message else None,
            int(duration_ms or 0),
            now_ts,
            now_ts,
        ),
    )


def _heartbeat(db: "DatabaseManager", status: str, details: str):
    try:
        db.update_heartbeat(SERVICE_NAME, status, details[:3500])
    except Exception:
        pass


def _parse_scope(scope_json: str) -> Tuple[Optional[str], Optional[str]]:
    raw = str(scope_json or "").strip()
    if not raw:
        return None, None
    try:
        data = json.loads(raw)
    except Exception:
        return None, None
    brand = str(data.get("brand") or "").strip() or None
    account = str(data.get("account") or "").strip() or None
    return brand, account


def _run_job(db: "DatabaseManager", job: Dict) -> Dict:
    job_id = str(job.get("id") or "").strip()
    period_ref = str(job.get("period_ref") or "").strip()
    start_date = str(job.get("start_date") or "").strip()
    end_date = str(job.get("end_date") or "").strip()
    brand_scope, account_scope = _parse_scope(str(job.get("scope_json") or ""))
    _update_job_status(db, job_id, STATUS_RUNNING)
    _heartbeat(db, STATUS_RUNNING, f"job={job_id} periodo={period_ref} carregando contas")

    accounts = _load_accounts(db, brand_scope, account_scope)
    if not accounts:
        msg = "Nenhuma conta ativa em marketing_google_accounts para o escopo solicitado."
        _update_job_status(db, job_id, STATUS_FAILED, msg)
        _heartbeat(db, STATUS_FAILED, f"job={job_id} {msg}")
        return {"status": STATUS_FAILED, "error": msg, "items": 0}

    mappings = _load_campaign_mappings(db)
    session = _make_http_session()
    access_token = _get_google_access_token(session)
    sync_ts = _now_ts()

    ok_count = 0
    err_count = 0
    skipped_count = 0
    total_read = 0
    total_written = 0

    for idx, account in enumerate(accounts, start=1):
        t0 = time.time()
        brand_slug = str(account.get("brand_slug") or "").strip().lower()
        ads_customer_id = str(account.get("ads_customer_id") or "").strip()
        ga4_property_id = str(account.get("ga4_property_id") or "").strip()

        if not ads_customer_id and not ga4_property_id:
            _insert_job_item(
                db,
                job_id,
                brand_slug,
                ads_customer_id,
                ga4_property_id,
                ITEM_SKIPPED,
                0,
                0,
                "Conta sem ads_customer_id e ga4_property_id.",
                int((time.time() - t0) * 1000),
            )
            skipped_count += 1
            continue

        _heartbeat(
            db,
            STATUS_RUNNING,
            f"job={job_id} conta={idx}/{len(accounts)} brand={brand_slug} ads={ads_customer_id or '-'} ga4={ga4_property_id or '-'}",
        )
        try:
            ads_rows: List[Dict] = []
            ga4_rows: List[Dict] = []

            if ads_customer_id:
                ads_rows = _fetch_google_ads_rows(session, access_token, ads_customer_id, start_date, end_date)
                _heartbeat(
                    db,
                    STATUS_RUNNING,
                    f"job={job_id} brand={brand_slug} ads fetched={len(ads_rows)} persistindo raw ads",
                )
                raw_ads_written = _persist_raw_ads(db, job_id, brand_slug, ads_customer_id, ads_rows)
                print(f"[{idx}/{len(accounts)}] marketing_funnel {brand_slug} raw_ads={raw_ads_written}")
            if ga4_property_id:
                ga4_rows = _fetch_ga4_rows(session, access_token, ga4_property_id, start_date, end_date)
                _heartbeat(
                    db,
                    STATUS_RUNNING,
                    f"job={job_id} brand={brand_slug} ga4 fetched={len(ga4_rows)} persistindo raw ga4",
                )
                raw_ga4_written = _persist_raw_ga4(db, job_id, brand_slug, ga4_property_id, ga4_rows)
                print(f"[{idx}/{len(accounts)}] marketing_funnel {brand_slug} raw_ga4={raw_ga4_written}")

            merged_rows = _merge_ads_ga4_rows(brand_slug, ads_rows, ga4_rows, mappings, sync_ts)
            _heartbeat(
                db,
                STATUS_RUNNING,
                f"job={job_id} brand={brand_slug} fact_rows={len(merged_rows)} persistindo fato",
            )
            fact_written = _persist_fact_rows(db, merged_rows)
            print(f"[{idx}/{len(accounts)}] marketing_funnel {brand_slug} fact_rows={fact_written}")

            read_count = len(ads_rows) + len(ga4_rows)
            write_count = fact_written
            total_read += read_count
            total_written += write_count

            _insert_job_item(
                db,
                job_id,
                brand_slug,
                ads_customer_id,
                ga4_property_id,
                ITEM_SUCCESS,
                read_count,
                write_count,
                None,
                int((time.time() - t0) * 1000),
            )
            ok_count += 1
            print(
                f"[{idx}/{len(accounts)}] OK marketing_funnel {brand_slug} "
                f"ads_rows={len(ads_rows)} ga4_rows={len(ga4_rows)} fact_upsert={write_count}"
            )
        except Exception as exc:
            err_count += 1
            msg = str(exc)[:1000]
            _insert_job_item(
                db,
                job_id,
                brand_slug,
                ads_customer_id,
                ga4_property_id,
                ITEM_ERROR,
                0,
                0,
                msg,
                int((time.time() - t0) * 1000),
            )
            print(f"[{idx}/{len(accounts)}] ERRO marketing_funnel {brand_slug}: {msg}")

    if err_count == 0:
        final_status = STATUS_COMPLETED
        final_error = None
    elif ok_count > 0 or skipped_count > 0:
        final_status = STATUS_PARTIAL
        final_error = f"partial: ok={ok_count} skip={skipped_count} erro={err_count}"
    else:
        final_status = STATUS_FAILED
        final_error = f"failed: erro={err_count}"

    _update_job_status(db, job_id, final_status, final_error)
    _heartbeat(
        db,
        final_status if final_status != STATUS_PARTIAL else "WARNING",
        f"job={job_id} done status={final_status} ok={ok_count} skip={skipped_count} erro={err_count} "
        f"read={total_read} written={total_written}",
    )
    return {
        "status": final_status,
        "ok": ok_count,
        "skip": skipped_count,
        "error": err_count,
        "read": total_read,
        "written": total_written,
    }


def process_pending_marketing_funnel_jobs_once(
    auto_enqueue_if_empty: bool = False,
    requested_by: str = "system_status",
    period_ref: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    brand: Optional[str] = None,
    account: Optional[str] = None,
) -> bool:
    if not DatabaseManager:
        raise RuntimeError("DatabaseManager indisponivel.")
    db = DatabaseManager()
    ensure_marketing_funnel_tables(db)

    pending = _get_pending_job(db)
    if not pending and auto_enqueue_if_empty:
        pending = enqueue_marketing_funnel_job(
            db=db,
            period_ref=period_ref,
            start_date=start_date,
            end_date=end_date,
            brand=brand,
            account=account,
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
        _update_job_status(db, str(pending.get("id")), STATUS_FAILED, msg)
        _heartbeat(db, STATUS_FAILED, f"job={pending.get('id')} erro={msg}")
        return True


def _connection_smoke_test(
    period_ref: Optional[str],
    start_date: Optional[str],
    end_date: Optional[str],
    brand: Optional[str],
    account: Optional[str],
):
    if not DatabaseManager:
        raise RuntimeError("DatabaseManager indisponivel.")

    db = DatabaseManager()
    ensure_marketing_funnel_tables(db)
    _, start_iso, end_iso = _resolve_period_range(period_ref, start_date, end_date)
    accounts = _load_accounts(db, brand, account)
    if not accounts:
        raise RuntimeError("Nenhuma conta ativa em marketing_google_accounts para testar.")

    sample_start = start_iso
    sample_end = min(end_iso, (date.today() - timedelta(days=1)).strftime("%Y-%m-%d"))
    if sample_end < sample_start:
        sample_end = sample_start

    session = _make_http_session()
    access_token = _get_google_access_token(session)
    print(f"OAuth OK. Testando {len(accounts)} conta(s) no range {sample_start}..{sample_end}.")

    for idx, acc in enumerate(accounts, start=1):
        brand_slug = str(acc.get("brand_slug") or "").strip()
        ads_customer_id = str(acc.get("ads_customer_id") or "").strip()
        ga4_property_id = str(acc.get("ga4_property_id") or "").strip()
        print(f"[{idx}/{len(accounts)}] {brand_slug} ads={ads_customer_id or '-'} ga4={ga4_property_id or '-'}")
        if ads_customer_id:
            ads_rows = _fetch_google_ads_rows(session, access_token, ads_customer_id, sample_start, sample_end)
            print(f"  - Ads OK rows={len(ads_rows)}")
        if ga4_property_id:
            ga4_rows = _fetch_ga4_rows(session, access_token, ga4_property_id, sample_start, sample_end)
            print(f"  - GA4 OK rows={len(ga4_rows)}")


def run_loop_forever():
    if not DatabaseManager:
        raise RuntimeError("DatabaseManager indisponivel.")
    db = DatabaseManager()
    ensure_marketing_funnel_tables(db)
    _heartbeat(db, STATUS_COMPLETED, "Worker marketing funnel iniciado")
    while True:
        try:
            had = process_pending_marketing_funnel_jobs_once(auto_enqueue_if_empty=False, requested_by="orchestrator")
            if not had:
                time.sleep(POLL_SEC)
        except Exception as exc:
            _heartbeat(db, STATUS_FAILED, f"Loop error: {exc}")
            time.sleep(POLL_SEC)


def main():
    parser = argparse.ArgumentParser(description="Worker Marketing Funnel (Google Ads + GA4)")
    parser.add_argument("--once", action="store_true", help="Processa um ciclo unico (job pendente).")
    parser.add_argument("--enqueue", action="store_true", help="Apenas enfileira um job PENDING e sai.")
    parser.add_argument("--period", type=str, default="", help="Periodo no formato YYYY-MM.")
    parser.add_argument("--start", type=str, default="", help="Data inicial (YYYY-MM-DD ou DD/MM/YYYY).")
    parser.add_argument("--end", type=str, default="", help="Data final (YYYY-MM-DD ou DD/MM/YYYY).")
    parser.add_argument("--brand", type=str, default="", help="Filtro de marca (brand_slug).")
    parser.add_argument("--account", type=str, default="", help="Filtro de conta Ads (customer_id).")
    parser.add_argument("--requested-by", type=str, default="manual_cli", help="Identificador do solicitante.")
    parser.add_argument("--test-connections", action="store_true", help="Testa OAuth/Ads/GA4 sem persistir fatos.")
    parser.add_argument("--ensure-only", action="store_true", help="Cria/valida schema e encerra.")
    args = parser.parse_args()

    if not DatabaseManager:
        raise RuntimeError("DatabaseManager indisponivel.")

    db = DatabaseManager()
    ensure_marketing_funnel_tables(db)

    period_ref = str(args.period or "").strip() or None
    start_date = str(args.start or "").strip() or None
    end_date = str(args.end or "").strip() or None
    brand = str(args.brand or "").strip() or None
    account = str(args.account or "").strip() or None
    requested_by = str(args.requested_by or "manual_cli").strip()

    if args.ensure_only:
        _heartbeat(db, STATUS_COMPLETED, "Schema marketing funnel validado")
        print("Schema marketing funnel validado.")
        return

    if args.test_connections:
        _connection_smoke_test(period_ref, start_date, end_date, brand, account)
        _heartbeat(db, STATUS_COMPLETED, "Teste de conexao Google Ads/GA4 concluido")
        return

    if args.enqueue:
        enqueue_marketing_funnel_job(
            db=db,
            period_ref=period_ref,
            start_date=start_date,
            end_date=end_date,
            brand=brand,
            account=account,
            requested_by=requested_by,
            initial_status=STATUS_PENDING,
        )
        _heartbeat(db, STATUS_PENDING, "Job enfileirado via CLI")
        return

    if args.once:
        processed = process_pending_marketing_funnel_jobs_once(
            auto_enqueue_if_empty=True,
            requested_by=requested_by,
            period_ref=period_ref,
            start_date=start_date,
            end_date=end_date,
            brand=brand,
            account=account,
        )
        if not processed:
            print("Sem jobs pendentes.")
        return

    run_loop_forever()


if __name__ == "__main__":
    main()
