import sys
import os
import time
import datetime
import pandas as pd

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from feegow_client import fetch_financial_data
    from database_manager import DatabaseManager
    # Import necessário para criar Statements do Turso
    import libsql_client 
except ImportError as e:
    # Se der erro no import, o DatabaseManager já trata, mas aqui é seguro ter
    pass

def clean_currency(value_str):
    if pd.isna(value_str) or value_str == '': return 0.0
    if isinstance(value_str, (int, float)): return float(value_str)
    try:
        s = str(value_str).replace('R$', '').replace(' ', '').replace('.', '').replace(',', '.')
        return float(s)
    except: return 0.0

def update_appointments_data():
    print(f"--- Worker Feegow Appointments (Batch Optimized): {datetime.datetime.now().strftime('%H:%M:%S')} ---")
    db = DatabaseManager()
    db.update_heartbeat("appointments", "RUNNING", "Baixando dados (Full)...")

    # 1. DOWNLOAD (Mantendo o método rápido de 60 dias)
    now = datetime.datetime.now()
    start_date = (now - datetime.timedelta(days=30)).strftime('%d-%m-%Y')
    end_date = (now + datetime.timedelta(days=30)).strftime('%d-%m-%Y')
    
    try:
        df = fetch_financial_data(start_date=start_date, end_date=end_date)
    except Exception as e:
        msg = f"Erro API: {e}"
        print(msg)
        db.update_heartbeat("appointments", "ERROR", msg)
        return

    if df.empty:
        db.update_heartbeat("appointments", "WARNING", "API retornou vazio")
        return

    # 2. PREPARAÇÃO DOS DADOS
    # Transformamos o DF em uma lista de tuplas para inserção em lote
    col_status = 'status_id' if 'status_id' in df.columns else 'status'
    valid_statuses = [1, 2, 3, 4, 6, 7, 11, 15, 16, 22]
    
    df[col_status] = pd.to_numeric(df[col_status], errors='coerce').fillna(0).astype(int)
    df_to_save = df[df[col_status].isin(valid_statuses)].copy()

    agora = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    data_params = []

    for _, row in df_to_save.iterrows():
        app_id = int(row.get('agendamento_id') or row.get('id') or 0)
        if app_id == 0: continue
        
        raw_date = row.get('data') or row.get('data_agendamento')
        iso_date = agora[:10]
        if raw_date:
            try: iso_date = pd.to_datetime(raw_date, dayfirst=True).strftime('%Y-%m-%d')
            except: pass

        val = clean_currency(row.get('valor') or row.get('valor_total_agendamento'))
        sched_at = str(row.get('agendado_em') or '').strip()
        nome_prof = str(row.get('nome_profissional') or row.get('profissional') or 'Desconhecido')
        
        # Monta a tupla de parâmetros
        params = (
            app_id, iso_date, int(row.get(col_status)), val, 
            str(row.get('especialidade') or 'Geral'), 
            nome_prof,
            str(row.get('procedure_group') or 'Geral'),
            str(row.get('agendado_por') or 'Sis'),
            str(row.get('nome_fantasia') or 'Matriz'),
            sched_at,
            agora
        )
        data_params.append(params)

    # 3. SALVAMENTO EM LOTE (BATCH)
    conn = db.get_connection()
    try:
        # Garante criação da Tabela
        conn.execute('''
            CREATE TABLE IF NOT EXISTS feegow_appointments (
                appointment_id INTEGER PRIMARY KEY, date TEXT, status_id INTEGER, value REAL, 
                specialty TEXT, professional_name TEXT, procedure_group TEXT, 
                scheduled_by TEXT, unit_name TEXT, scheduled_at TEXT, updated_at TEXT
            )
        ''')
        
        # --- CORREÇÃO: MIGRAÇÕES RODAM EM QUALQUER BANCO (TURSO OU LOCAL) ---
        migrations = [
            "ALTER TABLE feegow_appointments ADD COLUMN scheduled_by TEXT",
            "ALTER TABLE feegow_appointments ADD COLUMN unit_name TEXT",
            "ALTER TABLE feegow_appointments ADD COLUMN scheduled_at TEXT"
        ]
        
        for mig in migrations:
            try:
                conn.execute(mig)
                # No Turso/LibSQL o execute já pode ser autocommit, mas não custa garantir no local
                if not db.use_turso: conn.commit()
            except Exception:
                # Se a coluna já existir, vai dar erro e cair aqui. Ignoramos.
                pass
        
        # ---------------------------------------------------------------------

        sql = '''
            INSERT INTO feegow_appointments (
                appointment_id, date, status_id, value, 
                specialty, professional_name, procedure_group, 
                scheduled_by, unit_name, scheduled_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(appointment_id) DO UPDATE SET
                status_id = excluded.status_id,
                value = excluded.value,
                professional_name = excluded.professional_name,
                unit_name = excluded.unit_name,
                scheduled_at = excluded.scheduled_at,
                updated_at = excluded.updated_at
        '''

        print(f" > Salvando {len(data_params)} registros...")
        start_save = time.time()

        if db.use_turso:
            # BATCH OTIMIZADO (TURSO)
            CHUNK_SIZE = 500
            for i in range(0, len(data_params), CHUNK_SIZE):
                chunk = data_params[i:i + CHUNK_SIZE]
                stmts = []
                for p in chunk:
                    stmts.append(libsql_client.Statement(sql, p))
                conn.batch(stmts)
                print(".", end="", flush=True)
                
        else:
            # BATCH LOCAL (SQLITE)
            conn.executemany(sql, data_params)
            conn.commit()

        duration = round(time.time() - start_save, 2)
        msg = f"Sucesso: {len(data_params)} registros em {duration}s"
        print(f"\n✅ {msg}")
        db.update_heartbeat("appointments", "ONLINE", msg)

    except Exception as e:
        print(f"\n❌ Erro Salvando: {e}")
        db.update_heartbeat("appointments", "ERROR", str(e))
    finally:
        conn.close()

if __name__ == "__main__":
    update_appointments_data()
