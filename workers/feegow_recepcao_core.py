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

            # Extração segura dos dados
            token = sessao.get("x-access-token", "")
            cookie = sessao.get("cookie", "")

            headers = {
                "accept": "*/*",
                "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
                "sec-ch-ua": "\"Not(A:Brand\";v=\"8\", \"Chromium\";v=\"144\", \"Google Chrome\";v=\"144\"",
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": "\"Windows\"",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-site",
                "Referer": "https://franchising.feegow.com/",
                "Referrer-Policy": "strict-origin-when-cross-origin",
                # USANDO OS DADOS VINDOS DO BANCO
                "x-access-token": token,
                "Cookie": cookie
            }

            try:
                print(f"Consultando Fila Unidade {unidade_id}...")
                response = requests.get(url, headers=headers, timeout=10)
                
                if response.status_code == 200:
                    data = response.json()
                    if isinstance(data, list):
                        # Injeta o ID da unidade para o monitor saber de onde veio
                        for item in data:
                            item['UnidadeID_Coleta'] = unidade_id
                        
                        todos_pacientes.extend(data)
                        print(f"✅ Unidade {unidade_id}: {len(data)} pacientes na fila.")
                    else:
                        print(f"Unidade {unidade_id}: Retorno vazio.")
                        
                elif response.status_code in [401, 403]:
                    msg = f"Unidade {unidade_id}: 🔒 Token Expirado (403/401)"
                    print(msg)
                    erros.append(msg)
                else:
                    msg = f"Unidade {unidade_id}: Erro HTTP {response.status_code}"
                    print(msg)
                    erros.append(msg)
            
            except Exception as e:
                msg = f"Erro de Conexão Unidade {unidade_id}: {e}"
                print(msg)
                erros.append(str(e))

        # Retorna lista vazia e erros acumulados se houver falha total
        if not todos_pacientes and erros:
            return [], " | ".join(erros)
            
        return todos_pacientes, "OK"