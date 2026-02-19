import pytz
import requests
import pandas as pd
import os
import time
import html
import re
import sys
import pytz
import hashlib
from io import StringIO
from datetime import datetime
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

# Caminho absoluto para o banco de dados
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database_manager import DatabaseManager
except ImportError:
    pass

def get_feegow_config_from_db():
    """Busca credenciais no banco de dados (Híbrido)"""
    try:
        db = DatabaseManager()
        res = db.execute_query("SELECT username, password, token FROM integrations_config WHERE service = 'feegow'")
        
        if res:
            row = res[0]
            # Extração segura (Tupla ou Objeto)
            if isinstance(row, (tuple, list)):
                return {"user": row[0], "pass": row[1], "token": row[2]}
            else:
                return {"user": row.username, "pass": row.password, "token": row.token}
    except Exception as e:
        # print(f"Aviso: Não foi possível ler config do banco: {e}")
        pass
    return None

class FeegowSystem:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36"
        })
        self.base_url = "https://franchising.feegow.com"

    def login(self):
        """Realiza o login via POST e valida a sessão"""
        url = f"{self.base_url}/main/?P=Login&U=&Partner=&qs="
        
        # 1. Tenta pegar do banco
        config = get_feegow_config_from_db()
        user = config['user'] if config and config['user'] else os.getenv("FEEGOW_USER")
        password = config['pass'] if config and config['pass'] else os.getenv("FEEGOW_PASS")

        if not user or not password:
            print("   [ERRO] Credenciais não encontradas (Configure no Painel Admin ou .env)")
            return False

        payload = {
            "User": user,
            "password": password,
            "btnLogar": "Entrar"
        }
        
        try:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Tentando login...")
            resp = self.session.post(url, data=payload, timeout=20)
            
            # Verifica sucesso via Cookies
            cookies = self.session.cookies.get_dict()
            if any("ASPSESSION" in k for k in cookies):
                print("   Login realizado com sucesso (Sessão ASP gerada).")
                return True
            else:
                print("   Falha: Servidor não retornou cookie de sessão.")
                return False
        except Exception as e:
            print(f"   Erro crítico no login: {e}")
            return False

    def trocar_unidade(self, unidade_id):
        """Troca o contexto da sessão para a unidade desejada"""
        url = f"{self.base_url}/v8.1/?P=MudaLocal&Pers=1&MudaLocal={unidade_id}"
        try:
            self.session.get(url, timeout=10)
            return True
        except:
            return False

    def obter_fila_raw(self):
        """Baixa o HTML da fila da unidade atual"""
        url = f"{self.base_url}/v8.1/ListaEsperaCont.asp"
        params = {
            "TipoAtendimentoTriagem": "ATENDIMENTO",
            "FiltroStatus": "2",  # 2 = Todos na espera? Ajuste conforme necessidade
            "Ordem": "HoraSta",
            "StatusExibir": "4"
        }
        try:
            resp = self.session.get(url, params=params, timeout=10)
            # Se redirecionar para Login, a sessão caiu
            if "login" in resp.url.lower():
                return None 
            return resp.content.decode('iso-8859-1')
        except:
            return None
        
    def _login_app_specific(self):
        """
        Login específico no APP e Ponte de Cookies para o CORE.
        """
        url = "https://app.feegow.com/main/?P=Login"
        
        # Usa as mesmas credenciais do login principal
        config = get_feegow_config_from_db()
        user = config['user'] if config and config['user'] else os.getenv("FEEGOW_USER")
        password = config['pass'] if config and config['pass'] else os.getenv("FEEGOW_PASS")

        payload = {
            "User": user,
            "password": password,
            "btnLogar": "Entrar"
        }
        try:
            print(f"   [AUTH] Autenticando via app.feegow.com...")
            headers_login = {
                "Origin": "https://app.feegow.com",
                "Referer": "https://app.feegow.com/main/?P=Login"
            }
            resp = self.session.post(url, data=payload, headers=headers_login, timeout=20)
            
            # --- PONTE DE COOKIES (A MÁGICA) ---
            # O login pode ter setado cookies para 'app.feegow.com' ou '.feegow.com'.
            # Vamos garantir que o 'core.feegow.com' também tenha esses cookies.
            if resp.status_code == 200:
                cookies_dict = self.session.cookies.get_dict()
                
                # Procura cookies importantes e replica para o domínio do Core
                for nome, valor in cookies_dict.items():
                    if "session" in nome or "token" in nome.lower() or "asp" in nome.lower():
                        self.session.cookies.set(nome, valor, domain="core.feegow.com")
                        self.session.cookies.set(nome, valor, domain=".feegow.com")
                
                print("   [AUTH] Cookies replicados para Core.")
                return True
            
            return False
        except Exception as e:
            print(f"   [AUTH] Erro no login APP: {e}")
            return False

    def parse_html(self, html_content, nome_unidade):
        if not html_content or "<table" not in html_content:
            return pd.DataFrame()

        try:
            html_content = html.unescape(html_content)
            dfs = pd.read_html(StringIO(html_content))
            df = dfs[0].iloc[:, :7].copy()
            df.columns = ['HORA', 'CHEGADA', 'PACIENTE', 'IDADE', 'PROFISSIONAL', 'COMPROMISSO', 'TEMPO_TEXTO']
            df['PACIENTE'] = df['PACIENTE'].astype(str).str.strip()
            df['CHEGADA'] = df['CHEGADA'].astype(str).str.strip().str[:5]
            df['PROFISSIONAL'] = df['PROFISSIONAL'].astype(str).str.strip()

            tz = pytz.timezone("America/Sao_Paulo")
            agora = datetime.now(tz)

            def calcular_espera_minutos(hora_chegada):
                try:
                    hoje = agora.strftime("%Y-%m-%d")
                    chegada = datetime.strptime(f"{hoje} {hora_chegada}", "%Y-%m-%d %H:%M")
                    chegada = tz.localize(chegada)
                    diff = int((agora - chegada).total_seconds() / 60)
                    return max(diff, 0)
                except:
                    return None

            def processar_linha(row):
                texto = str(row['TEMPO_TEXTO']).lower()
                chegada = str(row['CHEGADA']).strip()

                # Status
                if "atendimento" in texto:
                    status = "Em Atendimento"
                else:
                    status = "Espera"

                espera = calcular_espera_minutos(chegada)
                return pd.Series([status, espera])

            df[['STATUS_DETECTADO', 'ESPERA_MINUTOS']] = df.apply(processar_linha, axis=1)
            df['UNIDADE'] = nome_unidade
            df['hash_id'] = df.apply(
                lambda r: hashlib.md5(
                    f"{nome_unidade}-{str(r.get('PACIENTE', '')).strip()}-{str(r.get('CHEGADA', '')).strip()}".encode()
                ).hexdigest(),
                axis=1
            )

            # Opcional: remover TEMPO_TEXTO
            # df = df.drop(columns=['TEMPO_TEXTO'])

            return df

        except Exception as e:
            print(f"Erro parse: {e}")
            return pd.DataFrame()
        
    def obter_dados_recepcao_core(self, unidade_id):
        """
        Busca dados da fila de recepção no sistema CORE.
        Estratégia: Réplica exata do 'teste_separacao.py' usando cookie completo.
        """
        base_url_core = "https://core.feegow.com"
        url_dashboard = f"{base_url_core}/"       
        url_api_post = f"{base_url_core}/reports/r/queue/table" 
        hoje = datetime.now().strftime('%d/%m/%Y')

        # 1. Carregar o Cookie Completo do Banco (Prioridade) ou .ENV
        config = get_feegow_config_from_db()
        cookie_full = config['token'] if config and config['token'] else os.getenv("FEEGOW_CORE_COOKIE_FULL")

        if not cookie_full:
            print("   [ERRO] Cookie Core não configurado (Verifique Painel Admin ou .env)")
            return pd.DataFrame()

        # 2. Configurar Headers IDÊNTICOS ao script que funcionou
        # Nota: Não usamos self.session.cookies.set aqui para garantir 
        # que a string seja enviada exatamente como no navegador.
        headers_custom = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": cookie_full  # <--- O SEGREDO ESTÁ AQUI
        }

        try:
            # 3. Acessa Dashboard para pegar o Token (Automação necessária)
            # Usamos requests puro (sem session) para ter controle total dos headers
            # print(f"   [CORE] Usando cookie completo para capturar token...")
            resp_dash = requests.get(url_dashboard, headers=headers_custom, timeout=15)
            
            if "login" in resp_dash.url:
                print(f"   [ERRO] Cookie expirado (Redirecionou para Login). Atualize no Painel Admin.")
                return pd.DataFrame()

            # Extração do Token via Regex
            html_content = resp_dash.text
            token = None
            import re
            
            # Padrões de busca
            patterns = [
                r'name="_token" value="([^"]+)"',
                r'name="csrf-token" content="([^"]+)"',
                r'window\.csrfToken\s*=\s*["\']([^"\']+)["\']'
            ]
            for pattern in patterns:
                match = re.search(pattern, html_content)
                if match:
                    token = match.group(1)
                    break

            if not token:
                print("   [ERRO] Token CSRF não encontrado na Dashboard.")
                # Fallback: Tenta achar o token dentro da própria página do relatório
                # (às vezes o token da dashboard é diferente do token de formulários)
                url_relatorio = f"{base_url_core}/reports/r/queue"
                resp_rel = requests.get(url_relatorio, headers=headers_custom, timeout=15)
                match = re.search(r'name="_token" value="([^"]+)"', resp_rel.text)
                if match:
                    token = match.group(1)
            
            if not token:
                print("   [ERRO FATAL] Impossível obter token mesmo com cookie válido.")
                return pd.DataFrame()

            # 4. Requisição dos Dados (Payload igual ao teste)
            payload = {
                "_token": token,
                "UNIDADE_IDS[]": str(unidade_id),
                "DATA_INICIO": hoje,
                "DATA_FIM": hoje
            }
            
            # print(f"   [CORE] Consultando Unidade {unidade_id}...")
            resp_table = requests.post(url_api_post, headers=headers_custom, data=payload, timeout=15)

            if resp_table.status_code == 200:
                # Usa o seu parser existente
                return self._parse_tabela_core(resp_table.text, unidade_id)
            else:
                print(f"   [ERRO] Status {resp_table.status_code} na unidade {unidade_id}")
                return pd.DataFrame()

        except Exception as e:
            print(f"   Erro recepção Core: {e}")
            return pd.DataFrame()

    def _parse_tabela_core(self, html_content, unidade_id):
        if not html_content: return pd.DataFrame()
        soup = BeautifulSoup(html_content, 'html.parser')
        table = soup.find('table')

        if not table: return pd.DataFrame()

        try:
            df = pd.read_html(str(table))[0]
            df['UNIDADE_ID'] = unidade_id
            df['TIPO_FILA'] = 'RECEPCAO'
            df['DATA_COLETA'] = datetime.now()
            return df
        except Exception:
            return pd.DataFrame()
