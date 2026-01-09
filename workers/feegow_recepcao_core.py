import requests
import os
import json
import pandas as pd
from dotenv import load_dotenv

try:
    # Tenta importação direta (funciona quando você roda o script dentro da pasta workers)
    from database_manager import DatabaseManager
except ImportError:
    # Tenta importação relativa (funciona se for chamado como módulo de fora)
    from .database_manager import DatabaseManager

load_dotenv()

class FeegowRecepcaoSystem:
    def __init__(self):
        pass

    def obter_dados_brutos(self, unidades=[2, 3, 12]):
        """
        Consulta a API JSON e retorna a LISTA BRUTA de dados.
        Não faz cálculos. Apenas coleta.
        """
        cookie_full = os.getenv("FEEGOW_CORE_COOKIE_FULL")
        if not cookie_full:
            return [], "ERRO: .env sem Cookie"

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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
                    
                    # Normalização para Lista
                    if isinstance(data, dict): data = [data]
                    
                    if isinstance(data, list):
                        for item in data:
                            # Garante o ID da Unidade para o Banco
                            if 'UnidadeID' not in item or not item['UnidadeID']:
                                item['UnidadeID'] = uid
                        todos_dados.extend(data)
                
                elif resp.status_code == 403:
                    logs.append(f"UID {uid}: 403 (Cookie Expirou)")
                    
            except Exception as e:
                logs.append(f"UID {uid}: {str(e)}")
                continue

        msg = "OK" if not logs else " | ".join(logs)
        return todos_dados, msg