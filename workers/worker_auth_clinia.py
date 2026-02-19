import logging
import os
from datetime import datetime

from playwright.sync_api import sync_playwright

from database_manager import DatabaseManager

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')


class CliniaCookieRenewer:
    def __init__(self, db: DatabaseManager | None = None):
        self.db = db or DatabaseManager()
        self.login_url = os.getenv("CLINIA_LOGIN_URL", "https://dashboard.clinia.io/login").strip()
        self.headless = str(os.getenv("CLINIA_AUTH_HEADLESS", "1")).strip() not in ("0", "false", "False")

    def _get_credentials(self):
        user = None
        pwd = None
        try:
            rows = self.db.execute_query(
                "SELECT username, password FROM integrations_config WHERE service='clinia' ORDER BY updated_at DESC"
            )
            if rows:
                row = rows[0]
                if isinstance(row, (tuple, list)):
                    user, pwd = row[0], row[1]
                else:
                    user = getattr(row, "username", None) or row.get("username")
                    pwd = getattr(row, "password", None) or row.get("password")
        except Exception as e:
            logging.error(f"Erro ao ler credenciais Clinia do banco: {e}")

        user = str(user or os.getenv("CLINIA_USER") or "").strip()
        pwd = str(pwd or os.getenv("CLINIA_PASS") or "").strip()
        return user, pwd

    def _save_cookie(self, cookie_str: str):
        conn = self.db.get_connection()
        try:
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            rows = conn.execute("SELECT COUNT(*) FROM integrations_config WHERE service = ?", ("clinia",))
            count_row = rows.fetchone() if hasattr(rows, "fetchone") else (list(rows)[0] if rows else (0,))
            count = int(count_row[0] if isinstance(count_row, (tuple, list)) else 0)

            if count > 0:
                conn.execute(
                    """
                    UPDATE integrations_config
                    SET token = ?, updated_at = ?
                    WHERE service = 'clinia'
                    """,
                    (cookie_str, now),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO integrations_config (service, username, password, token, unit_id, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    ("clinia", "", "", cookie_str, "", now),
                )

            if not self.db.use_turso:
                conn.commit()
            return True
        except Exception as e:
            logging.error(f"Erro ao salvar cookie Clinia: {e}")
            return False
        finally:
            conn.close()

    @staticmethod
    def _first_visible(page, selectors, timeout=6000):
        for sel in selectors:
            try:
                loc = page.locator(sel).first
                loc.wait_for(state="visible", timeout=timeout)
                return loc
            except Exception:
                continue
        return None

    def renew_cookie(self):
        user, pwd = self._get_credentials()
        if not user or not pwd:
            logging.error("Credenciais Clinia ausentes (integrations_config ou env CLINIA_USER/CLINIA_PASS).")
            return None

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=self.headless, args=["--no-sandbox"])
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            )
            page = context.new_page()
            try:
                logging.info("Abrindo login do Clinia...")
                page.goto(self.login_url, wait_until="domcontentloaded", timeout=45000)

                email_loc = self._first_visible(
                    page,
                    [
                        "input[type='email']",
                        "input[name='E-mail']",
                        "input[placeholder='E-mail']",
                        "input[name='email']",
                    ],
                )
                pass_loc = self._first_visible(
                    page,
                    [
                        "input[type='password']",
                        "input[placeholder='Senha']",
                    ],
                )
                if not email_loc or not pass_loc:
                    logging.error("Nao foi possivel localizar campos de login do Clinia.")
                    return None

                email_loc.fill(user)
                pass_loc.fill(pwd)

                submit = self._first_visible(
                    page,
                    [
                        "button[type='submit']",
                        "button:has-text('Entrar')",
                        "[role='button']:has-text('Entrar')",
                        ".bg-clinia-main",
                    ],
                    timeout=3000,
                )
                if submit:
                    submit.click()
                else:
                    pass_loc.press("Enter")

                page.wait_for_timeout(5000)

                current_url = str(page.url or "")
                if "/login" in current_url:
                    logging.error(f"Login Clinia nao concluiu (permaneceu em {current_url}).")
                    return None

                cookies = context.cookies()
                if not cookies:
                    logging.error("Nenhum cookie retornado apos login Clinia.")
                    return None

                cookie_str = "; ".join(f"{c['name']}={c['value']}" for c in cookies if c.get("name"))
                if not cookie_str:
                    logging.error("Cookie Clinia vazio apos login.")
                    return None

                if not self._save_cookie(cookie_str):
                    return None

                logging.info("Cookie Clinia renovado e salvo com sucesso.")
                return cookie_str

            except Exception as e:
                logging.error(f"Falha ao renovar cookie Clinia: {e}")
                return None
            finally:
                context.close()
                browser.close()


if __name__ == "__main__":
    renewer = CliniaCookieRenewer()
    token = renewer.renew_cookie()
    if token:
        print("OK: cookie Clinia renovado.")
    else:
        print("ERRO: nao foi possivel renovar cookie Clinia.")

