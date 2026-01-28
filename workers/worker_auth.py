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
        self.unidades = [2, 3, 12] # IDs das unidades para capturar
        self.tokens_coletados = {}

    def obter_tokens(self):
        user, pwd = self.db.obter_credenciais_feegow()
        
        if not user or not pwd:
            logging.error("Credenciais do Feegow não encontradas no banco (integrations_config).")
            return

        with sync_playwright() as p:
            # Lança o browser (headless=True para rodar em background)
            browser = p.chromium.launch(headless=True) 
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
            )
            page = context.new_page()

            try:
                logging.info("Acessando página de login...")
                page.goto("https://franchising.feegow.com/v8.1/")
                
                # Login
                page.get_by_role("textbox", name="E-mail").fill(user)
                page.get_by_role("textbox", name="Senha").fill(pwd)
                page.get_by_role("button", name="Entrar ").click()
                
                # Espera login completar (verifica se mudou URL ou elemento apareceu)
                page.wait_for_load_state("networkidle")
                
                # Lida com popup de escolha de unidade inicial (se houver)
                if page.is_visible("text=Selecione a unidade"):
                    logging.info("Selecionando unidade padrão...")
                    page.click("text=Confirmar") # Ou lógica para selecionar a primeira

                logging.info("Login realizado com sucesso.")

                # ITERA SOBRE AS UNIDADES
                for unidade_id in self.unidades:
                    logging.info(f"--- Capturando token Unidade {unidade_id} ---")
                    
                    url_troca = f"https://franchising.feegow.com/v8.1/?P=MudaLocal&Pers=1&MudaLocal={unidade_id}"
                    page.goto(url_troca)
                    page.wait_for_load_state("networkidle")

                    target_url = "https://franchising.feegow.com/v8.1/?P=Totem"
                    token_info = {"found": False}

                    def handle_request(request):
                        if request.resource_type in ["xhr", "fetch"]:
                            headers = request.headers
                            if "x-access-token" in headers:
                                # Captura cookies reais do contexto
                                browser_cookies = context.cookies(request.url)
                                cookie_str = "; ".join([f"{c['name']}={c['value']}" for c in browser_cookies])
                                
                                self.tokens_coletados[str(unidade_id)] = {
                                    "x-access-token": headers["x-access-token"],
                                    "cookie": cookie_str
                                }
                                token_info["found"] = True
                                logging.info(f"✅ Sucesso Unidade {unidade_id}: ...{headers['x-access-token'][-10:]} / ...{cookie_str[-10:]}")

                    page.on("request", handle_request)
                    page.goto(target_url)
                    
                    try:
                        page.wait_for_timeout(7000)
                    except: pass

                    if str(unidade_id) in self.tokens_coletados:
                        self.db.salvar_unidade_feegow(unidade_id, self.tokens_coletados[str(unidade_id)])
                    
                    page.remove_listener("request", handle_request)

            except Exception as e:
                logging.error(f"Erro durante scraping: {e}")
                # Tira screenshot se der erro para debug
                try:
                    page.screenshot(path="error_screenshot.png")
                except: pass
            
            finally:
                browser.close()

if __name__ == "__main__":
    renewer = FeegowTokenRenewer()
    # Executa uma vez. Você pode colocar num loop while True com time.sleep(4h)
    renewer.obter_tokens()