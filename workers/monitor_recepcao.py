import time
import sys
import os
from datetime import datetime
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from feegow_recepcao_core import FeegowRecepcaoSystem
    from database_manager import DatabaseManager
except ImportError:
    from .feegow_recepcao_core import FeegowRecepcaoSystem
    from .database_manager import DatabaseManager

load_dotenv()

def run_monitor_recepcao():
    print("=== MONITOR RECEPÇÃO (HÍBRIDO) INICIADO ===")
    
    sistema = FeegowRecepcaoSystem()
    db = DatabaseManager()

    while True:
        try:
            sistema = FeegowRecepcaoSystem()
            db.update_heartbeat("monitor_recepcao", "RUNNING", "Buscando dados...")
            
            timestamp = datetime.now().strftime('%H:%M:%S')

            dados_brutos, msg_erro = sistema.obter_dados_brutos(unidades=[2, 3, 12])

            if "Cookie Expirou" in msg_erro or "403" in msg_erro:
                err_msg = "🚨 TOKEN EXPIROU."
                print(f"\n[{timestamp}] {err_msg}")
                db.update_heartbeat("monitor_recepcao", "ERROR", err_msg)
            
            elif msg_erro != "OK" and not dados_brutos:
                print(f"[{timestamp}] Erro técnico: {msg_erro}")
                db.update_heartbeat("monitor_recepcao", "WARNING", f"Falha API: {msg_erro}")
            
            else:
                if dados_brutos:
                    db.salvar_dados_recepcao(dados_brutos)
                
                resumo_unidades = []
                for uid in [2, 3, 12]:
                    ids_nesta_unidade = [
                        item['id'] for item in dados_brutos 
                        if str(item.get('UnidadeID_Coleta')) == str(uid)
                    ]
                    db.finalizar_ausentes_recepcao(uid, ids_nesta_unidade)
                    
                    # Nome curto para o log
                    nome_u = "Ouro Verde" if uid == 2 else "Cambuí" if uid == 3 else "Shop. Campinas"
                    resumo_unidades.append(f"{nome_u}: {len(ids_nesta_unidade)}")

                # Monta a linha única de log
                string_unidades = " | ".join(resumo_unidades)
                status_msg = f"Fila: {len(dados_brutos)} ({string_unidades})"
                
                print(f"[{timestamp}] ✅ {status_msg}")
                db.update_heartbeat("monitor_recepcao", "ONLINE", status_msg)

        except KeyboardInterrupt:
            print("\nMonitor encerrado.")
            break
        except Exception as e:
            print(f"\n[ERRO CRÍTICO RECEPÇÃO] {e}")
            db.update_heartbeat("monitor_recepcao", "ERROR", str(e))

        time.sleep(15)

if __name__ == "__main__":
    run_monitor_recepcao()
