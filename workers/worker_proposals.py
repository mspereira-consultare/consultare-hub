import sys
import os
import datetime
import pandas as pd
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from feegow_client import fetch_proposals, request_endpoint
    from database_manager import DatabaseManager
    import libsql_client
except ImportError:
    pass

CONTACT_CACHE_STALE_DAYS = max(1, int(os.getenv('PROPOSALS_CONTACT_CACHE_STALE_DAYS', '30')))
CONTACT_CACHE_LIMIT_PER_BATCH = max(1, int(os.getenv('PROPOSALS_CONTACT_CACHE_LIMIT_PER_BATCH', '40')))
CONTACT_CACHE_MAX_WORKERS = max(1, int(os.getenv('PROPOSALS_CONTACT_CACHE_MAX_WORKERS', '6')))


def clean_currency(value):
    if pd.isna(value) or value == '':
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    try:
        s = str(value).replace('R$', '').replace(' ', '').strip()
        s = s.replace('.', '').replace(',', '.')
        return float(s)
    except Exception:
        return 0.0


def normalize_datetime_text(value):
    raw = str(value or '').strip()
    return raw or None


def pick_primary_value(value):
    if isinstance(value, list):
        for entry in value:
            normalized = str(entry or '').strip()
            if normalized:
                return normalized
        return ''
    return str(value or '').strip()


def ensure_support_tables(db):
    conn = db.get_connection()
    try:
        conn.execute(
            '''
            CREATE TABLE IF NOT EXISTS feegow_proposals (
                proposal_id INTEGER PRIMARY KEY,
                date TEXT,
                status TEXT,
                unit_name TEXT,
                professional_name TEXT,
                total_value REAL,
                items_json TEXT,
                patient_id INTEGER,
                proposal_last_update TEXT,
                updated_at TEXT
            )
            '''
        )
        conn.execute(
            '''
            CREATE TABLE IF NOT EXISTS feegow_patient_contacts_cache (
                patient_id INTEGER PRIMARY KEY,
                patient_name TEXT,
                phone_primary TEXT,
                email_primary TEXT,
                cpf TEXT,
                updated_at TEXT
            )
            '''
        )

        existing_columns = set()
        rs = conn.execute('PRAGMA table_info(feegow_proposals)')
        rows = rs.fetchall() if hasattr(rs, 'fetchall') else getattr(rs, 'rows', [])
        for row in rows or []:
            name = ''
            if isinstance(row, (list, tuple)) and len(row) > 1:
                name = str(row[1] or '').strip()
            elif isinstance(row, (list, tuple)) and len(row) >= 1:
                name = str(row[0] or '').strip()
            elif hasattr(row, 'get'):
                name = str(row.get('name') or row.get('COLUMN_NAME') or '').strip()
            else:
                name = str(getattr(row, 'name', '') or '').strip()
            if name:
                existing_columns.add(name)

        if 'patient_id' not in existing_columns:
            conn.execute('ALTER TABLE feegow_proposals ADD COLUMN patient_id INTEGER')
        if 'proposal_last_update' not in existing_columns:
            conn.execute('ALTER TABLE feegow_proposals ADD COLUMN proposal_last_update TEXT')

        if db.use_turso:
            conn.execute('CREATE INDEX IF NOT EXISTS idx_prop_date ON feegow_proposals(date)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_prop_unit ON feegow_proposals(unit_name)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_prop_status ON feegow_proposals(status)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_prop_patient ON feegow_proposals(patient_id)')
        else:
            if db.use_mysql:
                indexes = {
                    'idx_prop_date': 'CREATE INDEX idx_prop_date ON feegow_proposals(date)',
                    'idx_prop_unit': 'CREATE INDEX idx_prop_unit ON feegow_proposals(unit_name)',
                    'idx_prop_status': 'CREATE INDEX idx_prop_status ON feegow_proposals(status(120))',
                    'idx_prop_patient': 'CREATE INDEX idx_prop_patient ON feegow_proposals(patient_id)',
                }
                for index_name, ddl in indexes.items():
                    rs = conn.execute(
                        """
                        SELECT COUNT(1)
                        FROM information_schema.statistics
                        WHERE table_schema = DATABASE()
                          AND table_name = 'feegow_proposals'
                          AND index_name = ?
                        """,
                        (index_name,),
                    )
                    row = rs.fetchone() if hasattr(rs, 'fetchone') else None
                    if row and row[0] == 0:
                        conn.execute(ddl)
                conn.commit()
            else:
                cursor = conn.cursor()
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_prop_date ON feegow_proposals(date)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_prop_unit ON feegow_proposals(unit_name)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_prop_status ON feegow_proposals(status)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_prop_patient ON feegow_proposals(patient_id)')
                conn.commit()
    finally:
        conn.close()


