import requests
import json
import logging
import time
import os
from datetime import datetime
from database_manager import DatabaseManager

class FeegowRecepcaoSystem:
    def __init__(self):
        self.db = DatabaseManager()
        self.SESSOES = {}
        self._last_tokens_load = 0
        self._token_cache_sec = int(os.getenv("FEEGOW_TOKEN_CACHE_SEC", "300"))
        
        self._reload_tokens(force=True)

    def _reload_tokens(self, force=False):
        now = time.time()
        if not force and self._token_cache_sec > 0 and (now - self._last_tokens_load) < self._token_cache_sec:
            return

        tokens_db = self.db.obter_todos_tokens_feegow()
        if tokens_db:
            print(f"Carregando {len(tokens_db)} sessões do Banco de Dados...")
            # Defesa: Garante que só converte chaves numéricas ("2" -> 2)
            # Isso evita erro se tiver um id "admin" ou vazio
            self.SESSOES = {
                str(k).strip(): v for k, v in tokens_db.items()
                if str(k).strip().isdigit()
            }
        else:
            print("⚠️ Aviso: Nenhum token encontrado no banco de dados.")
            self.SESSOES = {}
        self._last_tokens_load = now

    def obter_dados_brutos(self, unidades=[3, 2, 12]):
        todos_pacientes = []
        url_base = "https://core.feegow.com/totem-queue/admin/get-queue-by-filter?filter="
        
        # 🟢 RECARREGA DO BANCO (com cache): Garante tokens novos sem ler a cada ciclo
        self._reload_tokens()

        for unidade_id in unidades:
            sessao = self.SESSOES.get(str(unidade_id))
            if not sessao: continue

            # 🟢 HEADER LIMPO: Sem herança de sessões anteriores
            headers = {
                "accept": "application/json",
                "x-access-token": sessao["x-access-token"],
                "Cookie": sessao["cookie"] 
            }

            try:
                # Forçamos o unit_id na URL para redundância
                url_final = f"{url_base}&unit_id={unidade_id}"
                
                # Usamos requests.get direto (sem usar self.session global)
                response = requests.get(url_final, headers=headers, timeout=10)
                
                if response.status_code == 200:
                    data = response.json()
                    # 🟢 FILTRO DE SEGURANÇA: Só aceita se a UnidadeID no JSON for a correta
                    dados_filtrados = [
                        item for item in data 
                        if str(item.get('UnidadeID')) == str(unidade_id)
                    ]
                    
                    for item in dados_filtrados:
                        item['UnidadeID_Coleta'] = unidade_id
                    
                    todos_pacientes.extend(dados_filtrados)
                    print(f"   Unidade {unidade_id}: {len(dados_filtrados)} registros.")
            except Exception as e:
                print(f"   Erro Unidade {unidade_id}: {e}")

        return todos_pacientes, "OK"
