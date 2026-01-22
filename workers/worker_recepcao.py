import sys
import os
import json
import datetime
import pandas as pd
from pathlib import Path
from dotenv import load_dotenv

# 1. Configuração de Ambiente
env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database_manager import DatabaseManager
except ImportError:
    from .database_manager import DatabaseManager

# Função auxiliar para imprimir logs no STDERR (não suja o JSON do STDOUT)
def log_err(msg):
    sys.stderr.write(f"[LOG] {msg}\n")
    sys.stderr.flush()

def run():
    # Estrutura padrão de resposta
    output = {
        "status": "error",
        "message": "Erro desconhecido",
        "data": {
            "global": {"total_fila": 0, "tempo_medio": 0, "tempo_medio_fmt": "--"},
            "por_unidade": {}
        },
        "timestamp": datetime.datetime.now().isoformat()
    }

    try:
        log_err("Iniciando Worker Recepção...")
        db = DatabaseManager()
        log_err(f"Conectado ao Banco: {'TURSO' if db.use_turso else 'LOCAL'}")
        
        hoje = datetime.datetime.now().strftime('%Y-%m-%d')
        
        sql = """
            SELECT unidade_id, status, dt_chegada, dt_atendimento
            FROM recepcao_historico 
            WHERE dia_referencia = ? AND status != 'Cancelado'
        """
        
        log_err(f"Executando query para data: {hoje}")
        rows = db.execute_query(sql, (hoje,))
        log_err(f"Registros encontrados: {len(rows) if rows else 0}")
        
        # --- CONVERSÃO ROBUSTA (TURSO/SQLITE) ---
        if not rows:
            df = pd.DataFrame(columns=['unidade_id', 'status', 'dt_chegada', 'dt_atendimento'])
        else:
            data_list = []
            for r in rows:
                if isinstance(r, (tuple, list)):
                    data_list.append(r)
                else:
                    # Tenta extrair atributos do objeto Row do Turso dinamicamente
                    # Fallback para índices numéricos se atributos falharem
                    try:
                        uid = getattr(r, 'unidade_id', r[0] if len(r)>0 else None)
                        st = getattr(r, 'status', r[1] if len(r)>1 else None)
                        dt_c = getattr(r, 'dt_chegada', r[2] if len(r)>2 else None)
                        dt_a = getattr(r, 'dt_atendimento', r[3] if len(r)>3 else None)
                        data_list.append((uid, st, dt_c, dt_a))
                    except Exception as ex:
                        log_err(f"Erro convertendo linha: {ex}")

            df = pd.DataFrame(data_list, columns=['unidade_id', 'status', 'dt_chegada', 'dt_atendimento'])

        # --- CÁLCULO DE MÉTRICAS ---
        if df.empty:
            output["status"] = "success"
            output["message"] = "Sem dados hoje"
        else:
            # Converte datas
            df['dt_chegada'] = pd.to_datetime(df['dt_chegada'], errors='coerce')
            df['dt_atendimento'] = pd.to_datetime(df['dt_atendimento'], errors='coerce')

            # Filtra quem está na fila
            fila_df = df[
                (df['status'].str.contains('Aguardando', case=False, na=False)) |
                (df['status'].str.contains('Triagem', case=False, na=False))
            ]
            
            # Métricas Globais
            global_fila = len(fila_df)
            total_com_tempo = 0
            soma_ponderada = 0
            detalhes = {}
            
            for uid in [2, 3, 12]:
                grupo = df[df['unidade_id'] == uid]
                
                if grupo.empty:
                    detalhes[uid] = {"fila": 0, "tempo_medio": 0, "total_passaram": 0}
                else:
                    # Fila Atual da Unidade
                    fila_atual = len(grupo[
                        (grupo['status'].str.contains('Aguardando', case=False, na=False)) |
                        (grupo['status'].str.contains('Triagem', case=False, na=False))
                    ])
                    
                    # Tempo Médio da Unidade
                    atendidos = grupo.dropna(subset=['dt_atendimento']).copy()
                    media = 0
                    total_passaram = len(atendidos)
                    
                    if not atendidos.empty:
                        atendidos['espera_min'] = (atendidos['dt_atendimento'] - atendidos['dt_chegada']).dt.total_seconds() / 60
                        media = int(atendidos['espera_min'].mean())

                    detalhes[uid] = {
                        "fila": fila_atual,
                        "tempo_medio": media,
                        "total_passaram": total_passaram
                    }

                    # Acumula para Média Ponderada Global
                    if media > 0 and total_passaram > 0:
                        soma_ponderada += (media * total_passaram)
                        total_com_tempo += total_passaram

            media_global = 0
            if total_com_tempo > 0:
                media_global = int(soma_ponderada / total_com_tempo)

            output["data"]["global"] = {
                "total_fila": global_fila,
                "tempo_medio": media_global,
                "tempo_medio_fmt": f"{media_global} min"
            }
            output["data"]["por_unidade"] = detalhes
            output["status"] = "success"
            output["message"] = "Dados processados"

    except Exception as e:
        log_err(f"ERRO FATAL: {e}")
        output["message"] = str(e)
        output["status"] = "error"

    # IMPRIME O JSON NO STDOUT (Saída final)
    print(json.dumps(output))
    sys.stdout.flush()

if __name__ == "__main__":
    run()