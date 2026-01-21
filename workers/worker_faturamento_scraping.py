import time
import os
import sys
import pandas as pd
import datetime
import sqlite3
import re
from playwright.sync_api import sync_playwright
from io import StringIO

# --- SETUP DE IMPORTS ---
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.append(parent_dir)

try:
    from lib.database_manager import DatabaseManager
except ImportError:
    try:
        from database_manager import DatabaseManager
    except ImportError:
        sys.path.append(os.path.join(parent_dir, '..'))
        from lib.database_manager import DatabaseManager

def clean_column_name(name):
    name = str(name).lower().strip()
    name = name.replace(" ", "_").replace(".", "").replace("/", "_")
    name = re.sub(r'[^\w\s]', '', name)
    return name

def clean_currency(value):
    """
    Converte valores monetários.
    Se já for número, retorna direto.
    Se for string, trata símbolos e sinal negativo corretamente.
    """
    if pd.isna(value): return 0.0
    if isinstance(value, (int, float)): return float(value)
    
    val_str = str(value).strip()
    if not val_str: return 0.0

    is_negative = '-' in val_str or '−' in val_str or '(' in val_str
    
    # Remove R$, pontos e espaços, mantém vírgula
    clean = val_str.replace('R$', '').replace('.', '').replace(' ', '')
    clean = re.sub(r'[^\d,]', '', clean)
    
    if not clean: return 0.0
    
    try:
        val_float = float(clean.replace(',', '.'))
        return -val_float if is_negative else val_float
    except: return 0.0

def convert_date_iso(date_str):
    try:
        return datetime.datetime.strptime(str(date_str), "%d/%m/%Y").strftime("%Y-%m-%d")
    except:
        return None

