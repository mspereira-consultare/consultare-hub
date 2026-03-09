import time
import sys
import os
import hashlib
import threading
from datetime import datetime
from queue import Queue, Empty
from concurrent.futures import TimeoutError as FutureTimeoutError

import pytz
from dotenv import load_dotenv

tz = pytz.timezone("America/Sao_Paulo")

# Ajuste para rodar tanto da raiz quanto da pasta workers
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from feegow_core import FeegowSystem
    from database_manager import DatabaseManager
except ImportError:
    from .feegow_core import FeegowSystem
    from .database_manager import DatabaseManager

load_dotenv()

FINALIZE_INTERVAL_SEC = int(os.getenv("MEDICO_FINALIZE_INTERVAL_SEC", "300"))
CLEANUP_INTERVAL_SEC = int(os.getenv("MEDICO_CLEANUP_INTERVAL_SEC", "600"))
ABSENCE_CONFIRM_MINUTES = max(1, int(os.getenv("MEDICO_ABSENCE_CONFIRM_MINUTES", "10")))
ABSENCE_CONFIRM_CYCLES = max(1, int(os.getenv("MEDICO_ABSENCE_CONFIRM_CYCLES", "2")))
PARSE_TIMEOUT_SEC = max(5, int(os.getenv("MEDICO_PARSE_TIMEOUT_SEC", "25")))
LOGIN_REFRESH_MINUTES = max(0, int(os.getenv("MEDICO_LOGIN_REFRESH_MINUTES", "90")))
EMPTY_RELOGIN_CYCLES = max(1, int(os.getenv("MEDICO_EMPTY_RELOGIN_CYCLES", "3")))
ACTIVITY_WINDOW_START = os.getenv("MEDICO_ACTIVITY_WINDOW_START", "06:00")
ACTIVITY_WINDOW_END = os.getenv("MEDICO_ACTIVITY_WINDOW_END", "22:00")
WARN_THROTTLE_SECONDS = max(30, int(os.getenv("MEDICO_WARN_THROTTLE_SECONDS", "120")))
MIDNIGHT_FINALIZE_ENABLED = str(os.getenv("MEDICO_MIDNIGHT_FINALIZE_ENABLED", "1")).strip().lower() in ("1", "true", "yes")
HARD_STALE_MINUTES = max(120, int(os.getenv("MEDICO_HARD_STALE_MINUTES", "360")))

UNIDADES = [
    ("Ouro Verde", 2),
    ("Centro Cambui", 3),
    ("Campinas Shopping", 12),
]


def _parse_db_datetime(raw_value):
    if raw_value is None:
        return None

    if isinstance(raw_value, datetime):
        dt = raw_value
    else:
        raw = str(raw_value).strip()
        if not raw:
            return None
        raw = raw.replace("T", " ").split(".")[0]
        try:
            dt = datetime.strptime(raw, "%Y-%m-%d %H:%M:%S")
        except Exception:
            try:
                dt = datetime.fromisoformat(str(raw_value))
            except Exception:
                return None

    if dt.tzinfo is None:
        return tz.localize(dt)
    return dt.astimezone(tz)


def _parse_hhmm(value, default_h, default_m):
    try:
        raw = str(value or "").strip()
        if not raw:
            return default_h, default_m
        hh, mm = raw.split(":")
        h = int(hh)
        m = int(mm)
        if not (0 <= h <= 23 and 0 <= m <= 59):
            return default_h, default_m
        return h, m
    except Exception:
        return default_h, default_m


def _is_activity_window(now_dt):
    start_h, start_m = _parse_hhmm(ACTIVITY_WINDOW_START, 6, 0)
    end_h, end_m = _parse_hhmm(ACTIVITY_WINDOW_END, 22, 0)
    start = now_dt.replace(hour=start_h, minute=start_m, second=0, microsecond=0)
    end = now_dt.replace(hour=end_h, minute=end_m, second=0, microsecond=0)
    if end <= start:
        return now_dt >= start or now_dt < end
    return start <= now_dt < end


