import time
import os
import sys
import pandas as pd
import datetime
import sqlite3
import hashlib
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
    """Padroniza nomes de colunas para o banco de dados"""
    name = str(name).lower().strip()
    name = name.replace(" ", "_").replace(".", "").replace("/", "_")
    name = re.sub(r'[^\w\s]', '', name)
    return name

def generate_row_hash(row, index):
    """Cria um ID único incluindo o índice para permitir duplicatas idênticas"""
    # Incluímos o índice da linha no hash para diferenciar transações idênticas
    content = f"{index}" + "".join(str(val) for idx, val in row.items() if idx not in ['hash_id', 'updated_at'])
    return hashlib.md5(content.encode()).hexdigest()

def clean_currency(value):
    if pd.isna(value) or str(value).strip() == '':
        return 0.0
    if isinstance(value, (float, int)):
        return float(value)
    try:
        clean = str(value).replace('R$', '').strip()
        clean = clean.replace('.', '') 
        clean = clean.replace(',', '.') 
        return float(clean)
    except:
        return 0.0

def run_scraper():
    print(f"--- Iniciando Scraping (Scrolling Infinito): {datetime.datetime.now().strftime('%H:%M:%S')} ---")
    
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

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        try:
            print("🔐 Logando...")
            page.goto("https://franchising.feegow.com/main/?P=Login&U=&Partner=&qs=P%3DRelatoriosModoFranquia%26Pers%3D1%26TR%3D72")
            page.get_by_role("textbox", name="E-mail").fill(user)
            page.get_by_role("textbox", name="Senha").fill(password)
            page.get_by_role("button", name="Entrar ").click()

            try:
                if page.get_by_role("button", name="Não, obrigada.").is_visible(timeout=5000):
                    page.get_by_role("button", name="Não, obrigada.").click()
            except: pass

            page.wait_for_selector(".multiselect.dropdown-toggle", timeout=30000)
            time.sleep(1)

            # --- 1. SELEÇÃO DE UNIDADES ---
            print("   Selecionando unidades...")
            page.locator(".multiselect.dropdown-toggle").first.click()
            menu = page.locator("ul.multiselect-container.dropdown-menu").first
            menu.wait_for(state="visible", timeout=5000)

            try:
                if menu.get_by_text("Selecionar tudo").is_visible():
                    menu.get_by_text("Selecionar tudo").click()
                if menu.get_by_text("CONSULTARE FRANCHISING").is_visible():
                    menu.get_by_text("CONSULTARE FRANCHISING").click()
            except: pass

            page.keyboard.press("Escape")
            time.sleep(0.5)

            # --- 1.5 CONFIRMAR FILTROS ---
            print("   Confirmando filtros...")
            page.locator('button[onclick*="alteraUnidade"]').click()

            # --- 2. DATAS (INJEÇÃO VIA JS) ---
            print(f"   Injetando datas: {inicio_vis} a {fim_vis}...")
            page.wait_for_selector("#De", state="visible", timeout=10000)

            for selector, data_val in [("#De", inicio_vis), ("#Ate", fim_vis)]:
                page.evaluate(f"""() => {{
                    const el = document.querySelector('{selector}');
                    el.value = '{data_val}';
                    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    el.dispatchEvent(new Event('blur', {{ bubbles: true }}));
                }}""")
            
            time.sleep(1)
            page.locator("body").click(force=True)

            # --- 3. PESQUISAR ---
            print("🔎 Pesquisando...")
            page.locator("#btn-filtrar").click()

            # --- 4. CARREGAMENTO POR SCROLLING ---
            print("⏳ Aguardando e carregando registros (Scrolling)...")
            page.wait_for_selector("#table-resultado tbody tr", timeout=45000)
            
            # Lógica para rolar até o fim e carregar tudo
            last_count = 0
            retries = 0
            while retries < 5:
                # Rola para o fim da tabela/página
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                time.sleep(2) # Espera carregar novos itens
                
                current_count = page.locator("#table-resultado tbody tr").count()
                print(f"   -> Itens carregados: {current_count}")
                
                if current_count > last_count:
                    last_count = current_count
                    retries = 0 # Reset se novos itens aparecerem
                else:
                    retries += 1 # Se não mudar, tenta mais algumas vezes antes de parar
            
            print(f"✅ Fim do scroll. Total de linhas detectadas: {last_count}")

            # --- 5. CAPTURA E PROCESSAMENTO ---
            html = page.content()
            dfs = pd.read_html(StringIO(html), decimal=',', thousands='.')
            df_raw = next((d for d in dfs if "unidade" in " ".join([str(c).lower() for c in d.columns])), max(dfs, key=lambda x: x.size))

            df = df_raw.copy()
            col_u_orig = next(c for c in df.columns if 'unidade' in c.lower())
            df = df.dropna(subset=[col_u_orig]).copy()
            df.columns = [clean_column_name(c) for c in df.columns]

            # Tratamento Financeiro
            cols_fin = [c for c in df.columns if any(t in c for t in ['valor', 'total', 'desconto', 'acrescimo'])]
            for col in cols_fin:
                df[col] = df[col].apply(clean_currency)

            # IDs de Controle (Com Índice para evitar colisão)
            df['hash_id'] = [generate_row_hash(row, i) for i, row in df.iterrows()]
            df['updated_at'] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            # --- PERSISTÊNCIA SEGURA (SEM EXCLUSÃO) ---
            conn = sqlite3.connect(db.db_path)
            
            # 1. Garante que a tabela exista (Cria apenas se não houver)
            # if_exists='append' não apaga os dados antigos!
            df.head(0).to_sql('faturamento_analitico', conn, if_exists='append', index=False)
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_hash_analitico ON faturamento_analitico (hash_id);")

            # 2. Faz o Upsert (Atualiza o que existe e insere o novo)
            df.to_sql('tmp_analitico', conn, if_exists='replace', index=False)
            conn.execute("""
                INSERT OR REPLACE INTO faturamento_analitico 
                SELECT * FROM tmp_analitico
            """)
            conn.execute("DROP TABLE tmp_analitico")
            
            conn.commit()
            conn.close()

            print(f"✅ Processamento de {len(df)} registros concluído com sucesso.")

        except Exception as e:
            print(f"❌ Erro: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run_scraper()