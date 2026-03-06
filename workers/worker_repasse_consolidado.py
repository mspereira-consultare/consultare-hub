import os
import sys
import time
import re
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
except ImportError:
    DatabaseManager = None


BASE_URL = "https://franchising.feegow.com"
LOGIN_URL = f"{BASE_URL}/main/?P=Login&U=&Partner=&qs="
CHANGE_UNIT_URL = f"{BASE_URL}/v8.1/?P=MudaLocal&Pers=1&MudaLocal=0"
REPASSE_URL = f"{BASE_URL}/v8.1/?P=RepassesConferidos&Pers=1"
REPORT_SOURCE_URL = "https://franchising.feegow.com/v8.1/?P=RepassesConferidos&Pers="

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
    content = page.content()
    soup = BeautifulSoup(content, "html.parser")
    table = soup.find("table", {"id": "datatableRepasses"})
    if not table:
        raise RuntimeError("Tabela datatableRepasses nao encontrada.")

    header_cells = table.select("thead th")
    headers = [re.sub(r"\s+", " ", th.get_text(" ", strip=True)) for th in header_cells]
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

    parsed_rows: List[Dict] = []
    for tr in table.select("tbody tr"):
        if tr.select_one("td.dataTables_empty"):
            continue
        tds = tr.find_all("td")
        if not tds:
            continue
        def _cell(i: int) -> str:
            if i < 0 or i >= len(tds):
                return ""
            return re.sub(r"\s+", " ", tds[i].get_text(" ", strip=True)).strip()

        parsed_rows.append(
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
    return parsed_rows


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


def _get_pending_job(db: "DatabaseManager") -> Optional[Dict]:
    rows = db.execute_query(
        """
        SELECT id, period_ref, requested_by
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
        "requested_by": str(_row_get(row, 2, "requested_by")),
    }


def enqueue_repasse_job(
    period_ref: Optional[str] = None,
    requested_by: str = "manual",
    db: Optional["DatabaseManager"] = None,
) -> Dict:
    own_db = db is None
    db_ref = db or DatabaseManager()
    _ensure_repasse_tables(db_ref)

    normalized_period = _normalize_period_ref(period_ref)
    now = _now_iso()
    job_id = uuid.uuid4().hex
    requested = str(requested_by or "manual").strip() or "manual"

    db_ref.execute_query(
        """
        INSERT INTO repasse_sync_jobs (
          id, period_ref, status, requested_by, started_at, finished_at, error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
        """,
        (job_id, normalized_period, STATUS_PENDING, requested, now, now),
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

    return {"id": job_id, "period_ref": normalized_period, "requested_by": requested}


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
        name = text.split("»")[0].strip()
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


def _fill_filters(page, date_from_br: str, date_to_br: str):
    page.fill("#De", date_from_br)
    page.fill("#Ate", date_to_br)


def _click_search(page):
    page.locator("button.btn.btn-ms.btn-primary", has_text="Buscar").first.click()
    page.wait_for_selector("#datatableRepasses", timeout=20000)
    page.wait_for_timeout(800)


def _login_feegow(page):
    user = os.getenv("FEEGOW_USER")
    password = os.getenv("FEEGOW_PASS")
    if not user or not password:
        raise RuntimeError("FEEGOW_USER/FEEGOW_PASS nao configurados.")

    page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=60000)
    page.fill("input[name='User']", user)
    page.fill("input[name='password']", password)
    page.locator("button[name='btnLogar']").first.click()
    page.wait_for_timeout(1200)

    if "login" in page.url.lower():
        raise RuntimeError("Falha no login Feegow (permaneceu na tela de login).")


def _open_repasse_screen(page):
    page.goto(CHANGE_UNIT_URL, wait_until="domcontentloaded", timeout=60000)
    page.goto(REPASSE_URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_selector("select#AccountID", timeout=20000)
    page.wait_for_selector("#De", timeout=20000)
    page.wait_for_selector("#Ate", timeout=20000)
    page.wait_for_selector("#datatableRepasses", timeout=20000)


def _process_job(job: Dict):
    db = DatabaseManager()
    _ensure_repasse_tables(db)

    job_id = job["id"]
    period_ref = job["period_ref"] or _previous_month_ref()
    date_from_br, date_to_br = _period_to_range(period_ref)
    professionals = _list_active_professionals(db)

    if not professionals:
        _mark_job_done(db, job_id, STATUS_FAILED, "Nenhum profissional ativo encontrado.")
        db.update_heartbeat(SERVICE_NAME, "ERROR", "Nenhum profissional ativo para processar.")
        return

    print(f"--- Repasse Consolidado | job={job_id} | periodo={period_ref} | profissionais={len(professionals)} ---")
    db.update_heartbeat(SERVICE_NAME, "RUNNING", f"job={job_id} periodo={period_ref} profissionais={len(professionals)}")

    any_error = False
    any_success = False

    with sync_playwright() as p:
        headless = str(os.getenv("PLAYWRIGHT_HEADLESS", "1")).strip().lower() in ("1", "true", "yes")
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        try:
            _login_feegow(page)
            _open_repasse_screen(page)
            _fill_filters(page, date_from_br, date_to_br)
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
):
    db = DatabaseManager()
    _ensure_repasse_tables(db)
    job = _get_pending_job(db)
    if not job and auto_enqueue_if_empty:
        created_job = enqueue_repasse_job(period_ref=period_ref, requested_by=requested_by, db=db)
        print(
            f"📝 Job de repasse criado automaticamente | id={created_job['id']} | "
            f"periodo={created_job['period_ref']}"
        )
        job = _get_pending_job(db)

    if not job:
        db.update_heartbeat(SERVICE_NAME, "COMPLETED", "Sem jobs pendentes")
        return False

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
    for i, token in enumerate(args):
        if token.startswith("--period="):
            period_arg = token.split("=", 1)[1].strip()
        elif token == "--period" and i + 1 < len(args):
            period_arg = str(args[i + 1] or "").strip()
        elif token.startswith("--requested-by="):
            requested_by_arg = token.split("=", 1)[1].strip() or "manual_cli"
        elif token == "--requested-by" and i + 1 < len(args):
            requested_by_arg = str(args[i + 1] or "").strip() or "manual_cli"

    if "--enqueue" in args:
        job = enqueue_repasse_job(period_ref=period_arg, requested_by=requested_by_arg)
        print(f"Job enfileirado: id={job['id']} periodo={job['period_ref']} requested_by={job['requested_by']}")
        if "--once" in args:
            process_pending_repasse_jobs_once()
        sys.exit(0)

    if "--once" in args:
        had_job = process_pending_repasse_jobs_once(
            auto_enqueue_if_empty=bool(period_arg),
            period_ref=period_arg,
            requested_by=requested_by_arg,
        )
        if not had_job:
            print("Sem jobs pendentes.")
        sys.exit(0)

    run_repasse_sync_loop()
