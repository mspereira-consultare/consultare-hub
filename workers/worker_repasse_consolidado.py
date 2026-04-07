import os
import sys
import time
import re
import json
import hashlib
import uuid
import unicodedata
import calendar
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Dict, List, Optional, Tuple

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

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
REPASSE_URL = f"{BASE_URL}/v8.1/?P=RepassesConferidos&Pers=1"
REPORT_SOURCE_URL = f"{BASE_URL}/v8.1/?P=RepassesConferidos&Pers="

SERVICE_NAME = "repasse_sync"
STATUS_PENDING = "PENDING"
STATUS_RUNNING = "RUNNING"
STATUS_COMPLETED = "COMPLETED"
STATUS_FAILED = "FAILED"
STATUS_PARTIAL = "PARTIAL"

ITEM_SUCCESS = "SUCCESS"
ITEM_NO_DATA = "NO_DATA"
ITEM_ERROR = "ERROR"


def _now_iso() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _is_debug_enabled() -> bool:
    return str(os.getenv("REPASSE_DEBUG", "0")).strip().lower() in ("1", "true", "yes", "on")


def _debug(msg: str):
    print(f"[REPASSE_DEBUG] {msg}")


def _debug_dump_page(page, stage: str):
    if not _is_debug_enabled():
        return
    try:
        base = os.getenv("REPASSE_DEBUG_DIR") or os.path.join(os.path.dirname(__file__), "_debug_repasse")
        os.makedirs(base, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_stage = re.sub(r"[^a-zA-Z0-9_-]+", "_", stage)
        html_path = os.path.join(base, f"{stamp}_{safe_stage}.html")
        png_path = os.path.join(base, f"{stamp}_{safe_stage}.png")
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(page.content())
        page.screenshot(path=png_path, full_page=True)
        _debug(f"dump salvo: {html_path} | {png_path}")
    except Exception as e:
        _debug(f"falha ao salvar dump de pagina ({stage}): {e}")


def _debug_read_filter_state(page, stage: str):
    if not _is_debug_enabled():
        return
    try:
        state = page.evaluate(
            """
            () => {
              const buttons = Array.from(document.querySelectorAll('button.multiselect.dropdown-toggle')).map((b, idx) => ({
                index: idx,
                text: String(b.textContent || '').replace(/\\s+/g, ' ').trim(),
                title: String(b.getAttribute('title') || '').replace(/\\s+/g, ' ').trim()
              }));
              const de = (document.querySelector('#De') || {}).value || '';
              const ate = (document.querySelector('#Ate') || {}).value || '';
              const acc = document.querySelector('select#AccountID');
              const accValue = acc ? String(acc.value || '') : '';
              const accSelected = acc && acc.options && acc.selectedIndex >= 0
                ? String(acc.options[acc.selectedIndex].textContent || '').replace(/\\s+/g, ' ').trim()
                : '';
              return { buttons, de, ate, accValue, accSelected };
            }
            """
        )
        _debug(f"{stage} | De={state.get('de')} Ate={state.get('ate')} AccountID={state.get('accValue')}::{state.get('accSelected')}")
        for btn in state.get("buttons", []):
            _debug(f"{stage} | multiselect[{btn.get('index')}] text='{btn.get('text')}' title='{btn.get('title')}'")
    except Exception as e:
        _debug(f"falha ao ler estado de filtros ({stage}): {e}")


def _normalize_text(value: str) -> str:
    raw = str(value or "").strip().upper()
    raw = unicodedata.normalize("NFD", raw)
    raw = "".join(ch for ch in raw if unicodedata.category(ch) != "Mn")
    raw = re.sub(r"\s+", " ", raw)
    return raw


def _normalize_professional_label(value: str) -> str:
    txt = _normalize_text(value)
    txt = txt.replace("» PROFISSIONAL", "").strip()
    return txt


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
        if 0 <= idx < len(row):
            return row[idx]
        return None
    if isinstance(row, dict):
        return row.get(key)
    if hasattr(row, key):
        return getattr(row, key)
    try:
        return row[key]
    except Exception:
        return None


def _parse_currency(value: str) -> Decimal:
    raw = str(value or "").strip()
    if not raw:
        return Decimal("0")
    neg = "-" in raw or "−" in raw or "(" in raw
    clean = raw.replace("R$", "").replace(".", "").replace(" ", "")
    clean = re.sub(r"[^\d,]", "", clean)
    if not clean:
        return Decimal("0")
    try:
        num = Decimal(clean.replace(",", "."))
    except InvalidOperation:
        num = Decimal("0")
    return -num if neg else num


def _parse_date(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})(?:\s+(\d{2}):(\d{2}))?$", raw)
    if not m:
        return raw
    dd, mm, yyyy, hh, mi = m.groups()
    if hh and mi:
        return f"{yyyy}-{mm}-{dd} {hh}:{mi}:00"
    return f"{yyyy}-{mm}-{dd}"


