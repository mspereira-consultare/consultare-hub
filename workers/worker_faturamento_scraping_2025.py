import time
import os
import sys
import datetime
import calendar
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
    save_dataframe_to_db,
)

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

def build_summary_parts(df, col_data):
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

    daily = base.groupby(["data_ref", "unidade", "grupo", "procedimento"], as_index=False).agg(
        total_pago=("total_pago", "sum"),
        qtd=("qtd", "sum"),
    )
    daily["updated_at"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    monthly = daily.copy()
    monthly["month_ref"] = monthly["data_ref"].str.slice(0, 7)
    monthly = monthly.groupby(["month_ref", "unidade", "grupo", "procedimento"], as_index=False).agg(
        total_pago=("total_pago", "sum"),
        qtd=("qtd", "sum"),
    )
    monthly["updated_at"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    return daily, monthly

def run_scraper_2025():
    print(f"--- Scraping Financeiro (Backfill 2025): {datetime.datetime.now().strftime('%H:%M:%S')} ---")

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

    daily_parts = []
    monthly_parts = []
    ensure_checkpoint_table(db)
    completed_months = get_completed_months(db, 2025)
    if completed_months:
        completed_list = ", ".join([f"{m:02d}" for m in sorted(completed_months)])
        print(f"✅ Checkpoint encontrado. Meses concluídos: {completed_list}")

    with sync_playwright() as p:
        for month in range(1, 13):
            if month in completed_months:
                print(f"⏭️ Pulando mês {month:02d}/2025 (já concluído)")
                continue
            month_start_time = datetime.datetime.now()
            last_day = calendar.monthrange(2025, month)[1]
            inicio_vis = f"01/{month:02d}/2025"
            fim_vis = f"{last_day:02d}/{month:02d}/2025"
            iso_inicio = f"2025-{month:02d}-01"
            iso_fim = f"2025-{month:02d}-{last_day:02d}"

            print(f"📆 Mês {month:02d}/2025: {inicio_vis} até {fim_vis}")
            db.update_heartbeat("faturamento", "RUNNING", f"Backfill 2025: {inicio_vis}-{fim_vis}")

            browser = p.chromium.launch(headless=False)
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
                    page.wait_for_selector('[title="Definir colunas"]', state="visible", timeout=10000)
                    page.locator('[title="Definir colunas"]').first.click()
                    checkbox = page.locator("input[type='checkbox'][name='Colunas'][value='|162|']")
                    checkbox.wait_for(state="visible", timeout=10000)
                    if not checkbox.is_checked():
                        checkbox.check(force=True)
                    page.locator(".btn.btn-primary.btn-block").filter(has_text="Selecionar").first.click()
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
                df['updated_at'] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                condition = f"{col_data} >= '{iso_inicio}' AND {col_data} <= '{iso_fim}'"
                print(f"💾 Salvando mês {month:02d}/2025: {len(df)} registros no faturamento_analitico")
                save_dataframe_to_db(db, df, 'faturamento_analitico', delete_condition=condition)

                daily_part, monthly_part = build_summary_parts(df, col_data)
                print(
                    f"🧩 Resumo mês {month:02d}/2025: "
                    f"{len(daily_part)} linhas diárias, {len(monthly_part)} linhas mensais"
                )
                daily_parts.append(daily_part)
                monthly_parts.append(monthly_part)
                mark_month_completed(db, 2025, month)

            except Exception as e:
                print(f"❌ Erro Scraping mês {month:02d}/2025: {e}")
                db.update_heartbeat("faturamento", "ERROR", str(e))
            finally:
                browser.close()
                month_end_time = datetime.datetime.now()
                elapsed = (month_end_time - month_start_time).total_seconds()
                print(f"⏱️ Mês {month:02d}/2025 finalizado em {elapsed:.1f}s")

            if month < 12:
                print("⏸️ Aguardando 2 minutos antes do próximo mês...")
                time.sleep(120)

    print("🧮 Montando resumos em memória...")
    if daily_parts:
        daily_df = pd.concat(daily_parts, ignore_index=True)
        daily_df = daily_df.groupby(["data_ref", "unidade", "grupo", "procedimento"], as_index=False).agg(
            total_pago=("total_pago", "sum"),
            qtd=("qtd", "sum"),
        )
        daily_df["updated_at"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    else:
        daily_df = pd.DataFrame(columns=["data_ref", "unidade", "grupo", "procedimento", "total_pago", "qtd", "updated_at"])

    if monthly_parts:
        monthly_df = pd.concat(monthly_parts, ignore_index=True)
        monthly_df = monthly_df.groupby(["month_ref", "unidade", "grupo", "procedimento"], as_index=False).agg(
            total_pago=("total_pago", "sum"),
            qtd=("qtd", "sum"),
        )
        monthly_df["updated_at"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    else:
        monthly_df = pd.DataFrame(columns=["month_ref", "unidade", "grupo", "procedimento", "total_pago", "qtd", "updated_at"])

    ensure_summary_tables(db)
    save_dataframe_to_db(
        db,
        daily_df,
        "faturamento_resumo_diario",
        delete_condition="data_ref >= '2025-01-01' AND data_ref <= '2025-12-31'"
    )
    save_dataframe_to_db(
        db,
        monthly_df,
        "faturamento_resumo_mensal",
        delete_condition="month_ref >= '2025-01' AND month_ref <= '2025-12'"
    )

    print("🚀 Backfill 2025 finalizado com sucesso.")
    db.update_heartbeat("faturamento", "ONLINE", "Backfill 2025 finalizado")


if __name__ == "__main__":
    run_scraper_2025()
