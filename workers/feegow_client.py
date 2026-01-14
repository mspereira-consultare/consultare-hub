import requests
import pandas as pd
import os
import json
from dotenv import load_dotenv

# --- CARREGA AMBIENTE ---
env_path = os.path.join(os.path.dirname(__file__), '../.env')
load_dotenv(env_path)

# --- CONFIGURAÇÃO ---
FEEGOW_TOKEN = os.getenv("FEEGOW_ACCESS_TOKEN")
BASE_URL = "https://api.feegow.com/v1/api"

def get_headers():
    if not FEEGOW_TOKEN:
        print("!!! ERRO: Token FEEGOW_ACCESS_TOKEN não encontrado no .env !!!")
        return {}
    return {
        "Content-Type": "application/json",
        "x-access-token": FEEGOW_TOKEN
    }

def request_endpoint(endpoint, method="GET", json_body=None):
    url = f"{BASE_URL}/{endpoint}"
    headers = get_headers()
    try:
        response = requests.request(method=method, url=url, headers=headers, json=json_body, timeout=20)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"[Feegow API Error] {endpoint}: {e}")
        return {}

def normalize_content(data):
    if data and isinstance(data, dict) and 'content' in data:
        return data['content']
    return []

# --- LISTAGENS AUXILIARES ---
def list_profissionals():
    data = request_endpoint("professional/list", method="GET")
    df = pd.DataFrame(normalize_content(data))
    if not df.empty and 'profissional_id' in df.columns:
        return df[['profissional_id', 'nome']]
    return df

def list_especialidades():
    data = request_endpoint("specialties/list", method="GET")
    df = pd.DataFrame(normalize_content(data))
    if not df.empty and 'especialidade_id' in df.columns:
        return df[['especialidade_id', 'nome']]
    return df

def list_procedure_groups():
    # Endpoint fornecido: GET /procedures/groups
    data = request_endpoint("procedures/groups", method="GET")
    df = pd.DataFrame(normalize_content(data))
    
    # O JSON retornado tem 'id' e 'NomeGrupo'
    if not df.empty and 'id' in df.columns:
        # Renomeia para facilitar o merge
        return df[['id', 'NomeGrupo']].rename(columns={'id': 'grupo_id', 'NomeGrupo': 'nome_grupo'})
    return df

# --- BUSCA PRINCIPAL ---
def fetch_agendamentos(data_start, data_end):
    payload = {
        "data_start": data_start,
        "data_end": data_end,
        "list_procedures": 0
    }
    data = request_endpoint("appoints/search", method="GET", json_body=payload)
    return pd.DataFrame(normalize_content(data))

def fetch_financial_data(start_date, end_date):
    print(f" -> Buscando agendamentos Feegow de {start_date} a {end_date}...")
    
    # 1. Busca Agendamentos
    df = fetch_agendamentos(start_date, end_date)
    if df.empty:
        return pd.DataFrame()

    # 2. Busca Auxiliares
    df_prof = list_profissionals()
    df_esp = list_especialidades()
    df_grupos = list_procedure_groups() # Nova busca
    
    # 3. MERGES
    
    # --- Merge Profissional ---
    if not df_prof.empty and "profissional_id" in df.columns:
        df_prof = df_prof.rename(columns={'nome': 'nome_profissional_ref'})
        df = df.merge(df_prof, on='profissional_id', how='left')
        if 'nome_profissional_ref' in df.columns:
            df['nome_profissional'] = df['nome_profissional_ref'].fillna('Desconhecido')
    else:
        df['nome_profissional'] = 'N/A'

    # --- Merge Especialidade ---
    if not df_esp.empty and "especialidade_id" in df.columns:
        df_esp = df_esp.rename(columns={'nome': 'nome_especialidade_ref'})
        try:
            df['especialidade_id'] = df['especialidade_id'].fillna(0).astype(int)
            df_esp['especialidade_id'] = df_esp['especialidade_id'].astype(int)
        except: pass

        df = df.merge(df_esp, on='especialidade_id', how='left')
        if 'nome_especialidade_ref' in df.columns:
            df['especialidade'] = df['nome_especialidade_ref'].fillna('Geral')
    else:
        df['especialidade'] = 'Geral'

    # --- Merge Grupo de Procedimento (NOVO) ---
    # Assume que a coluna no agendamento é 'grupo_procedimento_id' conforme informado
    if not df_grupos.empty and "grupo_procedimento_id" in df.columns:
        try:
            df['grupo_procedimento_id'] = df['grupo_procedimento_id'].fillna(0).astype(int)
            df_grupos['grupo_id'] = df_grupos['grupo_id'].astype(int)
            
            df = df.merge(df_grupos, left_on='grupo_procedimento_id', right_on='grupo_id', how='left')
            
            if 'nome_grupo' in df.columns:
                df['procedure_group'] = df['nome_grupo'].fillna('Outros')
        except Exception as e:
            print(f"Erro merge grupos: {e}")
            df['procedure_group'] = 'Erro Grupo'
    else:
        # Se não tiver a coluna, tenta usar especialidade ou define padrão
        df['procedure_group'] = 'Geral'

    return df