import sqlite3
import pandas as pd
import os

DB_PATH = os.path.join(os.getcwd(), 'data', 'dados_clinica.db')

def check_status():
    conn = sqlite3.connect(DB_PATH)
    
    print("--- CONTAGEM POR STATUS (FEEGOW) ---")
    try:
        # Pega todos os registros sem filtrar status
        query = """
            SELECT status_id, COUNT(*) as qtd, SUM(value) as valor_total
            FROM feegow_appointments
            GROUP BY status_id
        """
        df = pd.read_sql_query(query, conn)
        
        # Mapa de status para facilitar leitura
        status_map = {
            1: 'MARCADO - NÃO CONFIRMADO',
            2: 'EM ANDAMENTO',
            3: 'ATENDIDO (Faturamento Real)', # <--- É ESTE QUE ESTAMOS USANDO
            4: 'EM ATENDIMENTO',
            6: 'NÃO COMPARECEU',
            7: 'MARCADO - CONFIRMADO',
            11: 'DESMARCADO PACIENTE',
            15: 'REMARCADO'
        }
        
        df['status_nome'] = df['status_id'].map(status_map).fillna('Outro')
        
        print(df[['status_id', 'status_nome', 'qtd', 'valor_total']].to_string(index=False))
        
        print("\n---------------------------------------------------")
        total_faturado = df[df['status_id'] == 3]['valor_total'].sum()
        print(f"TOTAL CONSIDERADO FATURAMENTO (Status 3): R$ {total_faturado:,.2f}")
        
    except Exception as e:
        print(f"Erro ao ler banco: {e}")
        print("Dica: Verifique se o worker_feegow.py rodou e criou a tabela.")
    finally:
        conn.close()

if __name__ == "__main__":
    check_status()