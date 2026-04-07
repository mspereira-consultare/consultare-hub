import argparse
import calendar
import csv
import hashlib
import json
import os
import re
import sys
import time
import unicodedata
import uuid
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Dict, List, Optional, Tuple

from bs4 import BeautifulSoup
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database_manager import DatabaseManager
    from feegow_web_auth import APP4_BASE_URL, login_feegow_app4, switch_feegow_unit
except ImportError:
    DatabaseManager = None
    from .feegow_web_auth import APP4_BASE_URL, login_feegow_app4, switch_feegow_unit


BASE_URL = APP4_BASE_URL
LOGIN_URL = f"{BASE_URL}/main/?P=Login"
CHANGE_UNIT_URL = f"{BASE_URL}/v8.1/?P=MudaLocal&Pers=1&MudaLocal=0"
CONSOLIDACAO_URL = f"{BASE_URL}/v8.1/?P=RepassesAConferir&Pers=1"

DEFAULT_UNITS = ["|12|", "|2|", "|3|"]
DEFAULT_RETRY_ATTEMPTS = 2
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "_debug_consolidacao")

SERVICE_NAME = "repasse_consolidacao"

STATUS_PENDING = "PENDING"
STATUS_RUNNING = "RUNNING"
STATUS_COMPLETED = "COMPLETED"
STATUS_FAILED = "FAILED"
STATUS_PARTIAL = "PARTIAL"

ITEM_SUCCESS = "SUCCESS"
ITEM_NO_DATA = "NO_DATA"
ITEM_SKIPPED_NOT_IN_FILTER = "SKIPPED_NOT_IN_FILTER"
ITEM_SKIPPED_AMBIGUOUS_NAME = "SKIPPED_AMBIGUOUS_NAME"
ITEM_ERROR = "ERROR"


def _enable_readonly_safety(page):
    """
    Hard-lock de segurança: impede qualquer ação de consolidar/desconsolidar/marcar.
    O worker deve atuar apenas em modo leitura (filtro + buscar + parse).
    """
    page.evaluate(
        """
        () => {
          const DANGEROUS_RE = /(desconsolidar|\\bconsolidar\\b|marcar\\s+pagos|marcar\\s+nao\\s+pagos|marcar\\s+não\\s+pagos|marcar\\s+consolidados)/i;
          const SAFE_RE = /\\bbuscar\\b/i;

          const textOf = (el) => {
            if (!el || !(el instanceof Element)) return '';
            const chunks = [
              el.textContent || '',
              el.getAttribute('title') || '',
              el.getAttribute('aria-label') || '',
              el.getAttribute('value') || '',
              (el instanceof HTMLInputElement) ? (el.value || '') : '',
            ];
            return chunks.join(' ').replace(/\\s+/g, ' ').trim();
          };

          const isDangerous = (el) => {
            const txt = textOf(el);
            if (!txt) return false;
            if (SAFE_RE.test(txt)) return false;
            return DANGEROUS_RE.test(txt);
          };

          const disableDangerousElements = () => {
            const list = Array.from(document.querySelectorAll('button, a, input[type=\"button\"], input[type=\"submit\"], label'));
            for (const el of list) {
              if (!isDangerous(el)) continue;
              try {
                if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) {
                  el.disabled = true;
                }
                el.setAttribute('data-readonly-blocked', '1');
                el.style.pointerEvents = 'none';
                el.style.opacity = '0.45';
              } catch (_) {}
            }
          };

          disableDangerousElements();

          if (!window.__repasseReadOnlySafetyBound) {
            window.__repasseReadOnlySafetyBound = true;
            document.addEventListener('click', (ev) => {
              const path = (ev.composedPath && ev.composedPath()) || [];
              for (const node of path) {
                if (!(node instanceof Element)) continue;
                if (isDangerous(node)) {
                  ev.preventDefault();
                  ev.stopPropagation();
                  ev.stopImmediatePropagation();
                  return false;
                }
              }
              return true;
            }, true);
          }
        }
        """
    )


def _now_ts() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _run_id() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S") + "_" + uuid.uuid4().hex[:8]


def _clean_ws(value) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _normalize_text(value: str) -> str:
    raw = _clean_ws(value).upper()
    raw = unicodedata.normalize("NFD", raw)
    raw = "".join(ch for ch in raw if unicodedata.category(ch) != "Mn")
    return raw


def _parse_decimal_br(value: str) -> Decimal:
    raw = _clean_ws(value)
    if not raw:
        return Decimal("0")
    neg = "-" in raw or "(" in raw
    clean = raw.replace("R$", "").replace(".", "").replace(" ", "")
    clean = re.sub(r"[^\d,]", "", clean)
    if not clean:
        return Decimal("0")
    try:
        val = Decimal(clean.replace(",", "."))
    except InvalidOperation:
        val = Decimal("0")
    if neg:
        val = -val
    return val


