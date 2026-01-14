import sqlite3
import os

DB_PATH = os.path.join(os.getcwd(), 'data', 'dados_clinica.db')

def add_group_column():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    print(f"--- Atualizando Banco: {DB_PATH} ---")
    
    try:
        # Tenta adicionar a coluna. Se já existir, vai dar erro e ignoramos.
        cursor.execute("ALTER TABLE feegow_appointments ADD COLUMN procedure_group TEXT DEFAULT 'Geral'")
        print("✅ Coluna 'procedure_group' adicionada com sucesso!")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e):
            print("ℹ️ A coluna 'procedure_group' já existe.")
        else:
            print(f"❌ Erro ao alterar tabela: {e}")
            
    conn.commit()
    conn.close()

if __name__ == "__main__":
    add_group_column()