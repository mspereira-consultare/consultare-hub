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

    while True:
        try:
            db.update_heartbeat("Monitor Medico", "RUNNING", "Iniciando ciclo...")

            if not sessao_ativa:
                print("   [AUTH] Realizando login...")
                if sistema.login():
                    sessao_ativa = True
                else:
                    print("   [AUTH] Falha no login. Retentando em 30s...")
                    time.sleep(30)
                    continue

            db.limpar_dias_anteriores()
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

                # 🔥 NOVO MODELO: Finaliza apenas quem sumiu por tempo
                db.finalizar_expirados_medicos(nome_unidade, minutos=5)

                print(f"   -> {nome_unidade}: {qtd_unidade} pacientes.")

            if sessao_ativa:
                msg = f"Ciclo concluído. Total detectado: {total_detectado_ciclo}"
                db.update_heartbeat("Monitor Médico", "online", msg)

                if total_detectado_ciclo == 0:
                    print(".", end="", flush=True)
                else:
                    print(f"[{timestamp}] {msg}")

        except Exception as e:
            print(f"\n[ERRO CRÍTICO] Monitor Médico: {e}")
            try:
                db.update_heartbeat("Monitor Médico", "error", str(e))
            except:
                pass
            sessao_ativa = False

        time.sleep(15)


if __name__ == "__main__":
    run_monitor_medico()