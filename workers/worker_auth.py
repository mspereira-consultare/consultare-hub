import time
import json
import logging
from datetime import datetime
from playwright.sync_api import sync_playwright
from database_manager import DatabaseManager

# Configuração de Logs
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

class FeegowTokenRenewer:
    def __init__(self):
        self.db = DatabaseManager()
        self.unidades = [2, 3, 12] 
        self.tokens_coletados = {}

    def obter_tokens(self):
        user, pwd = self.db.obter_credenciais_feegow()
        
        if not user or not pwd:
            logging.error("Credenciais do Feegow não encontradas.")
            return

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True) 

            try:
                for idx, unidade_id in enumerate(self.unidades):
                    context = browser.new_context(
                        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                    )
                    page = context.new_page()

                    try:
                        logging.info(f"--- Processando Unidade {unidade_id} ---")
                        
                        # Função auxiliar para o login (reutilizável após deslogar)
                        def realizar_login():
                            page.goto("https://franchising.feegow.com/v8.1/")
                            # Tenta preencher usando o seletor inicial ou o legado
                            campo_u = page.locator("#User").or_(page.get_by_role("textbox", name="E-mail"))
                            campo_u.fill(user)
                            
                            campo_p = page.locator("#password").or_(page.get_by_role("textbox", name="Senha"))
                            campo_p.fill(pwd)
                            
                            btn = page.locator("#Entrar").or_(page.get_by_role("button", name="Entrar "))
                            btn.click()
                            page.wait_for_load_state("networkidle")

                        realizar_login()

                        # --- TRATAMENTO DE BLOQUEIO (SESSÃO ATIVA) ---
                        modal = page.locator("#confirmaDesloga")
                        if modal.is_visible(timeout=3000):
                            logging.info(f"⚠️ Bloqueio na Unidade {unidade_id}. Deslogando sessão anterior...")
                            # Preenche a senha no modal e clica em Deslogar
                            page.locator("#confirmaDesloga >> #password").fill(pwd)
                            page.locator("#Deslogar").click()
                            page.wait_for_load_state("networkidle")
                            
                            # Refaz o login após o redirecionamento
                            logging.info("🔄 Refazendo login pós-limpeza...")
                            realizar_login()

                        # Troca para a unidade específica
                        url_troca = f"https://franchising.feegow.com/v8.1/?P=MudaLocal&Pers=1&MudaLocal={unidade_id}"
                        page.goto(url_troca)
                        page.wait_for_load_state("networkidle")

                        # Captura de Token e Cookie
                        target_url = "https://franchising.feegow.com/v8.1/?P=Totem"
                        token_info = {"found": False}

                        def handle_request(request):
                            if "x-access-token" in request.headers and not token_info["found"]:
                                browser_cookies = context.cookies()
                                cookie_str = "; ".join([f"{c['name']}={c['value']}" for c in browser_cookies])
                                
                                self.tokens_coletados[str(unidade_id)] = {
                                    "x-access-token": request.headers["x-access-token"],
                                    "cookie": cookie_str
                                }
                                token_info["found"] = True
                                logging.info(f"✅ Unidade {unidade_id}: Token/Cookie capturados.")

                        page.on("request", handle_request)
                        page.goto(target_url)
                        page.wait_for_timeout(7000)

                        if str(unidade_id) in self.tokens_coletados:
                            self.db.salvar_unidade_feegow(unidade_id, self.tokens_coletados[str(unidade_id)])
                        
                        page.remove_listener("request", handle_request)

                    except Exception as e:
                        logging.error(f"❌ Erro na unidade {unidade_id}: {e}")
                    finally:
                        context.close()

                    if idx < len(self.unidades) - 1:
                        logging.info(f"⏳ Aguardando 2 minutos antes da Unidade {self.unidades[idx+1]}...")
                        time.sleep(120)

            finally:
                browser.close()

if __name__ == "__main__":
    renewer = FeegowTokenRenewer()
    renewer.obter_tokens()