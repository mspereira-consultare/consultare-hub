import requests
import pandas as pd
import os
import yaml
import string
import html
import time
from io import StringIO
from datetime import timedelta
from pathlib import Path
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from datetime import datetime, date
from playwright.sync_api import sync_playwright

# Carrega variáveis de ambiente locais (.env)
load_dotenv()

API_CONFIG_FILE = "api_config.yaml"

# ==========================================================
# CARREGA CONFIGURAÇÃO DA API
# ==========================================================
def load_api_config():
    try:
        with open(API_CONFIG_FILE, 'r', encoding='utf-8') as f:
            cfg = yaml.safe_load(f)
            return cfg
    except FileNotFoundError:
        # Substituído st.error/st.stop por exceção padrão do Python
        raise FileNotFoundError(f"Arquivo de configuração não encontrado em: {API_CONFIG_FILE}")

# ==========================================================
# PARÂMETROS GLOBAIS DA API
# ==========================================================
cfg = load_api_config()
globals_cfg = cfg.get("globals", {})
timeout = globals_cfg.get("timeout_seconds", 15)
method_default = globals_cfg.get("method", "GET")
global_headers = globals_cfg.get("headers", {})
auth_cfg = globals_cfg.get("auth", {})

endpoints_list = cfg.get("endpoints", [])
ENDPOINTS = {ep["name"]: ep for ep in endpoints_list}

