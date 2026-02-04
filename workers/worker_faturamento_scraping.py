import time
import os
import sys
import pandas as pd
import datetime
import re
import math
from playwright.sync_api import sync_playwright
from io import StringIO

# --- SETUP DE IMPORTS ---
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database_manager import DatabaseManager
    import libsql_client
except ImportError:
    pass

def clean_column_name(name):
    name = str(name).lower().strip()
    name = name.replace(" ", "_").replace(".", "").replace("/", "_")
    name = re.sub(r'[^\w\s]', '', name)
    return name

def clean_currency(value):
    """Lógica original de limpeza de moeda mantida"""
    if pd.isna(value): return 0.0
    if isinstance(value, (int, float)): return float(value)
    
    val_str = str(value).strip()
    if not val_str: return 0.0

    is_negative = '-' in val_str or '−' in val_str or '(' in val_str
    
    clean = val_str.replace('R$', '').replace('.', '').replace(' ', '')
    clean = re.sub(r'[^\d,]', '', clean)
    
    if not clean: return 0.0
    
    try:
        val_float = float(clean.replace(',', '.'))
        return -val_float if is_negative else val_float
    except: return 0.0

def save_dataframe_to_db(db, df, table_name, delete_condition=None):
    """
    Função auxiliar para salvar DataFrame no Turso ou SQLite.
    Substitui o pandas.to_sql que falha com drivers HTTP.
    """
    if df.empty: return
    
    conn = db.get_connection()
    try:
        # 1. Garante a tabela (Criação Dinâmica baseada no DF)
        # Mapeia tipos do Pandas para SQLite
        type_map = {
            'int64': 'INTEGER', 'float64': 'REAL', 'object': 'TEXT',
            'bool': 'INTEGER', 'datetime64[ns]': 'TEXT'
        }
        cols_def = []
        for col, dtype in df.dtypes.items():
            sql_type = type_map.get(str(dtype), 'TEXT')
            cols_def.append(f"{col} {sql_type}")
        
        create_sql = f"CREATE TABLE IF NOT EXISTS {table_name} ({', '.join(cols_def)})"
        
        if db.use_turso: conn.execute(create_sql)
        else: conn.execute(create_sql)

        # 2. Limpeza (Delete prévio)
        if delete_condition:
            del_sql = f"DELETE FROM {table_name} WHERE {delete_condition}"
            print(f"   🗑️  Executando limpeza: {del_sql}")
            if db.use_turso: conn.execute(del_sql)
            else: conn.execute(del_sql)

        # 3. Inserção em Lote (Batch)
        cols = list(df.columns)
        placeholders = ', '.join(['?'] * len(cols))
        insert_sql = f"INSERT INTO {table_name} ({', '.join(cols)}) VALUES ({placeholders})"
        
        # Converte DataFrame para lista de tuplas (tratando NaNs como None)
        data = df.where(pd.notnull(df), None).values.tolist()
        
        # Conversão extra para garantir tipos primitivos (int, float, str)
        # O driver do Turso pode reclamar de tipos numpy
        clean_data = []
        for row in data:
            clean_row = []
            for item in row:
                # Convert numpy scalars to Python types
                if hasattr(item, 'item'):
                    try:
                        item = item.item()
                    except Exception:
                        item = None

                # Replace non-finite floats (inf, -inf, nan) with None to avoid driver errors
                if isinstance(item, float):
                    if not math.isfinite(item):
                        item = None

                clean_row.append(item)
            clean_data.append(tuple(clean_row))

        print(f"   💾 Salvando {len(clean_data)} registros...")

        if db.use_turso:
            # Batch Turso
            stmts = [libsql_client.Statement(insert_sql, row) for row in clean_data]
            # O Turso tem limite de batch. Vamos dividir em chunks de 500.
            CHUNK_SIZE = 500
            for i in range(0, len(stmts), CHUNK_SIZE):
                conn.batch(stmts[i:i + CHUNK_SIZE])
        else:
            # Batch Local
            conn.executemany(insert_sql, clean_data)
            conn.commit()
            
    except Exception as e:
        print(f"❌ Erro ao salvar no banco: {e}")
        raise
    finally:
        conn.close()

