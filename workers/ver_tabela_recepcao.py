import sqlite3
import pandas as pd
import os

def encontrar_banco():
    # Caminho onde este script está
    atual = os.path.dirname(os.path.abspath(__file__))
    
    # Lista de lugares prováveis onde o banco pode ter sido criado
    candidatos = [
        os.path.join(atual, "data", "dados_clinica.db"),              # ./data/dados_clinica.db (Padrão ideal)
        os.path.join(os.path.dirname(atual), "data", "dados_clinica.db"), # ../data/
        os.path.join(atual, "workers", "data", "dados_clinica.db"),   
        os.path.join(atual, "dados_clinica.db")                       
    ]
    
    for caminho in candidatos:
        if os.path.exists(caminho):
            return caminho
    return None

def consultar_recepcao():
    db_path = encontrar_banco()

    if not db_path:
        print("❌ ERRO: Banco de dados 'dados_clinica.db' não encontrado.")
        print("   Dica: Rode 'python workers/monitor_recepcao.py' primeiro.")
        return

    print(f"📂 Lendo banco: {db_path}")
    
    try:
        with sqlite3.connect(db_path) as conn:
            # Query padronizada com cálculo matemático de minutos
            # Mapeia os IDs das unidades para nomes para facilitar a leitura
            query = """
            SELECT 
                CASE unidade_id
                    WHEN 2 THEN 'Ouro Verde'
                    WHEN 3 THEN 'Cambuí'
                    WHEN 12 THEN 'Shop. Campinas'
                    ELSE unidade_id
                END as unidade,
                senha,
                tipo_senha,
                status,
                substr(dt_chegada, 12, 5) as chegada,      -- Pega só HH:MM
                substr(dt_atendimento, 12, 5) as atendim,  -- Pega só HH:MM
                
                -- CÁLCULO PADRÃO INT (MINUTOS)
                CAST(
                    CASE 
                        WHEN dt_atendimento IS NOT NULL THEN 
                            (julianday(dt_atendimento) - julianday(dt_chegada)) * 24 * 60
                        ELSE 
                            (julianday('now', 'localtime') - julianday(dt_chegada)) * 24 * 60
                    END AS INTEGER
                ) as espera_min
                
            FROM recepcao_historico
            ORDER BY dt_chegada DESC
            """
            
            # Tenta ler a tabela
            try:
                df = pd.read_sql_query(query, conn)
            except pd.errors.DatabaseError:
                print("⚠️ A tabela 'recepcao_historico' ainda não existe.")
                print("   O monitor da recepção precisa rodar pelo menos uma vez.")
                return

            if df.empty:
                print("⚠️ A tabela existe, mas está vazia (nenhuma senha coletada hoje).")
            else:
                # Ajustes visuais
                pd.set_option('display.max_rows', None)
                pd.set_option('display.max_columns', None)
                pd.set_option('display.width', 1000)
                pd.set_option('display.colheader_justify', 'left')
                
                print(f"\n✅ FILA RECEPÇÃO - TOTAL: {len(df)} REGISTROS:\n")
                print(df.to_string(index=False))

    except Exception as e:
        print(f"❌ Erro técnico: {e}")

if __name__ == "__main__":
    consultar_recepcao()