import os
import sys
import time
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
    print("=== MONITOR RECEPCAO (HIBRIDO) INICIADO ===")

    sistema = FeegowRecepcaoSystem()
    db = DatabaseManager()

    while True:
        try:
            sistema = FeegowRecepcaoSystem()
            db.update_heartbeat("monitor_recepcao", "RUNNING", "Buscando dados...")

            timestamp = datetime.now().strftime("%H:%M:%S")
            dados_brutos, msg_erro = sistema.obter_dados_brutos(unidades=[2, 3, 12])

            if "Cookie Expirou" in msg_erro or "403" in msg_erro:
                err_msg = "TOKEN EXPIROU"
                print(f"\n[{timestamp}] {err_msg}")
                db.update_heartbeat("monitor_recepcao", "ERROR", err_msg)

            elif msg_erro != "OK" and not dados_brutos:
                print(f"[{timestamp}] Erro tecnico: {msg_erro}")
                db.update_heartbeat("monitor_recepcao", "WARNING", f"Falha API: {msg_erro}")

            elif msg_erro != "OK" and dados_brutos:
                # Evita finalizar pacientes durante coleta parcial da API.
                print(f"[{timestamp}] Aviso API parcial: {msg_erro}")
                db.salvar_dados_recepcao(dados_brutos)
                status_msg = f"Fila parcial: {len(dados_brutos)} (finalizacao pausada)"
                db.update_heartbeat("monitor_recepcao", "WARNING", status_msg)

            else:
                if dados_brutos:
                    db.salvar_dados_recepcao(dados_brutos)

                resumo_unidades = []
                for uid in [2, 3, 12]:
                    ids_nesta_unidade = [
                        item["id"]
                        for item in dados_brutos
                        if str(item.get("UnidadeID_Coleta")) == str(uid)
                    ]
                    db.finalizar_ausentes_recepcao(uid, ids_nesta_unidade)

                    nome_u = "Ouro Verde" if uid == 2 else "Cambui" if uid == 3 else "Shop. Campinas"
                    resumo_unidades.append(f"{nome_u}: {len(ids_nesta_unidade)}")

                string_unidades = " | ".join(resumo_unidades)
                status_msg = f"Fila: {len(dados_brutos)} ({string_unidades})"

                print(f"[{timestamp}] OK {status_msg}")
                db.update_heartbeat("monitor_recepcao", "ONLINE", status_msg)

        except KeyboardInterrupt:
            print("\nMonitor encerrado.")
            break
        except Exception as e:
            print(f"\n[ERRO CRITICO RECEPCAO] {e}")
            db.update_heartbeat("monitor_recepcao", "ERROR", str(e))

        time.sleep(15)


if __name__ == "__main__":
    run_monitor_recepcao()
