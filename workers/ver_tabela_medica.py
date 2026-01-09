import sqlite3
import pandas as pd
import os

def encontrar_banco():
    atual = os.path.dirname(os.path.abspath(__file__))
    candidatos = [
        os.path.join(atual, "data", "dados_clinica.db"),
        os.path.join(os.path.dirname(atual), "data", "dados_clinica.db"),
    ]
    for caminho in candidatos:
        if os.path.exists(caminho): return caminho
    return None

def consultar_tudo():
    db_path = encontrar_banco()
    if not db_path:
        print("❌ Banco não encontrado. Rode o monitor_medico.py primeiro.")
        return

    print(f"📂 Lendo banco: {db_path}")
    
    try:
        with sqlite3.connect(db_path) as conn:
            # Query padronizada com cálculo matemático de minutos
            query = """
            SELECT 
                unidade_nome,
                hora_agendada as agenda,
                paciente,
                idade,
                profissional,
                status,
                substr(dt_chegada, 12, 5) as chegada,
                substr(dt_atendimento, 12, 5) as atendim,
                
                -- CÁLCULO PADRÃO INT (MINUTOS)
                CAST(
                    CASE 
                        WHEN dt_atendimento IS NOT NULL THEN 
                            (julianday(dt_atendimento) - julianday(dt_chegada)) * 24 * 60
                        ELSE 
                            (julianday('now', 'localtime') - julianday(dt_chegada)) * 24 * 60
                    END AS INTEGER
                ) as espera_min
                
            FROM espera_medica_historico
            ORDER BY dt_chegada DESC
            """
            
            df = pd.read_sql_query(query, conn)

            if df.empty:
                print("⚠️ Tabela vazia. Aguardando dados do monitor.")
            else:
                pd.set_option('display.max_rows', None)
                pd.set_option('display.max_columns', None)
                pd.set_option('display.width', 1000)
                pd.set_option('display.colheader_justify', 'left')
                
                print(f"\n✅ FILA MÉDICA PADRONIZADA ({len(df)} registros):\n")
                print(df.to_string(index=False))

    except Exception as e:
        print(f"❌ Erro: {e}")

if __name__ == "__main__":
    consultar_tudo()