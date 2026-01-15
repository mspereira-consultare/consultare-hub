import sqlite3
import pandas as pd
import os

DB_PATH = os.path.join("data", "dados_clinica.db")

def check():
    if not os.path.exists(DB_PATH): return print("❌ Banco não encontrado.")
    conn = sqlite3.connect(DB_PATH)
    
    print("--- 📊 CONFERÊNCIA DE FATURAMENTO (TOTAL PAGO) ---")
    
    # Busca a soma da coluna total_pago
    query = """
    SELECT 
        COUNT(*) as registros,
        SUM(valor_produzido) as total_produzido,
        SUM(total_bruto) as total_bruto,
        SUM(total_pago) as total_pago
    FROM faturamento_analitico
    """
    df = pd.read_sql_query(query, conn)
    
    print(f"📌 Registros: {int(df.iloc[0]['registros'])}")
    print(f"💵 Valor Produzido: R$ {df.iloc[0]['total_produzido']:,.2f}")
    print(f"📦 Total Bruto:     R$ {df.iloc[0]['total_bruto']:,.2f}")
    print(f"🎯 Total Pago (Meta): R$ {df.iloc[0]['total_pago']:,.2f}  <-- Verifique este!")

    print("\n--- 🏥 Faturamento Pago por Unidade ---")
    rank = pd.read_sql_query("SELECT unidade, SUM(total_pago) as pago FROM faturamento_analitico GROUP BY 1 ORDER BY 2 DESC", conn)
    print(rank)
    
    conn.close()

if __name__ == "__main__": check()