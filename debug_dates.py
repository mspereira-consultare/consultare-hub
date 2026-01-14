import sqlite3
import pandas as pd
import os

DB_PATH = os.path.join(os.getcwd(), 'data', 'dados_clinica.db')

def debug_dates():
    conn = sqlite3.connect(DB_PATH)
    try:
        print("--- VERIFICANDO DATAS COM FATURAMENTO ---")
        # Agrupa por data e soma o valor
        query = """
            SELECT date, COUNT(*) as qtd, SUM(value) as total
            FROM feegow_appointments
            WHERE status_id = 3
            GROUP BY date
            ORDER BY date DESC
        """
        df = pd.read_sql_query(query, conn)
        
        if df.empty:
            print("Nenhum faturamento (Status 3) encontrado em nenhuma data.")
        else:
            print(df.to_string(index=False))
            print(f"\nTotal Geral no Banco: R$ {df['total'].sum():,.2f}")
            print(f"Datas Disponíveis: de {df['date'].min()} a {df['date'].max()}")
            
    except Exception as e:
        print(f"Erro: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    debug_dates()