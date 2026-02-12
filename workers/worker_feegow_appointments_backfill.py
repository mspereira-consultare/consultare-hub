import os
import re
import sys
import json
import time
import argparse
import calendar
import datetime
from urllib.parse import urlparse, unquote, parse_qs

import pymysql
import requests
from dotenv import load_dotenv


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))
load_dotenv(os.path.join(BASE_DIR, ".env.local"))

API_URL = "https://api.feegow.com/v1/api/appoints/search"


def is_lost_connection_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    if "lost connection to mysql server" in msg:
        return True
    if "mysql server has gone away" in msg:
        return True
    if "connection was killed" in msg:
        return True
    if hasattr(exc, "args") and exc.args:
        code = exc.args[0]
        if code in (2006, 2013):
            return True
    return False


def resolve_mysql_url() -> str:
    internal = str(os.getenv("MYSQL_URL", "")).strip()
    public = str(os.getenv("MYSQL_PUBLIC_URL", "")).strip()
    if not internal and public:
        return public
    if not internal:
        return ""
    try:
        host = (urlparse(internal).hostname or "").lower()
        is_internal = host.endswith(".railway.internal")
        if is_internal and public:
            print("Host interno detectado fora do Railway. Usando MYSQL_PUBLIC_URL.")
            return public
    except Exception:
        pass
    return internal


def parse_mysql_url(raw_url: str, use_ssl: bool) -> dict:
    parsed = urlparse(raw_url)
    if not parsed.scheme.lower().startswith("mysql"):
        raise RuntimeError("MYSQL_URL invalida: use mysql://...")
    qs = parse_qs(parsed.query or "")
    if "sslmode" in qs:
        mode = str((qs.get("sslmode", [""])[0] or "")).lower()
        if mode in ("disable", "false", "0"):
            use_ssl = False
    cfg = {
        "host": parsed.hostname,
        "port": int(parsed.port or 3306),
        "user": unquote(parsed.username or ""),
        "password": unquote(parsed.password or ""),
        "database": unquote((parsed.path or "").lstrip("/")),
        "charset": "utf8mb4",
        "autocommit": False,
        "connect_timeout": int(os.getenv("MYSQL_CONNECT_TIMEOUT_SEC", "20")),
        "read_timeout": int(os.getenv("MYSQL_READ_TIMEOUT_SEC", "120")),
        "write_timeout": int(os.getenv("MYSQL_WRITE_TIMEOUT_SEC", "120")),
        "cursorclass": pymysql.cursors.Cursor,
    }
    if use_ssl:
        cfg["ssl"] = {}
    return cfg


def mysql_operation(mysql_cfg: dict, action_name: str, fn, retries: int = 6):
    last_exc = None
    for attempt in range(1, retries + 1):
        conn = None
        try:
            conn = pymysql.connect(**mysql_cfg)
            out = fn(conn)
            return out
        except Exception as e:
            last_exc = e
            retryable = is_lost_connection_error(e) and attempt < retries
            if not retryable:
                raise
            wait_sec = min(30, attempt * 2)
            print(
                f"[WARN] {action_name} falhou ({attempt}/{retries}): {e}. "
                f"Retry em {wait_sec}s..."
            )
            time.sleep(wait_sec)
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass
    raise last_exc


