import sys
import os
import sqlite3
import datetime
import pandas as pd
import json
import time

sys.path.append(os.path.dirname(__file__))

try:
    from feegow_client import fetch_proposals
except ImportError as e:
    print(f"ERRO: {e}")
    sys.exit(1)

DB_PATH = os.path.join(os.path.dirname(__file__), '../data/dados_clinica.db')

def get_db_connection():
    return sqlite3.connect(DB_PATH)

def clean_currency(value):
    if pd.isna(value) or value == '': return 0.0
    if isinstance(value, (int, float)): return float(value)
    try:
        s = str(value).replace('R$', '').replace(' ', '').strip()
        s = s.replace('.', '').replace(',', '.')
        return float(s)
    except: return 0.0

def create_table():
    conn = get_db_connection()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS feegow_proposals (
            proposal_id INTEGER PRIMARY KEY,
            date TEXT,
            status TEXT,
            unit_name TEXT,
            professional_name TEXT,
            total_value REAL,
            items_json TEXT,
            updated_at TEXT
        )
    ''')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_prop_date ON feegow_proposals(date)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_prop_unit ON feegow_proposals(unit_name)')
    conn.close()

def process_dataframe(df):
    """Salva um lote de dados no banco"""
    if df.empty: return 0
    
    conn = get_db_connection()
    cursor = conn.cursor()
    saved = 0
    
    for _, row in df.iterrows():
        try:
            prop_id = int(row.get('proposal_id') or 0)
            if prop_id == 0: continue

            raw_date = row.get('proposal_date')
            iso_date = raw_date 

            status = row.get('status', 'Pendente')
            unit_data = row.get('unidade') or {}
            unit_name = unit_data.get('nome_fantasia', 'Matriz') if isinstance(unit_data, dict) else 'Matriz'
            prof_name = row.get('proposer_name', 'Sistema')

            # Cálculo Líquido
            total_liquido = 0.0
            items_list = []
            
            procs = row.get('procedimentos') or {}
            if isinstance(procs, dict) and 'data' in procs:
                item_array = procs['data']
                for item in item_array:
                    v_bruto = clean_currency(item.get('valor'))
                    v_desc = clean_currency(item.get('desconto'))
                    liquido_item = v_bruto - v_desc
                    total_liquido += liquido_item
                    items_list.append({'nome': item.get('nome'), 'valor': liquido_item})
            else:
                total_liquido = clean_currency(row.get('value'))

            cursor.execute('''
                INSERT INTO feegow_proposals (
                    proposal_id, date, status, unit_name, 
                    professional_name, total_value, items_json, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(proposal_id) DO UPDATE SET
                    status=excluded.status,
                    total_value=excluded.total_value,
                    unit_name=excluded.unit_name,
                    updated_at=excluded.updated_at
            ''', (prop_id, iso_date, status, unit_name, prof_name, total_liquido, json.dumps(items_list)))
            saved += 1
        except Exception: pass

    conn.commit()
    conn.close()
    return saved

def update_proposals():
    print(f"--- Worker Propostas (Modo Fatiado): {datetime.datetime.now().strftime('%H:%M:%S')} ---")
    create_table()

    # Define janela total: 30 dias atrás até 30 dias frente
    now = datetime.datetime.now()
    start_date_obj = now - datetime.timedelta(days=30)
    end_date_obj = now + datetime.timedelta(days=30)
    
    # Loop de fatiamento (Chunking) - 5 dias por vez
    current_start = start_date_obj
    CHUNK_DAYS = 5
    total_saved = 0

    while current_start < end_date_obj:
        current_end = min(current_start + datetime.timedelta(days=CHUNK_DAYS), end_date_obj)
        
        s_str = current_start.strftime('%d-%m-%Y')
        e_str = current_end.strftime('%d-%m-%Y')
        
        print(f" > Buscando lote: {s_str} a {e_str} ...", end="", flush=True)
        
        try:
            df = fetch_proposals(s_str, e_str)
            if not df.empty:
                qtd = process_dataframe(df)
                total_saved += qtd
                print(f" ✅ {qtd} salvos.")
            else:
                print(" ⚠️ Vazio.")
        except Exception as e:
            print(f" ❌ Erro: {e}")
        
        # Avança o cursor
        current_start = current_end + datetime.timedelta(days=1)
        # Pequena pausa para não floodar a API
        time.sleep(1)

    print(f"🏁 Finalizado. Total de propostas processadas: {total_saved}")

if __name__ == "__main__":
    update_proposals()