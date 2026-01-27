import requests
import json
import logging
from datetime import datetime
from database_manager import DatabaseManager

class FeegowRecepcaoSystem:
    def __init__(self):
        self.db = DatabaseManager()
        self.SESSOES = {}
        
        # Carrega tokens usando o novo método que busca múltiplas linhas
        tokens_db = self.db.obter_todos_tokens_feegow()
        
        if tokens_db:
            print(f"Carregando {len(tokens_db)} sessões do Banco de Dados...")
            # Defesa: Garante que só converte chaves numéricas ("2" -> 2)
            # Isso evita erro se tiver um id "admin" ou vazio
            self.SESSOES = {
                int(k): v for k, v in tokens_db.items() 
                if str(k).strip().isdigit()
            }
        else:
            print("⚠️ Aviso: Nenhum token encontrado no banco de dados.")

    def obter_dados_brutos(self, unidades=[2, 3, 12]):
        todos_pacientes = []
        url = "https://core.feegow.com/totem-queue/admin/get-queue-by-filter?filter="
        erros = []
        
        for unidade_id in unidades:
            # Busca a sessão já convertida para int
            sessao = self.SESSOES.get(unidade_id)
            
            if not sessao:
                msg = f"⚠️ Unidade {unidade_id}: Sem credenciais no banco."
                print(msg)
                erros.append(msg)
                continue

            headers = {
                "accept": "application/json",
                "x-access-token": sessao["x-access-token"],
                "Cookie": sessao["cookie"]
            }

            try:
                # 2. FORÇAR unit_id na URL (Isso resolve a replicação)
                url_com_unidade = f"{url}&unit_id={unidade_id}"
                
                response = requests.get(url_com_unidade, headers=headers, timeout=10)
                
                if response.status_code == 200:
                    data = response.json()
                    if isinstance(data, list):
                        # 3. FILTRO DE SEGURANÇA: Só aceita se o UnidadeID no dado bater com o solicitado
                        # Isso impede que o dado da 12 "vaze" para a 2
                        dados_filtrados = [
                            item for item in data 
                            if str(item.get('UnidadeID')) == str(unidade_id)
                        ]
                        
                        for item in dados_filtrados:
                            item['UnidadeID_Coleta'] = unidade_id
                        
                        todos_pacientes.extend(dados_filtrados)
            
            except Exception as e:
                msg = f"Erro de Conexão Unidade {unidade_id}: {e}"
                print(msg)
                erros.append(str(e))

        # Retorna lista vazia e erros acumulados se houver falha total
        if not todos_pacientes and erros:
            return [], " | ".join(erros)
            
        return todos_pacientes, "OK"