def fetch_patient_contact(patient_id):
    try:
        data = request_endpoint('patient/search', method='GET', json_body={'paciente_id': int(patient_id), 'photo': 0})
        content = data.get('content') if isinstance(data, dict) else None
        if not isinstance(content, dict):
            return None
        phone_primary = pick_primary_value(content.get('celulares')) or pick_primary_value(content.get('telefones')) or pick_primary_value(content.get('celular'))
        email_primary = pick_primary_value(content.get('email'))
        documentos = content.get('documentos') if isinstance(content.get('documentos'), dict) else {}
        return {
            'patient_id': int(patient_id),
            'patient_name': str(content.get('nome') or '').strip(),
            'phone_primary': phone_primary,
            'email_primary': email_primary,
            'cpf': str(documentos.get('cpf') or content.get('cpf') or '').strip(),
        }
    except Exception:
        return None


def parse_cache_timestamp(value):
    raw = str(value or '').strip().replace('T', ' ')
    if not raw:
        return None
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M:%S.%f'):
        try:
            return datetime.datetime.strptime(raw, fmt)
        except Exception:
            continue
    return None


def should_refresh_cache_row(row):
    if not row:
        return True
    patient_name = str(row[1] or '').strip() if len(row) > 1 else ''
    phone_primary = str(row[2] or '').strip() if len(row) > 2 else ''
    email_primary = str(row[3] or '').strip() if len(row) > 3 else ''
    updated_at = str(row[5] or '').strip() if len(row) > 5 else ''
    if not patient_name and not phone_primary and not email_primary:
        return True
    parsed = parse_cache_timestamp(updated_at)
    if not parsed:
        return True
    return (datetime.datetime.now() - parsed).days >= CONTACT_CACHE_STALE_DAYS


def sync_patient_contacts_cache(db, patient_ids):
    unique_ids = sorted({int(pid) for pid in (patient_ids or []) if str(pid or '').strip().isdigit() and int(pid) > 0})
    if not unique_ids:
        return 0

    conn = db.get_connection()
    try:
        placeholders = ','.join(['?'] * len(unique_ids))
        rs = conn.execute(
            f'''
            SELECT patient_id, patient_name, phone_primary, email_primary, cpf, updated_at
            FROM feegow_patient_contacts_cache
            WHERE patient_id IN ({placeholders})
            ''',
            tuple(unique_ids),
        )
        rows = rs.fetchall() if hasattr(rs, 'fetchall') else getattr(rs, 'rows', [])
        cache_by_id = {}
        for row in rows or []:
            if isinstance(row, dict):
                cache_by_id[int(row.get('patient_id') or 0)] = (
                    row.get('patient_id'), row.get('patient_name'), row.get('phone_primary'), row.get('email_primary'), row.get('cpf'), row.get('updated_at')
                )
            elif isinstance(row, (list, tuple)) and row:
                cache_by_id[int(row[0] or 0)] = row

        ids_to_fetch = [patient_id for patient_id in unique_ids if should_refresh_cache_row(cache_by_id.get(patient_id))]
        ids_to_fetch = ids_to_fetch[:CONTACT_CACHE_LIMIT_PER_BATCH]
        if not ids_to_fetch:
            return 0

        contacts = []
        with ThreadPoolExecutor(max_workers=CONTACT_CACHE_MAX_WORKERS) as executor:
            future_map = {executor.submit(fetch_patient_contact, patient_id): patient_id for patient_id in ids_to_fetch}
            for future in as_completed(future_map):
                result = future.result()
                if result:
                    contacts.append(result)

        if not contacts:
            return 0

        sql = '''
            INSERT INTO feegow_patient_contacts_cache (
                patient_id, patient_name, phone_primary, email_primary, cpf, updated_at
            ) VALUES (?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(patient_id) DO UPDATE SET
                patient_name = excluded.patient_name,
                phone_primary = excluded.phone_primary,
                email_primary = excluded.email_primary,
                cpf = excluded.cpf,
                updated_at = excluded.updated_at
        '''
        params = [
            (
                int(item['patient_id']),
                item.get('patient_name') or '',
                item.get('phone_primary') or '',
                item.get('email_primary') or '',
                item.get('cpf') or '',
            )
            for item in contacts
        ]

        if db.use_turso:
            stmts = [libsql_client.Statement(sql, p) for p in params]
            conn.batch(stmts)
        else:
            conn.executemany(sql, params)
            conn.commit()
        return len(params)
    except Exception as e:
        print(f'⚠️ Erro ao sincronizar cache de pacientes: {e}')
        return 0
    finally:
        conn.close()


