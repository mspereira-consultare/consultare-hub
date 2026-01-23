import time
import sys
import os
import hashlib
import re
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv

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
            # 1. Autocura de Sessão (Login)
            if not sessao_ativa:
                print("   [AUTH] Realizando login...")
                if sistema.login():
                    sessao_ativa = True
                else:
                    print("   [AUTH] Falha no login. Retentando em 30s...")
                    time.sleep(30)
                    continue

            # Limpeza diária
            db.limpar_dias_anteriores()
            hoje = datetime.now().strftime('%Y-%m-%d')
            timestamp = datetime.now().strftime('%H:%M:%S')
            
            total_detectado_ciclo = 0
            
            # 2. Varredura por Unidade (Loop Explícito)
            for nome_unidade, uid in UNIDADES:
                # Tenta trocar a unidade
                if not sistema.trocar_unidade(uid):
                    print(f"[{timestamp}] Falha ao trocar para {nome_unidade} ({uid})")
                    continue
                
                # Pequeno delay para o servidor processar a troca de sessão
                time.sleep(1.0) 

                # Baixa o HTML
                html = sistema.obter_fila_raw()

                # Se retornou None, a sessão caiu
                if html is None:
                    print(f"[{timestamp}] Sessão expirou ao consultar {nome_unidade}.")
                    sessao_ativa = False
                    break 

                # Processa HTML
                df = sistema.parse_html(html, nome_unidade)
                
                hashes_presentes = []
                qtd_unidade = 0
                
                if not df.empty:
                    qtd_unidade = len(df)
                    total_detectado_ciclo += qtd_unidade
                    
                    # Salva no Banco
                    db.salvar_dados_medicos(df)
                    
                    # Gera Hashes para verificar saídas
                    for _, row in df.iterrows():
                        raw = f"{row['UNIDADE']}-{row['PACIENTE']}-{row['CHEGADA']}-{hoje}"
                        hashes_presentes.append(hashlib.md5(raw.encode()).hexdigest())
                
                # Verifica quem saiu da fila (foi atendido)
                db.finalizar_ausentes_medicos(nome_unidade, hashes_presentes)
                
                # Log por unidade para confirmar que passou aqui
                print(f"   -> {nome_unidade}: {qtd_unidade} pacientes.")

            if sessao_ativa:
                msg = f"Ciclo concluído. Total detectado: {total_detectado_ciclo}"
                # AVISA QUE ESTÁ VIVO
                db.update_heartbeat("Monitor Médico", "online", msg)
                
                if total_detectado_ciclo == 0:
                    print(".", end="", flush=True)
                else:
                    print(f"[{timestamp}] {msg}")

        except Exception as e:
            print(f"\n[ERRO CRÍTICO] Monitor Médico: {e}")
            # AVISA QUE DEU ERRO
            try: db.update_heartbeat("Monitor Médico", "error", str(e))
            except: pass
            sessao_ativa = False
        
        # Espera 15s para o próximo ciclo
        time.sleep(15)

if __name__ == "__main__":
    run_monitor_medico()