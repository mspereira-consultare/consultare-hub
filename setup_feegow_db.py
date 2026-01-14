import sqlite3
import os

DB_PATH = os.path.join(os.getcwd(), 'data', 'dados_clinica.db')

def setup_feegow():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Tabela espelho do Feegow (Focada em Financeiro)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS feegow_appointments (
            appointment_id INTEGER PRIMARY KEY,
            date TEXT,              -- YYYY-MM-DD
            status_id INTEGER,
            value REAL,
            specialty TEXT,         -- Para agrupamento por procedimento/especialidade
            professional_name TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()
    print("Tabela 'feegow_appointments' criada com sucesso.")

if __name__ == "__main__":
    setup_feegow()