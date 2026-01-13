import sqlite3
import os
import datetime

# Tenta localizar o banco de dados (ajuste se seu caminho for diferente)
# Assumindo que você roda isso da raiz e o banco está em ./data/
DB_PATH = os.path.join(os.getcwd(), 'data', 'dados_clinica.db')

# Se não achar, tenta subir um nível (caso rode de dentro de /workers)
if not os.path.exists(DB_PATH):
    DB_PATH = os.path.join(os.getcwd(), '../data', 'dados_clinica.db')

def inspect_table(cursor, table_name):
    print(f"\n{'='*20} TABELA: {table_name} {'='*20}")
    
    try:
        # Pega as colunas
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = [col[1] for col in cursor.fetchall()]
        print(f"COLUNAS: {columns}")
        
        # Pega os dados
        cursor.execute(f"SELECT * FROM {table_name}")
        rows = cursor.fetchall()
        
        if not rows:
            print(">>> [VAZIA] Nenhum registro encontrado.")
        else:
            print(f">>> Encontrados {len(rows)} registros:")
            for row in rows:
                print(row)
                
    except sqlite3.OperationalError as e:
        print(f">>> [ERRO] A tabela não existe ou não pode ser lida: {e}")

def main():
    if not os.path.exists(DB_PATH):
        print(f"[ERRO CRÍTICO] Arquivo de banco de dados não encontrado em: {DB_PATH}")
        return

    print(f"--- Inspecionando Banco de Dados: {DB_PATH} ---")
    print(f"Hora atual: {datetime.datetime.now()}")
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 1. Verifica Tabela de Monitor em Tempo Real (Dropdown)
        inspect_table(cursor, "clinia_group_snapshots")
        
        # 2. Verifica Tabela de Relatório Diário (Chat)
        inspect_table(cursor, "clinia_chat_stats")
        
        # 3. Verifica Tabela de Agendamentos
        inspect_table(cursor, "clinia_appointment_stats")
        
        conn.close()
        
    except Exception as e:
        print(f"Erro ao conectar no banco: {e}")

if __name__ == "__main__":
    main()