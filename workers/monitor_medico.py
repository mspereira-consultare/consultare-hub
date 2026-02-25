import time
import sys
import os
import hashlib
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError

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
PARSE_TIMEOUT_SEC = max(5, int(os.getenv("MEDICO_PARSE_TIMEOUT_SEC", "25")))

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


def _parse_html_with_timeout(sistema, html, nome_unidade, timeout_sec):
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(sistema.parse_html, html, nome_unidade)
        return future.result(timeout=timeout_sec)


def run_monitor_medico():
    print("=== MONITOR MEDICO (COM HISTORICO) INICIADO ===")

    sistema = FeegowSystem()
    db = DatabaseManager()
    sessao_ativa = False
    last_finalize_ts = 0
    last_cleanup_ts = 0

    while True:
        try:
            db.update_heartbeat("monitor_medico", "RUNNING", "Iniciando ciclo...")

            if not sessao_ativa:
                print("   [AUTH] Realizando login...")
                if sistema.login():
                    sessao_ativa = True
                else:
                    print("   [AUTH] Falha no login. Retentando em 30s...")
                    time.sleep(30)
                    continue

            now_ts = time.time()
            if CLEANUP_INTERVAL_SEC <= 0 or (now_ts - last_cleanup_ts) >= CLEANUP_INTERVAL_SEC:
                db.limpar_dias_anteriores()
                last_cleanup_ts = now_ts

            timestamp = datetime.now(tz).strftime("%H:%M:%S")
            total_detectado_ciclo = 0

            for nome_unidade, uid in UNIDADES:
                db.update_heartbeat("monitor_medico", "RUNNING", f"Coletando {nome_unidade}...")

                if not sistema.trocar_unidade(uid):
                    print(f"[{timestamp}] Falha ao trocar para {nome_unidade} ({uid})")
                    continue

                time.sleep(1.0)
                html = sistema.obter_fila_raw()
                if html is None:
                    print(f"[{timestamp}] Sessao expirou ao consultar {nome_unidade}.")
                    sessao_ativa = False
                    break

                try:
                    df = _parse_html_with_timeout(sistema, html, nome_unidade, PARSE_TIMEOUT_SEC)
                except FutureTimeoutError:
                    print(
                        f"[{timestamp}] [WARN] {nome_unidade}: parse_html excedeu "
                        f"{PARSE_TIMEOUT_SEC}s; pulando unidade neste ciclo."
                    )
                    db.update_heartbeat(
                        "monitor_medico",
                        "WARNING",
                        f"Timeout parse {nome_unidade} ({PARSE_TIMEOUT_SEC}s)",
                    )
                    continue
                except Exception as parse_err:
                    print(f"[{timestamp}] [WARN] {nome_unidade}: erro no parse_html: {parse_err}")
                    db.update_heartbeat("monitor_medico", "WARNING", f"Erro parse {nome_unidade}")
                    continue

                qtd_unidade = 0
                coleta_vazia = df.empty

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
                    print(f"[{timestamp}] [WARN] {nome_unidade}: sem hash_ids_atuais; pulando finalizacao por seguranca.")
                    print(f"   -> {nome_unidade}: {qtd_unidade} pacientes.")
                    continue

                if coleta_vazia:
                    # Evita finalizar em massa quando o scrape vier vazio por oscilacao/intermitencia.
                    print(
                        f"[{timestamp}] [WARN] {nome_unidade}: coleta vazia; "
                        f"finalizacao por ausencia pausada neste ciclo."
                    )
                else:
                    conn = db.get_connection()
                    try:
                        cursor = conn.cursor()
                        cursor.execute(
                            """
                            SELECT hash_id, updated_at
                            FROM espera_medica
                            WHERE unidade = %s AND (status IS NULL OR status NOT LIKE 'Finalizado%%')
                            """,
                            (nome_unidade,),
                        )
                        rows_ativos_local = cursor.fetchall()

                        agora_dt = datetime.now(tz)
                        ids_para_finalizar = []

                        for row in rows_ativos_local:
                            hash_id = row[0]
                            updated_at = row[1]

                            if hash_id in hash_ids_atuais:
                                continue

                            last_seen_dt = _parse_db_datetime(updated_at)
                            if last_seen_dt is None:
                                ids_para_finalizar.append(hash_id)
                                continue

                            mins_absente = (agora_dt - last_seen_dt).total_seconds() / 60.0
                            if mins_absente >= ABSENCE_CONFIRM_MINUTES:
                                ids_para_finalizar.append(hash_id)

                        if ids_para_finalizar:
                            agora = datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")
                            for hash_id in ids_para_finalizar:
                                cursor.execute(
                                    """
                                    UPDATE espera_medica
                                    SET status = 'Finalizado (Saiu)', updated_at = %s
                                    WHERE hash_id = %s
                                      AND unidade = %s
                                      AND (status IS NULL OR status NOT LIKE 'Finalizado%%')
                                    """,
                                    (agora, hash_id, nome_unidade),
                                )
                            if not db.use_turso:
                                conn.commit()
                            # Evita cache stale bloquear reabertura se paciente reaparecer.
                            db.clear_espera_cache(ids_para_finalizar)
                    finally:
                        conn.close()

                # Fallback legado de limpeza por tempo (casos presos)
                if FINALIZE_INTERVAL_SEC <= 0 or (time.time() - last_finalize_ts) >= FINALIZE_INTERVAL_SEC:
                    db.finalizar_expirados_medicos(nome_unidade, minutos=120)

                print(f"   -> {nome_unidade}: {qtd_unidade} pacientes.")

            if FINALIZE_INTERVAL_SEC <= 0 or (time.time() - last_finalize_ts) >= FINALIZE_INTERVAL_SEC:
                last_finalize_ts = time.time()

            if sessao_ativa:
                msg = f"Ciclo concluido. Total detectado: {total_detectado_ciclo}"
                db.update_heartbeat("monitor_medico", "ONLINE", msg)

                if total_detectado_ciclo == 0:
                    print(".", end="", flush=True)
                else:
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
