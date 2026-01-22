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
        response = requests.request(method=method, url=url, headers=headers, json=json_body, timeout=60)
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
        # Garante ID numérico para merge seguro
        df['profissional_id'] = pd.to_numeric(df['profissional_id'], errors='coerce').fillna(0).astype(int)
        return df[['profissional_id', 'nome']]
    return df

def list_especialidades():
    data = request_endpoint("specialties/list", method="GET")
    df = pd.DataFrame(normalize_content(data))
    if not df.empty and 'especialidade_id' in df.columns:
        df['especialidade_id'] = pd.to_numeric(df['especialidade_id'], errors='coerce').fillna(0).astype(int)
        return df[['especialidade_id', 'nome']]
    return df

def list_procedures():
    data = request_endpoint("procedures/list", method="GET")
    df = pd.DataFrame(normalize_content(data))
    if df.empty: return df

    id_col = next((c for c in ['id', 'ID', 'procedimento_id'] if c in df.columns), None)
    grp_col = next((c for c in ['grupo_procedimento_id', 'grupo_id'] if c in df.columns), None)

    if id_col:
        # Padroniza IDs para int
        if grp_col: 
            df[grp_col] = pd.to_numeric(df[grp_col], errors='coerce').fillna(0).astype(int)
        
        df[id_col] = pd.to_numeric(df[id_col], errors='coerce').fillna(0).astype(int)
        
        cols = {id_col: 'proc_ref_id'}
        if grp_col: cols[grp_col] = 'grupo_procedimento_id'
        
        return df[list(cols.keys())].rename(columns=cols)
    return pd.DataFrame()

def list_procedure_groups():
    data = request_endpoint("procedures/groups", method="GET")
    df = pd.DataFrame(normalize_content(data))
    if df.empty: return df

    id_col = next((c for c in ['id', 'ID', 'grupo_id'] if c in df.columns), None)
    nome_col = next((c for c in ['NomeGrupo', 'nome', 'Nome'] if c in df.columns), None)

    if id_col and nome_col:
        df[id_col] = pd.to_numeric(df[id_col], errors='coerce').fillna(0).astype(int)
        return df[[id_col, nome_col]].rename(columns={id_col: 'grupo_ref_id', nome_col: 'nome_grupo'})
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
    df_procs = list_procedures()      
    df_grupos = list_procedure_groups() 
    
    # 3. MERGES (CRUZAMENTOS)
    
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

    # --- Merge Grupo de Procedimento (PONTE DUPLA) ---
    # Passo A: Agendamento -> Procedimento
    if not df_procs.empty and "procedimento_id" in df.columns:
        # Verifica se temos a coluna chave de referência antes de tentar o merge
        if 'proc_ref_id' in df_procs.columns:
            try:
                df['procedimento_id'] = df['procedimento_id'].fillna(0).astype(int)
                df_procs['proc_ref_id'] = df_procs['proc_ref_id'].fillna(0).astype(int)
                
                # Merge 1: Descobrir o ID do Grupo
                df = df.merge(df_procs, left_on='procedimento_id', right_on='proc_ref_id', how='left')
            except Exception as e:
                print(f"Erro merge procedimentos: {e}")
        else:
            print("AVISO: Tabela de procedimentos baixada mas sem coluna 'proc_ref_id'. Merge ignorado.")

    # Passo B: Procedimento -> Grupo
    if not df_grupos.empty and "grupo_procedimento_id" in df.columns:
        if 'grupo_ref_id' in df_grupos.columns:
            try:
                df['grupo_procedimento_id'] = df['grupo_procedimento_id'].fillna(0).astype(int)
                df_grupos['grupo_ref_id'] = df_grupos['grupo_ref_id'].fillna(0).astype(int)
                
                # Merge 2: Descobrir o Nome do Grupo
                df = df.merge(df_grupos, left_on='grupo_procedimento_id', right_on='grupo_ref_id', how='left')
                
                if 'nome_grupo' in df.columns:
                    df['procedure_group'] = df['nome_grupo'].fillna('Outros')
            except Exception as e:
                print(f"Erro merge grupos: {e}")
                df['procedure_group'] = 'Geral'
        else:
             df['procedure_group'] = 'Geral'
    else:
        # Se falhou a cadeia, marca como Geral
        df['procedure_group'] = 'Geral'

    return df

def fetch_proposals(start_date, end_date):
    """
    Busca propostas comerciais no período.
    Endpoint: /proposal/list
    """
    payload = {
        "data_inicio": start_date,
        "data_fim": end_date,
        "tipo_data": "I" # I = Inclusão (Data da proposta)
    }
    # Nota: A documentação da Feegow às vezes varia os nomes dos parâmetros.
    # Se der erro, verifique se é 'date_start' ou 'data_inicio'.
    data = request_endpoint("proposal/list", method="GET", json_body=payload)
    return pd.DataFrame(normalize_content(data))