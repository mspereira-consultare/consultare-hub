import contextlib
import errno
import os
import random
import threading
import time
from contextlib import ExitStack

from playwright.sync_api import sync_playwright

try:
    import fcntl
except ImportError:  # pragma: no cover - fallback para ambientes sem fcntl
    fcntl = None


_PROCESS_LOCK = threading.Lock()


def _merge_launch_args(custom_args):
    base_args = [
        "--no-sandbox",
        "--disable-dev-shm-usage",
    ]
    merged = list(base_args)
    for arg in custom_args or []:
        if arg not in merged:
            merged.append(arg)
    return merged


@contextlib.contextmanager
def _interprocess_lock(lock_name: str):
    lock_name = str(lock_name or "playwright").strip() or "playwright"
    lock_file = f"/tmp/{lock_name}.lock"
    fd = None
    try:
        if fcntl is not None:
            fd = os.open(lock_file, os.O_CREAT | os.O_RDWR, 0o666)
            fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        if fd is not None:
            try:
                fcntl.flock(fd, fcntl.LOCK_UN)
            except Exception:
                pass
            try:
                os.close(fd)
            except Exception:
                pass


def _is_resource_temp_error(exc: Exception) -> bool:
    if isinstance(exc, BlockingIOError):
        return True
    err_no = getattr(exc, "errno", None)
    return err_no == errno.EAGAIN


def _start_browser_with_retry(*, headless: bool, launch_args=None, startup_label: str = "playwright_startup"):
    attempts = max(1, int(os.getenv("PLAYWRIGHT_STARTUP_MAX_ATTEMPTS", "4")))
    base_delay = max(0.5, float(os.getenv("PLAYWRIGHT_STARTUP_RETRY_BASE_SEC", "2.0")))
    jitter = max(0.0, float(os.getenv("PLAYWRIGHT_STARTUP_RETRY_JITTER_SEC", "0.5")))
    merged_args = _merge_launch_args(launch_args)
    last_exc = None

    for attempt in range(1, attempts + 1):
        stack = ExitStack()
        try:
            with _PROCESS_LOCK:
                with _interprocess_lock(startup_label):
                    playwright = stack.enter_context(sync_playwright())
                    browser = playwright.chromium.launch(headless=headless, args=merged_args)
            return stack, browser
        except Exception as exc:
            stack.close()
            last_exc = exc
            if not _is_resource_temp_error(exc) or attempt >= attempts:
                raise
            sleep_for = (base_delay * attempt) + random.uniform(0, jitter)
            print(
                f"⚠️ Playwright indisponível temporariamente ({exc}). "
                f"Nova tentativa em {sleep_for:.1f}s [{attempt}/{attempts}]..."
            )
            time.sleep(sleep_for)

    raise last_exc or RuntimeError("Falha ao iniciar Playwright")


@contextlib.contextmanager
def chromium_session(*, headless: bool = True, launch_args=None, startup_label: str = "playwright_startup"):
    stack, browser = _start_browser_with_retry(
        headless=headless,
        launch_args=launch_args,
        startup_label=startup_label,
    )
    try:
        yield browser
    finally:
        try:
            browser.close()
        except Exception:
            pass
        stack.close()