def run_scraper():
    print(f"--- Scraping Financeiro (Ajuste Estorno Retroativo): {datetime.datetime.now().strftime('%H:%M:%S')} ---")
    
    try:
        db = DatabaseManager()
        config = db.get_integration_config('feegow')
        user = config.get('username') if config else os.getenv("FEEGOW_USER")
        password = config.get('password') if config else os.getenv("FEEGOW_PASS")
    except:
        user = os.getenv("FEEGOW_USER")
        password = os.getenv("FEEGOW_PASS")

    if not user or not password:
        print("❌ Credenciais não encontradas.")
        return

    hoje = datetime.datetime.now()
    inicio_vis = hoje.replace(day=1).strftime("%d/%m/%Y")
    fim_vis = hoje.strftime("%d/%m/%Y")
    iso_inicio = hoje.replace(day=1).strftime("%Y-%m-%d")
    iso_fim = hoje.strftime("%Y-%m-%d")

    print(f"📅 Janela de Extração: {inicio_vis} até {fim_vis}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        try:
            print("🔐 1. Login...")
            page.goto("https://franchising.feegow.com/main/?P=Login")
            try:
                if page.get_by_role("textbox", name="E-mail").is_visible(timeout=3000):
                    page.get_by_role("textbox", name="E-mail").fill(user)
                    page.get_by_role("textbox", name="Senha").fill(password)
                    page.get_by_role("button", name="Entrar ").click()
            except: pass

            print("🔄 2. Reset Contexto...")
            time.sleep(2)
            page.goto("https://franchising.feegow.com/v8.1/?P=MudaLocal&Pers=1&MudaLocal=0", timeout=60000)
            time.sleep(3)

            print("📂 3. Acessando Relatório...")
            page.goto("https://franchising.feegow.com/main/?P=RelatoriosModoFranquia&Pers=1&TR=72")

            try:
                if page.get_by_role("button", name="Não, obrigada.").is_visible(timeout=3000):
                    page.get_by_role("button", name="Não, obrigada.").click()
            except: pass

            page.wait_for_selector(".multiselect.dropdown-toggle", state="visible", timeout=20000)

            print("   Selecionando unidades...")
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

            print(f"   Injetando datas...")
            page.wait_for_selector("#De", state="visible", timeout=10000)
            script_datas = f"""() => {{
                const elDe = document.querySelector('#De');
                const elAte = document.querySelector('#Ate');
                if(elDe) {{ elDe.value = '{inicio_vis}'; elDe.dispatchEvent(new Event('change')); }}
                if(elAte) {{ elAte.value = '{fim_vis}'; elAte.dispatchEvent(new Event('change')); }}
            }}"""
            page.evaluate(script_datas)
            page.locator("body").click(force=True)

            print("🔎 4. Pesquisando...")
            page.locator("#btn-filtrar").click()

            print("⏳ 5. Scroll Infinito...")
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
            
            print(f"✅ Download finalizado: {last_count} linhas.")

            # --- PROCESSAMENTO ---
            html = page.content()
            dfs = pd.read_html(StringIO(html), decimal=',', thousands='.')
            df_raw = max(dfs, key=lambda x: x.size)
            
            df = df_raw.copy()
            df.columns = [clean_column_name(c) for c in df.columns]

            # Conversão de Valores
            cols_fin = [c for c in df.columns if any(t in c for t in ['valor', 'total', 'pago', 'liquido'])]
            for col in cols_fin:
                df[col] = df[col].apply(clean_currency)

            # Conversão de Datas
            col_data = next((c for c in df.columns if 'pagamento' in c and 'data' in c), None)
            if not col_data:
                col_data = next((c for c in df.columns if 'data' in c), 'data')
            
            # Helper para normalizar data
            def normalize_accounting_date(row):
                d_str = row[col_data]
                val = row['total_pago'] if 'total_pago' in row else 0
                
                try:
                    # Tenta converter
                    d_obj = datetime.datetime.strptime(str(d_str), "%d/%m/%Y")
                    d_iso = d_obj.strftime("%Y-%m-%d")
                    
                    # REGRA DE NEGÓCIO: ESTORNO RETROATIVO
                    # Se for negativo (cancelamento) E a data for anterior ao início da janela (ex: Dezembro)
                    # Forçamos a data para o início da janela (01/Jan) para que o valor seja abatido AGORA.
                    if val < 0 and d_iso < iso_inicio:
                        return iso_inicio
                    
                    return d_iso
                except:
                    return None

            # Aplica a normalização (Data Real ou Data Forçada para Estornos)
            df['data_contabil'] = df.apply(normalize_accounting_date, axis=1)
            
            # Validação
            df_validas = df[df['data_contabil'].notna()].copy()
            
            # Substitui a coluna original pela data contábil ajustada
            df_validas[col_data] = df_validas['data_contabil']
            df_validas = df_validas.drop(columns=['data_contabil'])

            df = df_validas
            df['updated_at'] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            # --- AUDITORIA RÁPIDA DE AJUSTES ---
            ajustados = df[df[col_data] == iso_inicio]
            negativos_ajustados = ajustados[ajustados['total_pago'] < 0]
            if not negativos_ajustados.empty:
                print(f"   ⚖️  Ajuste Contábil: {len(negativos_ajustados)} estornos antigos trazidos para {iso_inicio}.")
                print(f"      Valor total ajustado: R$ {negativos_ajustados['total_pago'].sum():.2f}")

            # --- ATUALIZAÇÃO DO BANCO ---
            print("💾 6. Substituindo dados no Banco...")
            conn = sqlite3.connect(db.db_path)
            
            df.head(0).to_sql('faturamento_analitico', conn, if_exists='append', index=False)
            
            cursor = conn.execute(f"""
                DELETE FROM faturamento_analitico 
                WHERE {col_data} >= '{iso_inicio}' 
                AND {col_data} <= '{iso_fim}'
            """)
            print(f"   🗑️  Limpeza da janela ({iso_inicio} a {iso_fim}): {cursor.rowcount} registros substituídos.")

            df.to_sql('faturamento_analitico', conn, if_exists='append', index=False)
            
            conn.commit()
            conn.close()

            print(f"🚀 SUCESSO! Banco atualizado.")

        except Exception as e:
            print(f"❌ Erro: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run_scraper()