def _to_float_2(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.01")))


def _extract_feegow_id(text: str) -> Optional[str]:
    raw = _clean_ws(text)
    if not raw:
        return None
    match = re.search(r"\((\d+)\)", raw)
    if match:
        return match.group(1)
    return None


def _extract_feegow_id_from_internal_id(internal_id: str) -> Optional[str]:
    raw = _clean_ws(internal_id)
    match = re.match(r"^feegow:(\d+)$", raw, flags=re.IGNORECASE)
    if match:
        return match.group(1)
    only_digits = re.sub(r"\D", "", raw)
    return only_digits if only_digits else None


def _period_default_previous_month() -> str:
    now = datetime.now()
    month = now.month - 1
    year = now.year
    if month <= 0:
        month = 12
        year -= 1
    return f"{year:04d}-{month:02d}"


def _period_to_dates(period_ref: str) -> Tuple[str, str]:
    m = re.match(r"^(\d{4})-(\d{2})$", _clean_ws(period_ref))
    if not m:
        raise RuntimeError("periodo invalido. Use YYYY-MM.")
    year = int(m.group(1))
    month = int(m.group(2))
    last_day = calendar.monthrange(year, month)[1]
    return f"01/{month:02d}/{year:04d}", f"{last_day:02d}/{month:02d}/{year:04d}"


def _parse_period_args(period: str, start: str, end: str) -> Tuple[str, str, str]:
    if _clean_ws(start) and _clean_ws(end):
        period_ref = f"{start[6:10]}-{start[3:5]}"
        return period_ref, _clean_ws(start), _clean_ws(end)

    ref = _clean_ws(period) or _period_default_previous_month()
    date_from, date_to = _period_to_dates(ref)
    return ref, date_from, date_to


def _make_output_paths(run_id: str) -> Dict[str, str]:
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    base = os.path.join(OUTPUT_DIR, f"consolidacao_{run_id}")
    return {
        "summary": f"{base}_summary.json",
        "rows_jsonl": f"{base}_rows.jsonl",
        "rows_csv": f"{base}_rows.csv",
        "errors_jsonl": f"{base}_errors.jsonl",
    }


def _dump_page(page, run_id: str, stage: str, debug: bool):
    if not debug:
        return
    safe_stage = re.sub(r"[^a-zA-Z0-9_-]+", "_", stage)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    base = os.path.join(OUTPUT_DIR, f"consolidacao_{run_id}_{stamp}_{safe_stage}")
    try:
        with open(base + ".html", "w", encoding="utf-8") as f:
            f.write(page.content())
        page.screenshot(path=base + ".png", full_page=True)
    except Exception as exc:
        print(f"[DEBUG] falha ao salvar dump ({stage}): {exc}")


def _row_value(row, index: int, key: str):
    if isinstance(row, (tuple, list)):
        if 0 <= index < len(row):
            return row[index]
        return None
    if isinstance(row, dict):
        return row.get(key)
    if hasattr(row, key):
        return getattr(row, key)
    try:
        return row[key]
    except Exception:
        return None


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


def _normalize_period_ref(period_ref: Optional[str]) -> str:
    raw = _clean_ws(period_ref)
    if not raw:
        return _period_default_previous_month()
    if not re.match(r"^\d{4}-\d{2}$", raw):
        raise RuntimeError("periodo invalido. Use YYYY-MM.")
    year = int(raw[:4])
    month = int(raw[5:7])
    if month < 1 or month > 12:
        raise RuntimeError("periodo invalido. Mes deve estar entre 01 e 12.")
    return f"{year:04d}-{month:02d}"


def _parse_professional_ids_json(raw_value) -> List[str]:
    raw = _clean_ws(raw_value)
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    out: List[str] = []
    seen = set()
    for item in parsed:
        val = _clean_ws(item)
        if not val or val in seen:
            continue
        seen.add(val)
        out.append(val)
    return out


def _ensure_consolidacao_tables(db: "DatabaseManager"):
    def _ensure_index(conn, table_name: str, index_name: str, columns_sql: str):
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
            cnt = 0
            if rows:
                row = rows[0]
                cnt = int(_row_value(row, 0, "COUNT(1)") or _row_value(row, 0, "count(1)") or 0)
            if cnt == 0:
                conn.execute(f"CREATE INDEX {index_name} ON {table_name} ({columns_sql})")
            return
        conn.execute(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} ({columns_sql})")

    conn = db.get_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS feegow_repasse_a_conferir (
              id VARCHAR(64) PRIMARY KEY,
              period_ref VARCHAR(7) NOT NULL,
              professional_id VARCHAR(64) NOT NULL,
              professional_name VARCHAR(180) NOT NULL,
              invoice_id VARCHAR(64),
              execution_date VARCHAR(32),
              patient_name VARCHAR(180),
              unit_name VARCHAR(120),
              account_date VARCHAR(32),
              requester_name VARCHAR(180),
              specialty_name VARCHAR(180),
              procedure_name VARCHAR(255),
              attendance_value DECIMAL(14,2) NOT NULL,
              detail_status VARCHAR(32),
              detail_status_text VARCHAR(255),
              role_code VARCHAR(32),
              role_name VARCHAR(120),
              detail_professional_name VARCHAR(180),
              detail_repasse_value DECIMAL(14,2) NOT NULL,
              executante_option_value VARCHAR(64),
              executante_option_title VARCHAR(255),
              source_row_hash VARCHAR(64) NOT NULL UNIQUE,
              is_active INTEGER NOT NULL,
              last_job_id VARCHAR(64),
              created_at VARCHAR(32) NOT NULL,
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        _ensure_index(
            conn,
            "feegow_repasse_a_conferir",
            "idx_repasse_conferir_period_prof",
            "period_ref, professional_id",
        )
        _ensure_index(
            conn,
            "feegow_repasse_a_conferir",
            "idx_repasse_conferir_exec_date",
            "execution_date",
        )
        _ensure_index(
            conn,
            "feegow_repasse_a_conferir",
            "idx_repasse_conferir_detail_status",
            "detail_status",
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS repasse_consolidacao_jobs (
              id VARCHAR(64) PRIMARY KEY,
              period_ref VARCHAR(7) NOT NULL,
              scope VARCHAR(20) NOT NULL,
              professional_ids_json TEXT,
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
        _ensure_index(conn, "repasse_consolidacao_jobs", "idx_repasse_consol_jobs_period", "period_ref")
        _ensure_index(conn, "repasse_consolidacao_jobs", "idx_repasse_consol_jobs_status", "status")
        _ensure_index(conn, "repasse_consolidacao_jobs", "idx_repasse_consol_jobs_created", "created_at")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS repasse_consolidacao_job_items (
              id VARCHAR(64) PRIMARY KEY,
              job_id VARCHAR(64) NOT NULL,
              professional_id VARCHAR(64) NOT NULL,
              professional_name VARCHAR(180) NOT NULL,
              status VARCHAR(40) NOT NULL,
              rows_count INTEGER NOT NULL,
              total_value DECIMAL(14,2) NOT NULL,
              error_message TEXT,
              duration_ms INTEGER,
              created_at VARCHAR(32) NOT NULL,
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        _ensure_index(conn, "repasse_consolidacao_job_items", "idx_repasse_consol_items_job", "job_id")
        _ensure_index(
            conn,
            "repasse_consolidacao_job_items",
            "idx_repasse_consol_items_prof",
            "professional_id",
        )
        _ensure_index(
            conn,
            "repasse_consolidacao_job_items",
            "idx_repasse_consol_items_status",
            "status",
        )

        if not db.use_turso:
            conn.commit()
    finally:
        conn.close()


def _list_active_professionals(db: "DatabaseManager", filter_ids: List[str]) -> List[Dict[str, str]]:
    all_rows = db.execute_query(
        """
        SELECT id, name
        FROM professionals
        WHERE is_active = 1
        ORDER BY name ASC
        """
    ) or []

    allow = set(x.strip() for x in filter_ids if x.strip())
    allow_feegow_ids = set()
    for item in allow:
        m = re.match(r"^feegow:(\d+)$", item, flags=re.IGNORECASE)
        if m:
            allow_feegow_ids.add(m.group(1))
        elif re.match(r"^\d+$", item):
            allow_feegow_ids.add(item)
    out: List[Dict[str, str]] = []
    for row in all_rows:
        internal_id = _clean_ws(_row_value(row, 0, "id"))
        name = _clean_ws(_row_value(row, 1, "name"))
        if not internal_id or not name:
            continue
        feegow_id = _extract_feegow_id_from_internal_id(internal_id) or ""
        if allow and (internal_id not in allow and feegow_id not in allow_feegow_ids):
            continue
        out.append(
            {
                "internal_id": internal_id,
                "name": name,
                "name_norm": _normalize_text(name),
                "feegow_id": feegow_id,
            }
        )
    return out


def _get_pending_job(db: "DatabaseManager") -> Optional[Dict]:
    rows = db.execute_query(
        """
        SELECT id, period_ref, scope, requested_by, professional_ids_json
        FROM repasse_consolidacao_jobs
        WHERE status = ?
        ORDER BY created_at ASC
        LIMIT 1
        """,
        (STATUS_PENDING,),
    ) or []
    if not rows:
        return None
    row = rows[0]
    return {
        "id": _clean_ws(_row_value(row, 0, "id")),
        "period_ref": _clean_ws(_row_value(row, 1, "period_ref")),
        "scope": _clean_ws(_row_value(row, 2, "scope")),
        "requested_by": _clean_ws(_row_value(row, 3, "requested_by")),
        "professional_ids_json": _row_value(row, 4, "professional_ids_json"),
    }


def enqueue_consolidacao_job(
    period_ref: Optional[str] = None,
    requested_by: str = "manual",
    db: Optional["DatabaseManager"] = None,
    initial_status: str = STATUS_PENDING,
    professional_ids: Optional[List[str]] = None,
) -> Dict:
    own_db = db is None
    db_ref = db or DatabaseManager()
    _ensure_consolidacao_tables(db_ref)

    normalized_period = _normalize_period_ref(period_ref)
    now = _now_ts()
    job_id = uuid.uuid4().hex
    requested = _clean_ws(requested_by) or "manual"
    selected_ids = [_clean_ws(x) for x in (professional_ids or []) if _clean_ws(x)]
    selected_json = json.dumps(selected_ids, ensure_ascii=False) if selected_ids else None
    scope = "single" if len(selected_ids) == 1 else ("multi" if len(selected_ids) > 1 else "all")

    db_ref.execute_query(
        """
        INSERT INTO repasse_consolidacao_jobs (
          id, period_ref, scope, professional_ids_json, status, requested_by,
          started_at, finished_at, error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
        """,
        (
            job_id,
            normalized_period,
            scope,
            selected_json,
            _clean_ws(initial_status) or STATUS_PENDING,
            requested,
            now if _clean_ws(initial_status).upper() == STATUS_RUNNING else None,
            now,
            now,
        ),
    )

    if own_db:
        try:
            db_ref.update_heartbeat(
                SERVICE_NAME,
                "COMPLETED",
                f"Job enfileirado manualmente id={job_id} periodo={normalized_period}",
            )
        except Exception:
            pass

    return {
        "id": job_id,
        "period_ref": normalized_period,
        "requested_by": requested,
        "scope": scope,
        "professional_ids_json": selected_json,
    }


def _mark_job_running(db: "DatabaseManager", job_id: str):
    now = _now_ts()
    db.execute_query(
        """
        UPDATE repasse_consolidacao_jobs
        SET status = ?, started_at = ?, finished_at = NULL, error = NULL, updated_at = ?
        WHERE id = ?
        """,
        (STATUS_RUNNING, now, now, job_id),
    )


def _mark_job_done(db: "DatabaseManager", job_id: str, status: str, error: str = ""):
    now = _now_ts()
    db.execute_query(
        """
        UPDATE repasse_consolidacao_jobs
        SET status = ?, finished_at = ?, error = ?, updated_at = ?
        WHERE id = ?
        """,
        (status, now, (error or None), now, job_id),
    )


def _save_job_item(
    db: "DatabaseManager",
    job_id: str,
    professional_id: str,
    professional_name: str,
    status: str,
    rows_count: int,
    total_value: Decimal,
    error_message: str = "",
    duration_ms: Optional[int] = None,
):
    now = _now_ts()
    db.execute_query(
        "DELETE FROM repasse_consolidacao_job_items WHERE job_id = ? AND professional_id = ?",
        (job_id, professional_id),
    )
    db.execute_query(
        """
        INSERT INTO repasse_consolidacao_job_items (
          id, job_id, professional_id, professional_name, status, rows_count, total_value,
          error_message, duration_ms, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            hashlib.md5(f"{job_id}:{professional_id}".encode("utf-8")).hexdigest(),
            job_id,
            professional_id,
            professional_name,
            status,
            int(rows_count),
            float(total_value),
            error_message or None,
            duration_ms,
            now,
            now,
        ),
    )


def _upsert_professional_rows(
    db: "DatabaseManager",
    job_id: str,
    period_ref: str,
    professional_id: str,
    professional_name: str,
    rows: List[Dict],
):
    now = _now_ts()
    conn = db.get_connection()
    try:
        conn.execute(
            """
            UPDATE feegow_repasse_a_conferir
            SET is_active = 0, updated_at = ?, last_job_id = ?
            WHERE period_ref = ? AND professional_id = ?
            """,
            (now, job_id, period_ref, professional_id),
        )

        for row in rows:
            source_hash = _clean_ws(row.get("line_key_hash"))
            if not source_hash:
                source_hash = _hash_line(period_ref, professional_id, row)

            row_id = hashlib.md5(f"{job_id}:{source_hash}".encode("utf-8")).hexdigest()
            conn.execute(
                """
                INSERT INTO feegow_repasse_a_conferir (
                  id, period_ref, professional_id, professional_name, invoice_id, execution_date,
                  patient_name, unit_name, account_date, requester_name, specialty_name, procedure_name,
                  attendance_value, detail_status, detail_status_text, role_code, role_name,
                  detail_professional_name, detail_repasse_value, executante_option_value,
                  executante_option_title, source_row_hash, is_active, last_job_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(source_row_hash) DO UPDATE SET
                  period_ref = excluded.period_ref,
                  professional_id = excluded.professional_id,
                  professional_name = excluded.professional_name,
                  invoice_id = excluded.invoice_id,
                  execution_date = excluded.execution_date,
                  patient_name = excluded.patient_name,
                  unit_name = excluded.unit_name,
                  account_date = excluded.account_date,
                  requester_name = excluded.requester_name,
                  specialty_name = excluded.specialty_name,
                  procedure_name = excluded.procedure_name,
                  attendance_value = excluded.attendance_value,
                  detail_status = excluded.detail_status,
                  detail_status_text = excluded.detail_status_text,
                  role_code = excluded.role_code,
                  role_name = excluded.role_name,
                  detail_professional_name = excluded.detail_professional_name,
                  detail_repasse_value = excluded.detail_repasse_value,
                  executante_option_value = excluded.executante_option_value,
                  executante_option_title = excluded.executante_option_title,
                  is_active = 1,
                  last_job_id = excluded.last_job_id,
                  updated_at = excluded.updated_at
                """,
                (
                    row_id,
                    period_ref,
                    professional_id,
                    professional_name,
                    _clean_ws(row.get("invoice_id")),
                    _clean_ws(row.get("execution_date")),
                    _clean_ws(row.get("patient_name")),
                    _clean_ws(row.get("unit_name")),
                    _clean_ws(row.get("account_date")),
                    _clean_ws(row.get("requester_name")),
                    _clean_ws(row.get("specialty_name")),
                    _clean_ws(row.get("procedure_name")),
                    float(row.get("attendance_value_num") or 0),
                    _clean_ws(row.get("detail_status")),
                    _clean_ws(row.get("detail_status_text")),
                    _clean_ws(row.get("role_code")),
                    _clean_ws(row.get("role_name")),
                    _clean_ws(row.get("detail_professional_name")),
                    float(row.get("detail_repasse_num") or 0),
                    _clean_ws(row.get("executante_option_value")),
                    _clean_ws(row.get("executante_option_title")),
                    source_hash,
                    1,
                    job_id,
                    now,
                    now,
                ),
            )

        if not db.use_turso:
            conn.commit()
    finally:
        conn.close()


def _login_feegow(page):
    user = os.getenv("FEEGOW_USER")
    password = os.getenv("FEEGOW_PASS")
    if not user or not password:
        raise RuntimeError("FEEGOW_USER/FEEGOW_PASS nao configurados.")

    login_feegow_app4(page, user, password, logger=print)


def _open_consolidacao_screen(page):
    try:
        switch_feegow_unit(page, 0)
    except Exception:
        pass

    page.goto(CONSOLIDACAO_URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(700)

    page.wait_for_selector("#De", timeout=30000)
    page.wait_for_selector("#Ate", timeout=30000)
    page.wait_for_selector("#BtnBuscar", timeout=30000)
    page.wait_for_selector("#searchAccountID", timeout=30000)
    _enable_readonly_safety(page)

def _set_multiselect_values(page, select_id: str, target_values: List[str]) -> Tuple[int, int, List[str]]:
    payload = page.evaluate(
        """
        ({ selectId, targetValues }) => {
          const sel = document.querySelector(`select#${selectId}`);
          if (!sel) return { ok: false, selected: 0, total: 0, selectedValues: [] };
          const enabled = Array.from(sel.options || []).filter(o => !o.disabled);
          const wanted = new Set((targetValues || []).map(v => String(v)));
          for (const opt of enabled) {
            if (wanted.size === 0) {
              opt.selected = true;
            } else {
              opt.selected = wanted.has(String(opt.value || ''));
            }
          }
          sel.dispatchEvent(new Event('input', { bubbles: true }));
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          if (window.$ && typeof window.$ === 'function') {
            try {
              const $sel = window.$(sel);
              if ($sel && typeof $sel.multiselect === 'function') {
                try { $sel.multiselect('refresh'); } catch (e) {}
                try { $sel.multiselect('updateButtonText'); } catch (e) {}
              }
              try { $sel.trigger('change'); } catch (e) {}
            } catch (e) {}
          }
          const selected = enabled.filter(o => o.selected).length;
          const selectedValues = enabled.filter(o => o.selected).map(o => String(o.value || ''));
          return { ok: true, selected, total: enabled.length, selectedValues };
        }
        """,
        {"selectId": select_id, "targetValues": target_values},
    )
    return (
        int(payload.get("selected") or 0),
        int(payload.get("total") or 0),
        list(payload.get("selectedValues") or []),
    )


def _set_date_type_execucao(page):
    page.evaluate(
        """
        () => {
          const byLabel = Array.from(document.querySelectorAll('label')).find(lbl =>
            /execu/i.test((lbl.textContent || '').trim())
          );
          let input = null;
          if (byLabel) {
            input = byLabel.querySelector('input[type="radio"]');
            if (!input) {
              const forId = byLabel.getAttribute('for');
              if (forId) input = document.getElementById(forId);
            }
          }
          if (!input) {
            input = document.querySelector('input[type="radio"][value*="Exec"], input[type="radio"][value*="exec"]');
          }
          if (input) {
            input.checked = true;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
        """
    )


def _set_dates(page, date_from: str, date_to: str):
    if page.locator("#De").count() == 0 or page.locator("#Ate").count() == 0:
        raise RuntimeError("campos de data De/Ate nao encontrados.")

    def _validate():
        de_val = _clean_ws(page.locator("#De").input_value())
        ate_val = _clean_ws(page.locator("#Ate").input_value())
        if de_val == date_from and ate_val == date_to:
            return True, de_val, ate_val
        return False, de_val, ate_val

    for selector, value in (("#De", date_from), ("#Ate", date_to)):
        page.click(selector, force=True)
        page.keyboard.press("Control+a")
        page.keyboard.type(value)
        page.locator(selector).blur()
        page.wait_for_timeout(120)

    ok, de_val, ate_val = _validate()
    if ok:
        return

    page.evaluate(
        """
        ({ de, ate }) => {
          const deInput = document.querySelector('#De');
          const ateInput = document.querySelector('#Ate');
          if (!deInput || !ateInput) return;
          deInput.value = String(de || '');
          ateInput.value = String(ate || '');
          const fire = (el) => {
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
          };
          fire(deInput);
          fire(ateInput);
          if (window.$ && typeof window.$ === 'function') {
            try {
              window.$(deInput).trigger('change');
              window.$(ateInput).trigger('change');
            } catch (e) {}
          }
        }
        """,
        {"de": date_from, "ate": date_to},
    )
    page.wait_for_timeout(180)
    ok, de_val, ate_val = _validate()
    if not ok:
        raise RuntimeError(f"datas nao aplicadas: De={de_val} Ate={ate_val}")


def _apply_fixed_filters(page, date_from: str, date_to: str):
    conv_sel, conv_total, _ = _set_multiselect_values(page, "Forma", [])
    uni_sel, uni_total, uni_vals = _set_multiselect_values(page, "Unidades", DEFAULT_UNITS)

    _set_date_type_execucao(page)
    _set_dates(page, date_from, date_to)
    page.wait_for_timeout(250)

    if conv_total > 0 and conv_sel == 0:
        raise RuntimeError("nao foi possivel selecionar convenios.")
    if uni_total > 0 and uni_sel == 0:
        raise RuntimeError("nao foi possivel selecionar unidades.")

    selected_units = set(uni_vals)
    expected_units = set(DEFAULT_UNITS)
    if selected_units != expected_units:
        raise RuntimeError(
            f"unidades divergentes. esperado={sorted(expected_units)} obtido={sorted(selected_units)}"
        )


def _looks_like_login_screen(page) -> bool:
    if "login" in (page.url or "").lower():
        return True
    try:
        if page.locator("input[name='User']").count() > 0:
            return True
        if page.locator("input[name='password']").count() > 0:
            return True
        if page.locator("input[type='password']").count() > 0 and page.locator("input[type='email']").count() > 0:
            return True
    except Exception:
        return True
    return False


def _has_required_screen_elements(page) -> bool:
    required = ("#De", "#Ate", "#BtnBuscar", "#searchAccountID")
    for selector in required:
        try:
            if page.locator(selector).count() == 0:
                return False
        except Exception:
            return False
    return True


def _handle_concurrent_session_prompt(page):
    # Aceita prompts/modal de sessão concorrente quando aparecerem.
    try:
        page.evaluate(
            """
            () => {
              const candidates = Array.from(document.querySelectorAll('.modal button, .swal2-container button, .bootbox button, button'));
              const wanted = /(derrubar|encerrar|continuar|confirmar|ok|sim)/i;
              for (const btn of candidates) {
                const txt = String(btn.textContent || '').trim();
                if (!txt) continue;
                if (wanted.test(txt)) {
                  const inDangerArea = /(consolidar|desconsolidar|marcar pagos|marcar nao pagos|marcar não pagos)/i.test(txt);
                  if (inDangerArea) continue;
                  try {
                    btn.click();
                    return true;
                  } catch (e) {}
                }
              }
              return false;
            }
            """
        )
    except Exception:
        pass


def _recover_session_and_screen(page, date_from: str, date_to: str):
    _handle_concurrent_session_prompt(page)
    _login_feegow(page)
    _open_consolidacao_screen(page)
    _apply_fixed_filters(page, date_from, date_to)


def _ensure_ready_for_professional(page, date_from: str, date_to: str):
    _handle_concurrent_session_prompt(page)

    if _looks_like_login_screen(page):
        raise RuntimeError("sessao invalida: tela de login detectada")

    if "RepassesAConferir" not in (page.url or ""):
        _open_consolidacao_screen(page)

    if not _has_required_screen_elements(page):
        raise RuntimeError("tela invalida: elementos obrigatorios ausentes")

    _set_date_type_execucao(page)
    _set_dates(page, date_from, date_to)
    _enable_readonly_safety(page)


def _extract_name_from_candidate_title(title: str) -> str:
    txt = _clean_ws(title)
    txt = re.sub(r"\(\d+\)", "", txt).strip()
    return txt


def _fetch_executante_candidates(page, query_name: str) -> List[Dict[str, str]]:
    if page.locator("#searchAccountID").count() == 0:
        raise RuntimeError("campo de executante (#searchAccountID) nao encontrado.")

    try:
        page.keyboard.press("Escape")
    except Exception:
        pass
    page.evaluate(
        """
        () => {
          if (window.$ && window.$.fn && window.$.fn.datepicker) {
            try { window.$('.date-picker').datepicker('hide'); } catch (e) {}
          }
          const dps = document.querySelectorAll('.datepicker-dropdown, .datepicker');
          dps.forEach(el => { try { el.style.display = 'none'; } catch(e) {} });
        }
        """
    )

    page.click("#searchAccountID", force=True)
    page.fill("#searchAccountID", "")
    page.type("#searchAccountID", query_name, delay=20)

    try:
        page.wait_for_function(
            """
            () => {
              const box = document.querySelector('#resultSelectAccountID');
              if (!box) return false;
              const txt = (box.textContent || '').trim();
              const hasItems = !!box.querySelector('.select-insert-item');
              const loading = /Buscando/i.test(txt);
              if (hasItems) return true;
              if (!loading && txt.length > 0) return true;
              return false;
            }
            """,
            timeout=7000,
        )
    except Exception:
        pass

    candidates = page.evaluate(
        """
        () => {
          const out = [];
          const items = Array.from(document.querySelectorAll('#resultSelectAccountID .select-insert-item'));
          for (const it of items) {
            const title = String(it.getAttribute('data-title') || it.textContent || '').trim();
            const value = String(it.getAttribute('data-valor') || '').trim();
            out.push({ title, value });
          }
          return out;
        }
        """
    ) or []
    return candidates


def _choose_candidate_for_professional(prof: Dict, candidates: List[Dict[str, str]]) -> Tuple[Optional[Dict[str, str]], str]:
    if not candidates:
        return None, "NOT_FOUND"

    target_name_norm = _clean_ws(prof.get("name_norm"))
    target_feegow_id = _clean_ws(prof.get("feegow_id"))

    def _norm_candidate_name(item: Dict[str, str]) -> str:
        return _normalize_text(_extract_name_from_candidate_title(item.get("title")))

    exact = [c for c in candidates if _norm_candidate_name(c) == target_name_norm]
    if not exact:
        contains = [c for c in candidates if target_name_norm and target_name_norm in _norm_candidate_name(c)]
        exact = contains

    if not exact:
        return None, "NOT_FOUND"

    if len(exact) == 1:
        return exact[0], "OK"

    if target_feegow_id:
        filtered = []
        for c in exact:
            cid = _extract_feegow_id(c.get("title") or "")
            if cid and cid == target_feegow_id:
                filtered.append(c)
        if len(filtered) == 1:
            return filtered[0], "OK"
        if len(filtered) > 1:
            return None, "AMBIGUOUS"

    return None, "AMBIGUOUS"


def _select_executante_candidate(page, candidate: Dict[str, str]) -> bool:
    value = _clean_ws(candidate.get("value"))
    if not value:
        return False
    ok = page.evaluate(
        """
        ({ targetValue }) => {
          const items = Array.from(document.querySelectorAll('#resultSelectAccountID .select-insert-item'));
          const item = items.find(el => String(el.getAttribute('data-valor') || '').trim() === targetValue);
          if (!item) return false;
          item.click();
          return true;
        }
        """,
        {"targetValue": value},
    )
    if not ok:
        return False
    try:
        page.wait_for_function(
            """
            (targetValue) => {
              const v = (document.querySelector('#AccountID') || {}).value || '';
              return String(v).trim() === String(targetValue).trim();
            }
            """,
            arg=value,
            timeout=5000,
        )
    except Exception:
        pass
    hidden = _clean_ws(page.locator("#AccountID").input_value() if page.locator("#AccountID").count() > 0 else "")
    return hidden == value


def _select_professional_by_name(page, prof: Dict) -> Tuple[str, Optional[Dict[str, str]]]:
    candidates = _fetch_executante_candidates(page, prof["name"])
    chosen, status = _choose_candidate_for_professional(prof, candidates)
    if status == "NOT_FOUND":
        return "SKIPPED_NOT_IN_FILTER", None
    if status == "AMBIGUOUS":
        return "SKIPPED_AMBIGUOUS_NAME", None
    if not chosen:
        return "SKIPPED_NOT_IN_FILTER", None
    if not _select_executante_candidate(page, chosen):
        return "SKIPPED_NOT_IN_FILTER", None
    return "OK", chosen


def _click_search(page, run_id: str, debug: bool):
    _enable_readonly_safety(page)

    btn = page.locator("#BtnBuscar")
    if btn.count() == 0:
        alt = page.locator("button:has-text('Buscar')")
        if alt.count() == 0:
            raise RuntimeError("botao Buscar nao encontrado.")
        alt.first.click()
    else:
        btn.first.click()

    try:
        page.wait_for_function(
            """
            () => {
              const txt = ((document.body && document.body.innerText) || '').replace(/\\s+/g, ' ');
              if (/Nenhum repasse/i.test(txt)) return true;
              const tables = Array.from(document.querySelectorAll('table'));
              for (const t of tables) {
                const heads = Array.from(t.querySelectorAll('thead th')).map(x => (x.textContent || '').trim()).join(' ');
                if (/Execu/i.test(heads) && /Paciente/i.test(heads) && /Valor/i.test(heads)) return true;
              }
              return false;
            }
            """,
            timeout=40000,
        )
    except PlaywrightTimeoutError:
        _dump_page(page, run_id, "search_timeout", debug)
        raise RuntimeError("timeout aguardando retorno da busca.")

    page.wait_for_timeout(500)
    _enable_readonly_safety(page)

def _find_target_table(soup: BeautifulSoup):
    candidates = soup.find_all("table")
    best = None
    best_score = -1
    for table in candidates:
        heads = [_clean_ws(th.get_text(" ", strip=True)) for th in table.select("thead th")]
        joined = _normalize_text(" ".join(heads))
        score = 0
        if "EXECU" in joined:
            score += 2
        if "PACIENTE" in joined:
            score += 2
        if "UNIDADE" in joined:
            score += 1
        if "PROCEDIMENTO" in joined:
            score += 1
        if "VALOR" in joined:
            score += 2
        if score > best_score:
            best_score = score
            best = table
    if best_score < 5:
        return None
    return best


def _panel_key(tr) -> str:
    classes = tr.get("class") or []
    for cls in classes:
        if re.match(r"^panel\d+$", str(cls)):
            return str(cls)
    return ""


def _parse_parent_row(tr) -> Optional[Dict]:
    tds = tr.find_all("td", recursive=False)
    if len(tds) < 4:
        return None

    invoice_input = tr.select_one("input[name='invoiceID']")
    invoice_id = _clean_ws(invoice_input.get("value") if invoice_input else "")

    def _cell(pos: int) -> str:
        if pos < 0 or pos >= len(tds):
            return ""
        return _clean_ws(tds[pos].get_text(" ", strip=True))

    execution_date = _cell(1)
    patient_name = _cell(2)
    unit_name = _cell(3)
    account_date = _cell(4)
    requester_name = _cell(5)
    specialty_name = _cell(6)
    procedure_name = _cell(7)
    attendance_value_raw = _cell(len(tds) - 1)
    attendance_value_num = _to_float_2(_parse_decimal_br(attendance_value_raw))

    return {
        "invoice_id": invoice_id,
        "execution_date": execution_date,
        "patient_name": patient_name,
        "unit_name": unit_name,
        "account_date": account_date,
        "requester_name": requester_name,
        "specialty_name": specialty_name,
        "procedure_name": procedure_name,
        "attendance_value_raw": attendance_value_raw,
        "attendance_value_num": attendance_value_num,
    }


def _status_from_text(status_text: str) -> str:
    norm = _normalize_text(status_text)
    if "NAO RECEB" in norm:
        return "NAO_RECEBIDO"
    if "CONSOLID" in norm:
        return "CONSOLIDADO"
    return "OUTRO"


def _parse_role(role_text: str) -> Tuple[str, str]:
    cleaned = _clean_ws(role_text)
    match = re.search(r"(\d+)\s*:\s*(.+)$", cleaned)
    if match:
        return match.group(1), _clean_ws(match.group(2))
    return "", cleaned


def _parse_detail_rows(detail_tr, debug: bool) -> List[Dict]:
    if detail_tr is None:
        return []

    detail_entries: List[Dict] = []
    detail_blocks = detail_tr.select("td[colspan] table.table.table-hover.table-condensed > tbody > tr")

    for block in detail_blocks:
        tds = block.find_all("td", recursive=False)
        if not tds:
            continue
        left_text = _clean_ws(tds[0].get_text(" ", strip=True))
        status_text = _clean_ws(left_text.replace("Desconsolidar", ""))
        status = _status_from_text(status_text)

        right_td = tds[1] if len(tds) > 1 else None
        role_rows = []
        if right_td is not None:
            role_rows = right_td.select("table.table.table-condensed > tbody > tr")
            if not role_rows:
                role_rows = right_td.find_all("tr")

        if not role_rows:
            detail_entries.append(
                {
                    "detail_status": status,
                    "detail_status_text": status_text,
                    "role_code": "",
                    "role_name": "",
                    "detail_professional_name": "",
                    "detail_repasse_raw": "",
                    "detail_repasse_num": 0.0,
                    "raw_detail_html": str(block) if debug else "",
                }
            )
            continue

        for rr in role_rows:
            rr_tds = rr.find_all("td", recursive=False)
            role_text = _clean_ws(rr_tds[1].get_text(" ", strip=True)) if len(rr_tds) > 1 else ""
            role_code, role_name = _parse_role(role_text)
            detail_prof_name = _clean_ws(rr_tds[2].get_text(" ", strip=True)) if len(rr_tds) > 2 else ""
            repasse_raw = _clean_ws(rr_tds[3].get_text(" ", strip=True)) if len(rr_tds) > 3 else ""
            detail_entries.append(
                {
                    "detail_status": status,
                    "detail_status_text": status_text,
                    "role_code": role_code,
                    "role_name": role_name,
                    "detail_professional_name": detail_prof_name,
                    "detail_repasse_raw": repasse_raw,
                    "detail_repasse_num": _to_float_2(_parse_decimal_br(repasse_raw)),
                    "raw_detail_html": str(rr) if debug else "",
                }
            )

    return detail_entries


def _parse_result_rows(page, run_id: str, debug: bool) -> List[Dict]:
    content = page.content()
    if re.search(r"Nenhum repasse", content, flags=re.IGNORECASE):
        return []

    soup = BeautifulSoup(content, "html.parser")
    table = _find_target_table(soup)
    if table is None:
        raise RuntimeError("tabela de consolidacao nao encontrada.")

    tbody = table.find("tbody")
    if tbody is None:
        return []

    tr_list = tbody.find_all("tr", recursive=False)
    if not tr_list:
        return []

    rows: List[Dict] = []
    i = 0
    while i < len(tr_list):
        tr = tr_list[i]
        key = _panel_key(tr)
        parent = _parse_parent_row(tr)
        if not key or parent is None:
            i += 1
            continue

        detail_tr = None
        if i + 1 < len(tr_list) and _panel_key(tr_list[i + 1]) == key:
            detail_tr = tr_list[i + 1]

        details = _parse_detail_rows(detail_tr, debug)
        if not details:
            details = [
                {
                    "detail_status": "SEM_DETALHE",
                    "detail_status_text": "SEM DETALHE",
                    "role_code": "",
                    "role_name": "",
                    "detail_professional_name": "",
                    "detail_repasse_raw": "",
                    "detail_repasse_num": 0.0,
                    "raw_detail_html": str(detail_tr) if (debug and detail_tr is not None) else "",
                }
            ]

        for det in details:
            out = {}
            out.update(parent)
            out.update(det)
            out["raw_parent_html"] = str(tr) if debug else ""
            rows.append(out)

        i += 2 if detail_tr is not None else 1

    if debug and not rows:
        _dump_page(page, run_id, "parse_empty", debug)
    return rows


def _hash_line(period_ref: str, prof_internal_id: str, item: Dict) -> str:
    source = "|".join(
        [
            _clean_ws(period_ref),
            _clean_ws(prof_internal_id),
            _clean_ws(item.get("invoice_id")),
            _clean_ws(item.get("execution_date")),
            _clean_ws(item.get("patient_name")),
            _clean_ws(item.get("unit_name")),
            _clean_ws(item.get("account_date")),
            _clean_ws(item.get("requester_name")),
            _clean_ws(item.get("specialty_name")),
            _clean_ws(item.get("procedure_name")),
            _clean_ws(item.get("attendance_value_raw")),
            _clean_ws(item.get("detail_status")),
            _clean_ws(item.get("detail_status_text")),
            _clean_ws(item.get("role_code")),
            _clean_ws(item.get("role_name")),
            _clean_ws(item.get("detail_professional_name")),
            _clean_ws(item.get("detail_repasse_raw")),
        ]
    )
    return hashlib.md5(source.encode("utf-8")).hexdigest()


def _process_professional(
    page,
    run_id: str,
    period_ref: str,
    date_from: str,
    date_to: str,
    prof: Dict,
    debug: bool,
    heartbeat_cb=None,
) -> Tuple[str, List[Dict], Optional[Dict]]:
    last_error = None
    for attempt in range(1, DEFAULT_RETRY_ATTEMPTS + 1):
        try:
            if heartbeat_cb:
                heartbeat_cb("validacao", prof.get("name"))
            _ensure_ready_for_professional(page, date_from, date_to)

            if heartbeat_cb:
                heartbeat_cb("executante", prof.get("name"))
            select_status, chosen_candidate = _select_professional_by_name(page, prof)
            if select_status != "OK":
                return select_status, [], None
            if heartbeat_cb:
                heartbeat_cb("buscar", prof.get("name"))
            _click_search(page, run_id, debug)
            if heartbeat_cb:
                heartbeat_cb("parse", prof.get("name"))
            parsed = _parse_result_rows(page, run_id, debug)
            if not parsed:
                return "NO_DATA", [], None

            out_rows = []
            chosen_value = _clean_ws((chosen_candidate or {}).get("value"))
            chosen_title = _clean_ws((chosen_candidate or {}).get("title"))
            for item in parsed:
                line_hash = _hash_line(period_ref, prof["internal_id"], item)
                out_rows.append(
                    {
                        "run_id": run_id,
                        "period_ref": period_ref,
                        "professional_filter_id": prof["internal_id"],
                        "professional_filter_name": prof["name"],
                        "invoice_id": _clean_ws(item.get("invoice_id")),
                        "execution_date": _clean_ws(item.get("execution_date")),
                        "patient_name": _clean_ws(item.get("patient_name")),
                        "unit_name": _clean_ws(item.get("unit_name")),
                        "account_date": _clean_ws(item.get("account_date")),
                        "requester_name": _clean_ws(item.get("requester_name")),
                        "specialty_name": _clean_ws(item.get("specialty_name")),
                        "procedure_name": _clean_ws(item.get("procedure_name")),
                        "attendance_value_raw": _clean_ws(item.get("attendance_value_raw")),
                        "attendance_value_num": float(item.get("attendance_value_num") or 0),
                        "detail_status": _clean_ws(item.get("detail_status")),
                        "detail_status_text": _clean_ws(item.get("detail_status_text")),
                        "role_code": _clean_ws(item.get("role_code")),
                        "role_name": _clean_ws(item.get("role_name")),
                        "detail_professional_name": _clean_ws(item.get("detail_professional_name")),
                        "detail_repasse_raw": _clean_ws(item.get("detail_repasse_raw")),
                        "detail_repasse_num": float(item.get("detail_repasse_num") or 0),
                        "line_key_hash": line_hash,
                        "executante_option_value": chosen_value,
                        "executante_option_title": chosen_title,
                        "raw_parent_html": item.get("raw_parent_html") or "",
                        "raw_detail_html": item.get("raw_detail_html") or "",
                    }
                )

            return "OK", out_rows, None

        except Exception as exc:
            last_error = exc
            if attempt < DEFAULT_RETRY_ATTEMPTS:
                try:
                    _recover_session_and_screen(page, date_from, date_to)
                except Exception as recover_exc:
                    last_error = RuntimeError(f"{exc} | recovery_failed={recover_exc}")
                continue
            return (
                "ERROR",
                [],
                {
                    "stage": "search_parse",
                    "message": str(last_error),
                    "attempts": attempt,
                },
            )

    return "ERROR", [], {"stage": "search_parse", "message": str(last_error or "erro desconhecido")}

def _write_jsonl(path: str, rows: List[Dict]):
    with open(path, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def _write_csv(path: str, rows: List[Dict]):
    fieldnames = [
        "run_id",
        "period_ref",
        "professional_filter_id",
        "professional_filter_name",
        "invoice_id",
        "execution_date",
        "patient_name",
        "unit_name",
        "account_date",
        "requester_name",
        "specialty_name",
        "procedure_name",
        "attendance_value_raw",
        "attendance_value_num",
        "detail_status",
        "detail_status_text",
        "role_code",
        "role_name",
        "detail_professional_name",
        "detail_repasse_raw",
        "detail_repasse_num",
        "line_key_hash",
        "executante_option_value",
        "executante_option_title",
        "raw_parent_html",
        "raw_detail_html",
    ]
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in fieldnames})


def _parse_professional_filter_arg(raw: str) -> List[str]:
    text = _clean_ws(raw)
    if not text:
        return []
    return [x.strip() for x in text.split(",") if x.strip()]


def _save_debug_outputs(
    debug: bool,
    run_id: str,
    period_ref: str,
    date_from: str,
    date_to: str,
    selected_ids: List[str],
    professionals_total: int,
    counters: Dict[str, int],
    rows: List[Dict],
    errors: List[Dict],
    started_ts: float,
):
    if not debug:
        return
    output_paths = _make_output_paths(run_id)
    summary = {
        "run_id": run_id,
        "period_ref": period_ref,
        "date_from": date_from,
        "date_to": date_to,
        "started_at": datetime.fromtimestamp(started_ts).strftime("%Y-%m-%d %H:%M:%S"),
        "finished_at": _now_ts(),
        "duration_sec": round(time.time() - started_ts, 2),
        "scope": "all_active" if not selected_ids else "selected",
        "selected_professional_ids": selected_ids,
        "totals": {
            "professionals_total": professionals_total,
            "ok": counters.get("ok", 0),
            "no_data": counters.get("no_data", 0),
            "skipped_not_in_filter": counters.get("skipped", 0),
            "skipped_ambiguous_name": counters.get("skipped_ambiguous", 0),
            "error": counters.get("error", 0),
            "rows": len(rows),
            "detail_repasse_total": round(
                sum(float(r.get("detail_repasse_num") or 0.0) for r in rows), 2
            ),
        },
        "assumptions": {
            "units_fixed": DEFAULT_UNITS,
            "granularity": "one_row_per_detail_item",
            "data_type_radio": "execucao",
        },
        "files": output_paths,
    }
    with open(output_paths["summary"], "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    _write_jsonl(output_paths["rows_jsonl"], rows)
    _write_csv(output_paths["rows_csv"], rows)
    _write_jsonl(output_paths["errors_jsonl"], errors)
    print(f"debug_summary: {output_paths['summary']}")


def _hb(db: "DatabaseManager", status: str, job_id: str, stage: str, extra: str = ""):
    details = f"job={job_id} etapa={stage}"
    if extra:
        details = f"{details} {extra}"
    db.update_heartbeat(SERVICE_NAME, status, details)


def _process_job(
    db: "DatabaseManager",
    job: Dict,
    debug: bool = False,
    headless: bool = False,
    date_from_override: str = "",
    date_to_override: str = "",
):
    job_id = _clean_ws(job.get("id"))
    period_ref = _normalize_period_ref(job.get("period_ref"))
    selected_ids = _parse_professional_ids_json(job.get("professional_ids_json"))
    date_from = _clean_ws(date_from_override)
    date_to = _clean_ws(date_to_override)
    if not date_from or not date_to:
        date_from, date_to = _period_to_dates(period_ref)

    professionals = _list_active_professionals(db, selected_ids)
    if not professionals:
        _mark_job_done(db, job_id, STATUS_FAILED, "Nenhum profissional ativo encontrado para o escopo do job.")
        db.update_heartbeat(SERVICE_NAME, "ERROR", "Nenhum profissional ativo para processar no escopo.")
        print(f"--- Repasse a conferir | job={job_id} | status={STATUS_FAILED} (sem profissionais) ---")
        return

    scope_label = _clean_ws(job.get("scope")) or ("selected" if selected_ids else "all")
    run_id = _run_id()
    start_ts = time.time()
    all_rows: List[Dict] = []
    all_errors: List[Dict] = []
    counters = {
        "ok": 0,
        "no_data": 0,
        "skipped": 0,
        "skipped_ambiguous": 0,
        "error": 0,
    }

    print(
        f"--- Repasse a conferir | job={job_id} | periodo={period_ref} | "
        f"de={date_from} ate={date_to} | profissionais={len(professionals)} | escopo={scope_label} ---"
    )
    _hb(db, "RUNNING", job_id, "init", f"periodo={period_ref} profissionais={len(professionals)}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(ignore_https_errors=True)
        page = context.new_page()
        page.on("dialog", lambda dialog: dialog.accept())
        try:
            _hb(db, "RUNNING", job_id, "login")
            _login_feegow(page)
            _hb(db, "RUNNING", job_id, "filtros")
            _open_consolidacao_screen(page)
            _apply_fixed_filters(page, date_from, date_to)

            for idx, prof in enumerate(professionals, start=1):
                t0 = time.time()

                def _stage_cb(stage: str, prof_name: str = ""):
                    if stage in ("validacao", "executante", "buscar", "parse"):
                        suffix = f"profissional={prof_name}" if prof_name else ""
                        _hb(db, "RUNNING", job_id, stage, suffix)

                status, rows, err = _process_professional(
                    page=page,
                    run_id=run_id,
                    period_ref=period_ref,
                    date_from=date_from,
                    date_to=date_to,
                    prof=prof,
                    debug=debug,
                    heartbeat_cb=_stage_cb,
                )

                duration_ms = int((time.time() - t0) * 1000)
                if status == "OK":
                    _hb(db, "RUNNING", job_id, "persist", f"profissional={prof['name']}")
                    _upsert_professional_rows(
                        db=db,
                        job_id=job_id,
                        period_ref=period_ref,
                        professional_id=prof["internal_id"],
                        professional_name=prof["name"],
                        rows=rows,
                    )
                    total_repasse = Decimal("0")
                    for item in rows:
                        total_repasse += Decimal(str(item.get("detail_repasse_num") or 0))
                    _save_job_item(
                        db,
                        job_id,
                        prof["internal_id"],
                        prof["name"],
                        ITEM_SUCCESS,
                        len(rows),
                        total_repasse,
                        "",
                        duration_ms,
                    )
                    counters["ok"] += 1
                    all_rows.extend(rows)
                    print(
                        f"[{idx}/{len(professionals)}] OK {prof['name']}: "
                        f"linhas={len(rows)} total={float(total_repasse):.2f}"
                    )
                elif status == "NO_DATA":
                    _hb(db, "RUNNING", job_id, "persist", f"profissional={prof['name']}")
                    _upsert_professional_rows(
                        db=db,
                        job_id=job_id,
                        period_ref=period_ref,
                        professional_id=prof["internal_id"],
                        professional_name=prof["name"],
                        rows=[],
                    )
                    _save_job_item(
                        db,
                        job_id,
                        prof["internal_id"],
                        prof["name"],
                        ITEM_NO_DATA,
                        0,
                        Decimal("0"),
                        "",
                        duration_ms,
                    )
                    counters["no_data"] += 1
                    print(f"[{idx}/{len(professionals)}] NO_DATA {prof['name']}")
                elif status == "SKIPPED_NOT_IN_FILTER":
                    _save_job_item(
                        db,
                        job_id,
                        prof["internal_id"],
                        prof["name"],
                        ITEM_SKIPPED_NOT_IN_FILTER,
                        0,
                        Decimal("0"),
                        "Executante nao encontrado no filtro da tela",
                        duration_ms,
                    )
                    counters["skipped"] += 1
                    print(f"[{idx}/{len(professionals)}] SKIPPED_NOT_IN_FILTER {prof['name']}")
                elif status == "SKIPPED_AMBIGUOUS_NAME":
                    _save_job_item(
                        db,
                        job_id,
                        prof["internal_id"],
                        prof["name"],
                        ITEM_SKIPPED_AMBIGUOUS_NAME,
                        0,
                        Decimal("0"),
                        "Nome ambiguo no filtro de executante",
                        duration_ms,
                    )
                    counters["skipped_ambiguous"] += 1
                    print(f"[{idx}/{len(professionals)}] SKIPPED_AMBIGUOUS_NAME {prof['name']}")
                else:
                    counters["error"] += 1
                    message = _clean_ws((err or {}).get("message")) or "erro desconhecido"
                    all_errors.append(
                        {
                            "run_id": run_id,
                            "period_ref": period_ref,
                            "professional_id": prof["internal_id"],
                            "professional_name": prof["name"],
                            "status": status,
                            "duration_ms": duration_ms,
                            "error": err or {"message": message},
                            "logged_at": _now_ts(),
                        }
                    )
                    _save_job_item(
                        db,
                        job_id,
                        prof["internal_id"],
                        prof["name"],
                        ITEM_ERROR,
                        0,
                        Decimal("0"),
                        message,
                        duration_ms,
                    )
                    print(f"[{idx}/{len(professionals)}] ERROR {prof['name']}: {message}")
        finally:
            context.close()
            browser.close()

    if counters["error"] >= len(professionals):
        final_status = STATUS_FAILED
    elif counters["error"] > 0:
        final_status = STATUS_PARTIAL
    else:
        final_status = STATUS_COMPLETED

    _mark_job_done(db, job_id, final_status)
    hb_status = "ERROR" if final_status == STATUS_FAILED else ("WARNING" if final_status == STATUS_PARTIAL else "COMPLETED")
    _hb(db, hb_status, job_id, "done", f"status={final_status}")

    _save_debug_outputs(
        debug=debug,
        run_id=run_id,
        period_ref=period_ref,
        date_from=date_from,
        date_to=date_to,
        selected_ids=selected_ids,
        professionals_total=len(professionals),
        counters=counters,
        rows=all_rows,
        errors=all_errors,
        started_ts=start_ts,
    )
    print(f"--- Repasse a conferir finalizado | job={job_id} | status={final_status} ---")


def process_pending_consolidacao_jobs_once(
    auto_enqueue_if_empty: bool = False,
    period_ref: Optional[str] = None,
    requested_by: str = "manual",
    professional_ids: Optional[List[str]] = None,
    debug: bool = False,
    headless: bool = False,
    date_from: str = "",
    date_to: str = "",
) -> bool:
    db = DatabaseManager()
    _ensure_consolidacao_tables(db)

    pending = _get_pending_job(db)
    date_from_override = ""
    date_to_override = ""

    if not pending and auto_enqueue_if_empty:
        normalized_period = _normalize_period_ref(period_ref)
        if _clean_ws(date_from) and _clean_ws(date_to):
            _, date_from_override, date_to_override = _parse_period_args(normalized_period, date_from, date_to)

        job = enqueue_consolidacao_job(
            period_ref=normalized_period,
            requested_by=requested_by,
            db=db,
            initial_status=STATUS_PENDING,
            professional_ids=professional_ids or [],
        )
        print(
            f"📝 Job de consolidacao criado automaticamente | id={job['id']} | periodo={job['period_ref']}"
        )
        pending = {
            "id": job["id"],
            "period_ref": job["period_ref"],
            "scope": job.get("scope") or "",
            "requested_by": job["requested_by"],
            "professional_ids_json": job.get("professional_ids_json"),
        }

    if not pending:
        db.update_heartbeat(SERVICE_NAME, "COMPLETED", "Sem jobs pendentes")
        return False

    _mark_job_running(db, pending["id"])
    try:
        _process_job(
            db=db,
            job=pending,
            debug=debug,
            headless=headless,
            date_from_override=date_from_override,
            date_to_override=date_to_override,
        )
    except Exception as exc:
        _mark_job_done(db, pending["id"], STATUS_FAILED, str(exc))
        db.update_heartbeat(SERVICE_NAME, "ERROR", f"job={pending['id']} erro={exc}")
        print(f"❌ Erro fatal no job {pending['id']}: {exc}")
        raise
    return True


def run_once(args):
    if DatabaseManager is None:
        raise RuntimeError("DatabaseManager indisponivel.")

    selected_ids = _parse_professional_filter_arg(args.professionals)
    period_ref, date_from, date_to = _parse_period_args(args.period, args.start, args.end)

    had_job = process_pending_consolidacao_jobs_once(
        auto_enqueue_if_empty=True,
        period_ref=period_ref,
        requested_by=_clean_ws(args.requested_by) or "manual_cli",
        professional_ids=selected_ids,
        debug=bool(args.debug),
        headless=bool(args.headless),
        date_from=date_from,
        date_to=date_to,
    )
    if not had_job:
        print("Sem jobs pendentes.")


def build_parser():
    parser = argparse.ArgumentParser(description="Extrator de consolidacao de repasses (RepassesAConferir) com persistencia em banco.")
    parser.add_argument("--once", action="store_true", help="Executa uma unica vez (processa 1 job pendente).")
    parser.add_argument("--period", default="", help="Periodo no formato YYYY-MM.")
    parser.add_argument("--start", default="", help="Data inicial DD/MM/YYYY.")
    parser.add_argument("--end", default="", help="Data final DD/MM/YYYY.")
    parser.add_argument(
        "--professionals",
        default="",
        help="Lista de IDs internos separados por virgula (ex: feegow:121659,2389).",
    )
    parser.add_argument("--requested-by", default="manual_cli", help="Identificador do solicitante do job.")
    browser_group = parser.add_mutually_exclusive_group()
    browser_group.add_argument(
        "--headless",
        dest="headless",
        action="store_true",
        help="Executa navegador em modo headless (padrao).",
    )
    browser_group.add_argument(
        "--headful",
        dest="headless",
        action="store_false",
        help="Executa navegador visivel para depuracao local.",
    )
    parser.set_defaults(headless=True)
    parser.add_argument("--debug", action="store_true", help="Salva dumps html/png por etapa.")
    return parser


if __name__ == "__main__":
    args = build_parser().parse_args()
    try:
        run_once(args)
    except Exception as e:
        print(f"ERRO: {e}")
        raise
