import requests
import os
import json
import sys
import pandas as pd
from dotenv import load_dotenv

# Ajuste de path para imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database_manager import DatabaseManager
except ImportError:
    # Se falhar o import aqui, tentamos relativo ou passamos
    pass

load_dotenv()

# Caminho mantido apenas para referência se necessário, mas o DB Manager resolve
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../data/dados_clinica.db')

def get_feegow_token_db():
    """Busca o token (cookie) no banco de dados de forma Híbrida (Turso/Local)"""
    try:
        # Usa o gerenciador centralizado
        db = DatabaseManager()
        res = db.execute_query("SELECT token FROM integrations_config WHERE service = 'feegow'")
        
        if res:
            row = res[0]
            # Compatibilidade Turso/SQLite
            if isinstance(row, (tuple, list)):
                return row[0]
            if hasattr(row, 'token'): 
                return row.token
            if hasattr(row, '__getitem__'):
                return row['token']
    except Exception as e:
        print(f"Erro buscando token no DB: {e}")
    return None

class FeegowRecepcaoSystem:
    def __init__(self):
        pass

    def obter_dados_brutos(self, unidades=[2, 3, 12]):
        # 1. Busca Cookie no Banco (Agora via Turso/Local)
        cookie_full = get_feegow_token_db()
        
        # 2. Fallback para .env
        if not cookie_full:
            cookie_full = os.getenv("FEEGOW_CORE_COOKIE_FULL")

        if not cookie_full:
            return [], "ERRO: Cookie não configurado no Painel Admin ou .env"

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
            "Cookie": cookie_full,
            "X-Requested-With": "XMLHttpRequest",
            "Referer": "https://core.feegow.com/totem-queue/admin/queue"
        }
        
        endpoint = "https://core.feegow.com/totem-queue/admin/get-queue-by-filter"
        todos_dados = []
        logs = []

        # --- LÓGICA DE REQUEST ORIGINAL MANTIDA ---
        for uid in unidades:
            try:
                url = f"{endpoint}?filter=&unit_id={uid}"
                resp = requests.get(url, headers=headers, timeout=10)

                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, dict): data = [data]
                    if isinstance(data, list):
                        for item in data:
                            if 'UnidadeID' not in item or not item['UnidadeID']:
                                item['UnidadeID'] = uid
                        todos_dados.extend(data)
                
                elif resp.status_code == 403:
                    logs.append(f"UID {uid}: 403 (Cookie Expirou - Atualize no Painel)")
                else:
                    logs.append(f"UID {uid}: {resp.status_code}")
                    
            except Exception as e:
                logs.append(f"UID {uid}: Erro req: {str(e)}")

        if not todos_dados and logs:
            return [], " | ".join(logs)
            
        return todos_dados, "OK"