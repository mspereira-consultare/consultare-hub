import threading
import time
import os
import sys
import datetime
import schedule

# --- CONFIGURAÇÃO PARA LOGS IMEDIATOS NO DOCKER ---
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# Adiciona diretório atual ao path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database_manager import DatabaseManager
    # Workers (Execução única)
    from worker_feegow import update_financial_data
    from worker_proposals import update_proposals
    from worker_faturamento_scraping import run_scraper
    from worker_contracts import run_worker_contracts
    
    # Monitores (Loops infinitos)
    # Nota: monitor_recepcao e monitor_medico já possuem while True interno.
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
# Esses wrappers protegem o main de cair se um monitor der crash

def run_monitor_recepcao_safe():
    while True:
        if is_working_hours():
            try: 
                # O monitor já tem while True, mas se der crash fatal, ele sai.
                # Aqui nós reiniciamos ele.
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
            time.sleep(60) # Roda a cada 1 minuto
        else:
            time.sleep(1800)

def run_scheduler():
    print("⏰ Scheduler Diário iniciado.")
    
    def daily_full_sync():
        print("🌅 Job Diário: Sincronização Completa...")
        try:
            update_financial_data()
            run_scraper()
            update_proposals()
            run_worker_contracts()
            print("✅ Job Diário Finalizado.")
        except Exception as e:
            print(f"❌ Falha no Job Diário: {e}")
        
    # Agendamento
    schedule.every().day.at("06:00").do(daily_full_sync)
    
    # Backup: roda contratos de novo no almoço para pegar matriculas novas
    schedule.every().day.at("12:00").do(lambda: run_worker_contracts())

    while True:
        schedule.run_pending()
        time.sleep(60)

def start_orchestrator():
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

    # Mantém a thread principal viva
    try:
        while True: time.sleep(10)
    except KeyboardInterrupt:
        print("🛑 Parando Orchestrator...")

if __name__ == "__main__":
    start_orchestrator()