def _parse_table_rows(headers: List[str], rows_matrix: List[List[str]]) -> List[Dict]:
    normalized_headers = [_normalize_text(h) for h in headers]

    def _idx_for(candidates: List[str]) -> int:
        for idx, h in enumerate(normalized_headers):
            for c in candidates:
                if c in h:
                    return idx
        return -1

    idx_data = _idx_for(["DATA EXEC"])
    idx_paciente = _idx_for(["PACIENTE"])
    idx_descricao = _idx_for(["DESCRICAO"])
    idx_funcao = _idx_for(["FUNCAO"])
    idx_convenio = _idx_for(["CONVENIO"])
    idx_repasse = _idx_for(["REPASSE"])

    if min(idx_data, idx_paciente, idx_descricao, idx_funcao, idx_convenio, idx_repasse) < 0:
        raise RuntimeError(f"Colunas esperadas nao encontradas na tabela: {headers}")

    out: List[Dict] = []
    for cells in rows_matrix:
        def _cell(i: int) -> str:
            if i < 0 or i >= len(cells):
                return ""
            return re.sub(r"\s+", " ", str(cells[i] or "")).strip()

        out.append(
            {
                "data_exec_raw": _cell(idx_data),
                "data_exec": _parse_date(_cell(idx_data)),
                "paciente": _cell(idx_paciente),
                "descricao": _cell(idx_descricao),
                "funcao": _cell(idx_funcao),
                "convenio": _cell(idx_convenio),
                "repasse_raw": _cell(idx_repasse),
                "repasse_value": _parse_currency(_cell(idx_repasse)),
            }
        )
    return out


def _period_to_range(period_ref: str) -> Tuple[str, str]:
    m = re.match(r"^(\d{4})-(\d{2})$", str(period_ref or "").strip())
    if not m:
        raise RuntimeError(f"period_ref invalido: {period_ref}")
    year = int(m.group(1))
    month = int(m.group(2))
    last_day = calendar.monthrange(year, month)[1]
    return f"01/{month:02d}/{year}", f"{last_day:02d}/{month:02d}/{year}"


def _previous_month_ref() -> str:
    now = datetime.now()
    year = now.year
    month = now.month - 1
    if month <= 0:
        month = 12
        year -= 1
    return f"{year}-{month:02d}"


def _normalize_period_ref(period_ref: Optional[str]) -> str:
    raw = str(period_ref or "").strip()
    if not raw:
        return _previous_month_ref()
    if not re.match(r"^\d{4}-\d{2}$", raw):
        raise RuntimeError("period_ref invalido. Use o formato YYYY-MM.")
    year = int(raw[:4])
    month = int(raw[5:7])
    if month < 1 or month > 12:
        raise RuntimeError("period_ref invalido. Mes deve estar entre 01 e 12.")
    return f"{year:04d}-{month:02d}"


def _extract_table_rows(page) -> List[Dict]:
    has_no_data = page.evaluate(
        """
        () => {
          const txt = ((document.body && document.body.innerText) || '').replace(/\\s+/g, ' ');
          return /Nenhum repasse consolidado foi encontrado/i.test(txt);
        }
        """
    )
    if has_no_data:
        return []

    dt_data = page.evaluate(
        """
        () => {
          const table = document.querySelector('#datatableRepasses');
          if (!table) return null;
          const headers = Array.from(table.querySelectorAll('thead th')).map(
            th => String(th.textContent || '').replace(/\\s+/g, ' ').trim()
          );
          if (!(window.$ && window.$.fn && window.$.fn.dataTable)) {
            return { headers, rows: null };
          }
          try {
            const dt = window.$('#datatableRepasses').DataTable();
            if (!dt) return { headers, rows: null };
            const rows = dt.rows({ search: 'applied' }).data().toArray().map((row) => {
              const arr = Array.isArray(row) ? row : Object.values(row || {});
              return arr.map((cell) => {
                const div = document.createElement('div');
                div.innerHTML = String(cell ?? '');
                return String(div.textContent || '').replace(/\\s+/g, ' ').trim();
              });
            });
            return { headers, rows };
          } catch (e) {
            return { headers, rows: null };
          }
        }
        """
    )

    if dt_data and isinstance(dt_data, dict):
        headers = dt_data.get("headers") or []
        rows_matrix = dt_data.get("rows")
        if headers and rows_matrix is not None:
            if not rows_matrix:
                return []
            return _parse_table_rows(headers, rows_matrix)

    content = page.content()
    soup = BeautifulSoup(content, "html.parser")
    table = soup.find("table", {"id": "datatableRepasses"})
    if not table:
        table = soup.select_one("table[id*='datatableRepasses'], table[id*='datatable']")
    if not table:
        for candidate in soup.find_all("table"):
            th_text = " ".join(
                re.sub(r"\s+", " ", th.get_text(" ", strip=True))
                for th in candidate.select("thead th")
            )
            norm = _normalize_text(th_text)
            if "DATA EXEC" in norm and "PACIENTE" in norm and "REPASSE" in norm:
                table = candidate
                break
    if not table:
        raise RuntimeError("Tabela de repasses nao encontrada apos busca.")

    headers = [re.sub(r"\s+", " ", th.get_text(" ", strip=True)) for th in table.select("thead th")]
    rows_matrix: List[List[str]] = []
    for tr in table.select("tbody tr"):
        if tr.select_one("td.dataTables_empty"):
            continue
        tds = tr.find_all("td")
        if not tds:
            continue
        rows_matrix.append([re.sub(r"\s+", " ", td.get_text(" ", strip=True)).strip() for td in tds])

    if not rows_matrix:
        return []
    return _parse_table_rows(headers, rows_matrix)


