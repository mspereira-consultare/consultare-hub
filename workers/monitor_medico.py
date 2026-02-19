import time
import sys
import os
import hashlib
import re
import pytz
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv

tz = pytz.timezone("America/Sao_Paulo")

# Ajuste para rodar tanto da raiz quanto da pasta workers
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Imports com fallback
try:
    from feegow_core import FeegowSystem
    from database_manager import DatabaseManager
except ImportError:
    from .feegow_core import FeegowSystem
    from .database_manager import DatabaseManager

load_dotenv()

FINALIZE_INTERVAL_SEC = int(os.getenv("MEDICO_FINALIZE_INTERVAL_SEC", "300"))
CLEANUP_INTERVAL_SEC = int(os.getenv("MEDICO_CLEANUP_INTERVAL_SEC", "600"))

# IDs corretos das unidades
UNIDADES = [
    ("Ouro Verde", 2),
    ("Centro Cambui", 3),
    ("Campinas Shopping", 12)
]

def run_monitor_medico():
    print("=== MONITOR MÉDICO (COM HISTÓRICO) INICIADO ===")
    
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
            hoje = datetime.now(tz).strftime('%Y-%m-%d')
            timestamp = datetime.now(tz).strftime('%H:%M:%S')

            total_detectado_ciclo = 0

            for nome_unidade, uid in UNIDADES:
                if not sistema.trocar_unidade(uid):
                    print(f"[{timestamp}] Falha ao trocar para {nome_unidade} ({uid})")
                    continue
                
                time.sleep(1.0)
                html = sistema.obter_fila_raw()

                if html is None:
                    print(f"[{timestamp}] Sessão expirou ao consultar {nome_unidade}.")
                    sessao_ativa = False
                    break 

                df = sistema.parse_html(html, nome_unidade)
                qtd_unidade = 0
                
                if not df.empty:
                    qtd_unidade = len(df)
                    total_detectado_ciclo += qtd_unidade
                    # Salva e atualiza last_seen_at
                    db.salvar_dados_medicos(df)

                # --- Sincronização: finaliza imediatamente quem saiu da fila ---
                if not df.empty and 'hash_id' in df.columns:
                    hash_ids_atuais = set(str(x) for x in df['hash_id'].tolist() if str(x).strip())
                elif not df.empty:
                    # Fallback defensivo para nunca zerar a fila por falta de hash_id.
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
                conn = db.get_connection()
                try:
                    cursor = conn.cursor()
                    cursor.execute("""
                        SELECT hash_id FROM espera_medica
                        WHERE unidade = %s AND (status IS NULL OR status NOT LIKE 'Finalizado%%')
                    """, (nome_unidade,))
                    hash_ids_local = set(row[0] for row in cursor.fetchall())
                    ids_para_finalizar = hash_ids_local - hash_ids_atuais
                    if ids_para_finalizar:
                        agora = datetime.now(tz).strftime('%Y-%m-%d %H:%M:%S')
                        for hash_id in ids_para_finalizar:
                            cursor.execute("""
                                UPDATE espera_medica SET status = 'Finalizado (Saiu)', updated_at = %s
                                WHERE hash_id = %s AND unidade = %s AND (status IS NULL OR status NOT LIKE 'Finalizado%%')
                            """, (agora, hash_id, nome_unidade))
                        if not db.use_turso:
                            conn.commit()
                finally:
                    conn.close()

                # 🔥 Modelo antigo: Finaliza por tempo (mantido como fallback)
                if FINALIZE_INTERVAL_SEC <= 0 or (time.time() - last_finalize_ts) >= FINALIZE_INTERVAL_SEC:
                    db.finalizar_expirados_medicos(nome_unidade, minutos=120)

                print(f"   -> {nome_unidade}: {qtd_unidade} pacientes.")

            if FINALIZE_INTERVAL_SEC <= 0 or (time.time() - last_finalize_ts) >= FINALIZE_INTERVAL_SEC:
                last_finalize_ts = time.time()

            if sessao_ativa:
                msg = f"Ciclo concluído. Total detectado: {total_detectado_ciclo}"
                db.update_heartbeat("monitor_medico", "ONLINE", msg)

                if total_detectado_ciclo == 0:
                    print(".", end="", flush=True)
                else:
                    print(f"[{timestamp}] {msg}")

        except Exception as e:
            print(f"\n[ERRO CRÍTICO] Monitor Médico: {e}")
            try:
                db.update_heartbeat("monitor_medico", "ERROR", str(e))
            except:
                pass
            sessao_ativa = False

        time.sleep(15)


if __name__ == "__main__":
    run_monitor_medico()
