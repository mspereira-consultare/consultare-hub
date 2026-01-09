import requests
from bs4 import BeautifulSoup
import datetime

print("--- INICIANDO SCRIPT DE DEBUG ---")

# 1. Configurações
url = "https://core.feegow.com/reports/r/queue/table"
hoje = datetime.datetime.now().strftime('%d/%m/%Y')

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    "Content-Type": "application/x-www-form-urlencoded",
    # Mantenha o cookie atualizado se tiver mudado
    "Cookie": "_fbp=fb.1.1767707333002.685322633791357824; tk=eyJzdWNjZXNzIjp0cnVlLCJ1c2VySWQiOjE3MzI2Njc4MCwibGljZW5zZUlkIjoxODc1NSwiaXNIb21vbG9nIjpmYWxzZSwiZGF0ZXRpbWUiOiIyMDI2LTAxLTA4IDE1OjU1OjE2IiwidmFsaWRfdW50aWwiOiIyMDI2LTAxLTA5IDAzOjU1OjE2IiwidW5pZGFkZUlkIjoiMTIiLCJpbXBlcnNvbmF0ZUxldmVsIjowfQ%3D%3D; laravel_session=Ancf7NvKz6izmiBeuQFNAGCj1graxtJAfjXIf30k"
}

payload = {
    "_token": "iXnb55fvKi8mfWCOIkEGKPnj5wzDHD1gOJs7vRL7", 
    "UNIDADE_IDS[]": "12",
    "DATA_INICIO": hoje, 
    "DATA_FIM": hoje
}

# 2. Requisição
print(f"Consultando dados para: {hoje}...")
try:
    response = requests.post(url, headers=headers, data=payload)
    print(f"Status Code: {response.status_code}")
except Exception as e:
    print(f"Erro fatal na conexão: {e}")
    exit()

# 3. Análise do HTML
if response.status_code == 200:
    soup = BeautifulSoup(response.text, 'html.parser')
    table = soup.find('table')

    if not table:
        print("ERRO: Nenhuma tabela encontrada no HTML. O token pode ter expirado ou a resposta veio vazia.")
        print("Conteúdo recebido (primeiros 500 chars):")
        print(response.text[:500])
    else:
        rows = table.find_all('tr')
        print(f"Encontradas {len(rows)} linhas na tabela.")
        
        # Pega a primeira linha de DADOS (índice 1, pois 0 é cabeçalho)
        if len(rows) > 1:
            first_data_row = rows[1]
            cols = first_data_row.find_all('td')
            
            print("\n--- MAPEAMENTO DE COLUNAS (Para ajustarmos o índice) ---")          
            for i, col in enumerate(cols):
                texto_limpo = col.get_text(" ", strip=True)
                print(f"Coluna [{i}]: {texto_limpo}")
        else:
            print("Tabela encontrada, mas está vazia (sem pacientes na fila agora).")
else:
    print("Erro na requisição.")
    print(response.text)

print("\n--- FIM ---")