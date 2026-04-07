import os
import sys
import math
import time
import argparse
import datetime

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from feegow_client import fetch_patients_page
    from database_manager import DatabaseManager
    import libsql_client
except ImportError:
    libsql_client = None


SERVICE_NAME = 'patients_registry'
DEFAULT_PAGE_SIZE = max(1, int(os.getenv('FEEGOW_PATIENTS_PAGE_SIZE', '100')))
DEFAULT_OVERLAP_DAYS = max(0, int(os.getenv('FEEGOW_PATIENTS_OVERLAP_DAYS', '1')))
DEFAULT_SLEEP_SEC = max(0.0, float(os.getenv('FEEGOW_PATIENTS_PAGE_SLEEP_SEC', '0')))


def clean_int(value, default=None):
    try:
        if value is None or value == '':
            return default
        return int(float(value))
    except Exception:
        return default


def clean_str(value):
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def parse_dt(raw_value):
    raw = clean_str(raw_value)
    if not raw:
        return None
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d'):
        try:
            return datetime.datetime.strptime(raw, fmt)
        except Exception:
            continue
    return None


def ensure_patients_table(db, conn):
    conn.execute(
        '''
        CREATE TABLE IF NOT EXISTS feegow_patients (
            patient_id INTEGER PRIMARY KEY,
            nome TEXT,
            nome_social TEXT,
            nascimento TEXT,
            bairro TEXT,
            tabela_id INTEGER,
            sexo_id INTEGER,
            email TEXT,
            celular TEXT,
            criado_em TEXT,
            alterado_em TEXT,
            programa_saude_json TEXT,
            payload_json TEXT,
            updated_at TEXT
        )
        '''
    )

    migrations = [
        'ALTER TABLE feegow_patients ADD COLUMN nome TEXT',
        'ALTER TABLE feegow_patients ADD COLUMN nome_social TEXT',
        'ALTER TABLE feegow_patients ADD COLUMN nascimento TEXT',
        'ALTER TABLE feegow_patients ADD COLUMN bairro TEXT',
        'ALTER TABLE feegow_patients ADD COLUMN tabela_id INTEGER',
        'ALTER TABLE feegow_patients ADD COLUMN sexo_id INTEGER',
        'ALTER TABLE feegow_patients ADD COLUMN email TEXT',
        'ALTER TABLE feegow_patients ADD COLUMN celular TEXT',
        'ALTER TABLE feegow_patients ADD COLUMN criado_em TEXT',
        'ALTER TABLE feegow_patients ADD COLUMN alterado_em TEXT',
        'ALTER TABLE feegow_patients ADD COLUMN programa_saude_json TEXT',
        'ALTER TABLE feegow_patients ADD COLUMN payload_json TEXT',
        'ALTER TABLE feegow_patients ADD COLUMN updated_at TEXT',
    ]

    for sql in migrations:
        try:
            conn.execute(sql)
            if not db.use_turso:
                conn.commit()
        except Exception:
            pass

    conn.execute(
        '''
        CREATE TABLE IF NOT EXISTS feegow_patients_sync_state (
            sync_key VARCHAR(100) PRIMARY KEY,
            sync_value TEXT,
            updated_at TEXT
        )
        '''
    )
    if not db.use_turso:
        conn.commit()


def set_sync_state(db, conn, sync_key, sync_value):
    now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn.execute(
        '''
        INSERT INTO feegow_patients_sync_state (sync_key, sync_value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(sync_key) DO UPDATE SET
            sync_value = excluded.sync_value,
            updated_at = excluded.updated_at
        ''',
        (str(sync_key), None if sync_value is None else str(sync_value), now_str),
    )
    if not db.use_turso:
        conn.commit()


def table_has_rows(conn):
    try:
        rs = conn.execute('SELECT COUNT(1) AS total FROM feegow_patients')
        row = rs.fetchone() if hasattr(rs, 'fetchone') else None
        if row is None and hasattr(rs, 'fetchall'):
            rows = rs.fetchall()
            row = rows[0] if rows else None
        if not row:
            return False
        if isinstance(row, (tuple, list)):
            return int(row[0] or 0) > 0
        return int(getattr(row, 'total', None) or row.get('total') or 0) > 0
    except Exception:
        return False


def get_incremental_date(conn, overlap_days=1):
    try:
        rs = conn.execute('SELECT MAX(alterado_em) AS max_alterado_em FROM feegow_patients')
        row = rs.fetchone() if hasattr(rs, 'fetchone') else None
        if row is None and hasattr(rs, 'fetchall'):
            rows = rs.fetchall()
            row = rows[0] if rows else None
        if not row:
            return None
        raw_value = row[0] if isinstance(row, (tuple, list)) else (getattr(row, 'max_alterado_em', None) or row.get('max_alterado_em'))
        dt_value = parse_dt(raw_value)
        if not dt_value:
            return None
        return (dt_value - datetime.timedelta(days=max(0, overlap_days))).strftime('%Y-%m-%d')
    except Exception:
        return None


def build_row(item, now_str):
    import json

    patient_id = clean_int(item.get('patient_id'), default=0)
    if not patient_id:
        return None

    return (
        patient_id,
        clean_str(item.get('nome')),
        clean_str(item.get('nome_social')),
        clean_str(item.get('nascimento')),
        clean_str(item.get('bairro')),
        clean_int(item.get('tabela_id')),
        clean_int(item.get('sexo_id')),
        clean_str(item.get('email')),
        clean_str(item.get('celular')),
        clean_str(item.get('criado_em')),
        clean_str(item.get('alterado_em')),
        json.dumps(item.get('programa_de_saude') or [], ensure_ascii=False, default=str),
        json.dumps(item, ensure_ascii=False, default=str),
        now_str,
    )