def process_and_save_batch(db, df):
    if df.empty:
        return 0, set()

    conn = db.get_connection()
    data_params = []
    patient_ids = set()

    for _, row in df.iterrows():
        try:
            prop_id = int(row.get('proposal_id') or 0)
            if prop_id == 0:
                continue

            iso_date = row.get('proposal_date')
            status = row.get('status', 'Pendente')
            proposal_last_update = normalize_datetime_text(row.get('proposal_last_update'))

            unit_data = row.get('unidade') or {}
            unit_name = 'Matriz'
            if isinstance(unit_data, dict):
                unit_name = unit_data.get('nome_fantasia', 'Matriz')

            prof_name = row.get('proposer_name', 'Sistema')
            patient_id = int(row.get('PacienteID') or 0) if str(row.get('PacienteID') or '').strip() else None
            if patient_id and patient_id > 0:
                patient_ids.add(patient_id)

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

            params = (
                prop_id,
                iso_date,
                status,
                unit_name,
                prof_name,
                total_liquido,
                json.dumps(items_list, ensure_ascii=False),
                patient_id,
                proposal_last_update,
            )
            data_params.append(params)
        except Exception:
            pass

    if not data_params:
        conn.close()
        return 0, set()

    sql = '''
        INSERT INTO feegow_proposals (
            proposal_id, date, status, unit_name,
            professional_name, total_value, items_json,
            patient_id, proposal_last_update, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(proposal_id) DO UPDATE SET
            date = excluded.date,
            status = excluded.status,
            unit_name = excluded.unit_name,
            professional_name = excluded.professional_name,
            total_value = excluded.total_value,
            items_json = excluded.items_json,
            patient_id = excluded.patient_id,
            proposal_last_update = excluded.proposal_last_update,
            updated_at = excluded.updated_at
    '''

    try:
        if db.use_turso:
            stmts = [libsql_client.Statement(sql, p) for p in data_params]
            conn.batch(stmts)
        else:
            conn.executemany(sql, data_params)
            conn.commit()
        return len(data_params), patient_ids
    except Exception as e:
        print(f'❌ Erro Batch: {e}')
        return 0, set()
    finally:
        conn.close()


def update_proposals():
    print(f"--- Worker Propostas (Hibrido + Batch): {datetime.datetime.now().strftime('%H:%M:%S')} ---")

    db = DatabaseManager()
    db.update_heartbeat('comercial', 'RUNNING', 'Iniciando fatiamento...')

    try:
        ensure_support_tables(db)
    except Exception as e:
        print(f'Erro tabela: {e}')

    now = datetime.datetime.now()
    start_date_obj = now - datetime.timedelta(days=30)
    end_date_obj = now + datetime.timedelta(days=30)

    current_start = start_date_obj
    chunk_days = 5
    total_saved = 0
    total_contacts_synced = 0

    print(f"📆 Janela: {start_date_obj.strftime('%d/%m')} a {end_date_obj.strftime('%d/%m')}")

    try:
        while current_start < end_date_obj:
            current_end = min(current_start + datetime.timedelta(days=chunk_days), end_date_obj)

            s_str = current_start.strftime('%d-%m-%Y')
            e_str = current_end.strftime('%d-%m-%Y')

            print(f" > Lote: {s_str} a {e_str} ...", end='', flush=True)

            try:
                df = fetch_proposals(s_str, e_str)
                if not df.empty:
                    qtd, patient_ids = process_and_save_batch(db, df)
                    total_saved += qtd
                    cache_synced = sync_patient_contacts_cache(db, patient_ids)
                    total_contacts_synced += cache_synced
                    print(f" ✅ {qtd} salvos | contatos cache: {cache_synced}.")
                else:
                    print(' .')
            except Exception as e:
                print(f" ❌ Erro: {e}")

            current_start = current_end + datetime.timedelta(days=1)
            time.sleep(1)

        msg_final = f'Total processado: {total_saved} | contatos cache: {total_contacts_synced}'
        print(f"\n🏁 {msg_final}")
        db.update_heartbeat('comercial', 'ONLINE', msg_final)

    except Exception as e:
        print(f"\n❌ Erro fatal loop: {e}")
        db.update_heartbeat('comercial', 'ERROR', str(e))


if __name__ == '__main__':
    update_proposals()
