import time
from typing import Callable, Optional

from playwright.sync_api import BrowserContext, Page

APP4_BASE_URL = "https://app4.feegow.com"
LOGIN_URL = f"{APP4_BASE_URL}/main/?P=Login"


def _emit(logger: Optional[Callable[[str], None]], message: str) -> None:
    if logger:
        logger(message)


def _has_login_form(page: Page) -> bool:
    try:
        if page.locator("#User").count() > 0:
            return True
        if page.locator("#password").count() > 0:
            return True
        return "p=login" in page.url.lower()
    except Exception:
        return False


def _fill_login_form(page: Page, user: str, password: str) -> None:
    if page.locator("#User").count() > 0:
        page.locator("#User").first.fill(user)
    else:
        page.get_by_role("textbox", name="E-mail").first.fill(user)

    if page.locator("#password").count() > 0:
        page.locator("#password").first.fill(password)
    else:
        page.get_by_role("textbox", name="Senha").first.fill(password)


def _submit_login_form(page: Page) -> None:
    page.evaluate(
        """
        () => {
          const form = document.querySelector('form');
          if (form) {
            form.submit();
            return;
          }
          const btn = document.querySelector('#Entrar');
          if (btn) btn.click();
        }
        """
    )


def _handle_concurrent_session_prompt(page: Page, password: str, logger: Optional[Callable[[str], None]] = None) -> bool:
    try:
        modal = page.locator("#confirmaDesloga")
        if modal.count() == 0 or not modal.is_visible(timeout=1500):
            return False

        _emit(logger, "   [AUTH] Sessão anterior detectada. Confirmando deslogar...")
        password_input = modal.locator("#password")
        if password_input.count() > 0:
            password_input.first.fill(password)
        modal.locator("#Deslogar").first.click()
        page.wait_for_load_state("networkidle", timeout=30000)
        return True
    except Exception:
        return False


def login_feegow_app4(
    page: Page,
    user: str,
    password: str,
    logger: Optional[Callable[[str], None]] = None,
    timeout_ms: int = 60000,
) -> str:
    _emit(logger, "   [AUTH] Abrindo login do Feegow em app4...")
    page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=timeout_ms)
    page.wait_for_timeout(1200)

    for attempt in range(1, 4):
        if not _has_login_form(page):
            _emit(logger, f"   [AUTH] Sessão já autenticada ({page.url}).")
            return page.url

        _emit(logger, f"   [AUTH] Enviando credenciais (tentativa {attempt}/3)...")
        _fill_login_form(page, user, password)
        _submit_login_form(page)
        page.wait_for_timeout(2500)

        if _handle_concurrent_session_prompt(page, password, logger=logger):
            page.wait_for_timeout(1200)
            continue

        try:
            page.wait_for_load_state("networkidle", timeout=timeout_ms)
        except Exception:
            pass

        if not _has_login_form(page):
            _emit(logger, f"   [AUTH] Login concluído em {page.url}.")
            return page.url

    raise RuntimeError(f"Falha no login Feegow via app4. URL final: {page.url}")


def switch_feegow_unit(
    page: Page,
    unit_id: int,
    logger: Optional[Callable[[str], None]] = None,
    timeout_ms: int = 60000,
) -> str:
    url = f"{APP4_BASE_URL}/v8.1/?P=MudaLocal&Pers=1&MudaLocal={int(unit_id)}"
    _emit(logger, f"   [AUTH] Trocando unidade para {unit_id}...")
    page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
    try:
        page.wait_for_load_state("networkidle", timeout=timeout_ms)
    except Exception:
        pass
    page.wait_for_timeout(1200)

    if _has_login_form(page):
        raise RuntimeError(f"Sessão caiu ao trocar unidade {unit_id}. URL final: {page.url}")
    return page.url


def collect_unit_token_payload(
    page: Page,
    context: BrowserContext,
    unit_id: int,
    logger: Optional[Callable[[str], None]] = None,
    timeout_ms: int = 15000,
) -> Optional[dict]:
    token_info: dict = {}

    def handle_request(request):
        token = request.headers.get("x-access-token")
        if not token or token_info.get("x-access-token"):
            return
        browser_cookies = context.cookies()
        cookie_str = "; ".join([f"{cookie['name']}={cookie['value']}" for cookie in browser_cookies])
        token_info.update(
            {
                "x-access-token": token,
                "cookie": cookie_str,
                "captured_from": request.url,
                "unit_id": str(unit_id),
            }
        )

    page.on("request", handle_request)
    try:
        switch_feegow_unit(page, unit_id, logger=logger)
        page.goto(f"{APP4_BASE_URL}/v8.1/?P=Totem", wait_until="domcontentloaded", timeout=60000)
        try:
            page.wait_for_load_state("networkidle", timeout=30000)
        except Exception:
            pass

        started = time.time()
        while time.time() - started < max(timeout_ms / 1000.0, 3):
            if token_info.get("x-access-token"):
                _emit(logger, f"   [AUTH] Token capturado para unidade {unit_id}.")
                return token_info
            page.wait_for_timeout(500)
    finally:
        try:
            page.remove_listener("request", handle_request)
        except Exception:
            pass

    _emit(logger, f"   [AUTH] Nenhum token capturado para unidade {unit_id}.")
    return None


def hydrate_requests_session_from_context(
    context: BrowserContext,
    session,
    logger: Optional[Callable[[str], None]] = None,
) -> None:
    browser_cookies = context.cookies()
    for cookie in browser_cookies:
        name = str(cookie.get("name") or "").strip()
        if not name:
            continue

        kwargs = {
            "domain": cookie.get("domain"),
            "path": cookie.get("path") or "/",
        }
        expires = cookie.get("expires")
        if isinstance(expires, (int, float)) and expires > 0:
            kwargs["expires"] = int(expires)

        session.cookies.set(name, str(cookie.get("value") or ""), **kwargs)

    _emit(logger, f"   [AUTH] {len(browser_cookies)} cookies copiados para requests.Session.")