def save_batch(db, conn, rows):
    if not rows:
        return 0

    sql = '''
        INSERT INTO feegow_patients (
            patient_id, nome, nome_social, nascimento, bairro,
            tabela_id, sexo_id, email, celular,
            criado_em, alterado_em, programa_saude_json, payload_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(patient_id) DO UPDATE SET
            nome = excluded.nome,
            nome_social = excluded.nome_social,
            nascimento = excluded.nascimento,
            bairro = excluded.bairro,
            tabela_id = excluded.tabela_id,
            sexo_id = excluded.sexo_id,
            email = excluded.email,
            celular = excluded.celular,
            criado_em = excluded.criado_em,
            alterado_em = excluded.alterado_em,
            programa_saude_json = excluded.programa_saude_json,
            payload_json = excluded.payload_json,
            updated_at = excluded.updated_at
    '''

    if db.use_turso:
        if libsql_client is None:
            raise RuntimeError('libsql_client nao disponivel para batch Turso')
        statements = [libsql_client.Statement(sql, row) for row in rows]
        conn.batch(statements)
    else:
        conn.executemany(sql, rows)
        conn.commit()

    return len(rows)


def sync_feegow_patients(full_sync=False, alterado_em=None, page_size=DEFAULT_PAGE_SIZE, max_pages=None, sleep_sec=DEFAULT_SLEEP_SEC):
    print(f"--- Worker Feegow Patients: {datetime.datetime.now().strftime('%H:%M:%S')} ---")
    db = DatabaseManager()
    db.update_heartbeat(SERVICE_NAME, 'RUNNING', 'Baixando cadastro de pacientes...')

    conn = db.get_connection()
    try:
        ensure_patients_table(db, conn)
        has_existing_rows = table_has_rows(conn)
        incremental_date = clean_str(alterado_em)
        sync_mode = 'full'

        if not full_sync and not incremental_date and has_existing_rows:
            incremental_date = get_incremental_date(conn, DEFAULT_OVERLAP_DAYS)
        if incremental_date:
            sync_mode = f'incremental alterado_em>={incremental_date}'

        is_bootstrap_run = (not incremental_date) and ((not has_existing_rows) or bool(full_sync))
        should_mark_bootstrap_complete = is_bootstrap_run and max_pages is None
        set_sync_state(db, conn, 'last_sync_mode', sync_mode)
        if is_bootstrap_run:
            set_sync_state(db, conn, 'bootstrap_complete', '0')

        print(f' -> Modo de sincronizacao: {sync_mode}')

        offset = 0
        page = 0
        total_saved = 0
        total_received = 0
        empty_pages = 0

        while True:
            if max_pages is not None and page >= max_pages:
                break

            params = {}
            if incremental_date:
                params['alterado_em'] = incremental_date

            response = fetch_patients_page(limit=page_size, offset=offset, extra_params=params)
            if not isinstance(response, dict) or response.get('success') is False:
                raise RuntimeError(f'Feegow patient/list retornou erro na pagina {page + 1}: {response}')

            content = response.get('content') or []
            received = len(content)
            page += 1
            total_received += received

            print(f' -> Pagina {page}: {received} pacientes (offset={offset})')

            if not content:
                empty_pages += 1
                if empty_pages >= 1:
                    break
                offset += page_size
                continue

            rows = []
            now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            for item in content:
                row = build_row(item, now_str)
                if row is not None:
                    rows.append(row)

            total_saved += save_batch(db, conn, rows)

            if received < page_size:
                break

            offset += page_size
            if sleep_sec > 0:
                time.sleep(sleep_sec)

        details = f'{total_saved} pacientes sincronizados ({sync_mode})'
        if should_mark_bootstrap_complete:
            set_sync_state(db, conn, 'bootstrap_complete', '1')
            set_sync_state(db, conn, 'bootstrap_completed_at', datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
        print(f'OK {details}')
        db.update_heartbeat(SERVICE_NAME, 'COMPLETED', details)
        return {
            'saved': total_saved,
            'received': total_received,
            'mode': sync_mode,
            'pages': page,
        }
    except Exception as exc:
        print(f'ERRO ao sincronizar pacientes Feegow: {exc}')
        db.update_heartbeat(SERVICE_NAME, 'ERROR', str(exc))
        raise
    finally:
        conn.close()


def build_arg_parser():
    parser = argparse.ArgumentParser(description='Sincroniza cadastro de pacientes da API Feegow')
    parser.add_argument('--full', action='store_true', help='Forca sincronizacao completa')
    parser.add_argument('--alterado-em', dest='alterado_em', help='Filtra por data de alteracao (YYYY-MM-DD)')
    parser.add_argument('--page-size', dest='page_size', type=int, default=DEFAULT_PAGE_SIZE, help='Tamanho da pagina')
    parser.add_argument('--max-pages', dest='max_pages', type=int, default=None, help='Limita numero de paginas (smoke)')
    parser.add_argument('--sleep-seconds', dest='sleep_seconds', type=float, default=DEFAULT_SLEEP_SEC, help='Pausa entre paginas')
    return parser


if __name__ == '__main__':
    args = build_arg_parser().parse_args()
    sync_feegow_patients(
        full_sync=bool(args.full),
        alterado_em=args.alterado_em,
        page_size=max(1, int(args.page_size or DEFAULT_PAGE_SIZE)),
        max_pages=args.max_pages if args.max_pages and args.max_pages > 0 else None,
        sleep_sec=max(0.0, float(args.sleep_seconds or 0)),
    )
