import sys
import os
import datetime
import pandas as pd
import json
import time

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from feegow_client import fetch_proposals
    from database_manager import DatabaseManager
    import libsql_client
except ImportError as e:
    pass

def clean_currency(value):
    """Lógica original de limpeza de moeda"""
    if pd.isna(value) or value == '': return 0.0
    if isinstance(value, (int, float)): return float(value)
    try:
        s = str(value).replace('R$', '').replace(' ', '').strip()
        s = s.replace('.', '').replace(',', '.')
        return float(s)
    except: return 0.0

def process_and_save_batch(db, df):
    """
    Processa o DataFrame, calcula totais e salva em Lote (Batch).
    Substitui o loop row-by-row antigo.
    """
    if df.empty: return 0
    
    conn = db.get_connection()
    data_params = []
    
    # 1. Preparação dos Dados (Memória)
    for _, row in df.iterrows():
        try:
            prop_id = int(row.get('proposal_id') or 0)
            if prop_id == 0: continue

            raw_date = row.get('proposal_date')
            iso_date = raw_date 

            status = row.get('status', 'Pendente')
            
            # Tratamento Unidade
            unit_data = row.get('unidade') or {}
            unit_name = 'Matriz'
            if isinstance(unit_data, dict):
                unit_name = unit_data.get('nome_fantasia', 'Matriz')
            
            prof_name = row.get('proposer_name', 'Sistema')

            # Cálculo Líquido (Lógica Original Mantida)
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

            # Adiciona à lista de parâmetros
            params = (
                prop_id, iso_date, status, unit_name, 
                prof_name, total_liquido, json.dumps(items_list)
            )
            data_params.append(params)
            
        except Exception: pass

    if not data_params: return 0

    # 2. Inserção no Banco (Batch)
    sql = '''
        INSERT INTO feegow_proposals (
            proposal_id, date, status, unit_name, 
            professional_name, total_value, items_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(proposal_id) DO UPDATE SET
            status=excluded.status,
            total_value=excluded.total_value,
            unit_name=excluded.unit_name,
            updated_at=excluded.updated_at
    '''

    try:
        if db.use_turso:
            # Modo Turso (Batch)
            stmts = [libsql_client.Statement(sql, p) for p in data_params]
            conn.batch(stmts)
        else:
            # Modo Local (Executemany)
            conn.executemany(sql, data_params)
            conn.commit()
        return len(data_params)
        
    except Exception as e:
        print(f"❌ Erro Batch: {e}")
        return 0
    finally:
        conn.close()

def update_proposals():
    print(f"--- Worker Propostas (Híbrido + Batch): {datetime.datetime.now().strftime('%H:%M:%S')} ---")
    
    db = DatabaseManager()
    db.update_heartbeat("Propostas (API)", "RUNNING", "Iniciando Fatiamento...")

    # 1. Garante Tabelas
    conn = db.get_connection()
    try:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS feegow_proposals (
                proposal_id INTEGER PRIMARY KEY,
                date TEXT, status TEXT, unit_name TEXT,
                professional_name TEXT, total_value REAL,
                items_json TEXT, updated_at TEXT
            )
        ''')
        # Índices (separados para compatibilidade)
        if db.use_turso:
            conn.execute('CREATE INDEX IF NOT EXISTS idx_prop_date ON feegow_proposals(date)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_prop_unit ON feegow_proposals(unit_name)')
        else:
            conn.execute('CREATE INDEX IF NOT EXISTS idx_prop_date ON feegow_proposals(date)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_prop_unit ON feegow_proposals(unit_name)')
            conn.commit()
    except Exception as e:
        print(f"Erro tabela: {e}")
    finally:
        conn.close()

    # 2. Lógica de Request (Intacta)
    # Define janela total: 30 dias atrás até 30 dias frente
    now = datetime.datetime.now()
    start_date_obj = now - datetime.timedelta(days=30)
    end_date_obj = now + datetime.timedelta(days=30)
    
    current_start = start_date_obj
    CHUNK_DAYS = 5
    total_saved = 0

    print(f"📅 Janela: {start_date_obj.strftime('%d/%m')} a {end_date_obj.strftime('%d/%m')}")

    try:
        while current_start < end_date_obj:
            current_end = min(current_start + datetime.timedelta(days=CHUNK_DAYS), end_date_obj)
            
            s_str = current_start.strftime('%d-%m-%Y')
            e_str = current_end.strftime('%d-%m-%Y')
            
            print(f" > Lote: {s_str} a {e_str} ...", end="", flush=True)
            
            try:
                # Chama a request original
                df = fetch_proposals(s_str, e_str)
                
                if not df.empty:
                    # Salva usando Batch Híbrido
                    qtd = process_and_save_batch(db, df)
                    total_saved += qtd
                    print(f" ✅ {qtd} salvos.")
                else:
                    print(" .") # Vazio
            except Exception as e:
                print(f" ❌ Erro: {e}")
            
            # Avança o cursor e Pausa
            current_start = current_end + datetime.timedelta(days=1)
            time.sleep(1)

        msg_final = f"Total Processado: {total_saved}"
        print(f"\n🏁 {msg_final}")
        db.update_heartbeat("Propostas (API)", "ONLINE", msg_final)

    except Exception as e:
        print(f"\n❌ Erro Fatal Loop: {e}")
        db.update_heartbeat("Propostas (API)", "ERROR", str(e))

if __name__ == "__main__":
    update_proposals()