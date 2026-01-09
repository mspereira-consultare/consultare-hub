import sys
import os
import json
import datetime
import pandas as pd
from contextlib import redirect_stdout
from pathlib import Path
from dotenv import load_dotenv

# Configuração de Ambiente
env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

sys.path.append(os.path.join(os.path.dirname(__file__)))

# Imports dos novos módulos
from feegow_recepcao_core import FeegowRecepcaoSystem
from database_manager import DatabaseManager

def run():
    output = {
        "status": "error",
        "message": "",
        "data": {
            "global": {"total_fila": 0, "tempo_medio": 0, "tempo_medio_fmt": "--"},
            "por_unidade": {}
        },
        "timestamp": datetime.datetime.now().isoformat()
    }

    try:
        # Bloco silencioso (exceto erros fatais)
        with redirect_stdout(sys.stderr):
            # 1. Instancia Gerenciadores
            sistema = FeegowRecepcaoSystem()
            db = DatabaseManager()

            # 2. Limpeza Matinal (Remove dias anteriores)
            db.limpar_dias_anteriores()

            # 3. Coleta Dados Vivos
            dados_brutos, msg_erro = sistema.obter_dados_brutos(unidades=[2, 3, 12])
            
            # 4. Persiste no Banco (Aqui a mágica acontece)
            # Mesmo que a fila esteja vazia agora, o histórico do dia está salvo no DB
            if dados_brutos:
                db.salvar_dados_recepcao(dados_brutos)

            # 5. Consulta os KPIs Consolidados do Dia
            df_kpis = db.obter_kpis_do_dia()

        # Montagem do JSON de Resposta
        output["status"] = "success"
        if msg_erro != "OK":
            output["message"] = msg_erro

        # Estrutura padrão zerada
        detalhes = {
            "2": {"fila": 0, "tempo_medio": 0, "total_passaram": 0}, 
            "3": {"fila": 0, "tempo_medio": 0, "total_passaram": 0}, 
            "12": {"fila": 0, "tempo_medio": 0, "total_passaram": 0}
        }

        # Preenche com dados do banco se houver
        global_fila = 0
        soma_ponderada = 0
        total_com_tempo = 0

        if not df_kpis.empty:
            for _, row in df_kpis.iterrows():
                uid = str(int(row['unidade_id']))
                fila = int(row['fila_atual'])
                # Se média for nula (ninguém atendido), vira 0
                media = int(row['media_espera_minutos']) if pd.notna(row['media_espera_minutos']) else 0
                total_dia = int(row['total_passaram'])

                if uid in detalhes:
                    detalhes[uid] = {
                        "fila": fila,
                        "tempo_medio": media,
                        "total_passaram": total_dia
                    }

                global_fila += fila
                if media > 0:
                    # Para média global ponderada (simplificada por unidade atendida)
                    # Nota: O ideal seria fazer a query global no SQL, mas aqui aproximamos
                    soma_ponderada += media * total_dia
                    total_com_tempo += total_dia

        # Cálculo Global
        media_global = 0
        if total_com_tempo > 0:
            media_global = int(soma_ponderada / total_com_tempo)

        output["data"]["global"] = {
            "total_fila": global_fila,
            "tempo_medio": media_global,
            "tempo_medio_fmt": f"{media_global} min"
        }
        output["data"]["por_unidade"] = detalhes

    except Exception as e:
        output["message"] = str(e)
        output["status"] = "error"
        sys.stderr.write(f"Erro worker: {e}\n")

    print(json.dumps(output))

if __name__ == "__main__":
    run()