def ensure_tables(mysql_cfg: dict):
    def _op(conn):
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS feegow_appointments (
                    appointment_id BIGINT PRIMARY KEY,
                    date DATE NULL,
                    status_id INT NULL,
                    value DECIMAL(14,2) NULL,
                    specialty VARCHAR(191) NULL,
                    professional_name VARCHAR(191) NULL,
                    procedure_group VARCHAR(191) NULL,
                    scheduled_by VARCHAR(191) NULL,
                    unit_name VARCHAR(191) NULL,
                    scheduled_at VARCHAR(50) NULL,
                    updated_at DATETIME NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS feegow_appointments_backfill_checkpoint (
                    year INT NOT NULL,
                    month INT NOT NULL,
                    from_date DATE NULL,
                    to_date DATE NULL,
                    rows_saved INT NULL,
                    completed_at DATETIME NULL,
                    PRIMARY KEY (year, month)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
        conn.commit()

    mysql_operation(mysql_cfg, "ensure tables", _op)


def get_existing_range(mysql_cfg: dict):
    def _op(conn):
        with conn.cursor() as cur:
            cur.execute("SELECT MIN(date), MAX(date), COUNT(1) FROM feegow_appointments")
            return cur.fetchone()

    row = mysql_operation(mysql_cfg, "get existing range", _op)
    if not row:
        return "", "", 0
    return (str(row[0] or ""), str(row[1] or ""), int(row[2] or 0))


def get_completed_months(mysql_cfg: dict):
    def _op(conn):
        with conn.cursor() as cur:
            cur.execute("SELECT year, month FROM feegow_appointments_backfill_checkpoint")
            return cur.fetchall()

    rows = mysql_operation(mysql_cfg, "get checkpoint", _op)
    return {(int(r[0]), int(r[1])) for r in rows}


def mark_month_completed(
    mysql_cfg: dict,
    year: int,
    month: int,
    from_date: datetime.date,
    to_date: datetime.date,
    rows_saved: int,
):
    sql = """
        INSERT INTO feegow_appointments_backfill_checkpoint
        (year, month, from_date, to_date, rows_saved, completed_at)
        VALUES (%s, %s, %s, %s, %s, NOW())
        ON DUPLICATE KEY UPDATE
            from_date = VALUES(from_date),
            to_date = VALUES(to_date),
            rows_saved = VALUES(rows_saved),
            completed_at = VALUES(completed_at)
    """

    def _op(conn):
        with conn.cursor() as cur:
            cur.execute(
                sql,
                (
                    int(year),
                    int(month),
                    from_date.strftime("%Y-%m-%d"),
                    to_date.strftime("%Y-%m-%d"),
                    int(rows_saved),
                ),
            )
        conn.commit()

    mysql_operation(mysql_cfg, f"checkpoint {month:02d}/{year}", _op)


def api_headers():
    token = str(os.getenv("FEEGOW_ACCESS_TOKEN", "")).strip()
    if not token:
        raise RuntimeError("FEEGOW_ACCESS_TOKEN nao configurado.")
    return {"x-access-token": token, "Content-Type": "application/json"}


def fetch_month(start_date: datetime.date, end_date: datetime.date) -> list:
    payload = {
        "data_start": start_date.strftime("%d-%m-%Y"),
        "data_end": end_date.strftime("%d-%m-%Y"),
        "list_procedures": 0,
    }

    for attempt in range(1, 6):
        try:
            res = requests.get(API_URL, headers=api_headers(), json=payload, timeout=120)
            if res.status_code >= 400:
                raise RuntimeError(f"HTTP {res.status_code}: {res.text[:220]}")
            body = res.json()
            if not body.get("success", False):
                raise RuntimeError(f"API success=false: {body}")
            content = body.get("content", [])
            if not isinstance(content, list):
                return []
            return content
        except Exception as e:
            if attempt >= 5:
                raise
            wait_sec = attempt * 2
            print(f"[WARN] API falhou ({attempt}/5): {e}. Retry em {wait_sec}s...")
            time.sleep(wait_sec)
    return []


def clean_currency(value_str) -> float:
    if value_str is None:
        return 0.0
    if isinstance(value_str, (int, float)):
        return float(value_str)
    s = str(value_str).strip()
    if not s:
        return 0.0
    s = s.replace("R$", "").replace(" ", "").replace(".", "").replace(",", ".")
    try:
        return float(s)
    except Exception:
        return 0.0


def normalize_date(raw) -> str:
    if raw is None:
        return ""
    s = str(raw).strip()
    if not s:
        return ""
    # dd-mm-yyyy or dd/mm/yyyy
    if re.match(r"^\d{2}[-/]\d{2}[-/]\d{4}$", s):
        d, m, y = re.split(r"[-/]", s)
        return f"{y}-{m}-{d}"
    # yyyy-mm-dd
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return s
    return ""


def parse_rows(api_rows: list) -> list:
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    valid_statuses = {1, 2, 3, 4, 6, 7, 11, 15, 16, 22}
    out = []

    for r in api_rows:
        app_id = int(r.get("agendamento_id") or r.get("id") or 0)
        if app_id <= 0:
            continue

        raw_status = r.get("status_id", r.get("status", 0))
        try:
            status_id = int(raw_status or 0)
        except Exception:
            status_id = 0
        if status_id not in valid_statuses:
            continue

        dt = normalize_date(r.get("data") or r.get("data_agendamento"))
        if not dt:
            continue

        out.append(
            (
                app_id,
                dt,
                status_id,
                clean_currency(r.get("valor") or r.get("valor_total_agendamento")),
                str(r.get("especialidade") or r.get("nome_especialidade") or "Geral"),
                str(r.get("nome_profissional") or r.get("profissional") or "Desconhecido"),
                str(
                    r.get("procedure_group")
                    or r.get("nome_grupo")
                    or r.get("grupo_procedimento")
                    or "Geral"
                ),
                str(r.get("agendado_por") or r.get("scheduled_by") or "Sis"),
                str(r.get("nome_fantasia") or r.get("unidade_nome") or r.get("unidade") or "Matriz"),
                str(r.get("agendado_em") or r.get("scheduled_at") or ""),
                now,
            )
        )
    return out


UPSERT_SQL = """
    INSERT INTO feegow_appointments (
        appointment_id, date, status_id, value,
        specialty, professional_name, procedure_group,
        scheduled_by, unit_name, scheduled_at, updated_at
    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON DUPLICATE KEY UPDATE
        date = VALUES(date),
        status_id = VALUES(status_id),
        value = VALUES(value),
        specialty = VALUES(specialty),
        professional_name = VALUES(professional_name),
        procedure_group = VALUES(procedure_group),
        scheduled_by = VALUES(scheduled_by),
        unit_name = VALUES(unit_name),
        scheduled_at = VALUES(scheduled_at),
        updated_at = VALUES(updated_at)
"""


def save_rows_month(mysql_cfg: dict, rows: list):
    if not rows:
        return

    chunk_size = max(10, int(os.getenv("FEEGOW_BACKFILL_DB_CHUNK", "50")))
    total_chunks = (len(rows) + chunk_size - 1) // chunk_size

    for chunk_idx, i in enumerate(range(0, len(rows), chunk_size), start=1):
        chunk = rows[i : i + chunk_size]

        def _save_chunk(conn):
            with conn.cursor() as cur:
                cur.executemany(UPSERT_SQL, chunk)
            conn.commit()

        try:
            mysql_operation(
                mysql_cfg,
                f"insert chunk {chunk_idx}/{total_chunks}",
                _save_chunk,
                retries=6,
            )
        except Exception as chunk_err:
            print(
                f"[WARN] chunk {chunk_idx}/{total_chunks} falhou em batch ({chunk_err}). "
                "Fallback linha a linha..."
            )
            for row_idx, row in enumerate(chunk, start=1):
                def _save_single(conn):
                    with conn.cursor() as cur:
                        cur.execute(UPSERT_SQL, row)
                    conn.commit()

                mysql_operation(
                    mysql_cfg,
                    f"insert row {row_idx}/{len(chunk)} do chunk {chunk_idx}/{total_chunks}",
                    _save_single,
                    retries=6,
                )

        if chunk_idx % 10 == 0 or chunk_idx == total_chunks:
            print(f"   [SAVE] chunks gravados: {chunk_idx}/{total_chunks}")


def month_start(d: datetime.date) -> datetime.date:
    return datetime.date(d.year, d.month, 1)


def month_end(d: datetime.date) -> datetime.date:
    last = calendar.monthrange(d.year, d.month)[1]
    return datetime.date(d.year, d.month, last)


def next_month(d: datetime.date) -> datetime.date:
    if d.month == 12:
        return datetime.date(d.year + 1, 1, 1)
    return datetime.date(d.year, d.month + 1, 1)


def parse_args():
    parser = argparse.ArgumentParser(description="Backfill local de feegow_appointments (mensal).")
    parser.add_argument("--start", default="2022-01-01", help="Data inicial YYYY-MM-DD")
    parser.add_argument("--end", default="2025-12-31", help="Data final YYYY-MM-DD")
    args = parser.parse_args()
    try:
        start = datetime.datetime.strptime(args.start, "%Y-%m-%d").date()
        end = datetime.datetime.strptime(args.end, "%Y-%m-%d").date()
    except ValueError as e:
        raise SystemExit(f"Datas invalidas: {e}")
    if end < start:
        raise SystemExit("Data final nao pode ser menor que data inicial.")
    return start, end


def run_backfill(start_date: datetime.date, end_date: datetime.date):
    print(f"--- Backfill Feegow Appointments (Local): {datetime.datetime.now().strftime('%H:%M:%S')} ---")

    raw_url = resolve_mysql_url()
    if not raw_url:
        raise RuntimeError("MYSQL_URL/MYSQL_PUBLIC_URL nao configuradas.")

    force_ssl_env = str(os.getenv("MYSQL_FORCE_SSL", "")).strip().lower()
    use_ssl = force_ssl_env not in ("0", "false", "no")
    mysql_cfg = parse_mysql_url(raw_url, use_ssl=use_ssl)

    print(
        f"[DB] MYSQL: {mysql_cfg.get('host')}:{mysql_cfg.get('port')}/{mysql_cfg.get('database')} "
        f"| ssl={'on' if 'ssl' in mysql_cfg else 'off'}"
    )

    try:
        ensure_tables(mysql_cfg)
    except Exception as e:
        if is_lost_connection_error(e) and "ssl" in mysql_cfg:
            print("[WARN] Falha inicial com SSL. Recriando conexao com SSL off...")
            mysql_cfg.pop("ssl", None)
            ensure_tables(mysql_cfg)
        else:
            raise

    min_d, max_d, total = get_existing_range(mysql_cfg)
    print(f"[INFO] Faixa atual: min={min_d or '-'} max={max_d or '-'} total={total}")
    print(f"[INFO] Backfill alvo: {start_date} -> {end_date}")

    completed = get_completed_months(mysql_cfg)
    cursor = month_start(start_date)
    total_saved = 0

    while cursor <= end_date:
        win_start = month_start(cursor)
        win_end = min(month_end(cursor), end_date)
        y, m = win_start.year, win_start.month
        label = f"{m:02d}/{y}"

        if (y, m) in completed:
            print(f"[SKIP] {label} ja concluido no checkpoint. Pulando.")
            cursor = next_month(cursor)
            continue

        print(
            f"\n[MONTH] {label}: {win_start.strftime('%d/%m/%Y')} ate {win_end.strftime('%d/%m/%Y')}"
        )
        t0 = time.time()
        api_rows = fetch_month(win_start, win_end)
        rows = parse_rows(api_rows)
        print(f"[API] linhas: {len(api_rows)} | validas para salvar: {len(rows)}")

        if rows:
            save_rows_month(mysql_cfg, rows)
            total_saved += len(rows)

        mark_month_completed(mysql_cfg, y, m, win_start, win_end, len(rows))
        elapsed = round(time.time() - t0, 1)
        print(f"[OK] Mes {label} concluido em {elapsed}s")

        cursor = next_month(cursor)

    print(f"\n[DONE] Backfill finalizado. Registros salvos: {total_saved}")


if __name__ == "__main__":
    s, e = parse_args()
    run_backfill(s, e)
