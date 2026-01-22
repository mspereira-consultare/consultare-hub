import requests
import datetime
import time
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database_manager import DatabaseManager
    import libsql_client
except ImportError:
    pass

load_dotenv()

URL_API = "https://cartao-beneficios.feegow.com/external/contract/datagrid"
TOKEN = os.getenv("FEEGOW_ACCESS_TOKEN")
MAX_WORKERS = 10 

def safe_date_raw(iso_date):
    if not iso_date: return None
    try: return iso_date[:10]
    except: return None

def fetch_page_data(url, payload, headers, page_num):
    payload_local = payload.copy()
    payload_local["page"] = page_num
    for attempt in range(3):
        try:
            resp = requests.post(url, json=payload_local, headers=headers, timeout=60)
            if resp.status_code == 200: return resp.json()
            if resp.status_code >= 500: time.sleep(2); continue
        except: time.sleep(2)
    return None

def process_and_save_batch(db, items):
    if not items: return 0
    conn = db.get_connection()
    data_params = []
    
    # SQL atualizado para a NOVA estrutura
    sql = '''
        INSERT INTO feegow_contracts (
            registration_number, contract_id, created_at, start_date, 
            patient_name, plan_name,
            status_contract, status_financial, 
            recurrence_value, membership_value,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(registration_number) DO UPDATE SET
            contract_id = excluded.contract_id,
            created_at = excluded.created_at,
            start_date = excluded.start_date,
            status_contract = excluded.status_contract,
            status_financial = excluded.status_financial,
            recurrence_value = excluded.recurrence_value,
            membership_value = excluded.membership_value,
            updated_at = excluded.updated_at
    '''

    for item in items:
        # Usa Matrícula como chave principal
        reg_num = item.get('registrationNumber')
        c_id = item.get('contractId')
        p_name = item.get('name') or 'Desconhecido'

        # Garante uma chave única (Matrícula ou Fallback composto)
        if reg_num:
            unique_key = str(reg_num)
        elif c_id:
            import hashlib
            name_hash = hashlib.md5(p_name.encode()).hexdigest()[:6]
            unique_key = f"{c_id}_{name_hash}"
        else:
            continue 

        try:
            raw_created = item.get('contractDate')
            date_created = safe_date_raw(raw_created) or datetime.datetime.now().strftime('%Y-%m-%d')
            
            raw_start = item.get('initialDate') or item.get('startDate')
            date_start = safe_date_raw(raw_start) or date_created

            val_rec = float(item.get('amountRecurrence') or 0)
            val_mem = float(item.get('amountMembership') or item.get('membershipValue') or 0)
            
            params = (
                unique_key,                 # PK
                str(c_id or ''),            # Coluna normal
                date_created, date_start,
                str(p_name), str(item.get('plan') or ''),
                str(item.get('statusContract') or ''), str(item.get('statusRecurrenceDescription') or ''),
                val_rec, val_mem
            )
            data_params.append(params)
        except: pass

    if not data_params: return 0

    try:
        if db.use_turso:
            stmts = [libsql_client.Statement(sql, p) for p in data_params]
            conn.batch(stmts)
        else:
            conn.executemany(sql, data_params)
            conn.commit()
        return len(data_params)
    except Exception as e:
        # Debug: Se der erro, mostra no terminal para sabermos o motivo
        # print(f"Erro Batch: {e}") 
        return 0
    finally:
        conn.close()

def print_progress_bar(iteration, total, prefix='', suffix='', decimals=1, length=30, fill='█'):
    percent = ("{0:." + str(decimals) + "f}").format(100 * (iteration / float(total)))
    filled_length = int(length * iteration // total)
    bar = fill * filled_length + '-' * (length - filled_length)
    sys.stdout.write(f'\r{prefix} |{bar}| {percent}% {suffix}')
    sys.stdout.flush()

def run_worker_contracts():
    print(f"--- Worker Contratos (Reset Schema): {datetime.datetime.now().strftime('%H:%M:%S')} ---")
    
    if not TOKEN:
        print("❌ Token não encontrado")
        return

    db = DatabaseManager()
    conn = db.get_connection()
    
    # === AQUI ESTÁ A CORREÇÃO ===
    # Forçamos a exclusão da tabela antiga para garantir que a nova seja criada corretamente
    print("🧹 Limpando tabela antiga para aplicar nova estrutura (Matrícula como Chave)...")
    try:
        conn.execute("DROP TABLE IF EXISTS feegow_contracts")
        if not db.use_turso: conn.commit()
        print("✅ Tabela antiga removida.")
    except Exception as e:
        print(f"⚠️ Aviso ao dropar: {e}")

    # Cria a NOVA tabela
    try:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS feegow_contracts (
                registration_number TEXT PRIMARY KEY, 
                contract_id TEXT, 
                created_at TEXT, 
                start_date TEXT,
                patient_name TEXT, 
                plan_name TEXT, 
                status_contract TEXT,
                status_financial TEXT, 
                recurrence_value REAL, 
                membership_value REAL,
                updated_at TEXT
            )
        ''')
        if not db.use_turso: conn.commit()
        print("✅ Nova tabela criada com sucesso.")
    except Exception as e:
        print(f"❌ Erro fatal criando tabela: {e}")
        conn.close()
        return

    conn.close()

    headers = {"x-access-token": TOKEN, "Content-Type": "application/json"}
    base_payload = { "perPage": 100 }
    
    print(f"📡 Modo: FULL SCAN")
    db.update_heartbeat("Contratos (API)", "RUNNING", "Iniciando...")

    # Discovery
    first_page = fetch_page_data(URL_API, base_payload, headers, 1)
    if not first_page:
        print("⚠️ Erro ao buscar página 1.")
        return

    total_pages = first_page.get('pages', 1)
    total_items = first_page.get('total', 0)
    
    if total_items == 0 and total_pages > 0: total_items = f"~{total_pages * 100}"
    print(f"📊 Volume: {total_items} registros em {total_pages} páginas.")

    total_saved = process_and_save_batch(db, first_page.get('data', []))
    
    if total_pages > 1:
        print(f"🚀 Baixando com {MAX_WORKERS} threads...")
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            future_to_page = {
                executor.submit(fetch_page_data, URL_API, base_payload, headers, p): p 
                for p in range(2, total_pages + 1)
            }
            processed_count = 0
            total_tasks = len(future_to_page)
            print_progress_bar(0, total_tasks, prefix='Progresso:', suffix='Iniciando', length=40)

            for future in as_completed(future_to_page):
                try:
                    data = future.result()
                    if data:
                        saved = process_and_save_batch(db, data.get('data', []))
                        total_saved += saved
                    processed_count += 1
                    print_progress_bar(processed_count, total_tasks, prefix='Progresso:', suffix=f'({processed_count}/{total_tasks})', length=40)
                except Exception:
                    processed_count += 1
    
    print()
    msg_final = f"Finalizado. Total Salvo: {total_saved}"
    print(f"🏁 {msg_final}")
    db.update_heartbeat("Contratos (API)", "ONLINE", msg_final)

if __name__ == "__main__":
    run_worker_contracts()