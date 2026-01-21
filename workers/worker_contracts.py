import requests
import sqlite3
import datetime
import time
import os
import sys
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
load_dotenv()

DB_PATH = os.path.join(os.path.dirname(__file__), '../data/dados_clinica.db')
URL_API = "https://cartao-beneficios.feegow.com/external/contract/datagrid"
TOKEN = os.getenv("FEEGOW_ACCESS_TOKEN")

def get_db_connection():
    return sqlite3.connect(DB_PATH)

def create_table():
    conn = get_db_connection()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS feegow_contracts (
            contract_id TEXT PRIMARY KEY,
            created_at TEXT,
            start_date TEXT,
            patient_name TEXT,
            plan_name TEXT,
            status_contract TEXT,
            status_financial TEXT,
            recurrence_value REAL,
            membership_value REAL,
            registration_number INTEGER,
            updated_at TEXT
        )
    ''')
    conn.close()

def safe_date_raw(iso_date):
    """Retorna data YYYY-MM-DD sem converter fuso (UTC Puro)"""
    if not iso_date: return None
    try: return iso_date[:10]
    except: return None

def fetch_page_with_retry(url, payload, headers, max_retries=3):
    for attempt in range(max_retries):
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=45)
            if resp.status_code == 200: return resp.json()
            if resp.status_code >= 500:
                print(f" [⚠️ 500 - Retrying {attempt+1}]", end="", flush=True)
                time.sleep(3)
                continue
            return None
        except:
            time.sleep(3)
    return None

def process_items(items, cursor):
    count = 0
    for item in items:
        # Tenta usar o ID, se não tiver, usa matrícula com prefixo PEND
        c_id = item.get('contractId')
        if not c_id:
            reg = item.get('registrationNumber')
            if reg: c_id = f"PEND_{reg}"
            else: continue 

        try:
            # DATAS (UTC Raw)
            raw_created = item.get('contractDate')
            date_created = safe_date_raw(raw_created)
            if not date_created: date_created = datetime.datetime.now().strftime('%Y-%m-%d')

            raw_start = item.get('initialDate') or item.get('startDate')
            date_start = safe_date_raw(raw_start)
            if not date_start: date_start = date_created

            val_rec = float(item.get('amountRecurrence') or 0)
            val_mem = float(item.get('amountMembership') or item.get('membershipValue') or 0)
            
            cursor.execute('''
                INSERT INTO feegow_contracts (
                    contract_id, created_at, start_date, 
                    patient_name, plan_name,
                    status_contract, status_financial, 
                    recurrence_value, membership_value,
                    registration_number, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(contract_id) DO UPDATE SET
                    created_at = excluded.created_at,
                    start_date = excluded.start_date,
                    status_contract = excluded.status_contract,
                    status_financial = excluded.status_financial,
                    recurrence_value = excluded.recurrence_value,
                    membership_value = excluded.membership_value,
                    updated_at = excluded.updated_at
            ''', (
                c_id, date_created, date_start,
                item.get('name'), item.get('plan'),
                item.get('statusContract'), item.get('statusRecurrenceDescription'),
                val_rec, val_mem, item.get('registrationNumber')
            ))
            count += 1
        except: pass
    return count

def run_worker_contracts():
    print(f"--- Worker Contratos (V9 - Automático): {datetime.datetime.now().strftime('%H:%M:%S')} ---")
    
    if not TOKEN: return
    create_table()
    
    headers = {"x-access-token": TOKEN, "Content-Type": "application/json"}
    conn = get_db_connection()
    cursor = conn.cursor()
    total_global = 0

    # =========================================================================
    # ESTRATÉGIA 1: VARREDURA DO MÊS ATUAL (AUTOMÁTICO)
    # Pega o dia 1 do mês atual até o dia de hoje
    # =========================================================================
    now = datetime.datetime.now()
    start_date_scan = now.strftime('%Y-%m-01') # Sempre o dia 01 do mês corrente
    end_date_scan = now.strftime('%Y-%m-%d')   # Hoje
    
    print(f"\n📅 ESTRATÉGIA 1: Varredura Cirúrgica ({start_date_scan} até {end_date_scan})")
    
    page = 1
    has_more = True
    while has_more:
        print(f"   > Scan Mês Atual Pág {page}...", end="", flush=True)
        
        payload = { 
            "page": page, "perPage": 100,
            "createdStartDate": start_date_scan,
            "createdEndDate": end_date_scan
        }
        
        data = fetch_page_with_retry(URL_API, payload, headers)
        if not data: break
        
        items = data.get('data', [])
        if not items: break
        
        saved = process_items(items, cursor)
        conn.commit()
        total_global += saved
        print(f" ✅ {saved} itens.")
        
        if page >= data.get('pages', 1): has_more = False
        else: page += 1

    # =========================================================================
    # ESTRATÉGIA 2: CARGA GERAL (Histórico)
    # Garante a base legada e contratos antigos
    # =========================================================================
    print("\n📚 ESTRATÉGIA 2: Carga Geral (Histórico)")
    page = 1
    has_more = True
    while has_more:
        print(f"   > Histórico Pág {page}...", end="", flush=True)
        payload = { "page": page, "perPage": 100 }
        
        data = fetch_page_with_retry(URL_API, payload, headers)
        if not data: 
            page += 1; continue 
        
        items = data.get('data', [])
        if not items: break
        
        saved = process_items(items, cursor)
        conn.commit()
        total_global += saved
        print(f" ✅ {saved} itens.")
        
        if page >= data.get('pages', 1): has_more = False
        else: page += 1

    conn.close()
    print(f"\n🚀 Finalizado! Total processado: {total_global}")

if __name__ == "__main__":
    run_worker_contracts()