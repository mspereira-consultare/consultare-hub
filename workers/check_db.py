import sqlite3
import pandas as pd
import os

# Tenta localizar o banco na pasta workers
db_path = os.path.join("fila_diaria.db")

if not os.path.exists(db_path):
    print(f"ERRO: Banco de dados não encontrado em '{db_path}'.")
    print("Certifique-se de que o 'monitor_recepcao.py' rodou pelo menos uma vez.")
    exit()

print(f"--- LENDO BANCO DE DADOS: {db_path} ---\n")

try:
    with sqlite3.connect(db_path) as conn:
        # 1. Mostra as últimas 20 senhas inseridas (Geral)
        print("=== 1. ÚLTIMAS 20 SENHAS REGISTRADAS ===")
        query_amostra = """
        SELECT id, unidade_id, senha, status, 
               substr(dt_chegada, 12, 8) as hora_chegada, 
               substr(dt_atendimento, 12, 8) as hora_atend,
               tipo_senha
        FROM recepcao 
        ORDER BY dt_chegada DESC 
        LIMIT 20
        """
        df_amostra = pd.read_sql_query(query_amostra, conn)
        
        if df_amostra.empty:
            print(">> O banco está vazio (nenhuma senha coletada hoje).")
        else:
            print(df_amostra.to_string(index=False))

        # 2. Resumo por Unidade (Para confirmar a separação)
        print("\n=== 2. RESUMO POR UNIDADE (Prova dos 9) ===")
        query_resumo = """
        SELECT 
            unidade_id, 
            COUNT(*) as total_senhas,
            SUM(CASE WHEN dt_atendimento IS NULL AND status != 'Cancelado' THEN 1 ELSE 0 END) as na_fila_agora,
            MAX(dt_chegada) as ultimo_registro
        FROM recepcao 
        GROUP BY unidade_id
        """
        df_resumo = pd.read_sql_query(query_resumo, conn)
        print(df_resumo.to_string(index=False))

except Exception as e:
    print(f"Erro ao ler banco: {e}")