import time
import os
import sys
import datetime
import calendar
import hashlib
import argparse
from io import StringIO

import pandas as pd
from playwright.sync_api import sync_playwright

# --- SETUP DE IMPORTS ---
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database_manager import DatabaseManager
except ImportError:
    DatabaseManager = None

from worker_faturamento_scraping import (
    clean_column_name,
    clean_currency,
    remove_total_pago_outliers,
    save_dataframe_to_db,
    update_faturamento_summary,
)

def _ensure_mysql_index(conn, table_name, index_name, index_cols_sql):
    rows = conn.execute(
        """
        SELECT COUNT(1)
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = %s
          AND index_name = %s
        """,
        (table_name, index_name),
    )
    count = None
    if hasattr(rows, "fetchone"):
        count = rows.fetchone()[0]
    else:
        fetched = list(rows)
        if fetched:
            count = fetched[0][0]
    if not count:
        conn.execute(f"CREATE INDEX {index_name} ON {table_name} ({index_cols_sql})")

def _mysql_pk_has_column(conn, table_name, column_name):
    rows = conn.execute(
        """
        SELECT COLUMN_NAME
        FROM information_schema.key_column_usage
        WHERE table_schema = DATABASE()
          AND table_name = %s
          AND constraint_name = 'PRIMARY'
        """,
        (table_name,),
    )
    if hasattr(rows, "fetchall"):
        all_rows = rows.fetchall()
    else:
        all_rows = list(rows)
    cols = []
    for row in all_rows:
        if isinstance(row, (tuple, list)):
            cols.append(row[0])
        else:
            cols.append(row.get("COLUMN_NAME"))
    return column_name in cols

def _ensure_mysql_procedure_key(conn, table_name, pk_cols_sql):
    try:
        conn.execute(
            f"""
            ALTER TABLE {table_name}
            ADD COLUMN procedimento_key VARCHAR(32) NOT NULL DEFAULT ''
            """
        )
    except Exception:
        pass
    try:
        conn.execute(
            f"""
            UPDATE {table_name}
            SET procedimento_key = MD5(COALESCE(TRIM(procedimento), ''))
            WHERE procedimento_key IS NULL OR procedimento_key = ''
            """
        )
    except Exception:
        pass
    try:
        if not _mysql_pk_has_column(conn, table_name, "procedimento_key"):
            conn.execute(f"ALTER TABLE {table_name} DROP PRIMARY KEY")
            conn.execute(f"ALTER TABLE {table_name} ADD PRIMARY KEY ({pk_cols_sql})")
    except Exception:
        pass

def _select_usuario_da_conta_column(page):
    last_err = None
    for _attempt in range(3):
        try:
            page.wait_for_selector('[title="Definir colunas"]', state="visible", timeout=10000)
            page.locator('[title="Definir colunas"]').first.click()
            time.sleep(0.5)
            try:
                checkbox = page.locator("input[type='checkbox'][name='Colunas'][value='|162|']")
                if checkbox.count() > 0:
                    checkbox.first.scroll_into_view_if_needed()
                    if not checkbox.first.is_checked():
                        checkbox.first.check(force=True)
            except Exception:
                pass

            page.evaluate(
                """
                () => {
                  const inputs = Array.from(document.querySelectorAll("input[type='checkbox'][name='Colunas']"));
                  const target = inputs.find(i => i.value === '|162|') || inputs.find(i => {
                    const label = i.closest('label')?.innerText?.toLowerCase() || i.parentElement?.innerText?.toLowerCase() || '';
                    return label.includes('usuario da conta') || label.includes('usuário da conta');
                  });
                  if (!target) return false;
                  target.checked = true;
                  target.dispatchEvent(new Event('change', { bubbles: true }));
                  return true;
                }
                """
            )

            page.locator(".btn.btn-primary.btn-block").filter(has_text="Selecionar").first.click()
            page.wait_for_selector("#table-resultado tbody tr", timeout=30000)
            return True
        except Exception as e:
            last_err = e
            try:
                page.keyboard.press("Escape")
            except Exception:
                pass
            time.sleep(1)
    raise last_err

