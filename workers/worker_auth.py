import logging
import os
import time

from playwright.sync_api import sync_playwright

from database_manager import DatabaseManager
from feegow_web_auth import collect_unit_token_payload, login_feegow_app4


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")


class FeegowTokenRenewer:
    def __init__(self):
        self.db = DatabaseManager()
        self.unidades = [2, 3, 12]
        self.tokens_coletados = {}
        self.delay_seconds = max(0, int(os.getenv("FEEGOW_AUTH_DELAY_SECONDS", "120")))

    def obter_tokens(self):
        user, pwd = self.db.obter_credenciais_feegow()

        if not user or not pwd:
            logging.error("Credenciais do Feegow não encontradas.")
            raise RuntimeError("Credenciais do Feegow não encontradas.")

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)

            try:
                context = browser.new_context(
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
                )
                page = context.new_page()
                login_feegow_app4(page, user, pwd, logger=logging.info)

                success_units = []
                failed_units = []

                for idx, unidade_id in enumerate(self.unidades):
                    try:
                        logging.info(f"--- Processando Unidade {unidade_id} ---")
                        payload = collect_unit_token_payload(page, context, unidade_id, logger=logging.info)
                        if not payload or not payload.get("x-access-token"):
                            raise RuntimeError("Token não capturado no Totem.")

                        auth_payload = {
                            "x-access-token": payload["x-access-token"],
                            "cookie": payload["cookie"],
                        }
                        self.tokens_coletados[str(unidade_id)] = auth_payload
                        self.db.salvar_unidade_feegow(unidade_id, auth_payload)
                        success_units.append(unidade_id)
                        logging.info(f"✅ Unidade {unidade_id}: Token/Cookie capturados e salvos.")
                    except Exception as exc:
                        failed_units.append(unidade_id)
                        logging.error(f"❌ Erro na unidade {unidade_id}: {exc}")

                    if idx < len(self.unidades) - 1 and self.delay_seconds > 0:
                        next_unit = self.unidades[idx + 1]
                        logging.info(f"⏳ Aguardando {self.delay_seconds}s antes da Unidade {next_unit}...")
                        time.sleep(self.delay_seconds)

                context.close()

                if not success_units:
                    raise RuntimeError("Nenhuma unidade teve token renovado com sucesso.")

                summary = f"{len(success_units)}/{len(self.unidades)} unidades atualizadas"
                if failed_units:
                    summary += f" | falharam: {', '.join(map(str, failed_units))}"
                return summary
            finally:
                browser.close()


if __name__ == "__main__":
    db = DatabaseManager()
    try:
        db.update_heartbeat("auth", "RUNNING", "Renovando tokens...")
        renewer = FeegowTokenRenewer()
        result = renewer.obter_tokens()
        logging.info(result)
        db.update_heartbeat("auth", "COMPLETED", result or "Tokens atualizados")
    except Exception as exc:
        logging.error(f"Falha na renovação de tokens: {exc}")
        db.update_heartbeat("auth", "ERROR", str(exc))
        raise
