import time
import sys
import os
import hashlib
import threading
import uuid
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
MONITOR_CYCLE_LOG_RETENTION_DAYS = max(1, int(os.getenv("MONITOR_MEDICO_CYCLE_LOG_RETENTION_DAYS", "30")))
MONITOR_EVENT_LOG_RETENTION_DAYS = max(1, int(os.getenv("MONITOR_MEDICO_EVENT_LOG_RETENTION_DAYS", "60")))
MONITOR_LOG_INCLUDE_HTML_SNIPPET = str(os.getenv("MONITOR_MEDICO_LOG_INCLUDE_HTML_SNIPPET", "0")).strip().lower() in ("1", "true", "yes")
MONITOR_LOG_HTML_SNIPPET_MAX_CHARS = max(80, int(os.getenv("MONITOR_MEDICO_LOG_HTML_SNIPPET_MAX_CHARS", "400")))

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


def _make_log_id(prefix):
    return f"{prefix}_{uuid.uuid4().hex}"


def _serialize_fetch_meta(meta, html=None):
    payload = dict(meta or {})
    if html:
        payload["html_hash"] = hashlib.sha1(str(html).encode("utf-8", errors="ignore")).hexdigest()
        if MONITOR_LOG_INCLUDE_HTML_SNIPPET:
            snippet = " ".join(str(html).split())
            payload["html_snippet"] = snippet[:MONITOR_LOG_HTML_SNIPPET_MAX_CHARS]
    return payload


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

    def log_event(cycle_id, unit_name, unit_id, event_type, severity="info", payload=None, patient_hash_id=None, patient_name=None):
        try:
            db.insert_monitor_medico_event_log({
                "id": _make_log_id("mmev"),
                "cycle_id": cycle_id,
                "unit_name": unit_name,
                "unit_id": unit_id,
                "event_type": event_type,
                "severity": severity,
                "patient_hash_id": patient_hash_id,
                "patient_name": patient_name,
                "payload_json": payload or {},
            })
        except Exception:
            pass

    def create_unit_cycle_log(cycle_id, cycle_started_at, unit_name, unit_id, session_was_active, login_performed=False, login_success=False):
        log_id = _make_log_id("mmcy")
        db.create_monitor_medico_cycle_log({
            "id": log_id,
            "cycle_id": cycle_id,
            "cycle_started_at": cycle_started_at,
            "unit_name": unit_name,
            "unit_id": unit_id,
            "session_was_active": session_was_active,
            "login_performed": login_performed,
            "login_success": login_success,
            "created_at": cycle_started_at,
            "updated_at": cycle_started_at,
        })
        return log_id

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
            cycle_started_at = datetime.now(tz).strftime('%Y-%m-%d %H:%M:%S')
            cycle_id = _make_log_id("mmc")
            login_performed_this_cycle = False
            login_success_this_cycle = False

            now_local = datetime.now(tz)
            if MIDNIGHT_FINALIZE_ENABLED:
                current_date = now_local.date()
                if last_midnight_finalize_date != current_date:
                    closed_prev_day = db.finalizar_medicos_dia_anterior()
                    last_midnight_finalize_date = current_date
                    if closed_prev_day > 0:
                        print(f"   [CLEANUP] Virada de dia: {closed_prev_day} registro(s) finalizado(s).")
                        log_event(
                            cycle_id,
                            None,
                            None,
                            "midnight_finalize",
                            "info",
                            {"finalized_count": int(closed_prev_day)},
                        )

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
                    log_event(
                        cycle_id,
                        None,
                        None,
                        "forced_reauth_by_day_turn" if "virada de dia" in force_reauth else "forced_reauth_by_refresh_window",
                        "info",
                        {"reason": force_reauth},
                    )
                    sessao_ativa = False

            if not sessao_ativa:
                print("   [AUTH] Realizando login...")
                log_event(cycle_id, None, None, "login_started", "info", {"reason": "session_inactive"})
                login_performed_this_cycle = True
                if sistema.login():
                    sessao_ativa = True
                    login_success_this_cycle = True
                    last_login_ts = time.time()
                    last_login_date = datetime.now(tz).date()
                else:
                    print("   [AUTH] Falha no login. Retentando em 30s...")
                    db.update_heartbeat("monitor_medico", "WARNING", "Falha no login Feegow")
                    log_event(cycle_id, None, None, "login_failed", "error", {"reason": "initial_login_failed"})
                    time.sleep(30)
                    continue

            now_ts = time.time()
            if CLEANUP_INTERVAL_SEC <= 0 or (now_ts - last_cleanup_ts) >= CLEANUP_INTERVAL_SEC:
                db.limpar_dias_anteriores()
                db.limpar_logs_monitor_medico(
                    cycle_retention_days=MONITOR_CYCLE_LOG_RETENTION_DAYS,
                    event_retention_days=MONITOR_EVENT_LOG_RETENTION_DAYS,
                )
                last_cleanup_ts = now_ts

            timestamp = datetime.now(tz).strftime("%H:%M:%S")
            total_detectado_ciclo = 0
            auth_issue_detected = False
            unidades_processadas = 0

            for nome_unidade, uid in UNIDADES:
                db.update_heartbeat("monitor_medico", "RUNNING", f"Coletando {nome_unidade}...")
                unit_cycle_log_id = create_unit_cycle_log(
                    cycle_id,
                    cycle_started_at,
                    nome_unidade,
                    uid,
                    sessao_ativa,
                    login_performed=login_performed_this_cycle,
                    login_success=login_success_this_cycle,
                )

                if not sistema.trocar_unidade(uid):
                    print(f"[{timestamp}] Falha ao trocar para {nome_unidade} ({uid})")
                    db.update_monitor_medico_cycle_log(
                        unit_cycle_log_id,
                        {
                            "cycle_result": "skipped",
                            "message": f"Falha ao trocar unidade {uid}",
                        },
                    )
                    log_event(
                        cycle_id,
                        nome_unidade,
                        uid,
                        "queue_untrusted_response",
                        "warning",
                        {"reason": "trocar_unidade_failed"},
                    )
                    continue
                unidades_processadas += 1

                time.sleep(1.0)
                html = sistema.obter_fila_raw()
                fetch_meta = _serialize_fetch_meta(getattr(sistema, "last_queue_fetch_meta", {}), html)
                queue_fetch_status = str(fetch_meta.get("reason") or "ok")
                if html is not None and sistema._looks_like_empty_queue_html(str(html)):
                    queue_fetch_status = "empty_valid"

                db.update_monitor_medico_cycle_log(
                    unit_cycle_log_id,
                    {
                        "queue_fetch_status": queue_fetch_status,
                        "queue_fetch_meta_json": fetch_meta,
                    },
                )
                if html is None:
                    meta_info = _format_fetch_meta(getattr(sistema, "last_queue_fetch_meta", {}))
                    log_event(
                        cycle_id,
                        nome_unidade,
                        uid,
                        "session_invalid_detected",
                        "warning",
                        {"fetch_meta": fetch_meta},
                    )
                    warn_throttled(
                        f"sessao_{nome_unidade}",
                        f"[{timestamp}] [WARN] Sessao invalida em {nome_unidade}. Re-login imediato. {meta_info}",
                        f"Sessao invalida em {nome_unidade}; reautenticando",
                    )
                    sessao_ativa = False

                    db.update_monitor_medico_cycle_log(
                        unit_cycle_log_id,
                        {
                            "session_was_active": False,
                            "login_performed": True,
                        },
                    )

                    if sistema.login():
                        sessao_ativa = True
                        last_login_ts = time.time()
                        last_login_date = datetime.now(tz).date()
                        log_event(
                            cycle_id,
                            nome_unidade,
                            uid,
                            "relogin_success",
                            "info",
                            {"reason": "session_invalid"},
                        )
                        if sistema.trocar_unidade(uid):
                            time.sleep(0.8)
                            html = sistema.obter_fila_raw()
                            fetch_meta = _serialize_fetch_meta(getattr(sistema, "last_queue_fetch_meta", {}), html)
                            queue_fetch_status = str(fetch_meta.get("reason") or "ok")
                            if html is not None and sistema._looks_like_empty_queue_html(str(html)):
                                queue_fetch_status = "empty_valid"
                            db.update_monitor_medico_cycle_log(
                                unit_cycle_log_id,
                                {
                                    "login_success": True,
                                    "queue_fetch_status": queue_fetch_status,
                                    "queue_fetch_meta_json": fetch_meta,
                                },
                            )
                        else:
                            html = None
                    else:
                        log_event(
                            cycle_id,
                            nome_unidade,
                            uid,
                            "relogin_failed",
                            "error",
                            {"reason": "session_invalid"},
                        )
                        html = None

                    if html is None:
                        auth_issue_detected = True
                        meta_info = _format_fetch_meta(getattr(sistema, "last_queue_fetch_meta", {}))
                        warn_throttled(
                            f"relogin_falha_{nome_unidade}",
                            f"[{timestamp}] [WARN] Re-login falhou em {nome_unidade}; encerrando ciclo para retry. {meta_info}",
                            f"Re-login falhou em {nome_unidade}; ciclo interrompido",
                        )
                        db.update_monitor_medico_cycle_log(
                            unit_cycle_log_id,
                            {
                                "cycle_result": "auth_retry",
                                "message": "Re-login falhou; ciclo interrompido",
                            },
                        )
                        break

                try:
                    df = _parse_html_with_timeout(sistema, html, nome_unidade, PARSE_TIMEOUT_SEC)
                    db.update_monitor_medico_cycle_log(
                        unit_cycle_log_id,
                        {"parse_status": "ok"},
                    )
                except FutureTimeoutError:
                    log_event(
                        cycle_id,
                        nome_unidade,
                        uid,
                        "parse_timeout",
                        "warning",
                        {"timeout_sec": PARSE_TIMEOUT_SEC},
                    )
                    warn_throttled(
                        f"timeout_parse_{nome_unidade}",
                        f"[{timestamp}] [WARN] {nome_unidade}: parse_html excedeu {PARSE_TIMEOUT_SEC}s; unidade ignorada no ciclo.",
                        f"Timeout parse {nome_unidade} ({PARSE_TIMEOUT_SEC}s)",
                    )
                    db.update_monitor_medico_cycle_log(
                        unit_cycle_log_id,
                        {
                            "parse_status": "timeout",
                            "cycle_result": "warning",
                            "message": f"Timeout no parse ({PARSE_TIMEOUT_SEC}s)",
                        },
                    )
                    continue
                except Exception as parse_err:
                    log_event(
                        cycle_id,
                        nome_unidade,
                        uid,
                        "parse_error",
                        "error",
                        {"error": str(parse_err)},
                    )
                    warn_throttled(
                        f"erro_parse_{nome_unidade}",
                        f"[{timestamp}] [WARN] {nome_unidade}: erro no parse_html: {parse_err}",
                        f"Erro parse {nome_unidade}",
                    )
                    db.update_monitor_medico_cycle_log(
                        unit_cycle_log_id,
                        {
                            "parse_status": "error",
                            "cycle_result": "error",
                            "message": f"Erro no parse: {parse_err}",
                        },
                    )
                    continue

                qtd_unidade = 0
                coleta_vazia = df.empty
                coleta_confiavel = bool(html and sistema.is_valid_queue_html(str(html)))

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

                db.update_monitor_medico_cycle_log(
                    unit_cycle_log_id,
                    {
                        "patients_detected_count": qtd_unidade,
                        "hashes_detected_count": len(hash_ids_atuais),
                        "coleta_confiavel": coleta_confiavel,
                        "coleta_vazia": coleta_vazia,
                        "queue_fetch_status": "empty_valid" if coleta_vazia and coleta_confiavel else queue_fetch_status,
                        "queue_fetch_meta_json": fetch_meta,
                    },
                )

                if coleta_vazia and coleta_confiavel:
                    log_event(
                        cycle_id,
                        nome_unidade,
                        uid,
                        "queue_empty_valid",
                        "info",
                        {"fetch_meta": fetch_meta},
                    )

                if not df.empty and not hash_ids_atuais:
                    log_event(
                        cycle_id,
                        nome_unidade,
                        uid,
                        "hash_missing_safety_pause",
                        "warning",
                        {"patients_detected_count": qtd_unidade},
                    )
                    warn_throttled(
                        f"hash_vazio_{nome_unidade}",
                        f"[{timestamp}] [WARN] {nome_unidade}: sem hash_ids_atuais; finalizacao pausada por seguranca.",
                        f"{nome_unidade}: hash_ids ausentes",
                    )
                    db.update_monitor_medico_cycle_log(
                        unit_cycle_log_id,
                        {
                            "cycle_result": "warning",
                            "message": "hash_ids ausentes; finalização pausada por segurança",
                        },
                    )
                    if last_unit_counts.get(nome_unidade) != qtd_unidade or qtd_unidade > 0:
                        print(f"   -> {nome_unidade}: {qtd_unidade} pacientes.")
                        last_unit_counts[nome_unidade] = qtd_unidade
                    continue

                if not coleta_confiavel:
                    log_event(
                        cycle_id,
                        nome_unidade,
                        uid,
                        "queue_untrusted_response",
                        "warning",
                        {"fetch_meta": fetch_meta},
                    )
                    warn_throttled(
                        f"coleta_inconfiavel_{nome_unidade}",
                        f"[{timestamp}] [WARN] {nome_unidade}: coleta sem resposta confiavel; finalizacao pausada por seguranca.",
                        f"{nome_unidade}: coleta inconfiavel",
                    )
                    db.update_monitor_medico_cycle_log(
                        unit_cycle_log_id,
                        {
                            "cycle_result": "warning",
                            "message": "Coleta sem resposta confiável; finalização pausada",
                        },
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
                    missing_candidates_count = 0

                    for row in rows_ativos_local:
                        hash_id = str(row[0]) if row and row[0] is not None else ""
                        updated_at = row[1] if row and len(row) > 1 else None
                        if not hash_id:
                            continue
                        active_hashes_local.add(hash_id)

                        if hash_id in hash_ids_atuais:
                            unit_tracker.pop(hash_id, None)
                            continue

                        missing_candidates_count += 1
                        last_seen_dt = _parse_db_datetime(updated_at)
                        if last_seen_dt is None:
                            mins_absente = ABSENCE_CONFIRM_MINUTES + 1
                        else:
                            mins_absente = max(0.0, (agora_dt - last_seen_dt).total_seconds() / 60.0)

                        tracker_entry = unit_tracker.get(hash_id, {"cycles": 0, "mins": 0.0, "patient_name": None})
                        tracker_entry["cycles"] = int(tracker_entry.get("cycles", 0)) + 1
                        tracker_entry["mins"] = float(mins_absente)
                        tracker_entry["patient_name"] = tracker_entry.get("patient_name") or None
                        unit_tracker[hash_id] = tracker_entry

                        event_type = "absence_tracking_started" if tracker_entry["cycles"] == 1 else "absence_tracking_progress"
                        log_event(
                            cycle_id,
                            nome_unidade,
                            uid,
                            event_type,
                            "info",
                            {
                                "cycles": tracker_entry["cycles"],
                                "mins_absente": round(mins_absente, 2),
                                "threshold_cycles": ABSENCE_CONFIRM_CYCLES,
                                "threshold_minutes": ABSENCE_CONFIRM_MINUTES,
                            },
                            patient_hash_id=hash_id,
                        )

                        if (
                            tracker_entry["cycles"] >= ABSENCE_CONFIRM_CYCLES
                            and mins_absente >= ABSENCE_CONFIRM_MINUTES
                        ):
                            ids_para_finalizar.append(hash_id)

                    # Remove tracking de hashes que ja nao estao mais ativos localmente.
                    for tracked_hash in list(unit_tracker.keys()):
                        if tracked_hash not in active_hashes_local:
                            unit_tracker.pop(tracked_hash, None)

                    finalized_absence_count = 0
                    if ids_para_finalizar:
                        finalized_count = db.finalizar_medicos_por_hash(
                            nome_unidade,
                            ids_para_finalizar,
                            motivo="Ausencia Confirmada",
                        )
                        for hash_id in ids_para_finalizar:
                            log_event(
                                cycle_id,
                                nome_unidade,
                                uid,
                                "absence_confirmed_finalize",
                                "info",
                                {
                                    "threshold_cycles": ABSENCE_CONFIRM_CYCLES,
                                    "threshold_minutes": ABSENCE_CONFIRM_MINUTES,
                                },
                                patient_hash_id=hash_id,
                            )
                            unit_tracker.pop(hash_id, None)
                        if finalized_count > 0:
                            finalized_absence_count = finalized_count
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

                    db.update_monitor_medico_cycle_log(
                        unit_cycle_log_id,
                        {
                            "active_rows_before_count": len(rows_ativos_local),
                            "missing_candidates_count": missing_candidates_count,
                            "absence_tracking_count": len(unit_tracker),
                            "finalized_absence_count": finalized_absence_count,
                            "cycle_result": "ok" if coleta_confiavel else "warning",
                            "message": (
                                f"Coleta ok; detectados={qtd_unidade}; ativos_antes={len(rows_ativos_local)}; "
                                f"ausentes={missing_candidates_count}; confirmacao={len(unit_tracker)}"
                            ),
                        },
                    )

                # Fallback de limpeza de casos muito antigos (seguranca operacional).
                if (
                    not auth_issue_detected
                    and (FINALIZE_INTERVAL_SEC <= 0 or (time.time() - last_finalize_ts) >= FINALIZE_INTERVAL_SEC)
                ):
                    finalized_hard_stale_count = db.finalizar_expirados_medicos(
                        nome_unidade,
                        minutos=HARD_STALE_MINUTES,
                    )
                    if finalized_hard_stale_count > 0:
                        log_event(
                            cycle_id,
                            nome_unidade,
                            uid,
                            "hard_stale_finalize",
                            "warning",
                            {
                                "finalized_count": int(finalized_hard_stale_count),
                                "minutes": HARD_STALE_MINUTES,
                            },
                        )
                        db.update_monitor_medico_cycle_log(
                            unit_cycle_log_id,
                            {
                                "finalized_hard_stale_count": finalized_hard_stale_count,
                            },
                        )

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
                log_event(
                    cycle_id,
                    None,
                    None,
                    "session_invalid_detected",
                    "warning",
                    {"scope": "cycle", "message": "Falha de autenticacao/sessao invalida durante o ciclo"},
                )
            elif sessao_ativa:
                msg = f"Ciclo concluido. Total detectado: {total_detectado_ciclo}"

                if total_detectado_ciclo == 0:
                    if unidades_processadas == len(UNIDADES) and _is_activity_window(datetime.now(tz)):
                        consecutive_zero_cycles += 1
                        if consecutive_zero_cycles == 1:
                            log_event(
                                cycle_id,
                                None,
                                None,
                                "suspicious_zero_cycle",
                                "warning",
                                {"count": consecutive_zero_cycles, "units_processed": unidades_processadas},
                            )
                        if consecutive_zero_cycles >= EMPTY_RELOGIN_CYCLES:
                            warn_msg = (
                                f"Coleta vazia suspeita por {consecutive_zero_cycles} ciclo(s); "
                                "forcando re-login no proximo ciclo."
                            )
                            print(f"[{timestamp}] [WARN] {warn_msg}")
                            db.update_heartbeat("monitor_medico", "WARNING", warn_msg)
                            log_event(
                                cycle_id,
                                None,
                                None,
                                "suspicious_zero_cycle",
                                "warning",
                                {
                                    "count": consecutive_zero_cycles,
                                    "units_processed": unidades_processadas,
                                    "action": "force_relogin_next_cycle",
                                },
                            )
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
                log_event(
                    locals().get("cycle_id"),
                    None,
                    None,
                    "critical_loop_error",
                    "error",
                    {"scope": "critical_loop", "error": str(e)},
                )
            except Exception:
                pass
            sessao_ativa = False

        time.sleep(15)


if __name__ == "__main__":
    run_monitor_medico()