def update_faturamento_summary(db, start_date_iso, end_date_iso):
    """
    Atualiza a tabela de resumo diário baseada em faturamento_analitico.
    Mantém a granularidade necessária para filtros por unidade/grupo/procedimento.
    """
    conn = db.get_connection()
    try:
        # Normaliza data_do_pagamento para ISO (YYYY-MM-DD) se necessário
        date_expr = "(CASE WHEN instr(data_do_pagamento, '/') > 0 THEN substr(data_do_pagamento, 7, 4) || '-' || substr(data_do_pagamento, 4, 2) || '-' || substr(data_do_pagamento, 1, 2) ELSE data_do_pagamento END)"

        # Cria tabela de resumo se não existir
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
        # Índices para acelerar filtros mais comuns
        conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_diario_data ON faturamento_resumo_diario(data_ref)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_diario_unidade ON faturamento_resumo_diario(unidade)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_diario_grupo ON faturamento_resumo_diario(grupo)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_diario_proc ON faturamento_resumo_diario(procedimento)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_diario_data_unidade ON faturamento_resumo_diario(data_ref, unidade)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_diario_data_grupo ON faturamento_resumo_diario(data_ref, grupo)")

        # Se a tabela de resumo estiver vazia, faz backfill completo (1x)
        try:
            row = conn.execute("SELECT COUNT(*) as cnt FROM faturamento_resumo_diario")
            cnt = None
            if hasattr(row, 'fetchone'):
                cnt = row.fetchone()[0]
            else:
                rows = list(row)
                if rows:
                    cnt = rows[0][0]
            if cnt == 0:
                rng = conn.execute(f"""
                    SELECT MIN({date_expr}) as min_d, MAX({date_expr}) as max_d
                    FROM faturamento_analitico
                    WHERE {date_expr} IS NOT NULL
                """)
                min_d = max_d = None
                if hasattr(rng, 'fetchone'):
                    r = rng.fetchone()
                    if r:
                        min_d, max_d = r[0], r[1]
                else:
                    rows = list(rng)
                    if rows:
                        min_d, max_d = rows[0][0], rows[0][1]
                if min_d and max_d:
                    print(f"   🔁 Backfill resumo diário: {min_d} a {max_d}")
                    start_date_iso, end_date_iso = min_d, max_d
        except Exception:
            # Se falhar o backfill automático, seguimos com o range atual
            pass

        # Limpa o período alvo antes de recalcular
        conn.execute(
            "DELETE FROM faturamento_resumo_diario WHERE data_ref BETWEEN ? AND ?",
            (start_date_iso, end_date_iso)
        )

        # Recalcula o resumo do período
        sql = f"""
            INSERT INTO faturamento_resumo_diario (
                data_ref, unidade, grupo, procedimento, total_pago, qtd, updated_at
            )
            SELECT
                {date_expr} as data_ref,
                COALESCE(TRIM(unidade), '') as unidade,
                COALESCE(TRIM(grupo), '') as grupo,
                COALESCE(TRIM(procedimento), '') as procedimento,
                SUM(total_pago) as total_pago,
                COUNT(*) as qtd,
                datetime('now') as updated_at
            FROM faturamento_analitico
            WHERE {date_expr} BETWEEN ? AND ?
            GROUP BY data_ref, unidade, grupo, procedimento
        """
        conn.execute(sql, (start_date_iso, end_date_iso))

        if not db.use_turso:
            conn.commit()
        print(f"   ✅ Resumo diário atualizado: {start_date_iso} a {end_date_iso}")

        # ---------------------------------------------------------
        # Resumo mensal (baseado no diário para reduzir leituras)
        # ---------------------------------------------------------
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

        monthly_start_date = start_date_iso
        monthly_end_date = end_date_iso
        start_month = monthly_start_date[:7]
        end_month = monthly_end_date[:7]

        # Se tabela mensal estiver vazia, faz backfill completo baseado no diário
        try:
            row_m = conn.execute("SELECT COUNT(*) as cnt FROM faturamento_resumo_mensal")
            cnt_m = None
            if hasattr(row_m, 'fetchone'):
                cnt_m = row_m.fetchone()[0]
            else:
                rows_m = list(row_m)
                if rows_m:
                    cnt_m = rows_m[0][0]
            if cnt_m == 0:
                rng_m = conn.execute("""
                    SELECT MIN(data_ref) as min_d, MAX(data_ref) as max_d
                    FROM faturamento_resumo_diario
                    WHERE data_ref IS NOT NULL
                """)
                min_m = max_m = None
                if hasattr(rng_m, 'fetchone'):
                    r_m = rng_m.fetchone()
                    if r_m:
                        min_m, max_m = r_m[0], r_m[1]
                else:
                    rows_m = list(rng_m)
                    if rows_m:
                        min_m, max_m = rows_m[0][0], rows_m[0][1]
                if min_m and max_m:
                    print(f"   🔁 Backfill resumo mensal: {min_m[:7]} a {max_m[:7]}")
                    monthly_start_date = min_m
                    monthly_end_date = max_m
                    start_month = monthly_start_date[:7]
                    end_month = monthly_end_date[:7]
        except Exception:
            pass

        conn.execute(
            "DELETE FROM faturamento_resumo_mensal WHERE month_ref BETWEEN ? AND ?",
            (start_month, end_month)
        )

        monthly_sql = """
            INSERT INTO faturamento_resumo_mensal (
                month_ref, unidade, grupo, procedimento, total_pago, qtd, updated_at
            )
            SELECT
                substr(data_ref, 1, 7) as month_ref,
                unidade,
                grupo,
                procedimento,
                SUM(total_pago) as total_pago,
                SUM(qtd) as qtd,
                datetime('now') as updated_at
            FROM faturamento_resumo_diario
            WHERE data_ref BETWEEN ? AND ?
            GROUP BY month_ref, unidade, grupo, procedimento
        """
        conn.execute(monthly_sql, (monthly_start_date, monthly_end_date))

        if not db.use_turso:
            conn.commit()
        print(f"   ✅ Resumo mensal atualizado: {start_month} a {end_month}")
    except Exception as e:
        print(f"   ⚠️ Erro ao atualizar resumo diário: {e}")
    finally:
        conn.close()