def _format_fetch_meta(meta):
    if not isinstance(meta, dict) or not meta:
        return "meta=indisponivel"
    status = meta.get("status_code")
    final_url = meta.get("final_url")
    reason = meta.get("reason")
    markers = meta.get("login_markers")
    size = meta.get("content_len")
    return (
        f"status={status} reason={reason} markers={markers} "
        f"len={size} url={final_url}"
    )


def _parse_html_with_timeout(sistema, html, nome_unidade, timeout_sec):
    result_queue = Queue(maxsize=1)

    def _target():
        try:
            parsed = sistema.parse_html(html, nome_unidade)
            result_queue.put(("ok", parsed), timeout=1)
        except Exception as exc:
            try:
                result_queue.put(("err", exc), timeout=1)
            except Exception:
                pass

    worker = threading.Thread(
        target=_target,
        name=f"MedParse-{nome_unidade}",
        daemon=True,
    )
    worker.start()
    worker.join(timeout=timeout_sec)

    if worker.is_alive():
        raise FutureTimeoutError(f"parse_html excedeu {timeout_sec}s")

    try:
        status, payload = result_queue.get_nowait()
    except Empty:
        raise RuntimeError("parse_html terminou sem retornar resultado")

    if status == "err":
        raise payload
    return payload


def run_medico_prewarm():
    """
    Pré-aquecimento de sessão antes da abertura:
    - login
    - troca de unidade
    - leitura/parsing básico da fila
    """
    db = DatabaseManager()
    sistema = FeegowSystem()
    ts = datetime.now(tz).strftime("%H:%M:%S")
    db.update_heartbeat("monitor_medico", "RUNNING", "Prewarm: iniciando login e teste de coleta")

    if not sistema.login():
        msg = "Prewarm: falha de login no Feegow"
        print(f"[{ts}] [PREWARM] {msg}")
        db.update_heartbeat("monitor_medico", "WARNING", msg)
        return False

    ok_units = 0
    results = []
    for nome_unidade, uid in UNIDADES:
        try:
            if not sistema.trocar_unidade(uid):
                results.append(f"{nome_unidade}:troca_falhou")
                continue
            time.sleep(0.6)
            html = sistema.obter_fila_raw()
            if html is None:
                results.append(f"{nome_unidade}:sessao_invalida")
                continue
            df = _parse_html_with_timeout(sistema, html, nome_unidade, max(10, PARSE_TIMEOUT_SEC))
            ok_units += 1
            results.append(f"{nome_unidade}:{len(df)}")
        except Exception as e:
            results.append(f"{nome_unidade}:erro_{e.__class__.__name__}")

    if ok_units == len(UNIDADES):
        msg = f"Prewarm OK ({' | '.join(results)})"
        print(f"[{ts}] [PREWARM] {msg}")
        db.update_heartbeat("monitor_medico", "ONLINE", msg)
        return True

    msg = f"Prewarm parcial {ok_units}/{len(UNIDADES)} ({' | '.join(results)})"
    print(f"[{ts}] [PREWARM] {msg}")
    db.update_heartbeat("monitor_medico", "WARNING", msg)
    return False


