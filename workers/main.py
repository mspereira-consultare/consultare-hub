import threading
import time
import os
import sys
import datetime
import schedule

# Adiciona diretório atual ao path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database_manager import DatabaseManager
    # Workers Pesados
    from worker_feegow import update_financial_data
    from worker_proposals import update_proposals
    from worker_faturamento_scraping import run_scraper
    from worker_contracts import run_worker_contracts
    
    # Monitores
    from monitor_recepcao import run_monitor_recepcao
    from monitor_medico import run_monitor_medico
    from worker_clinia import process_and_save as clinia_cycle
except ImportError as e:
    print(f"❌ Erro de Importação no Main: {e}")
    sys.exit(1)

START_HOUR = 6
END_HOUR = 22

def is_working_hours():
    h = datetime.datetime.now().hour
    return START_HOUR <= h < END_HOUR

def run_on_demand_listener():
    print("👂 Listener de Atualizações Manuais iniciado.")
    db = DatabaseManager()
    
    while True:
        try:
            # Busca pedidos PENDING
            pedidos = db.execute_query("SELECT service_name FROM system_status WHERE status = 'PENDING'")
            
            if pedidos:
                conn = db.get_connection()
                conn.execute("UPDATE system_status SET status = 'QUEUED' WHERE status = 'PENDING'")
                conn.commit()
                conn.close()

            for row in pedidos:
                # Compatibilidade de tupla vs objeto
                service = row[0] if isinstance(row, (tuple, list)) else row['service_name']
                
                print(f"\n⚡ GATILHO RECEBIDO: {service}")
                db.update_heartbeat(service, "RUNNING", "Processando...")
                
                try:
                    start_time = time.time()
                    
                    if service == 'financeiro':
                        update_financial_data()
                        run_scraper()
                    elif service == 'comercial':
                        update_proposals()
                        run_worker_contracts()
                    
                    elapsed = round(time.time() - start_time, 2)
                    db.update_heartbeat(service, "COMPLETED", f"Concluído em {elapsed}s")
                    
                except Exception as e:
                    print(f"❌ Erro {service}: {e}")
                    db.update_heartbeat(service, "ERROR", str(e))
            
        except Exception as e:
            print(f"⚠️ Erro Listener: {e}")
        
        time.sleep(5)

# --- WRAPPERS DE SEGURANÇA ---
def run_monitor_recepcao_safe():
    while True:
        if is_working_hours():
            try: run_monitor_recepcao()
            except: pass
        else:
            time.sleep(1800)
        time.sleep(10)

def run_monitor_medico_safe():
    while True:
        if is_working_hours():
            try: run_monitor_medico()
            except: pass
        else:
            time.sleep(1800)
        time.sleep(10)

def run_clinia_safe():
    while True:
        if is_working_hours():
            try: clinia_cycle()
            except: pass
            time.sleep(60)
        else:
            time.sleep(1800)

def run_scheduler():
    print("⏰ Scheduler Diário iniciado.")
    def daily_job():
        print("🌅 Job Diário...")
        try:
            update_financial_data()
            run_scraper()
            run_worker_contracts()
        except: pass
        
    schedule.every().day.at("06:00").do(daily_job)
    while True:
        schedule.run_pending()
        time.sleep(60)

def start_orchestrator():
    print("\n🎹 ORQUESTRADOR HÍBRIDO INICIADO 🎹")
    
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
        print("🛑 Parando...")

if __name__ == "__main__":
    start_orchestrator()