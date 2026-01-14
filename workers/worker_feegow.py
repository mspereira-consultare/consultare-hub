import sys
import os
import sqlite3
import time
import datetime
import pandas as pd

# Adiciona o diretório atual ao path para garantir importação
sys.path.append(os.path.dirname(__file__))

try:
    from feegow_client import fetch_financial_data
except ImportError as e:
    print(f"ERRO CRÍTICO: Não foi possível importar 'feegow_client'.\nDetalhe: {e}")
    sys.exit(1)

# Caminho do Banco
DB_PATH = os.path.join(os.path.dirname(__file__), '../data/dados_clinica.db')

def get_db_connection():
    return sqlite3.connect(DB_PATH)

def clean_currency(value_str):
    if pd.isna(value_str) or value_str == '':
        return 0.0
    if isinstance(value_str, (int, float)):
        return float(value_str)
    try:
        s = str(value_str).replace('R$', '').replace(' ', '').strip()
        s = s.replace('.', '').replace(',', '.')
        return float(s)
    except Exception:
        return 0.0

def update_financial_data():
    print(f"--- Atualizando Feegow (Completo): {datetime.datetime.now()} ---")
    
    # Busca do dia 1 do mês até hoje (garante que atualiza status que mudaram recentemente)
    now = datetime.datetime.now()
    first_day = now.replace(day=1).strftime('%d-%m-%Y')
    today = now.strftime('%d-%m-%Y')
    
    try:
        df = fetch_financial_data(start_date=first_day, end_date=today)
    except Exception as e:
        print(f"Erro na conexão com Feegow: {e}")
        return

    if df.empty:
        print("Nenhum dado retornado do Feegow.")
        return

    col_status = 'status_id' if 'status_id' in df.columns else 'status'
    
    if col_status not in df.columns:
        print(f"Aviso: Coluna '{col_status}' não encontrada.")
        return

    # --- MUDANÇA AQUI: Não filtramos mais apenas o 3 ---
    # Queremos salvar tudo para calcular absenteísmo e ocupação depois
    # Lista de status úteis para o dashboard (ignora lixo de teste se houver)
    valid_statuses = [
        1,  # Marcado (Futuro)
        2,  # Em andamento (Check-in feito)
        3,  # Atendido (Finalizado)
        4,  # Em atendimento (Na sala)
        6,  # Não Compareceu (Falta)
        7,  # Confirmado (Futuro ou Passado não finalizado)
        11, # Desmarcado Paciente
        15, # Remarcado
        16, # Desmarcado Profissional
        22  # Cancelado Profissional
    ]

    # Filtra apenas para garantir que não pegamos status nulos ou estranhos,
    # mas mantemos todos os relevantes para a operação.
    # Convertemos para numérico para evitar erro de string
    df[col_status] = pd.to_numeric(df[col_status], errors='coerce').fillna(0).astype(int)
    df_to_save = df[df[col_status].isin(valid_statuses)].copy()

    conn = get_db_connection()
    cursor = conn.cursor()
    
    records_saved = 0
    
    for _, row in df_to_save.iterrows():
        try:
            app_id = int(row.get('agendamento_id') or row.get('id') or 0)
            
            # Tratamento de Data
            raw_date = row.get('data') or row.get('data_agendamento')
            iso_date = datetime.datetime.now().strftime("%Y-%m-%d")
            
            if raw_date:
                clean_date_str = str(raw_date)[:10]
                try:
                    if '-' in clean_date_str:
                         date_obj = datetime.datetime.strptime(clean_date_str, "%d-%m-%Y").date()
                    else:
                         date_obj = datetime.datetime.strptime(clean_date_str, "%d/%m/%Y").date()
                    iso_date = date_obj.strftime("%Y-%m-%d")
                except: pass

            raw_val = row.get('valor')
            val = clean_currency(raw_val)
            
            spec = row.get('especialidade') or row.get('nome_especialidade') or 'Geral'
            prof = row.get('nome_profissional') or row.get('profissional') or 'Desconhecido'
            proc_group = row.get('procedure_group') or 'Geral'
            
            # Pega o Status ID da linha atual
            st_id = int(row.get(col_status))

            if app_id > 0:
                cursor.execute('''
                    INSERT INTO feegow_appointments (
                        appointment_id, date, status_id, value, 
                        specialty, professional_name, procedure_group, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
                    ON CONFLICT(appointment_id) DO UPDATE SET
                        status_id = excluded.status_id,
                        value = excluded.value,
                        specialty = excluded.specialty,
                        professional_name = excluded.professional_name,
                        procedure_group = excluded.procedure_group,
                        updated_at = excluded.updated_at
                ''', (app_id, iso_date, st_id, val, spec, prof, proc_group))
                records_saved += 1
            
        except Exception as e:
            print(f"Erro linha {row.get('id')}: {e}")

    conn.commit()
    conn.close()
    print(f" -> Sucesso: {records_saved} registros (Agendados, Atendidos, Cancelados) atualizados.")

if __name__ == "__main__":
    print("--- Iniciando Worker Feegow 2.0 (Multi-Status) ---")
    while True:
        update_financial_data()
        print("Aguardando 5 minutos...")
        time.sleep(300)