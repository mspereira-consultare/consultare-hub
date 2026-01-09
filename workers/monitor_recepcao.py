import time
import sys
import os
from datetime import datetime
from feegow_recepcao_core import FeegowRecepcaoSystem
from database_manager import DatabaseManager

sys.path.append(os.path.join(os.path.dirname(__file__), 'workers'))

def run_monitor_recepcao():
    print("=== MONITOR RECEPÇÃO (COM INFERÊNCIA DE ATENDIMENTO) INICIADO ===")
    
    sistema = FeegowRecepcaoSystem()
    db = DatabaseManager()

    while True:
        try:
            db.limpar_dias_anteriores()
            timestamp = datetime.now().strftime('%H:%M:%S')

            # 1. Coleta TODOS os dados brutos
            dados_brutos, msg_erro = sistema.obter_dados_brutos(unidades=[2, 3, 12])

            if msg_erro != "OK" and not dados_brutos:
                print(f"[{timestamp}] Erro na coleta: {msg_erro}")
                # Se deu erro de conexão, NÃO rodamos a baixa de ausentes
                # para não limpar a fila inteira por engano.
            else:
                # 2. Salva quem está PRESENTE (UPSERT)
                if dados_brutos:
                    db.salvar_dados_recepcao(dados_brutos)
                
                # 3. Processa SAÍDAS por Unidade
                # Precisamos separar os IDs por unidade para fazer a baixa correta
                for uid in [2, 3, 12]:
                    # Filtra IDs desta unidade que vieram na API
                    ids_nesta_unidade = [
                        item['id'] for item in dados_brutos 
                        if item.get('UnidadeID') == uid or item.get('UnidadeID_Coleta') == uid
                    ]
                    
                    # Chama a função mágica:
                    # "Quem é desta unidade, estava esperando, e NÃO está nessa lista de IDs?"
                    db.finalizar_ausentes(uid, ids_nesta_unidade)

                qtd = len(dados_brutos)
                print(f"[{timestamp}] Ciclo concluído. {qtd} pessoas na fila agora.")

        except KeyboardInterrupt:
            print("\nMonitor encerrado.")
            break
        except Exception as e:
            print(f"[ERRO CRÍTICO] {e}")

        time.sleep(15)

if __name__ == "__main__":
    run_monitor_recepcao()