def run_scraper():
    print(f"--- Scraping Financeiro (Híbrido): {datetime.datetime.now().strftime('%H:%M:%S')} ---")
    
    db = DatabaseManager()
    
    # 1. Busca Credenciais (Híbrido)
    try:
        # Tenta buscar no banco primeiro
        res = db.execute_query("SELECT username, password FROM integrations_config WHERE service = 'feegow'")
        if res:
            row = res[0]
            if isinstance(row, (tuple, list)):
                user, password = row[0], row[1]
            else:
                user, password = row.username, row.password
        else:
            raise Exception("Não achou no banco")
    except:
        # Fallback .env
        user = os.getenv("FEEGOW_USER")
        password = os.getenv("FEEGOW_PASS")

    if not user or not password:
        print("❌ Credenciais não encontradas (Banco ou .env).")
        return

    hoje = datetime.datetime.now()
    inicio_vis = hoje.replace(day=1).strftime("%d/%m/%Y")
    fim_vis = hoje.strftime("%d/%m/%Y")
    iso_inicio = hoje.replace(day=1).strftime("%Y-%m-%d")
    iso_fim = hoje.strftime("%Y-%m-%d")

    print(f"📅 Janela: {inicio_vis} até {fim_vis}")
    db.update_heartbeat("faturamento", "RUNNING", f"Extraindo {inicio_vis}-{fim_vis}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        try:
            # --- LÓGICA DE SCRAPING ORIGINAL (INTACTA) ---
            print("🔐 Login...")
            page.goto("https://franchising.feegow.com/main/?P=Login")
            try:
                if page.get_by_role("textbox", name="E-mail").is_visible(timeout=3000):
                    page.get_by_role("textbox", name="E-mail").fill(user)
                    page.get_by_role("textbox", name="Senha").fill(password)
                    page.get_by_role("button", name="Entrar ").click()
            except: pass

            time.sleep(2)
            page.goto("https://franchising.feegow.com/v8.1/?P=MudaLocal&Pers=1&MudaLocal=0", timeout=60000)
            time.sleep(3)

            print("📂 Acessando Relatório...")
            page.goto("https://franchising.feegow.com/main/?P=RelatoriosModoFranquia&Pers=1&TR=72")

            try:
                if page.get_by_role("button", name="Não, obrigada.").is_visible(timeout=3000):
                    page.get_by_role("button", name="Não, obrigada.").click()
            except: pass

            page.wait_for_selector(".multiselect.dropdown-toggle", state="visible", timeout=20000)
            page.locator(".multiselect.dropdown-toggle").first.click()
            menu = page.locator("ul.multiselect-container.dropdown-menu").first
            menu.wait_for(state="visible", timeout=5000)

            if menu.get_by_text("Selecionar tudo").is_visible():
                menu.get_by_text("Selecionar tudo").click()
            
            try:
                if menu.get_by_text("CONSULTARE FRANCHISING").is_visible():
                    menu.get_by_text("CONSULTARE FRANCHISING").click()
            except: pass

            page.keyboard.press("Escape")
            time.sleep(0.5)

            try:
                page.locator('button[onclick*="alteraUnidade"]').click()
            except: pass

            page.wait_for_selector("#De", state="visible", timeout=10000)
            script_datas = f"""() => {{
                const elDe = document.querySelector('#De');
                const elAte = document.querySelector('#Ate');
                if(elDe) {{ elDe.value = '{inicio_vis}'; elDe.dispatchEvent(new Event('change')); }}
                if(elAte) {{ elAte.value = '{fim_vis}'; elAte.dispatchEvent(new Event('change')); }}
            }}"""
            page.evaluate(script_datas)
            page.locator("body").click(force=True)

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

            # --- PROCESSAMENTO DOS DADOS ---
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
                    # Lógica de Estorno Retroativo (Mantida)
                    if val < 0 and d_iso < iso_inicio:
                        return iso_inicio
                    return d_iso
                except:
                    return None

            df['data_contabil'] = df.apply(normalize_accounting_date, axis=1)
            df_validas = df[df['data_contabil'].notna()].copy()
            
            df_validas[col_data] = df_validas['data_contabil']
            df_validas = df_validas.drop(columns=['data_contabil'])

            df = df_validas
            df['updated_at'] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            # --- AUDITORIA ---
            ajustados = df[df[col_data] == iso_inicio]
            negativos_ajustados = ajustados[ajustados['total_pago'] < 0]
            if not negativos_ajustados.empty:
                print(f"   ⚖️  Ajuste Retroativo: {len(negativos_ajustados)} estornos movidos para {iso_inicio}.")

            # --- SALVAMENTO HÍBRIDO ---
            # Define condição de limpeza para evitar duplicidade no período
            condition = f"{col_data} >= '{iso_inicio}' AND {col_data} <= '{iso_fim}'"
            
            save_dataframe_to_db(db, df, 'faturamento_analitico', delete_condition=condition)
            update_faturamento_summary(db, iso_inicio, iso_fim)
            
            print(f"🚀 Finalizado com Sucesso.")
            db.update_heartbeat("faturamento", "ONLINE", f"{len(df)} registros")

        except Exception as e:
            print(f"❌ Erro Scraping: {e}")
            db.update_heartbeat("faturamento", "ERROR", str(e))
        finally:
            browser.close()

if __name__ == "__main__":
    run_scraper()
