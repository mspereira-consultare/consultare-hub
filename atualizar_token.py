import os
import sys
import requests
import json

# Garante acesso aos workers
sys.path.append(os.path.join(os.path.dirname(__file__), 'workers'))

try:
    from workers.database_manager import DatabaseManager
except ImportError:
    # Fallback se a estrutura de pastas for diferente
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    from workers.database_manager import DatabaseManager

def validar_cookie(cookie_str):
    """Testa se o cookie realmente abre a porta da API"""
    print("⏳ Validando cookie com a API da Feegow...", end="", flush=True)
    
    url = "https://core.feegow.com/totem-queue/admin/get-queue-by-filter?filter=&unit_id=2"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Cookie": cookie_str,
        "X-Requested-With": "XMLHttpRequest"
    }

    try:
        resp = requests.get(url, headers=headers, timeout=10)
        
        if resp.status_code == 200:
            # Verifica se retornou JSON válido (mesmo que lista vazia)
            try:
                data = resp.json()
                if isinstance(data, (list, dict)):
                    print(" OK! ✅")
                    return True
            except:
                pass
            
        print(f" FALHOU! ❌ (Status: {resp.status_code})")
        return False
        
    except Exception as e:
        print(f" ERRO TÉCNICO! ❌ ({str(e)})")
        return False

def update():
    print("\n=== ATUALIZADOR MANUAL DE TOKEN (RECEPÇÃO) ===")
    print("Este script valida e salva o token para o monitor_recepcao.py.\n")
    print("1. Acesse core.feegow.com e abra o DevTools (F12) -> Network.")
    print("2. Filtre por 'get-queue'.")
    print("3. Copie o valor inteiro do cabeçalho 'Cookie'.")
    print("\nCole o cookie abaixo e pressione ENTER:")
    
    try:
        novo_cookie = input().strip()
    except EOFError:
        return
    
    if not novo_cookie:
        print("❌ Operação cancelada (entrada vazia).")
        return

    # --- ETAPA DE VALIDAÇÃO ---
    if not validar_cookie(novo_cookie):
        print("\n⚠️  ATENÇÃO: Este cookie parece INVÁLIDO ou EXPIRADO.")
        print("   O servidor da Feegow rejeitou o acesso com ele.")
        print("   NADA FOI SALVO. Tente copiar novamente.")
        return

    # --- SALVAMENTO ---
    try:
        db = DatabaseManager()
        db.salvar_cookie(novo_cookie)
        print("\n✅ SUCESSO ABSOLUTO! Cookie validado e salvo.")
        print("   O monitor da recepção voltará a funcionar no próximo ciclo.")
    except Exception as e:
        print(f"❌ Erro ao salvar no banco: {e}")

if __name__ == "__main__":
    update()