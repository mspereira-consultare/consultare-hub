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
    print("=== MONITOR RECEPÇÃO (MODO TOKEN MANUAL) INICIADO ===")
    
    sistema = FeegowRecepcaoSystem()
    db = DatabaseManager()

    while True:
        try:
            db.limpar_dias_anteriores()
            timestamp = datetime.now().strftime('%H:%M:%S')

            # Coleta dados (ele lê o cookie do banco sozinho)
            dados_brutos, msg_erro = sistema.obter_dados_brutos(unidades=[2, 3, 12])

            # --- DETECÇÃO DE TOKEN EXPIRADO ---
            if "Cookie Expirou" in msg_erro or "403" in msg_erro:
                print(f"\n[{timestamp}] 🚨 ALERTA: O TOKEN DA RECEPÇÃO EXPIROU!")
                print("   Ação Necessária: Rode 'python atualizar_token.py' e cole um novo cookie.")
                print("   (O monitor continuará tentando a cada 15s até você atualizar)\n")
            
            elif msg_erro != "OK" and not dados_brutos:
                print(f"[{timestamp}] Erro técnico: {msg_erro}")
            
            else:
                # Fluxo Normal
                if dados_brutos:
                    db.salvar_dados_recepcao(dados_brutos)
                
                # Baixa automática de quem saiu da fila
                for uid in [2, 3, 12]:
                    ids_nesta_unidade = [
                        item['id'] for item in dados_brutos 
                        if item.get('UnidadeID') == uid or item.get('UnidadeID_Coleta') == uid
                    ]
                    db.finalizar_ausentes_recepcao(uid, ids_nesta_unidade)

                if dados_brutos:
                    print(f"[{timestamp}] OK. {len(dados_brutos)} pessoas na fila.")
                else:
                    print(".", end="", flush=True)

        except KeyboardInterrupt:
            print("\nMonitor encerrado.")
            break
        except Exception as e:
            print(f"\n[ERRO CRÍTICO] {e}")

        time.sleep(15)

if __name__ == "__main__":
    run_monitor_recepcao()