def _ensure_repasse_tables(db: "DatabaseManager"):
    def _ensure_index(conn, table_name: str, index_name: str, columns_sql: str):
        if db.use_mysql:
            res = conn.execute(
                """
                SELECT COUNT(1)
                FROM information_schema.statistics
                WHERE table_schema = DATABASE()
                  AND table_name = ?
                  AND index_name = ?
                """,
                (table_name, index_name),
            )
            rows = _fetch_rows(res)
            cnt = 0
            if rows:
                row = rows[0]
                cnt = int(_row_get(row, 0, "COUNT(1)") or _row_get(row, 0, "count(1)") or 0)
            if cnt == 0:
                conn.execute(f"CREATE INDEX {index_name} ON {table_name} ({columns_sql})")
            return
        conn.execute(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} ({columns_sql})")

    def _ensure_column(conn, table_name: str, column_name: str, column_def_sql: str):
        if db.use_mysql:
            res = conn.execute(
                """
                SELECT COUNT(1)
                FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = ?
                  AND column_name = ?
                """,
                (table_name, column_name),
            )
            rows = _fetch_rows(res)
            cnt = 0
            if rows:
                row = rows[0]
                cnt = int(_row_get(row, 0, "COUNT(1)") or _row_get(row, 0, "count(1)") or 0)
            if cnt == 0:
                conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_def_sql}")
            return

        res = conn.execute(f"PRAGMA table_info({table_name})")
        rows = _fetch_rows(res)
        exists = False
        for row in rows:
            name = _row_get(row, 1, "name")
            if str(name or "").strip().lower() == column_name.lower():
                exists = True
                break
        if not exists:
            conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_def_sql}")

    conn = db.get_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS feegow_repasse_consolidado (
              id VARCHAR(64) PRIMARY KEY,
              period_ref VARCHAR(7) NOT NULL,
              professional_id VARCHAR(64) NOT NULL,
              professional_name VARCHAR(180) NOT NULL,
              data_exec VARCHAR(32) NOT NULL,
              paciente VARCHAR(180) NOT NULL,
              descricao VARCHAR(255) NOT NULL,
              funcao VARCHAR(120) NOT NULL,
              convenio VARCHAR(180) NOT NULL,
              repasse_value DECIMAL(14,2) NOT NULL,
              source_row_hash VARCHAR(64) NOT NULL UNIQUE,
              is_active INTEGER NOT NULL,
              last_job_id VARCHAR(64),
              created_at VARCHAR(32) NOT NULL,
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        _ensure_index(conn, "feegow_repasse_consolidado", "idx_repasse_consolidado_period_prof", "period_ref, professional_id")
        _ensure_index(conn, "feegow_repasse_consolidado", "idx_repasse_consolidado_data_exec", "data_exec")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS repasse_sync_jobs (
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
        _ensure_column(conn, "repasse_sync_jobs", "scope", "VARCHAR(20) NOT NULL DEFAULT 'all'")
        _ensure_column(conn, "repasse_sync_jobs", "professional_ids_json", "TEXT")
        _ensure_index(conn, "repasse_sync_jobs", "idx_repasse_sync_jobs_period", "period_ref")
        _ensure_index(conn, "repasse_sync_jobs", "idx_repasse_sync_jobs_status", "status")
        _ensure_index(conn, "repasse_sync_jobs", "idx_repasse_sync_jobs_created", "created_at")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS repasse_sync_job_items (
              id VARCHAR(64) PRIMARY KEY,
              job_id VARCHAR(64) NOT NULL,
              professional_id VARCHAR(64) NOT NULL,
              professional_name VARCHAR(180) NOT NULL,
              status VARCHAR(20) NOT NULL,
              rows_count INTEGER NOT NULL,
              total_value DECIMAL(14,2) NOT NULL,
              error_message TEXT,
              duration_ms INTEGER,
              created_at VARCHAR(32) NOT NULL,
              updated_at VARCHAR(32) NOT NULL
            )
            """
        )
        _ensure_index(conn, "repasse_sync_job_items", "idx_repasse_sync_items_job", "job_id")
        _ensure_index(conn, "repasse_sync_job_items", "idx_repasse_sync_items_prof", "professional_id")
        _ensure_index(conn, "repasse_sync_job_items", "idx_repasse_sync_items_status", "status")

        if not db.use_turso:
            conn.commit()
    finally:
        conn.close()


def _list_active_professionals(db: "DatabaseManager") -> List[Tuple[str, str]]:
    rows = db.execute_query(
        """
        SELECT id, name
        FROM professionals
        WHERE is_active = 1
        ORDER BY name ASC
        """
    ) or []
    out = []
    for row in rows:
        prof_id = _row_get(row, 0, "id")
        name = _row_get(row, 1, "name")
        if prof_id and name:
            out.append((str(prof_id), str(name)))
    return out


def _parse_professional_ids_json(raw_value) -> List[str]:
    raw = str(raw_value or "").strip()
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
        pid = str(item or "").strip()
        if not pid or pid in seen:
            continue
        seen.add(pid)
        out.append(pid)
    return out


def _list_selected_active_professionals(db: "DatabaseManager", professional_ids: List[str]) -> List[Tuple[str, str]]:
    ids = [str(x or "").strip() for x in (professional_ids or []) if str(x or "").strip()]
    if not ids:
        return _list_active_professionals(db)

    conn = db.get_connection()
    try:
        placeholders = ", ".join(["?"] * len(ids))
        rs = conn.execute(
            f"""
            SELECT id, name
            FROM professionals
            WHERE is_active = 1
              AND id IN ({placeholders})
            ORDER BY name ASC
            """,
            tuple(ids),
        )
        rows = _fetch_rows(rs)
    finally:
        conn.close()

    by_id = {}
    for row in rows:
        pid = str(_row_get(row, 0, "id") or "").strip()
        name = str(_row_get(row, 1, "name") or "").strip()
        if pid and name:
            by_id[pid] = name

    return [(pid, by_id[pid]) for pid in ids if pid in by_id]


def _get_pending_job(db: "DatabaseManager") -> Optional[Dict]:
    rows = db.execute_query(
        """
        SELECT id, period_ref, scope, requested_by, professional_ids_json
        FROM repasse_sync_jobs
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
        "id": str(_row_get(row, 0, "id")),
        "period_ref": str(_row_get(row, 1, "period_ref")),
        "scope": str(_row_get(row, 2, "scope") or ""),
        "requested_by": str(_row_get(row, 3, "requested_by")),
        "professional_ids_json": _row_get(row, 4, "professional_ids_json"),
    }


def enqueue_repasse_job(
    period_ref: Optional[str] = None,
    requested_by: str = "manual",
    db: Optional["DatabaseManager"] = None,
    initial_status: str = STATUS_PENDING,
    professional_ids: Optional[List[str]] = None,
) -> Dict:
    own_db = db is None
    db_ref = db or DatabaseManager()
    _ensure_repasse_tables(db_ref)

    normalized_period = _normalize_period_ref(period_ref)
    now = _now_iso()
    job_id = uuid.uuid4().hex
    requested = str(requested_by or "manual").strip() or "manual"
    selected_ids = [str(x or "").strip() for x in (professional_ids or []) if str(x or "").strip()]
    selected_json = json.dumps(selected_ids, ensure_ascii=False) if selected_ids else None
    scope = "single" if len(selected_ids) == 1 else ("multi" if len(selected_ids) > 1 else "all")

    db_ref.execute_query(
        """
        INSERT INTO repasse_sync_jobs (
          id, period_ref, scope, professional_ids_json, status, requested_by, started_at, finished_at, error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
        """,
        (
            job_id,
            normalized_period,
            scope,
            selected_json,
            str(initial_status or STATUS_PENDING),
            requested,
            now if str(initial_status or "").upper() == STATUS_RUNNING else None,
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
    now = _now_iso()
    db.execute_query(
        """
        UPDATE repasse_sync_jobs
        SET status = ?, started_at = ?, finished_at = NULL, error = NULL, updated_at = ?
        WHERE id = ?
        """,
        (STATUS_RUNNING, now, now, job_id),
    )


def _mark_job_done(db: "DatabaseManager", job_id: str, status: str, error: str = ""):
    now = _now_iso()
    db.execute_query(
        """
        UPDATE repasse_sync_jobs
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
    now = _now_iso()
    db.execute_query(
        "DELETE FROM repasse_sync_job_items WHERE job_id = ? AND professional_id = ?",
        (job_id, professional_id),
    )
    db.execute_query(
        """
        INSERT INTO repasse_sync_job_items (
          id, job_id, professional_id, professional_name, status, rows_count, total_value,
          error_message, duration_ms, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            hashlib.md5(f"{job_id}:{professional_id}".encode()).hexdigest(),
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
    now = _now_iso()
    conn = db.get_connection()
    try:
        conn.execute(
            """
            UPDATE feegow_repasse_consolidado
            SET is_active = 0, updated_at = ?, last_job_id = ?
            WHERE period_ref = ? AND professional_id = ?
            """,
            (now, job_id, period_ref, professional_id),
        )

        for row in rows:
            hash_base = "|".join(
                [
                    period_ref,
                    professional_id,
                    str(row.get("data_exec") or ""),
                    str(row.get("paciente") or ""),
                    str(row.get("descricao") or ""),
                    str(row.get("funcao") or ""),
                    str(row.get("convenio") or ""),
                    f"{Decimal(row.get('repasse_value') or 0):.2f}",
                ]
            )
            source_hash = hashlib.md5(hash_base.encode("utf-8")).hexdigest()
            row_id = hashlib.md5(f"{job_id}:{source_hash}".encode("utf-8")).hexdigest()
            conn.execute(
                """
                INSERT INTO feegow_repasse_consolidado (
                  id, period_ref, professional_id, professional_name, data_exec, paciente,
                  descricao, funcao, convenio, repasse_value, source_row_hash, is_active,
                  last_job_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(source_row_hash) DO UPDATE SET
                  period_ref = excluded.period_ref,
                  professional_id = excluded.professional_id,
                  professional_name = excluded.professional_name,
                  data_exec = excluded.data_exec,
                  paciente = excluded.paciente,
                  descricao = excluded.descricao,
                  funcao = excluded.funcao,
                  convenio = excluded.convenio,
                  repasse_value = excluded.repasse_value,
                  is_active = 1,
                  last_job_id = excluded.last_job_id,
                  updated_at = excluded.updated_at
                """,
                (
                    row_id,
                    period_ref,
                    professional_id,
                    professional_name,
                    row.get("data_exec") or "",
                    row.get("paciente") or "",
                    row.get("descricao") or "",
                    row.get("funcao") or "",
                    row.get("convenio") or "",
                    float(row.get("repasse_value") or 0),
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


def _build_professional_option_map(page) -> Dict[str, str]:
    options = page.eval_on_selector_all(
        "select#AccountID option",
        """els => els.map(e => ({
            value: (e.value || '').trim(),
            text: (e.textContent || '').trim()
        }))""",
    )

    mapping: Dict[str, str] = {}
    for item in options:
        value = str(item.get("value") or "").strip()
        text = str(item.get("text") or "").strip()
        if not value:
            continue
        name = re.split(r"\s*(?:Â»|»)\s*", text, maxsplit=1)[0].strip()
        if not name:
            continue
        mapping[_normalize_professional_label(name)] = value
    return mapping


def _select_professional(page, option_value: str):
    ok = page.evaluate(
        """
        (value) => {
          const sel = document.querySelector('select#AccountID');
          if (!sel) return false;
          sel.value = value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          if (window.$ && typeof window.$ === 'function') {
            try {
              window.$(sel).trigger('change.select2');
            } catch (e) {}
          }
          return true;
        }
        """,
        option_value,
    )
    if not ok:
        raise RuntimeError("Nao foi possivel selecionar o profissional no filtro.")


def _visible_multiselect_menu(page):
    menus = page.locator("ul.multiselect-container.dropdown-menu")
    total = menus.count()
    for i in range(total):
        menu = menus.nth(i)
        try:
            if menu.is_visible():
                return menu
        except Exception:
            continue
    return None


def _force_select_all_multiselects_via_js(page):
    return page.evaluate(
        """
        () => {
          const out = [];
          const selects = Array.from(document.querySelectorAll('select[multiple]'));
          for (const sel of selects) {
            const options = Array.from(sel.options || []);
            const enabled = options.filter(o => !o.disabled);
            const totalEnabled = enabled.length;
            const before = enabled.filter(o => o.selected).length;

            for (const opt of enabled) opt.selected = true;
            sel.dispatchEvent(new Event('input', { bubbles: true }));
            sel.dispatchEvent(new Event('change', { bubbles: true }));

            try {
              if (window.$ && typeof window.$ === 'function') {
                const $sel = window.$(sel);
                if ($sel && typeof $sel.multiselect === 'function') {
                  try { $sel.multiselect('selectAll', false); } catch (e) {}
                  try { $sel.multiselect('refresh'); } catch (e) {}
                  try { $sel.multiselect('updateButtonText'); } catch (e) {}
                }
                try { $sel.trigger('change'); } catch (e) {}
              }
            } catch (e) {}

            const after = enabled.filter(o => o.selected).length;
            const sample = enabled.slice(0, 4).map(o => String(o.textContent || '').trim());
            out.push({
              id: sel.id || '',
              name: sel.name || '',
              before,
              after,
              total: totalEnabled,
              sample
            });
          }
          return out;
        }
        """
    ) or []


def _select_all_multiselect_filters(page):
    _debug("aplicando multiselects (select all)...")
    # 1) Forca no select base + plugin (mais robusto)
    changed = _force_select_all_multiselects_via_js(page)

    # 2) Reforco pela UI do dropdown (quando existir)
    toggles = page.locator("button.multiselect.dropdown-toggle")
    count = toggles.count()
    if count <= 0:
        return changed

    for i in range(count):
        btn = toggles.nth(i)
        try:
            title = btn.get_attribute("title") or ""
            btn.click()
            page.wait_for_timeout(250)

            menu = _visible_multiselect_menu(page)
            if menu is None:
                page.keyboard.press("Escape")
                page.wait_for_timeout(120)
                continue

            try:
                select_all = menu.get_by_text("Selecionar tudo")
                if select_all.count() > 0:
                    select_all.first.click()
                    page.wait_for_timeout(80)
            except Exception:
                pass

            checkboxes = menu.locator("li:not(.multiselect-filter) input[type='checkbox']")
            total_boxes = checkboxes.count()
            selected_before = 0
            selected_after = 0
            for j in range(total_boxes):
                cb = checkboxes.nth(j)
                try:
                    if cb.is_checked():
                        selected_before += 1
                    else:
                        cb.click()
                except Exception:
                    continue

            for j in range(total_boxes):
                cb = checkboxes.nth(j)
                try:
                    if cb.is_checked():
                        selected_after += 1
                except Exception:
                    continue

            page.keyboard.press("Escape")
            page.wait_for_timeout(120)

            changed.append(
                {
                    "index": i,
                    "title": title.strip(),
                    "before": selected_before,
                    "after": selected_after,
                    "total": total_boxes,
                }
            )
        except Exception:
            try:
                page.keyboard.press("Escape")
            except Exception:
                pass
            continue

    return changed


def _env_csv(name: str, default: str) -> List[str]:
    raw = str(os.getenv(name, default) or "").strip()
    if not raw:
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


def _normalize_option_value(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if raw.startswith("|") and raw.endswith("|"):
        return raw
    raw = raw.strip("|")
    return f"|{raw}|"


def _set_multiselect_values(page, select_id: str, target_values: List[str]) -> Tuple[int, int]:
    selected_count, total_count = page.evaluate(
        """
        ({selectId, values}) => {
          const sel = document.querySelector(`select#${selectId}`);
          if (!sel) return [0, 0];
          const target = new Set((values || []).map(v => String(v).trim()));
          const options = Array.from(sel.options || []).filter(o => !o.disabled);
          for (const opt of options) {
            opt.selected = target.has(String(opt.value || '').trim());
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
          const selected = options.filter(o => o.selected).length;
          return [selected, options.length];
        }
        """,
        {"selectId": select_id, "values": target_values},
    )
    return int(selected_count or 0), int(total_count or 0)


def _select_all_multiselect_values(page, select_id: str) -> Tuple[int, int]:
    values = page.evaluate(
        """
        (selectId) => {
          const sel = document.querySelector(`select#${selectId}`);
          if (!sel) return [];
          return Array.from(sel.options || [])
            .filter(o => !o.disabled)
            .map(o => String(o.value || '').trim());
        }
        """,
        select_id,
    ) or []
    return _set_multiselect_values(page, select_id, values)


def _apply_repasse_filters(page):
    parts: List[str] = []

    # Convenio (Forma): manter todos selecionados.
    conv_selected, conv_total = _select_all_multiselect_values(page, "Forma")
    parts.append(f"Convenios(Forma):{conv_selected}/{conv_total}")

    # Unidades: restringir ao conjunto operacional.
    unit_values = [_normalize_option_value(v) for v in _env_csv("REPASSE_UNIDADES_VALUES", "|0|,|12|,|2|,|3|")]
    unit_values = [v for v in unit_values if v]
    uni_selected, uni_total = _set_multiselect_values(page, "Unidades", unit_values)
    parts.append(f"Unidades:{uni_selected}/{uni_total} -> {','.join(unit_values)}")

    print("Filtros multiselect aplicados:", ", ".join(parts))
    _debug("filtros multiselect aplicados: " + ", ".join(parts))


def _fill_filters(page, date_from_br: str, date_to_br: str):
    _debug(f"iniciando preenchimento de filtros | De={date_from_br} Ate={date_to_br}")
    _debug_read_filter_state(page, "before_fill")
    _apply_repasse_filters(page)

    de_selector = "#De:visible" if page.locator("#De:visible").count() > 0 else "#De"
    ate_selector = "#Ate:visible" if page.locator("#Ate:visible").count() > 0 else "#Ate"

    de_input = page.locator(de_selector).first
    ate_input = page.locator(ate_selector).first

    de_input.click()
    page.keyboard.press("Control+a")
    page.keyboard.type(date_from_br, delay=30)
    de_input.dispatch_event("change")
    page.wait_for_timeout(100)

    ate_input.click()
    page.keyboard.press("Control+a")
    page.keyboard.type(date_to_br, delay=30)
    ate_input.dispatch_event("change")
    page.wait_for_timeout(100)

    ok = page.evaluate(
        """
        ({de, ate}) => {
          const findVisible = (sel) => {
            const all = Array.from(document.querySelectorAll(sel));
            for (const el of all) {
              const style = window.getComputedStyle(el);
              const visible = style && style.display !== 'none' && style.visibility !== 'hidden';
              if (visible) return el;
            }
            return all[0] || null;
          };
          const deEl = findVisible('#De');
          const ateEl = findVisible('#Ate');
          if (deEl) {
            deEl.value = de;
            deEl.dispatchEvent(new Event('input', { bubbles: true }));
            deEl.dispatchEvent(new Event('change', { bubbles: true }));
            deEl.dispatchEvent(new Event('blur', { bubbles: true }));
          }
          if (ateEl) {
            ateEl.value = ate;
            ateEl.dispatchEvent(new Event('input', { bubbles: true }));
            ateEl.dispatchEvent(new Event('change', { bubbles: true }));
            ateEl.dispatchEvent(new Event('blur', { bubbles: true }));
          }
          return {
            okDe: !!deEl,
            okAte: !!ateEl,
            deValue: deEl ? String(deEl.value || '') : '',
            ateValue: ateEl ? String(ateEl.value || '') : '',
          };
        }
        """,
        {"de": date_from_br, "ate": date_to_br},
    )

    page.locator("body").click(force=True)
    page.wait_for_timeout(300)

    if not ok or not ok.get("okDe") or not ok.get("okAte"):
        raise RuntimeError("Nao foi possivel preencher os campos de data do relatorio.")

    if str(ok.get("deValue") or "").strip() != date_from_br or str(ok.get("ateValue") or "").strip() != date_to_br:
        raise RuntimeError(
            f"Datas nao aplicadas corretamente. De='{ok.get('deValue')}' Ate='{ok.get('ateValue')}'"
        )

    print(f"Datas aplicadas: De={date_from_br} Ate={date_to_br}")
    _debug_read_filter_state(page, "after_fill")
    _debug_dump_page(page, "after_fill")


def _click_search(page):
    clicked_locator = None
    for selector in [
        "button.btn.btn-ms.btn-primary:has-text('Buscar')",
        "button.btn.btn-primary:has-text('Buscar')",
        "button:has-text('Buscar')",
    ]:
        try:
            locator = page.locator(selector)
            if locator.count() > 0:
                clicked_locator = locator.first
                break
        except Exception:
            continue

    if clicked_locator is None:
        raise RuntimeError("Botao Buscar nao encontrado na tela de repasses.")

    clicked_locator.click()
    try:
        page.wait_for_load_state("domcontentloaded", timeout=7000)
    except Exception:
        pass

    try:
        page.wait_for_function(
            """
            () => {
              const txt = (document.body && document.body.innerText) ? document.body.innerText : '';
              if (/Nenhum repasse consolidado foi encontrado/i.test(txt)) return true;
              if (/Nenhum registro|No matching records|Sem registros/i.test(txt)) return true;
              if (document.querySelector('#datatableRepasses')) return true;
              if (document.querySelector("table[id*='datatableRepasses'], table[id*='datatable']")) return true;
              return false;
            }
            """,
            timeout=40000,
        )

        page.wait_for_function(
            """
            () => {
              const proc = document.querySelector('#datatableRepasses_processing');
              if (!proc) return true;
              const style = window.getComputedStyle(proc);
              return style.display === 'none' || style.visibility === 'hidden';
            }
            """,
            timeout=15000,
        )
    except Exception:
        _debug_dump_page(page, "search_timeout")
        raise
    page.wait_for_timeout(700)


def _login_feegow(page):
    user = os.getenv("FEEGOW_USER")
    password = os.getenv("FEEGOW_PASS")
    if not user or not password:
        raise RuntimeError("FEEGOW_USER/FEEGOW_PASS nao configurados.")

    login_feegow_app4(page, user, password, logger=_debug if _is_debug_enabled() else print)


def _open_repasse_screen(page):
    _debug("abrindo tela de repasses...")
    try:
        switch_feegow_unit(page, 0, logger=_debug if _is_debug_enabled() else None)
    except Exception:
        pass

    page.goto(REPASSE_URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(800)

    # Alguns ambientes exigem aplicar "alteraUnidade" para liberar os filtros.
    try:
        btn = page.locator("button[onclick*='alteraUnidade']")
        if btn.count() > 0:
            btn.first.click()
            page.wait_for_timeout(500)
    except Exception:
        pass

    try:
        page.wait_for_selector("#De", timeout=30000)
        page.wait_for_selector("#Ate", timeout=30000)
        # Profissional pode estar no select real ou apenas no select2 renderizado.
        page.wait_for_function(
            """
            () => {
              return !!document.querySelector('select#AccountID')
                || !!document.querySelector('#select2-AccountID-container');
            }
            """,
            timeout=30000,
        )
    except Exception:
        _debug_dump_page(page, "open_screen_timeout")
        raise

    _debug_read_filter_state(page, "open_screen")
    _debug_dump_page(page, "open_screen")


def _process_job(job: Dict):
    db = DatabaseManager()
    _ensure_repasse_tables(db)

    job_id = job["id"]
    period_ref = job["period_ref"] or _previous_month_ref()
    date_from_br, date_to_br = _period_to_range(period_ref)
    selected_professional_ids = _parse_professional_ids_json(job.get("professional_ids_json"))
    professionals = _list_selected_active_professionals(db, selected_professional_ids)

    if not professionals:
        _mark_job_done(db, job_id, STATUS_FAILED, "Nenhum profissional ativo encontrado para o escopo do job.")
        db.update_heartbeat(SERVICE_NAME, "ERROR", "Nenhum profissional ativo para processar no escopo.")
        return

    scope_label = "selecionados" if selected_professional_ids else "todos_ativos"
    print(
        f"--- Repasse Consolidado | job={job_id} | periodo={period_ref} | "
        f"profissionais={len(professionals)} | scope={scope_label} ---"
    )
    db.update_heartbeat(
        SERVICE_NAME,
        "RUNNING",
        f"job={job_id} periodo={period_ref} profissionais={len(professionals)} scope={scope_label}",
    )

    any_error = False
    any_success = False

    with sync_playwright() as p:
        headless = str(os.getenv("PLAYWRIGHT_HEADLESS", "1")).strip().lower() in ("1", "true", "yes")
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context()
        page = context.new_page()

        try:
            _login_feegow(page)
            _open_repasse_screen(page)
            _fill_filters(page, date_from_br, date_to_br)
            pause_sec = int(os.getenv("REPASSE_DEBUG_PAUSE_SEC", "0") or "0")
            if _is_debug_enabled() and pause_sec > 0:
                _debug(f"pausa de debug apos filtros: {pause_sec}s")
                time.sleep(pause_sec)
            option_map = _build_professional_option_map(page)

            for idx, (professional_id, professional_name) in enumerate(professionals, start=1):
                started = time.time()
                display_name = professional_name.strip()
                normalized_name = _normalize_professional_label(display_name)
                option_value = option_map.get(normalized_name)

                if not option_value:
                    err = "Profissional nao encontrado no filtro do Feegow."
                    _save_job_item(
                        db,
                        job_id,
                        professional_id,
                        display_name,
                        ITEM_ERROR,
                        0,
                        Decimal("0"),
                        err,
                        int((time.time() - started) * 1000),
                    )
                    any_error = True
                    print(f"[{idx}/{len(professionals)}] ERRO {display_name}: {err}")
                    continue

                try:
                    _select_professional(page, option_value)
                    _click_search(page)
                    rows = _extract_table_rows(page)
                    total_value = sum((row.get("repasse_value") or Decimal("0")) for row in rows)

                    if rows:
                        _upsert_professional_rows(
                            db=db,
                            job_id=job_id,
                            period_ref=period_ref,
                            professional_id=professional_id,
                            professional_name=display_name,
                            rows=rows,
                        )
                        _save_job_item(
                            db,
                            job_id,
                            professional_id,
                            display_name,
                            ITEM_SUCCESS,
                            len(rows),
                            total_value,
                            "",
                            int((time.time() - started) * 1000),
                        )
                        any_success = True
                        print(f"[{idx}/{len(professionals)}] OK {display_name}: linhas={len(rows)} total={float(total_value):.2f}")
                    else:
                        _upsert_professional_rows(
                            db=db,
                            job_id=job_id,
                            period_ref=period_ref,
                            professional_id=professional_id,
                            professional_name=display_name,
                            rows=[],
                        )
                        _save_job_item(
                            db,
                            job_id,
                            professional_id,
                            display_name,
                            ITEM_NO_DATA,
                            0,
                            Decimal("0"),
                            "",
                            int((time.time() - started) * 1000),
                        )
                        any_success = True
                        print(f"[{idx}/{len(professionals)}] NO_DATA {display_name}")
                except PlaywrightTimeoutError as e:
                    err = f"Timeout no scraping: {e}"
                    _save_job_item(
                        db,
                        job_id,
                        professional_id,
                        display_name,
                        ITEM_ERROR,
                        0,
                        Decimal("0"),
                        err,
                        int((time.time() - started) * 1000),
                    )
                    any_error = True
                    print(f"[{idx}/{len(professionals)}] ERRO {display_name}: timeout")
                except Exception as e:
                    err = str(e)
                    _save_job_item(
                        db,
                        job_id,
                        professional_id,
                        display_name,
                        ITEM_ERROR,
                        0,
                        Decimal("0"),
                        err,
                        int((time.time() - started) * 1000),
                    )
                    any_error = True
                    print(f"[{idx}/{len(professionals)}] ERRO {display_name}: {err}")

        finally:
            try:
                context.close()
            except Exception:
                pass
            try:
                browser.close()
            except Exception:
                pass

    if any_error and any_success:
        final_status = STATUS_PARTIAL
        details = f"job={job_id} concluido com parcial"
    elif any_error and not any_success:
        final_status = STATUS_FAILED
        details = f"job={job_id} falhou"
    else:
        final_status = STATUS_COMPLETED
        details = f"job={job_id} concluido"

    _mark_job_done(db, job_id, final_status)
    heartbeat_status = "ERROR" if final_status == STATUS_FAILED else ("WARNING" if final_status == STATUS_PARTIAL else "COMPLETED")
    db.update_heartbeat(SERVICE_NAME, heartbeat_status, details)
    print(f"--- Repasse Consolidado finalizado | job={job_id} | status={final_status} ---")


def process_pending_repasse_jobs_once(
    auto_enqueue_if_empty: bool = False,
    period_ref: Optional[str] = None,
    requested_by: str = "system_status",
    professional_ids: Optional[List[str]] = None,
):
    db = DatabaseManager()
    _ensure_repasse_tables(db)
    preclaimed_job = False
    job = _get_pending_job(db)
    if not job and auto_enqueue_if_empty:
        created_job = enqueue_repasse_job(
            period_ref=period_ref,
            requested_by=requested_by,
            db=db,
            initial_status=STATUS_RUNNING,
            professional_ids=professional_ids,
        )
        print(
            f"📝 Job de repasse criado automaticamente | id={created_job['id']} | "
            f"periodo={created_job['period_ref']} | "
            f"profissionais={len(professional_ids) if professional_ids else 'todos'}"
        )
        job = {
            "id": created_job["id"],
            "period_ref": created_job["period_ref"],
            "scope": created_job.get("scope") or "",
            "requested_by": created_job["requested_by"],
            "professional_ids_json": created_job.get("professional_ids_json"),
        }
        preclaimed_job = True

    if not job:
        db.update_heartbeat(SERVICE_NAME, "COMPLETED", "Sem jobs pendentes")
        return False

    if not preclaimed_job:
        _mark_job_running(db, job["id"])
    try:
        _process_job(job)
    except Exception as e:
        _mark_job_done(db, job["id"], STATUS_FAILED, str(e))
        db.update_heartbeat(SERVICE_NAME, "ERROR", f"job={job['id']} erro={e}")
        print(f"❌ Erro fatal no job {job['id']}: {e}")
    return True


def run_repasse_sync_loop():
    poll_interval = max(10, int(os.getenv("REPASSE_SYNC_POLL_SEC", "30")))
    print(f"📦 Worker Repasse Sync iniciado. poll={poll_interval}s")
    while True:
        try:
            process_pending_repasse_jobs_once()
        except Exception as e:
            try:
                db = DatabaseManager()
                db.update_heartbeat(SERVICE_NAME, "ERROR", f"loop_error={e}")
            except Exception:
                pass
            print(f"⚠️ Loop repasse_sync erro: {e}")
        time.sleep(poll_interval)


if __name__ == "__main__":
    args = sys.argv[1:]

    period_arg = None
    requested_by_arg = "manual_cli"
    professional_ids_arg: List[str] = []
    for i, token in enumerate(args):
        if token.startswith("--period="):
            period_arg = token.split("=", 1)[1].strip()
        elif token == "--period" and i + 1 < len(args):
            period_arg = str(args[i + 1] or "").strip()
        elif token.startswith("--requested-by="):
            requested_by_arg = token.split("=", 1)[1].strip() or "manual_cli"
        elif token == "--requested-by" and i + 1 < len(args):
            requested_by_arg = str(args[i + 1] or "").strip() or "manual_cli"
        elif token.startswith("--professional-ids="):
            raw_ids = token.split("=", 1)[1].strip()
            professional_ids_arg = [x.strip() for x in raw_ids.split(",") if x.strip()]
        elif token == "--professional-ids" and i + 1 < len(args):
            raw_ids = str(args[i + 1] or "").strip()
            professional_ids_arg = [x.strip() for x in raw_ids.split(",") if x.strip()]

    if "--enqueue" in args:
        job = enqueue_repasse_job(
            period_ref=period_arg,
            requested_by=requested_by_arg,
            professional_ids=professional_ids_arg,
        )
        print(f"Job enfileirado: id={job['id']} periodo={job['period_ref']} requested_by={job['requested_by']}")
        if "--once" in args:
            process_pending_repasse_jobs_once()
        sys.exit(0)

    if "--once" in args:
        had_job = process_pending_repasse_jobs_once(
            auto_enqueue_if_empty=bool(period_arg or professional_ids_arg),
            period_ref=period_arg,
            requested_by=requested_by_arg,
            professional_ids=professional_ids_arg,
        )
        if not had_job:
            print("Sem jobs pendentes.")
        sys.exit(0)

    run_repasse_sync_loop()
