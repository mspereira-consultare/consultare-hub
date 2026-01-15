import requests
import os
import json
import sqlite3
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

# Caminho absoluto para o banco
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../data/dados_clinica.db')

def get_feegow_token_db():
    try:
        conn = sqlite3.connect(DB_PATH)
        res = conn.execute("SELECT token FROM integrations_config WHERE service = 'feegow'").fetchone()
        conn.close()
        if res and res[0]:
            return res[0]
    except: pass
    return None

class FeegowRecepcaoSystem:
    def __init__(self):
        pass

    def obter_dados_brutos(self, unidades=[2, 3, 12]):
        # 1. Busca Cookie no Banco (Prioridade)
        cookie_full = get_feegow_token_db()
        
        # 2. Fallback para .env se não achar no banco
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
                    
            except Exception as e:
                logs.append(f"UID {uid}: {str(e)}")
                continue

        msg = "OK" if not logs else " | ".join(logs)
        return todos_dados, msg