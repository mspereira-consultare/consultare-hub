import threading
import time
import os
import sys
import datetime
import schedule

# --- CONFIGURAÇÃO: LOGS IMEDIATOS + SUPORTE A EMOJIS (WINDOWS) ---
# O encoding='utf-8' impede o erro 'charmap codec can't encode character' no Windows
sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.stderr.reconfigure(line_buffering=True, encoding='utf-8')

# Adiciona diretório atual ao path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database_manager import DatabaseManager
    # Workers (Execução única)
    from worker_feegow import update_financial_data
    from worker_proposals import update_proposals
    from worker_faturamento_scraping import run_scraper
    from worker_contracts import run_worker_contracts
    from worker_auth import FeegowTokenRenewer
    
    # Monitores (Loops infinitos)
    from monitor_recepcao import run_monitor_recepcao
    from monitor_medico import run_monitor_medico
    
    # Worker Clinia (Ciclo único que precisa de loop externo)
    from worker_clinia import process_and_save as clinia_cycle
    
except ImportError as e:
    print(f"❌ Erro de Importação no Main: {e}")
    sys.exit(1)

START_HOUR = 6
END_HOUR = 23 # Estendido um pouco para garantir fechamento

def is_working_hours():
    h = datetime.datetime.now().hour
    return START_HOUR <= h < END_HOUR

def run_token_renewal():
    """Roda o Playwright para renovar tokens e salvar no banco"""
    print("\n🔑 Iniciando Renovação de Tokens (Auth)...")
    db = DatabaseManager()
    try:
        db.update_heartbeat("Auth Feegow", "RUNNING", "Renovando tokens...")
        renewer = FeegowTokenRenewer()
        renewer.obter_tokens() # Isso popula as linhas unit_id 2, 3, 12 no banco
        print("✅ Tokens renovados com sucesso.")
        db.update_heartbeat("Auth Feegow", "COMPLETED", "Tokens atualizados")
    except Exception as e:
        print(f"❌ Falha na renovação de tokens: {e}")
        db.update_heartbeat("Auth Feegow", "ERROR", str(e))

def run_on_demand_listener():
    print("👂 Listener de Atualizações Manuais iniciado.")
    db = DatabaseManager()
    
    while True:
        try:
            # Busca pedidos PENDING
            pedidos = db.execute_query("SELECT service_name FROM system_status WHERE status = 'PENDING'")
            
            if pedidos:
                # Marca como na fila para não pegar duas vezes
                conn = db.get_connection()
                conn.execute("UPDATE system_status SET status = 'QUEUED' WHERE status = 'PENDING'")
                conn.commit()
                conn.close()

            for row in pedidos:
                service = row[0] if isinstance(row, (tuple, list)) else row['service_name']
                
                print(f"\n⚡ GATILHO RECEBIDO: {service}")
                db.update_heartbeat(service, "RUNNING", "Processando...")
                
                try:
                    start_time = time.time()
                    
                    if service == 'financeiro':
                        update_financial_data() # API
                        run_scraper()           # Scraping
                    elif service == 'comercial':
                        update_proposals()
                    elif service == 'contratos':
                        run_worker_contracts()
                    elif service == 'auth':
                        run_token_renewal()
                    
                    elapsed = round(time.time() - start_time, 2)
                    db.update_heartbeat(service, "COMPLETED", f"Concluído em {elapsed}s")
                    
                except Exception as e:
                    print(f"❌ Erro {service}: {e}")
                    db.update_heartbeat(service, "ERROR", str(e))
            
        except Exception as e:
            print(f"⚠️ Erro Listener: {e}")
            time.sleep(5)
        
        time.sleep(5)

# --- WRAPPERS DE SEGURANÇA ---
def run_monitor_recepcao_safe():
    while True:
        if is_working_hours():
            try: 
                run_monitor_recepcao()
            except Exception as e: 
                print(f"⚠️ Crash Monitor Recepção: {e}. Reiniciando em 10s...")
        time.sleep(10)

def run_monitor_medico_safe():
    while True:
        if is_working_hours():
            try: 
                run_monitor_medico()
            except Exception as e:
                print(f"⚠️ Crash Monitor Médico: {e}. Reiniciando em 10s...")
        time.sleep(10)

def run_clinia_safe():
    while True:
        if is_working_hours():
            try: 
                clinia_cycle()
            except Exception as e:
                print(f"⚠️ Erro Clinia: {e}")
            time.sleep(60) 
        else:
            time.sleep(1800)

def run_scheduler():
    print("⏰ Scheduler Diário iniciado.")
    
    def daily_full_sync():
        print("🌅 Job Diário: Sincronização Completa...")
        try:
            run_token_renewal()
            update_financial_data()
            run_scraper()
            update_proposals()
            run_worker_contracts()
            print("✅ Job Diário Finalizado.")
        except Exception as e:
            print(f"❌ Falha no Job Diário: {e}")
        
    # Agendamento
    schedule.every().day.at("05:00").do(run_token_renewal)
    schedule.every().day.at("06:00").do(daily_full_sync)
    schedule.every().day.at("12:00").do(lambda: run_worker_contracts())

    schedule.every().day.at("12:00").do(run_token_renewal)

    while True:
        schedule.run_pending()
        time.sleep(60)

def start_orchestrator():
    # Os emojis abaixo causavam erro no Windows sem o encoding='utf-8'
    print("\n🎹 ORQUESTRADOR HÍBRIDO INICIADO 🎹")
    print(f"🌍 Ambiente: {'RAILWAY/PROD' if os.getenv('RAILWAY_ENVIRONMENT') else 'LOCAL'}")
    
    threads = [
        threading.Thread(target=run_on_demand_listener, name="Listener", daemon=True),
        threading.Thread(target=run_scheduler, name="Scheduler", daemon=True),
        threading.Thread(target=run_monitor_recepcao_safe, name="MonRec", daemon=True),
        threading.Thread(target=run_monitor_medico_safe, name="MonMed", daemon=True),
        threading.Thread(target=run_clinia_safe, name="Clinia", daemon=True),
    ]

    for t in threads: t.start()

    try:
        while True: time.sleep(10)
    except KeyboardInterrupt:
        print("🛑 Parando Orchestrator...")

if __name__ == "__main__":
    start_orchestrator()