import time
import sqlite3 # <--- NOVO IMPORT
import pandas as pd
import os
from datetime import datetime
from dotenv import load_dotenv
from feegow_core import FeegowSystem

load_dotenv()

UNIDADES = {
    "Ouro Verde": 2,
    "Centro Cambui": 3,
    "Campinas Shopping": 12
}

def salvar_no_banco(df):
    try:
        # Define o caminho para SALVAR NA RAIZ (um nível acima da pasta workers)
        db_path = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "..", "fila.db"))
        
        # Conecta no caminho absoluto calculado acima
        with sqlite3.connect(db_path) as conn:
            conn.execute("PRAGMA journal_mode=WAL;") 
            df.to_sql("fila_tempo_real", conn, if_exists="replace", index=False)
        return True
    except Exception as e:
        print(f"Erro ao salvar no banco: {e}")
        return False

def run_monitor():
    sistema = FeegowSystem()
    sessao_ativa = False

    print("=== MONITOR FEEGOW (COM BANCO DE DADOS) INICIADO ===")
    
    while True:
        # 1. Autocura de Sessão
        if not sessao_ativa:
            if sistema.login():
                sessao_ativa = True
            else:
                print("Erro ao logar. Tentando novamente em 30s...")
                time.sleep(30)
                continue

        dfs_ciclo = []
        
        # 2. Varredura
        for nome, uid in UNIDADES.items():
            sistema.trocar_unidade(uid)
            html = sistema.obter_fila_raw()
            
            if html is None:
                print("Sessão expirou. Reiniciando...")
                sessao_ativa = False
                break 
            
            df_unidade = sistema.parse_html(html, nome)
            if not df_unidade.empty:
                dfs_ciclo.append(df_unidade)
            
            time.sleep(0.5)

        # 3. Consolidação e Salvamento
        if sessao_ativa and dfs_ciclo:
            df_final = pd.concat(dfs_ciclo, ignore_index=True)
            
            # --- O SALVAMENTO ACONTECE AQUI ---
            if salvar_no_banco(df_final):
                hora_atual = datetime.now().strftime('%H:%M:%S')
                print(f"[{hora_atual}] Banco atualizado! {len(df_final)} pacientes na fila.")
            
            # (Opcional) Ainda mostramos no terminal para debug
            # print(df_final[['UNIDADE', 'HORA', 'PACIENTE']].head())

        elif sessao_ativa:
            # Se a fila estiver vazia, salvamos um DF vazio para limpar o painel também
            df_vazio = pd.DataFrame(columns=['UNIDADE', 'PACIENTE', 'TEMPO DE ESPERA'])
            salvar_no_banco(df_vazio)
            print(".", end="", flush=True)

        # Atualiza a cada 15 segundos
        time.sleep(15)

if __name__ == "__main__":
    run_monitor()