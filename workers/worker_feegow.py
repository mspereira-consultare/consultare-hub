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

# --- FUNÇÃO DE LIMPEZA DE MOEDA ---
def clean_currency(value_str):
    """
    Converte 'R$ 1.200,50' ou '200,00' para float python (1200.50 ou 200.0).
    """
    if pd.isna(value_str) or value_str == '':
        return 0.0
    
    # Se já for número, retorna direto
    if isinstance(value_str, (int, float)):
        return float(value_str)

    try:
        # Converte para string segura
        s = str(value_str)
        # Remove R$ e espaços
        s = s.replace('R$', '').replace(' ', '').strip()
        # Remove ponto de milhar (ex: 1.000 -> 1000)
        s = s.replace('.', '')
        # Troca vírgula decimal por ponto (ex: 50,2 -> 50.2)
        s = s.replace(',', '.')
        
        return float(s)
    except Exception:
        return 0.0

def update_financial_data():
    print(f"--- Atualizando Feegow: {datetime.datetime.now()} ---")
    
    # LÓGICA DE DATA: Do dia 1 do mês até hoje
    now = datetime.datetime.now()
    first_day = now.replace(day=1).strftime('%d-%m-%Y')
    today = now.strftime('%d-%m-%Y')
    
    try:
        df = fetch_financial_data(start_date=first_day, end_date=today)
    except Exception as e:
        print(f"Erro na conexão com Feegow: {e}")
        return

    if df.empty:
        print("Nenhum dado retornado do Feegow (DataFrame vazio).")
        return

    # Verifica a coluna de status
    col_status = 'status_id' if 'status_id' in df.columns else 'status'
    
    if col_status in df.columns:
        # Filtra Status 3 (ATENDIDO / FATURADO)
        # Convertemos para int para garantir, pois pode vir como string "3"
        try:
            df_faturado = df[df[col_status].astype(str) == '3'].copy()
        except:
            df_faturado = df[df[col_status] == 3].copy()
    else:
        print(f"Aviso: Coluna '{col_status}' não encontrada. Colunas: {df.columns.tolist()}")
        return

    conn = get_db_connection()
    cursor = conn.cursor()
    
    records_saved = 0
    
    for _, row in df_faturado.iterrows():
        try:
            # IDs e Nomes
            app_id = int(row.get('agendamento_id') or row.get('id') or 0)
            
            # Data: Tenta limpar se vier com hora ou formato estranho
            raw_date = row.get('data') or row.get('data_agendamento')
            iso_date = datetime.datetime.now().strftime("%Y-%m-%d")
            
            if raw_date:
                # Pega só os primeiros 10 chars (dd-mm-yyyy) caso venha hora junto
                clean_date_str = str(raw_date)[:10]
                try:
                    # Converte de dd-mm-yyyy para yyyy-mm-dd (SQLite)
                    # Tenta formatos com traço e barra
                    if '-' in clean_date_str:
                         date_obj = datetime.datetime.strptime(clean_date_str, "%d-%m-%Y").date()
                    else:
                         date_obj = datetime.datetime.strptime(clean_date_str, "%d/%m/%Y").date()
                    iso_date = date_obj.strftime("%Y-%m-%d")
                except:
                    pass # Mantém data de hoje se falhar

            # --- AQUI ESTAVA O ERRO ---
            # Usa a nova função de limpeza
            raw_val = row.get('valor')
            val = clean_currency(raw_val)
            
            # Dados complementares
            spec = row.get('especialidade') or row.get('nome_especialidade') or 'Geral'
            prof = row.get('nome_profissional') or row.get('profissional') or 'Desconhecido'
            proc_group = row.get('procedure_group') or 'Geral'

            if app_id > 0:
                # Atualizei a Query SQL para incluir procedure_group
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
                ''', (app_id, iso_date, 3, val, spec, prof, proc_group))
                records_saved += 1
            
        except Exception as e:
            # Imprime o erro mas continua o loop
            print(f"Erro na linha (ID: {row.get('id', '?')}): {e}")

    conn.commit()
    conn.close()
    print(f" -> Sucesso: {records_saved} registros de faturamento salvos no banco.")

if __name__ == "__main__":
    print("--- Iniciando Worker Feegow (Loop) ---")
    while True:
        update_financial_data()
        print("Aguardando 5 minutos...")
        time.sleep(300)