import sqlite3
import os

DB_PATH = os.path.join(os.getcwd(), 'data', 'dados_clinica.db')
conn = sqlite3.connect(DB_PATH)
try:
    conn.execute("ALTER TABLE goals_config ADD COLUMN filter_group TEXT DEFAULT NULL")
    print("Coluna criada!")
except:
    print("Coluna já existe.")
conn.close()