# ==========================================================
# SESSÃO REQUESTS (SEM CACHE DO STREAMLIT)
# ==========================================================
def get_session():
    session = requests.Session()
    retry_strategy = Retry(
        total=globals_cfg.get("retries", 3),
        backoff_factor=globals_cfg.get("backoff_factor", 1),
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST", "PUT", "DELETE", "HEAD"]
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session

session = get_session()

# ==========================================================
# EXTRAÇÃO DE DADOS DA API
# ==========================================================
def build_headers(endpoint_cfg, has_payload=False):
    headers = dict(global_headers)
    headers.update(endpoint_cfg.get("headers", {}))
    
    if not has_payload:
        headers.pop("Content-Type", None)

    auth = endpoint_cfg.get("auth", auth_cfg)
    if auth and auth.get("type") == "env_header":
        env_name = auth.get("env_var")
        
        # CORREÇÃO PRINCIPAL: Usamos apenas os.getenv
        token = os.getenv(env_name)
        
        # Fallback de segurança (adaptado do seu código anterior para .env)
        if not token:
            # Tenta buscar uma variável alternativa se a principal falhar
            token = os.getenv("FEEGOW_ACCESS_TOKEN") 

        if not token:
            print(f"[AUTH ERROR] Token '{env_name}' não encontrado no arquivo .env")
            # É melhor retornar os headers incompletos ou lançar erro, dependendo da sua estratégia
            # raise RuntimeError(f"Token '{env_name}' não encontrado.")
            
        headers[auth.get("header_name", "Authorization")] = str(token)
    return headers

def fill_body_template(template: dict, context: dict):
    body = {}
    
    # Helper para converter numpy/pandas types
    def to_native(val):
        if hasattr(val, "item") and not isinstance(val, (list, dict, str)):
            return val.item()
        return val

    for k, v in context.items():
        body[k] = to_native(v)

    class SafeDict(dict):
        def __missing__(self, key):
            return "{" + key + "}"

    for k, v in template.items():
        if isinstance(v, str) and "{" in v:
            val = string.Formatter().vformat(v, (), SafeDict(context))
            # Removida conversão forçada de int que causava bugs
            body[k] = val
        else:
            body[k] = to_native(v)
    return body

def request_endpoint(ep_cfg, global_context=None):
    url = ep_cfg["url"]
    method = ep_cfg.get("method", method_default).upper()
    needs_body = ep_cfg.get("needs_body", False)
    
    # Passamos has_payload corretamente
    headers = build_headers(ep_cfg, has_payload=needs_body)
    
    body_template = ep_cfg.get("body_template", {})

    json_payload = None
    if needs_body:
        ctx = (global_context or {}).copy()
        
        for k in ["data_start", "data_end", "data"]:
            if k in ctx and isinstance(ctx[k], (datetime, date)):
                ctx[k] = ctx[k].strftime("%d-%m-%Y") # Verifique se a API pede DD-MM-YYYY ou YYYY-MM-DD

        if "data_start" not in ctx or "data_end" not in ctx:
            today = datetime.now().date().strftime("%d-%m-%Y")
            ctx.setdefault("data_start", today)
            ctx.setdefault("data_end", today)
        
        json_payload = fill_body_template(body_template, ctx)

    real_method = "POST" if needs_body and ep_cfg.get("use_post_for_body", False) else method

    try:
        resp = session.request(real_method, url, headers=headers, json=json_payload, timeout=timeout)
        resp.raise_for_status()
        return resp.json() if resp.text else {}
    except Exception as e:
        # Se quiser ver o erro real da API, print aqui:
        if hasattr(e, 'response') and e.response is not None:
             print(f"Erro API: {e.response.text}")
        return {"error": True, "text": str(e)}

# ==========================================================
# Helpers internos
# ==========================================================
def _call_endpoint(name: str, context: dict = None):
    ep_cfg = ENDPOINTS.get(name)
    if not ep_cfg:
        raise RuntimeError(f"Endpoint não encontrado: {name}")

    result = request_endpoint(ep_cfg, global_context=context or {})
    if result and "error" in result:
        print(f"[API ERROR] {name}: {result}")
        return None
    return result

def _normalize_df(data, nested_key=None):
    if data is None:
        return pd.DataFrame()
    
    if nested_key and isinstance(data, dict) and nested_key in data:
        data = data[nested_key]
    
    try:
        return pd.json_normalize(data)
    except Exception:
        return pd.DataFrame(data)

# ==========================================================
# FUNÇÕES DE BUSCA (SEM CACHE STREAMLIT)
# ==========================================================
def fetch_agendamentos(unidade_id=None, start_date=None, end_date=None):
    ctx = {}
    if start_date: ctx['data_start'] = start_date
    if end_date: ctx['data_end'] = end_date
    if unidade_id: ctx['unidade_id'] = unidade_id

    raw = _call_endpoint('appointments', context=ctx)
    df = _normalize_df(raw, nested_key='content')
    return df

def list_profissionals():
    raw = _call_endpoint('list-professional')
    df = _normalize_df(raw, nested_key='content')
    return df

def list_especialidades():
    raw = _call_endpoint("list-specialties")
    df = _normalize_df(raw, nested_key="content")
    return df

def list_salas(unidade_id=None):
    raw = _call_endpoint("list-local")
    df = _normalize_df(raw, nested_key="content")
    return df

def list_status():
    raw = _call_endpoint("list-status")
    df = _normalize_df(raw, nested_key="content")
    return df

_ = list_status()

def list_unidades():
    today = datetime.now()
    start_date = (today - timedelta(days=10)).strftime("%d-%m-%Y")
    end_date = today.strftime("%d-%m-%Y")
    
    ctx = {"data_start": start_date, "data_end": end_date}
    
    raw = _call_endpoint("appointments", context=ctx) 
    df = _normalize_df(raw, nested_key='content')
    
    if not df.empty:
        cols = df.columns
        id_col = 'unidade_id' if 'unidade_id' in cols else None
        nome_col = 'nome_fantasia' if 'nome_fantasia' in cols else None
        
        if id_col and nome_col:
            df = df[[id_col, nome_col]].dropna().drop_duplicates()
            df[id_col] = df[id_col].astype(int)
            df = df.sort_values(by=nome_col)
            
    return df

def fetch_fila_espera(unidade_id=None, profissional_id="", especialidade_id="", cookie_override=None):
    """
    Busca a fila de espera. Aceita unidade_id para compatibilidade, 
    mas quem define a unidade real é o cookie_override (sessão).
    """
    
    # 1. Prioridade do Cookie: Robô > .env
    if cookie_override:
        cookies_str = cookie_override
    else:
        cookies_str = os.getenv("FEEGOW_COOKIE")
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html, */*; q=0.01",
        "x-requested-with": "XMLHttpRequest",
        "Cookie": cookies_str,
        "Referer": "https://franchising.feegow.com/v8.1/PainelEspera.asp",
    }
    
    params = {
        "TipoAtendimentoTriagem": "ATENDIMENTO",
        "FiltroStatus": "2",
        "Ordem": "HoraSta",
        "StatusExibir": "4",
        # Passamos a unidade aqui também só por garantia, embora o Cookie mande
        "UnidadeID": unidade_id if unidade_id else "", 
        "ProfissionalID": profissional_id,
        "EspecialidadeID": especialidade_id
    }
    
    url = "https://franchising.feegow.com/v8.1/ListaEsperaCont.asp"
    
    try:
        import requests # Garantindo import local caso falte
        resp = requests.get(url, headers=headers, params=params, timeout=15)
        resp.raise_for_status()
        
        # Decode manual para corrigir acentos
        return resp.content.decode('iso-8859-1')
            
    except Exception as e:
        print(f"[FILA ERROR] {e}")
        return None
    
def parse_fila_html(html_content):
    if not html_content or "<table" not in html_content:
        return pd.DataFrame()

    try:
        # 1. Decodifica corrigindo erros de caracteres latinos
        # Tenta latin-1 e ignora erros residuais para não quebrar o código
        if isinstance(html_content, bytes):
            html_content = html_content.decode('iso-8859-1', errors='replace')
        
        # 2. Converte entidades HTML (ex: &nbsp; para espaço)
        html_content = html.unescape(html_content)

        # 3. Lê a tabela
        dfs = pd.read_html(StringIO(html_content))
        df = dfs[0].iloc[:, :7]
        df.columns = ['HORA', 'CHEGADA', 'PACIENTE', 'IDADE', 'PROFISSIONAL', 'COMPROMISSO', 'TEMPO_ESPERA']

        # 4. Dicionário de Correções Específicas (Padrões Feegow)
        correcoes = {
            'Ã': 'Í', 'Ã': 'Á', 'Ã‰': 'É', 'Ã“': 'Ó', 'Ãš': 'Ú',
            'Ã¢': 'â', 'Ãª': 'ê', 'Ã®': 'î', 'Ã´': 'ô', 'Ã»': 'û',
            'Ã£': 'ã', 'Ãµ': 'õ', 'Ã§': 'ç', 'Ã‡': 'Ç',
            'Ã€': 'À', 'Âº': 'º', 'Âª': 'ª', 'hÃ¡': 'há'
        }

        for col in df.columns:
            df[col] = df[col].astype(str)
            # Aplica as correções de caracteres
            for errado, correto in correcoes.items():
                df[col] = df[col].str.replace(errado, correto, regex=False)
            
            # Limpa espaços duplos e resíduos de tags
            df[col] = df[col].str.replace(r'\s+', ' ', regex=True).str.strip()
            # Remove o selo "Primeira vez" do nome do paciente
            if col == 'PACIENTE':
                df[col] = df[col].str.replace('Primeira vez ', '', case=False)

        return df

    except Exception as e:
        print(f"Erro no parse aprimorado: {e}")
        return pd.DataFrame()

def get_feegow_auth(target_unidade_id=None):
    """
    Loga (lidando com queda de sessão e 'usuário em outra máquina') e troca de unidade.
    """
    with sync_playwright() as p:
        # headless=True para produção. Mantenha False se quiser ver rodando.
        browser = p.chromium.launch(headless=False) 
        context = browser.new_context()
        page = context.new_page()

        try:
            print("[AUTH] Acessando página de login...")
            page.goto("https://franchising.feegow.com/main/?P=Login&U=&Partner=&qs=")
            
            # --- FASE 1: TENTATIVA DE LOGIN INTELIGENTE ---
            try:
                # Verifica se aparece o campo de usuário (indicando que precisa logar)
                page.wait_for_selector("#User", state="visible", timeout=5000)
                precisa_logar = True
            except:
                # Se não apareceu, verifica se é a tela de "Senha" (sessão presa) ou se já está logado
                if page.locator("#password").is_visible():
                    print("[AUTH] Detectada tela de apenas senha (Sessão Presa)...")
                    precisa_logar = True # Precisa revalidar a senha
                else:
                    precisa_logar = False
                    print("[AUTH] Parecemos já estar logados. Verificando...")

            if precisa_logar:
                print("[AUTH] Preenchendo credenciais...")
                
                # Se o campo User estiver visível, preenche. Se não, assume que só precisa da senha.
                if page.locator("#User").is_visible():
                    page.fill("#User", os.getenv("FEEGOW_USER"))
                
                page.fill("#password", os.getenv("FEEGOW_PASS"))
                page.press("#password", "Enter")
                
                # --- AQUI ESTÁ A CORREÇÃO PARA "LOGADO EM OUTRA MÁQUINA" ---
                # Esperamos um pouco para ver como o servidor reage
                time.sleep(3)
                
                # Se ainda não entrou na v8.1 e o campo senha apareceu de novo:
                if "/v8.1/" not in page.url and page.locator("#password").is_visible():
                    print("[AUTH] ALERTA: Tela de 'Usuário logado em outra máquina' detectada!")
                    print("[AUTH] Forçando desconexão da outra sessão...")
                    page.fill("#password", os.getenv("FEEGOW_PASS"))
                    page.press("#password", "Enter")
                    time.sleep(3) # Espera o servidor processar o "chute" da outra sessão

            # Espera final para garantir que estamos no painel
            # Aumentei o timeout para 60s para evitar erro em dias lentos
            page.wait_for_url("**/v8.1/**", timeout=60000)
            print("[AUTH] Login confirmado e Painel carregado!")

            # --- FASE 2: TROCA DE UNIDADE ---
            if target_unidade_id:
                print(f"[AUTH] Trocando para unidade ID: {target_unidade_id}")
                url_troca = f"https://franchising.feegow.com/v8.1/?P=MudaLocal&Pers=1&MudaLocal={target_unidade_id}"
                
                # Aumentei timeout para 60s aqui também (Unidade 2 falhou aqui)
                page.goto(url_troca, timeout=60000)
                
                # Espera a rede estabilizar
                page.wait_for_load_state("networkidle", timeout=60000)
                time.sleep(2)

            # --- FASE 3: VALIDAÇÃO FINAL (Acessa Fila) ---
            print("[AUTH] Validando sessão na Fila de Espera...")
            page.goto("https://franchising.feegow.com/v8.1/?P=ListaEspera&Pers=1", timeout=60000)
            
            # Se encontrar a tabela ou qualquer conteúdo, sucesso
            page.wait_for_load_state("domcontentloaded", timeout=60000)
            time.sleep(1)

            # Captura Cookies
            cookies = context.cookies()
            cookie_string = "; ".join([f"{c['name']}={c['value']}" for c in cookies])
            
            browser.close()
            return {"cookie": cookie_string}

        except Exception as e:
            # Captura a URL atual para ajudar no debug
            current_url = page.url if page else "N/A"
            print(f"[AUTH ERROR] Falha na URL: {current_url} | Erro: {e}")
            try: browser.close()
            except: pass
            return None