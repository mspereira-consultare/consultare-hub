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

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database_manager import DatabaseManager
except ImportError:
    from .database_manager import DatabaseManager

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
        # Bloco silencioso para não sujar o JSON
        with redirect_stdout(sys.stderr):
            db = DatabaseManager()
            
            # --- LEITURA EXCLUSIVA DO BANCO ---
            # Lê a tabela recepcao_historico que o monitor está alimentando
            query = """
            SELECT 
                unidade_id,
                status,
                dt_chegada,
                dt_atendimento
            FROM recepcao_historico 
            WHERE dia_referencia = ? AND status != 'Cancelado'
            """
            hoje = datetime.date.today().isoformat()
            
            with list(db._init_db() or []) or sqlite3.connect(db.db_path) as conn:
                 df = pd.read_sql_query(query, conn, params=(hoje,))

        # Montagem da Resposta
        output["status"] = "success"
        
        # Estrutura padrão zerada
        detalhes = {
            "2": {"fila": 0, "tempo_medio": 0, "total_passaram": 0}, 
            "3": {"fila": 0, "tempo_medio": 0, "total_passaram": 0}, 
            "12": {"fila": 0, "tempo_medio": 0, "total_passaram": 0}
        }

        global_fila = 0
        soma_ponderada = 0
        total_com_tempo = 0

        # Se tiver dados no banco, preenche
        if not df.empty:
            # Converte colunas de data
            df['dt_chegada'] = pd.to_datetime(df['dt_chegada'])
            df['dt_atendimento'] = pd.to_datetime(df['dt_atendimento'])
            agora = datetime.datetime.now()

            for uid_int, grupo in df.groupby('unidade_id'):
                uid = str(int(uid_int))
                if uid not in detalhes: continue

                # 1. Total Passaram (Todos do dia)
                total_passaram = len(grupo)

                # 2. Fila Atual (Status 'Espera' e sem data de atendimento)
                fila_atual = len(grupo[(grupo['status'] == 'Espera') & (grupo['dt_atendimento'].isna())])

                # 3. Tempo Médio (Apenas de quem JÁ FOI ATENDIDO - status fechado)
                # Cálculo: (Atendimento - Chegada) em minutos
                atendidos = grupo.dropna(subset=['dt_atendimento']).copy()
                media = 0
                if not atendidos.empty:
                    atendidos['espera_min'] = (atendidos['dt_atendimento'] - atendidos['dt_chegada']).dt.total_seconds() / 60
                    media = int(atendidos['espera_min'].mean())

                # Atualiza JSON
                detalhes[uid] = {
                    "fila": fila_atual,
                    "tempo_medio": media,
                    "total_passaram": total_passaram
                }

                # Acumula Global
                global_fila += fila_atual
                if media > 0 and total_passaram > 0:
                    soma_ponderada += (media * total_passaram)
                    total_com_tempo += total_passaram

        # Cálculo da Média Global Ponderada
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
        # sys.stderr.write(f"Erro worker: {e}\n")

    print(json.dumps(output))

if __name__ == "__main__":
    import sqlite3 # Import local para o caso de execução direta
    run()