import sqlite3
import pandas as pd
import os
import datetime

# Caminho do banco de dados
DB_PATH = os.path.join("data", "dados_clinica.db")

def check_meta_requirements():
    print("--- DIAGNÓSTICO: META REALIZADOS + AGENDADOS ---")
    
    if not os.path.exists(DB_PATH):
        print(f"❌ Banco de dados não encontrado em: {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    
    # 1. VERIFICAÇÃO BÁSICA DA TABELA
    try:
        total = conn.execute("SELECT COUNT(*) FROM feegow_appointments").fetchone()[0]
        print(f"📊 Total de registros na tabela 'feegow_appointments': {total}")
        
        if total == 0:
            print("❌ A tabela está VAZIA. O worker não salvou nada.")
            print("   -> Rode: python workers/worker_feegow.py")
            return
    except Exception as e:
        print(f"❌ Erro ao ler tabela: {e}")
        return

    # 2. VERIFICAÇÃO DE STATUS (O filtro da meta usa IDs 1, 2, 3, 4, 7)
    print("\n[1/3] VERIFICANDO STATUS SALVOS:")
    df_status = pd.read_sql("SELECT status_id, COUNT(*) as qtd FROM feegow_appointments GROUP BY status_id", conn)
    
    status_meta = [1, 2, 3, 4, 7]
    qtd_meta = df_status[df_status['status_id'].isin(status_meta)]['qtd'].sum()
    
    print(df_status.to_string(index=False))
    print(f"👉 Total elegível para a Meta (Status 1,2,3,4,7): {qtd_meta}")
    
    if qtd_meta == 0:
        print("❌ ALERTA: Nenhum agendamento tem status válido para a meta!")
        return

    # 3. VERIFICAÇÃO DE DATAS (O filtro espera YYYY-MM-DD)
    print("\n[2/3] VERIFICANDO FORMATO DE DATA:")
    # Pega uma amostra de 5 datas distintas
    datas = conn.execute("SELECT DISTINCT date FROM feegow_appointments ORDER BY date DESC LIMIT 5").fetchall()
    amostra = [d[0] for d in datas]
    print(f"   Amostra de datas no banco: {amostra}")
    
    # Verifica se parece ISO (YYYY-MM-DD)
    tem_iso = any("-" in str(d) and len(str(d)) == 10 for d in amostra)
    if not tem_iso:
        print("❌ ALERTA: As datas parecem não estar no formato YYYY-MM-DD. O filtro de período vai falhar!")
    else:
        print("✅ Formato de data parece correto (ISO).")

    # 4. VERIFICAÇÃO DE GRUPOS (O problema do 'Geral')
    print("\n[3/3] VERIFICANDO GRUPOS DE PROCEDIMENTO:")
    df_grupos = pd.read_sql("SELECT procedure_group, COUNT(*) as qtd FROM feegow_appointments GROUP BY procedure_group ORDER BY qtd DESC", conn)
    print(df_grupos.to_string(index=False))
    
    geral_qtd = df_grupos[df_grupos['procedure_group'] == 'Geral']['qtd'].sum()
    total_validos = df_grupos['qtd'].sum()
    
    if geral_qtd == total_validos:
        print("\n❌ CRÍTICO: 100% dos agendamentos estão como 'Geral'.")
        print("   Isso significa que o cruzamento de IDs no 'feegow_client.py' falhou.")
        print("   O filtro de meta por grupo não vai encontrar nada.")
    elif geral_qtd > 0:
        print(f"\n⚠️ AVISO: {geral_qtd} agendamentos ainda estão como 'Geral'.")
        print("   Seus gráficos funcionarão, mas esses específicos não entrarão nos filtros de grupo.")
    else:
        print("\n✅ Sucesso: Os grupos parecem estar nomeados corretamente.")

    # 5. SIMULAÇÃO DA META (Teste Real)
    print("\n--- SIMULAÇÃO DO CÁLCULO DA META (Mês Atual) ---")
    hoje = datetime.date.today()
    inicio_mes = hoje.replace(day=1).strftime('%Y-%m-%d')
    # Fim do mês (simplificado)
    if hoje.month == 12:
        fim_mes = datetime.date(hoje.year + 1, 1, 1) - datetime.timedelta(days=1)
    else:
        fim_mes = datetime.date(hoje.year, hoje.month + 1, 1) - datetime.timedelta(days=1)
    fim_mes_str = fim_mes.strftime('%Y-%m-%d')

    query_teste = f"""
        SELECT COUNT(*) as meta_valor 
        FROM feegow_appointments 
        WHERE date BETWEEN '{inicio_mes}' AND '{fim_mes_str}'
        AND status_id IN (1, 2, 3, 4, 7)
    """
    valor = conn.execute(query_teste).fetchone()[0]
    print(f"📅 Período: {inicio_mes} a {fim_mes_str}")
    print(f"🎯 Valor que deveria aparecer no painel (Sem filtros de grupo): {valor}")

    conn.close()

if __name__ == "__main__":
    check_meta_requirements()