def ensure_checkpoint_table(db):
    conn = db.get_connection()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS faturamento_backfill_checkpoint (
                year INTEGER NOT NULL,
                month INTEGER NOT NULL,
                completed_at TEXT,
                PRIMARY KEY (year, month)
            )
        """)
        if not db.use_turso:
            conn.commit()
    finally:
        conn.close()

def get_completed_months(db, year):
    conn = db.get_connection()
    try:
        rows = conn.execute(
            "SELECT month FROM faturamento_backfill_checkpoint WHERE year = ?",
            (year,)
        )
        if hasattr(rows, 'fetchall'):
            raw = rows.fetchall()
        else:
            raw = list(rows)
        months = set()
        for row in raw:
            if isinstance(row, dict):
                m = row.get("month")
            elif hasattr(row, '__getitem__'):
                m = row[0]
            else:
                m = None
            if m is not None:
                months.add(int(m))
        return months
    finally:
        conn.close()

def mark_month_completed(db, year, month):
    conn = db.get_connection()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO faturamento_backfill_checkpoint (year, month, completed_at) VALUES (?, ?, datetime('now'))",
            (year, month)
        )
        if not db.use_turso:
            conn.commit()
    finally:
        conn.close()

def ensure_summary_tables(db):
    conn = db.get_connection()
    try:
        if db.use_mysql:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS faturamento_resumo_diario (
                    data_ref VARCHAR(191) NOT NULL,
                    unidade VARCHAR(191) NOT NULL,
                    grupo VARCHAR(191) NOT NULL,
                    procedimento VARCHAR(191) NOT NULL,
                    procedimento_key VARCHAR(32) NOT NULL DEFAULT '',
                    total_pago DOUBLE,
                    qtd INTEGER,
                    updated_at TEXT,
                    PRIMARY KEY (data_ref, unidade, grupo, procedimento_key)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            _ensure_mysql_procedure_key(
                conn,
                "faturamento_resumo_diario",
                "data_ref, unidade, grupo, procedimento_key",
            )
            _ensure_mysql_index(
                conn,
                "faturamento_resumo_diario",
                "idx_fat_resumo_diario_data",
                "data_ref",
            )
            _ensure_mysql_index(
                conn,
                "faturamento_resumo_diario",
                "idx_fat_resumo_diario_unidade",
                "unidade",
            )
            _ensure_mysql_index(
                conn,
                "faturamento_resumo_diario",
                "idx_fat_resumo_diario_grupo",
                "grupo",
            )
            _ensure_mysql_index(
                conn,
                "faturamento_resumo_diario",
                "idx_fat_resumo_diario_proc",
                "procedimento",
            )
            _ensure_mysql_index(
                conn,
                "faturamento_resumo_diario",
                "idx_fat_resumo_diario_data_unidade",
                "data_ref, unidade",
            )
            _ensure_mysql_index(
                conn,
                "faturamento_resumo_diario",
                "idx_fat_resumo_diario_data_grupo",
                "data_ref, grupo",
            )

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS faturamento_resumo_mensal (
                    month_ref VARCHAR(191) NOT NULL,
                    unidade VARCHAR(191) NOT NULL,
                    grupo VARCHAR(191) NOT NULL,
                    procedimento VARCHAR(191) NOT NULL,
                    procedimento_key VARCHAR(32) NOT NULL DEFAULT '',
                    total_pago DOUBLE,
                    qtd INTEGER,
                    updated_at TEXT,
                    PRIMARY KEY (month_ref, unidade, grupo, procedimento_key)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            _ensure_mysql_procedure_key(
                conn,
                "faturamento_resumo_mensal",
                "month_ref, unidade, grupo, procedimento_key",
            )
            _ensure_mysql_index(
                conn,
                "faturamento_resumo_mensal",
                "idx_fat_resumo_mensal_month",
                "month_ref",
            )
            _ensure_mysql_index(
                conn,
                "faturamento_resumo_mensal",
                "idx_fat_resumo_mensal_unidade",
                "unidade",
            )
            _ensure_mysql_index(
                conn,
                "faturamento_resumo_mensal",
                "idx_fat_resumo_mensal_grupo",
                "grupo",
            )
            _ensure_mysql_index(
                conn,
                "faturamento_resumo_mensal",
                "idx_fat_resumo_mensal_proc",
                "procedimento",
            )
            _ensure_mysql_index(
                conn,
                "faturamento_resumo_mensal",
                "idx_fat_resumo_mensal_month_unidade",
                "month_ref, unidade",
            )
            _ensure_mysql_index(
                conn,
                "faturamento_resumo_mensal",
                "idx_fat_resumo_mensal_month_grupo",
                "month_ref, grupo",
            )
        else:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS faturamento_resumo_diario (
                    data_ref TEXT NOT NULL,
                    unidade TEXT NOT NULL,
                    grupo TEXT NOT NULL,
                    procedimento TEXT NOT NULL,
                    total_pago REAL,
                    qtd INTEGER,
                    updated_at TEXT,
                    PRIMARY KEY (data_ref, unidade, grupo, procedimento)
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_diario_data ON faturamento_resumo_diario(data_ref)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_diario_unidade ON faturamento_resumo_diario(unidade)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_diario_grupo ON faturamento_resumo_diario(grupo)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_diario_proc ON faturamento_resumo_diario(procedimento)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_diario_data_unidade ON faturamento_resumo_diario(data_ref, unidade)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_diario_data_grupo ON faturamento_resumo_diario(data_ref, grupo)")

            conn.execute("""
                CREATE TABLE IF NOT EXISTS faturamento_resumo_mensal (
                    month_ref TEXT NOT NULL,
                    unidade TEXT NOT NULL,
                    grupo TEXT NOT NULL,
                    procedimento TEXT NOT NULL,
                    total_pago REAL,
                    qtd INTEGER,
                    updated_at TEXT,
                    PRIMARY KEY (month_ref, unidade, grupo, procedimento)
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_mensal_month ON faturamento_resumo_mensal(month_ref)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_mensal_unidade ON faturamento_resumo_mensal(unidade)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_mensal_grupo ON faturamento_resumo_mensal(grupo)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_mensal_proc ON faturamento_resumo_mensal(procedimento)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_mensal_month_unidade ON faturamento_resumo_mensal(month_ref, unidade)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_mensal_month_grupo ON faturamento_resumo_mensal(month_ref, grupo)")
        if not db.use_turso:
            conn.commit()
    finally:
        conn.close()

def build_summary_parts(df, col_data, use_mysql=False):
    def safe_col(name):
        if name not in df.columns:
            return ""
        return df[name].fillna("")

    base = pd.DataFrame({
        "data_ref": df[col_data].astype(str),
        "unidade": safe_col("unidade"),
        "grupo": safe_col("grupo"),
        "procedimento": safe_col("procedimento"),
        "total_pago": pd.to_numeric(df.get("total_pago", 0), errors="coerce").fillna(0),
    })
    base["qtd"] = 1

    if use_mysql:
        base["procedimento"] = base["procedimento"].apply(lambda v: str(v or "").strip())
        base["procedimento_key"] = base["procedimento"].apply(
            lambda v: hashlib.md5(str(v or "").strip().encode("utf-8")).hexdigest()
        )
        daily_group = ["data_ref", "unidade", "grupo", "procedimento", "procedimento_key"]
        monthly_group = ["month_ref", "unidade", "grupo", "procedimento", "procedimento_key"]
    else:
        daily_group = ["data_ref", "unidade", "grupo", "procedimento"]
        monthly_group = ["month_ref", "unidade", "grupo", "procedimento"]

    daily = base.groupby(daily_group, as_index=False).agg(
        total_pago=("total_pago", "sum"),
        qtd=("qtd", "sum"),
    )
    daily["updated_at"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    monthly = daily.copy()
    monthly["month_ref"] = monthly["data_ref"].str.slice(0, 7)
    monthly = monthly.groupby(monthly_group, as_index=False).agg(
        total_pago=("total_pago", "sum"),
        qtd=("qtd", "sum"),
    )
    monthly["updated_at"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    return daily, monthly

def _parse_cli_date(value):
    s = str(value or "").strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    raise ValueError(f"Data inválida: {value}. Use YYYY-MM-DD ou DD/MM/YYYY.")


def run_scraper_2025(start_date=None, end_date=None, use_checkpoint=True, sleep_between_months=120):
    print(f"--- Scraping Financeiro (Backfill Historico): {datetime.datetime.now().strftime('%H:%M:%S')} ---")

    if DatabaseManager is None:
        print("❌ DatabaseManager não disponível.")
        return

    db = DatabaseManager()

    # 1. Busca Credenciais (Híbrido)
    try:
        res = db.execute_query("SELECT username, password FROM integrations_config WHERE service = 'feegow'")
        if res:
            row = res[0]
            if isinstance(row, (tuple, list)):
                user, password = row[0], row[1]
            else:
                user, password = row.username, row.password
        else:
            raise Exception("Não achou no banco")
    except Exception:
        user = os.getenv("FEEGOW_USER")
        password = os.getenv("FEEGOW_PASS")

    if not user or not password:
        print("❌ Credenciais não encontradas (Banco ou .env).")
        return

    today = datetime.date.today()
    if end_date is None:
        end_date = today - datetime.timedelta(days=1)
    if start_date is None:
        start_date = datetime.date(2025, 1, 1)

    if end_date < start_date:
        print(f"❌ Intervalo inválido: {start_date} > {end_date}")
        return

    processed_ranges = []
    if use_checkpoint:
        ensure_checkpoint_table(db)

    start_year = start_date.year
    end_year = end_date.year
    print(f"📆 Backfill de {start_date.strftime('%Y-%m-%d')} até {end_date.strftime('%Y-%m-%d')}")
    print(f"📌 Checkpoint: {'ATIVO' if use_checkpoint else 'DESATIVADO'}")
    print(f"⏳ Intervalo entre meses: {sleep_between_months}s")

    with sync_playwright() as p:
        for year in range(start_year, end_year + 1):
            completed_months = get_completed_months(db, year) if use_checkpoint else set()
            if use_checkpoint and completed_months:
                completed_list = ", ".join([f"{m:02d}" for m in sorted(completed_months)])
                print(f"✅ Checkpoint {year}. Meses concluídos: {completed_list}")

            year_start_month = start_date.month if year == start_year else 1
            year_end_month = end_date.month if year == end_year else 12

            for month in range(year_start_month, year_end_month + 1):
                first_day = datetime.date(year, month, 1)
                last_day = datetime.date(year, month, calendar.monthrange(year, month)[1])
                range_start = max(first_day, start_date)
                range_end = min(last_day, end_date)
                full_month = (range_start == first_day and range_end == last_day)

                if use_checkpoint and full_month and month in completed_months:
                    print(f"⏭️ Pulando mês {month:02d}/{year} (já concluído)")
                    continue

                month_start_time = datetime.datetime.now()
                inicio_vis = range_start.strftime("%d/%m/%Y")
                fim_vis = range_end.strftime("%d/%m/%Y")
                iso_inicio = range_start.strftime("%Y-%m-%d")
                iso_fim = range_end.strftime("%Y-%m-%d")

                print(f"📆 Mês {month:02d}/{year}: {inicio_vis} até {fim_vis}")
                db.update_heartbeat("faturamento", "RUNNING", f"Backfill {year}: {inicio_vis}-{fim_vis}")

                browser = p.chromium.launch(headless=True)
                context = browser.new_context()
                page = context.new_page()

                try:
                    print("🔐 Login...")
                    page.goto("https://franchising.feegow.com/main/?P=Login")
                    try:
                        if page.get_by_role("textbox", name="E-mail").is_visible(timeout=3000):
                            page.get_by_role("textbox", name="E-mail").fill(user)
                            page.get_by_role("textbox", name="Senha").fill(password)
                            page.get_by_role("button", name="Entrar ").click()
                    except Exception:
                        pass

                    time.sleep(2)
                    page.goto("https://franchising.feegow.com/v8.1/?P=MudaLocal&Pers=1&MudaLocal=0", timeout=60000)
                    time.sleep(3)

                    print("📂 Acessando Relatório...")
                    page.goto("https://franchising.feegow.com/main/?P=RelatoriosModoFranquia&Pers=1&TR=72")

                    try:
                        if page.get_by_role("button", name="Não, obrigada.").is_visible(timeout=3000):
                            page.get_by_role("button", name="Não, obrigada.").click()
                    except Exception:
                        pass

                    page.wait_for_selector(".multiselect.dropdown-toggle", state="visible", timeout=20000)
                    page.locator(".multiselect.dropdown-toggle").first.click()
                    menu = page.locator("ul.multiselect-container.dropdown-menu").first
                    menu.wait_for(state="visible", timeout=5000)

                    if menu.get_by_text("Selecionar tudo").is_visible():
                        menu.get_by_text("Selecionar tudo").click()

                    try:
                        if menu.get_by_text("CONSULTARE FRANCHISING").is_visible():
                            menu.get_by_text("CONSULTARE FRANCHISING").click()
                    except Exception:
                        pass

                    page.keyboard.press("Escape")
                    time.sleep(0.5)

                    try:
                        page.locator('button[onclick*="alteraUnidade"]').click()
                    except Exception:
                        pass

                    page.wait_for_selector("#De", state="visible", timeout=10000)
                    script_datas = f"""() => {{
                        const elDe = document.querySelector('#De');
                        const elAte = document.querySelector('#Ate');
                        if(elDe) {{ elDe.value = '{inicio_vis}'; elDe.dispatchEvent(new Event('change')); }}
                        if(elAte) {{ elAte.value = '{fim_vis}'; elAte.dispatchEvent(new Event('change')); }}
                    }}"""
                    page.evaluate(script_datas)
                    page.locator("body").click(force=True)

                    print("🧩 Selecionando colunas...")
                    try:
                        _select_usuario_da_conta_column(page)
                        print("⏳ Baixando...")
                        page.wait_for_selector("#table-resultado tbody tr", timeout=30000)
                    except Exception as e:
                        print(f"⚠️ Falha ao selecionar colunas: {e}. Tentando filtrar...")
                        print("🔎 Pesquisando...")
                        page.locator("#btn-filtrar").click()
                        print("⏳ Baixando...")
                        page.wait_for_selector("#table-resultado tbody tr", timeout=30000)

                    last_count = 0
                    no_change_count = 0
                    while no_change_count < 5:
                        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                        time.sleep(2.5)
                        current_count = page.locator("#table-resultado tbody tr").count()
                        if current_count > last_count:
                            last_count = current_count
                            no_change_count = 0
                        else:
                            no_change_count += 1

                    print(f"✅ Extraído: {last_count} linhas.")

                    html = page.content()
                    dfs = pd.read_html(StringIO(html), decimal=',', thousands='.')
                    df_raw = max(dfs, key=lambda x: x.size)

                    df = df_raw.copy()
                    df.columns = [clean_column_name(c) for c in df.columns]

                    cols_fin = [c for c in df.columns if any(t in c for t in ['valor', 'total', 'pago', 'liquido'])]
                    for col in cols_fin:
                        df[col] = df[col].apply(clean_currency)

                    col_data = next((c for c in df.columns if 'pagamento' in c and 'data' in c), None)
                    if not col_data:
                        col_data = next((c for c in df.columns if 'data' in c), 'data')

                    def normalize_accounting_date(row):
                        d_str = row[col_data]
                        val = row['total_pago'] if 'total_pago' in row else 0
                        try:
                            d_obj = datetime.datetime.strptime(str(d_str), "%d/%m/%Y")
                            d_iso = d_obj.strftime("%Y-%m-%d")
                            if val < 0 and d_iso < iso_inicio:
                                return iso_inicio
                            return d_iso
                        except Exception:
                            return None

                    df['data_contabil'] = df.apply(normalize_accounting_date, axis=1)
                    df_validas = df[df['data_contabil'].notna()].copy()

                    df_validas[col_data] = df_validas['data_contabil']
                    df_validas = df_validas.drop(columns=['data_contabil'])

                    df = df_validas
                    df = remove_total_pago_outliers(df, abs_threshold=1_000_000.0, context=f"backfill {month:02d}/{year}")
                    df['updated_at'] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                    condition = f"{col_data} >= '{iso_inicio}' AND {col_data} <= '{iso_fim}'"
                    print(f"💾 Salvando mês {month:02d}/{year}: {len(df)} registros no faturamento_analitico")
                    save_dataframe_to_db(db, df, 'faturamento_analitico', delete_condition=condition)

                    processed_ranges.append((iso_inicio, iso_fim))
                    if use_checkpoint and full_month:
                        mark_month_completed(db, year, month)

                except Exception as e:
                    print(f"❌ Erro Scraping mês {month:02d}/{year}: {e}")
                    db.update_heartbeat("faturamento", "ERROR", str(e))
                finally:
                    browser.close()
                    month_end_time = datetime.datetime.now()
                    elapsed = (month_end_time - month_start_time).total_seconds()
                    print(f"⏱️ Mês {month:02d}/{year} finalizado em {elapsed:.1f}s")

                if sleep_between_months > 0 and not (year == end_year and month == year_end_month):
                    print(f"⏸️ Aguardando {sleep_between_months}s antes do próximo mês...")
                    time.sleep(sleep_between_months)

    if processed_ranges:
        start_ref = start_date.strftime("%Y-%m-%d")
        end_ref = end_date.strftime("%Y-%m-%d")
        print(f"🧮 Recalculando resumos de {start_ref} até {end_ref} a partir do analítico...")
        update_faturamento_summary(db, start_ref, end_ref, update_monthly=True)

    print("🚀 Backfill histórico finalizado com sucesso.")
    db.update_heartbeat("faturamento", "ONLINE", "Backfill histórico finalizado")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Backfill histórico do faturamento analítico em janela personalizada."
    )
    parser.add_argument(
        "--start-date",
        default="2025-01-01",
        help="Data inicial (YYYY-MM-DD ou DD/MM/YYYY). Ex.: 2022-01-01",
    )
    parser.add_argument(
        "--end-date",
        default="",
        help="Data final (YYYY-MM-DD ou DD/MM/YYYY). Padrão: ontem.",
    )
    parser.add_argument(
        "--ignore-checkpoint",
        action="store_true",
        help="Ignora checkpoint e reprocessa meses completos já marcados.",
    )
    parser.add_argument(
        "--sleep-seconds",
        type=int,
        default=120,
        help="Pausa entre meses em segundos (padrão: 120).",
    )
    args = parser.parse_args()
    start_date = _parse_cli_date(args.start_date)
    end_date = _parse_cli_date(args.end_date) if str(args.end_date).strip() else (datetime.date.today() - datetime.timedelta(days=1))
    return start_date, end_date, (not args.ignore_checkpoint), max(0, int(args.sleep_seconds))


if __name__ == "__main__":
    s, e, use_cp, sleep_s = parse_args()
    run_scraper_2025(start_date=s, end_date=e, use_checkpoint=use_cp, sleep_between_months=sleep_s)