def run_monitor_medico():
    print("=== MONITOR MEDICO (COM HISTORICO) INICIADO ===")

    sistema = FeegowSystem()
    db = DatabaseManager()
    sessao_ativa = False
    last_finalize_ts = 0
    last_cleanup_ts = 0
    last_login_ts = 0
    last_login_date = None
    consecutive_zero_cycles = 0
    warning_last_by_key = {}
    last_unit_counts = {nome: None for nome, _ in UNIDADES}
    unit_missing_tracker = {nome: {} for nome, _ in UNIDADES}
    last_midnight_finalize_date = None

    def warn_throttled(key, message, heartbeat_detail=None):
        now_ts_local = time.time()
        last = warning_last_by_key.get(key, 0)
        if (now_ts_local - last) >= WARN_THROTTLE_SECONDS:
            print(message)
            warning_last_by_key[key] = now_ts_local
        if heartbeat_detail:
            db.update_heartbeat("monitor_medico", "WARNING", heartbeat_detail)

    while True:
        try:
            db.update_heartbeat("monitor_medico", "RUNNING", "Iniciando ciclo...")

            now_local = datetime.now(tz)
            if MIDNIGHT_FINALIZE_ENABLED:
                current_date = now_local.date()
                if last_midnight_finalize_date != current_date:
                    closed_prev_day = db.finalizar_medicos_dia_anterior()
                    last_midnight_finalize_date = current_date
                    if closed_prev_day > 0:
                        print(f"   [CLEANUP] Virada de dia: {closed_prev_day} registro(s) finalizado(s).")

            if sessao_ativa:
                force_reauth = None
                if last_login_date and now_local.date() != last_login_date:
                    force_reauth = "virada de dia"
                elif LOGIN_REFRESH_MINUTES > 0 and last_login_ts > 0:
                    age_min = (time.time() - last_login_ts) / 60.0
                    if age_min >= LOGIN_REFRESH_MINUTES:
                        force_reauth = f"renovacao preventiva ({int(age_min)} min)"
                if force_reauth:
                    print(f"   [AUTH] Reautenticando por {force_reauth}...")
                    sessao_ativa = False

            if not sessao_ativa:
                print("   [AUTH] Realizando login...")
                if sistema.login():
                    sessao_ativa = True
                    last_login_ts = time.time()
                    last_login_date = datetime.now(tz).date()
                else:
                    print("   [AUTH] Falha no login. Retentando em 30s...")
                    db.update_heartbeat("monitor_medico", "WARNING", "Falha no login Feegow")
                    time.sleep(30)
                    continue

            now_ts = time.time()
            if CLEANUP_INTERVAL_SEC <= 0 or (now_ts - last_cleanup_ts) >= CLEANUP_INTERVAL_SEC:
                db.limpar_dias_anteriores()
                last_cleanup_ts = now_ts

            timestamp = datetime.now(tz).strftime("%H:%M:%S")
            total_detectado_ciclo = 0
            auth_issue_detected = False
            unidades_processadas = 0

            for nome_unidade, uid in UNIDADES:
                db.update_heartbeat("monitor_medico", "RUNNING", f"Coletando {nome_unidade}...")

                if not sistema.trocar_unidade(uid):
                    print(f"[{timestamp}] Falha ao trocar para {nome_unidade} ({uid})")
                    continue
                unidades_processadas += 1

                time.sleep(1.0)
                html = sistema.obter_fila_raw()
                if html is None:
                    meta_info = _format_fetch_meta(getattr(sistema, "last_queue_fetch_meta", {}))
                    warn_throttled(
                        f"sessao_{nome_unidade}",
                        f"[{timestamp}] [WARN] Sessao invalida em {nome_unidade}. Re-login imediato. {meta_info}",
                        f"Sessao invalida em {nome_unidade}; reautenticando",
                    )
                    sessao_ativa = False

                    if sistema.login():
                        sessao_ativa = True
                        last_login_ts = time.time()
                        last_login_date = datetime.now(tz).date()
                        if sistema.trocar_unidade(uid):
                            time.sleep(0.8)
                            html = sistema.obter_fila_raw()
                        else:
                            html = None
                    else:
                        html = None

                    if html is None:
                        auth_issue_detected = True
                        meta_info = _format_fetch_meta(getattr(sistema, "last_queue_fetch_meta", {}))
                        warn_throttled(
                            f"relogin_falha_{nome_unidade}",
                            f"[{timestamp}] [WARN] Re-login falhou em {nome_unidade}; encerrando ciclo para retry. {meta_info}",
                            f"Re-login falhou em {nome_unidade}; ciclo interrompido",
                        )
                        break

                try:
                    df = _parse_html_with_timeout(sistema, html, nome_unidade, PARSE_TIMEOUT_SEC)
                except FutureTimeoutError:
                    warn_throttled(
                        f"timeout_parse_{nome_unidade}",
                        f"[{timestamp}] [WARN] {nome_unidade}: parse_html excedeu {PARSE_TIMEOUT_SEC}s; unidade ignorada no ciclo.",
                        f"Timeout parse {nome_unidade} ({PARSE_TIMEOUT_SEC}s)",
                    )
                    continue
                except Exception as parse_err:
                    warn_throttled(
                        f"erro_parse_{nome_unidade}",
                        f"[{timestamp}] [WARN] {nome_unidade}: erro no parse_html: {parse_err}",
                        f"Erro parse {nome_unidade}",
                    )
                    continue

                qtd_unidade = 0
                coleta_vazia = df.empty
                coleta_confiavel = bool(html and "<table" in str(html).lower())

                if not df.empty:
                    qtd_unidade = len(df)
                    total_detectado_ciclo += qtd_unidade
                    db.salvar_dados_medicos(df)

                if not df.empty and "hash_id" in df.columns:
                    hash_ids_atuais = set(str(x) for x in df["hash_id"].tolist() if str(x).strip())
                elif not df.empty:
                    hash_ids_atuais = set(
                        hashlib.md5(
                            f"{nome_unidade}-{str(r.get('PACIENTE', '')).strip()}-{str(r.get('CHEGADA', '')).strip()}".encode()
                        ).hexdigest()
                        for _, r in df.iterrows()
                    )
                else:
                    hash_ids_atuais = set()

                if not df.empty and not hash_ids_atuais:
                    warn_throttled(
                        f"hash_vazio_{nome_unidade}",
                        f"[{timestamp}] [WARN] {nome_unidade}: sem hash_ids_atuais; finalizacao pausada por seguranca.",
                        f"{nome_unidade}: hash_ids ausentes",
                    )
                    if last_unit_counts.get(nome_unidade) != qtd_unidade or qtd_unidade > 0:
                        print(f"   -> {nome_unidade}: {qtd_unidade} pacientes.")
                        last_unit_counts[nome_unidade] = qtd_unidade
                    continue

                if not coleta_confiavel:
                    warn_throttled(
                        f"coleta_inconfiavel_{nome_unidade}",
                        f"[{timestamp}] [WARN] {nome_unidade}: coleta sem tabela confiavel; finalizacao pausada por seguranca.",
                        f"{nome_unidade}: coleta inconfiavel",
                    )
                else:
                    rows_ativos_local = db.execute_query(
                        """
                        SELECT hash_id, updated_at
                        FROM espera_medica
                        WHERE unidade = ? AND (status IS NULL OR status NOT LIKE ?)
                        """,
                        (nome_unidade, "Finalizado%"),
                    )

                    agora_dt = datetime.now(tz)
                    ids_para_finalizar = []
                    active_hashes_local = set()
                    unit_tracker = unit_missing_tracker.setdefault(nome_unidade, {})

                    for row in rows_ativos_local:
                        hash_id = str(row[0]) if row and row[0] is not None else ""
                        updated_at = row[1] if row and len(row) > 1 else None
                        if not hash_id:
                            continue
                        active_hashes_local.add(hash_id)

                        if hash_id in hash_ids_atuais:
                            unit_tracker.pop(hash_id, None)
                            continue

                        last_seen_dt = _parse_db_datetime(updated_at)
                        if last_seen_dt is None:
                            mins_absente = ABSENCE_CONFIRM_MINUTES + 1
                        else:
                            mins_absente = max(0.0, (agora_dt - last_seen_dt).total_seconds() / 60.0)

                        tracker_entry = unit_tracker.get(hash_id, {"cycles": 0, "mins": 0.0})
                        tracker_entry["cycles"] = int(tracker_entry.get("cycles", 0)) + 1
                        tracker_entry["mins"] = float(mins_absente)
                        unit_tracker[hash_id] = tracker_entry

                        if (
                            tracker_entry["cycles"] >= ABSENCE_CONFIRM_CYCLES
                            and mins_absente >= ABSENCE_CONFIRM_MINUTES
                        ):
                            ids_para_finalizar.append(hash_id)

                    # Remove tracking de hashes que ja nao estao mais ativos localmente.
                    for tracked_hash in list(unit_tracker.keys()):
                        if tracked_hash not in active_hashes_local:
                            unit_tracker.pop(tracked_hash, None)

                    if ids_para_finalizar:
                        finalized_count = db.finalizar_medicos_por_hash(
                            nome_unidade,
                            ids_para_finalizar,
                            motivo="Ausencia Confirmada",
                        )
                        for hash_id in ids_para_finalizar:
                            unit_tracker.pop(hash_id, None)
                        if finalized_count > 0:
                            print(
                                f"   [FINALIZACAO] {nome_unidade}: {finalized_count} paciente(s) finalizado(s) por ausencia confirmada."
                            )
                    elif coleta_vazia and active_hashes_local:
                        warn_throttled(
                            f"coleta_vazia_confirmacao_{nome_unidade}",
                            (
                                f"[{timestamp}] [WARN] {nome_unidade}: coleta vazia, "
                                f"aguardando {ABSENCE_CONFIRM_CYCLES} ciclo(s) validos para confirmar ausencia."
                            ),
                            f"{nome_unidade}: coleta vazia em confirmacao",
                        )

                # Fallback de limpeza de casos muito antigos (seguranca operacional).
                if (
                    not auth_issue_detected
                    and (FINALIZE_INTERVAL_SEC <= 0 or (time.time() - last_finalize_ts) >= FINALIZE_INTERVAL_SEC)
                ):
                    db.finalizar_expirados_medicos(nome_unidade, minutos=HARD_STALE_MINUTES)

                if last_unit_counts.get(nome_unidade) != qtd_unidade or qtd_unidade > 0:
                    print(f"   -> {nome_unidade}: {qtd_unidade} pacientes.")
                    last_unit_counts[nome_unidade] = qtd_unidade

            if FINALIZE_INTERVAL_SEC <= 0 or (time.time() - last_finalize_ts) >= FINALIZE_INTERVAL_SEC:
                last_finalize_ts = time.time()

            if auth_issue_detected:
                consecutive_zero_cycles = 0
                db.update_heartbeat(
                    "monitor_medico",
                    "WARNING",
                    "Falha de autenticacao/sessao invalida durante o ciclo; aguardando novo login.",
                )
            elif sessao_ativa:
                msg = f"Ciclo concluido. Total detectado: {total_detectado_ciclo}"

                if total_detectado_ciclo == 0:
                    if unidades_processadas == len(UNIDADES) and _is_activity_window(datetime.now(tz)):
                        consecutive_zero_cycles += 1
                        if consecutive_zero_cycles >= EMPTY_RELOGIN_CYCLES:
                            warn_msg = (
                                f"Coleta vazia suspeita por {consecutive_zero_cycles} ciclo(s); "
                                "forcando re-login no proximo ciclo."
                            )
                            print(f"[{timestamp}] [WARN] {warn_msg}")
                            db.update_heartbeat("monitor_medico", "WARNING", warn_msg)
                            sessao_ativa = False
                            consecutive_zero_cycles = 0
                        else:
                            db.update_heartbeat("monitor_medico", "ONLINE", msg)
                            print(".", end="", flush=True)
                    else:
                        consecutive_zero_cycles = 0
                        db.update_heartbeat("monitor_medico", "ONLINE", msg)
                        print(".", end="", flush=True)
                else:
                    consecutive_zero_cycles = 0
                    db.update_heartbeat("monitor_medico", "ONLINE", msg)
                    print(f"[{timestamp}] {msg}")

        except Exception as e:
            print(f"\n[ERRO CRITICO] Monitor Medico: {e}")
            try:
                db.update_heartbeat("monitor_medico", "ERROR", str(e))
            except Exception:
                pass
            sessao_ativa = False

        time.sleep(15)


if __name__ == "__main__":
    run_monitor_medico()
