import requests
import os
import json
from dotenv import load_dotenv

load_dotenv()

# Configuração
url_base = "https://core.feegow.com/totem-queue/admin/get-queue-by-filter"
cookie = os.getenv("FEEGOW_CORE_COOKIE_FULL")

if not cookie:
    print("ERRO: Configure FEEGOW_CORE_COOKIE_FULL no .env primeiro!")
    exit()

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Cookie": cookie,
    "X-Requested-With": "XMLHttpRequest"
}

# Vamos testar variações de parâmetros para descobrir como filtrar por unidade
# Geralmente APIs aceitam 'unit_id', 'unidade', 'local_id' etc.
unidade_teste = 12

print(f"--- TESTANDO ENDPOINT JSON PARA UNIDADE {unidade_teste} ---")

try:
    # Tentativa 1: Do jeito que você mandou (provavelmente traz tudo ou filtra pela sessão)
    print(f"\n1. GET {url_base}?filter=")
    resp = requests.get(f"{url_base}?filter=", headers=headers)
    
    if resp.status_code == 200:
        dados = resp.json()
        print("   SUCESSO! JSON Recebido.")
        # Mostra apenas o primeiro item para não poluir o terminal, mas vermos as chaves
        if isinstance(dados, list) and len(dados) > 0:
            print(json.dumps(dados[0], indent=2))
        elif isinstance(dados, dict):
             print(json.dumps(dados, indent=2))
        else:
            print("   Resposta vazia: ", dados)
    else:
        print(f"   Erro: {resp.status_code}")

    # Tentativa 2: Passando unit_id (chute comum)
    print(f"\n2. GET {url_base}?filter=&unit_id={unidade_teste}")
    resp = requests.get(f"{url_base}?filter=&unit_id={unidade_teste}", headers=headers)
    if resp.status_code == 200:
        print("   SUCESSO (Com parametro unit_id).")
        # Se for diferente da anterior, vale a pena ver
        # print(resp.json()) 

except Exception as e:
    print(f"Erro fatal: {e}")