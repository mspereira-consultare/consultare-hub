import threading
import time
import os
import sys
import datetime
import schedule
import builtins

# --- CONFIGURAÇÃO: LOGS IMEDIATOS + SUPORTE A EMOJIS (WINDOWS) ---
# O encoding='utf-8' impede o erro 'charmap codec can't encode character' no Windows
sys.stdout.reconfigure(line_buffering=True, encoding='utf-8')
sys.stderr.reconfigure(line_buffering=True, encoding='utf-8')

# --- PADRÃO DE LOGS COM PREFIXO (THREAD + HORÁRIO) ---
_original_print = builtins.print

def _prefixed_print(*args, **kwargs):
    ts = datetime.datetime.now().strftime('%H:%M:%S')
    tname = threading.current_thread().name
    prefix = f"[{ts}][{tname}]"
    if args:
        _original_print(prefix, *args, **kwargs)
    else:
        _original_print(prefix, **kwargs)

builtins.print = _prefixed_print

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
START_MINUTE = 30

def is_working_hours():
    now = datetime.datetime.now()
    start = now.replace(hour=START_HOUR, minute=START_MINUTE, second=0, microsecond=0)
    end = now.replace(hour=20, minute=0, second=0, microsecond=0)
    return start <= now < end

# --- EXECUTOR SEGURO POR SERVIÇO (evita concorrência entre agendador e trigger manual) ---
service_locks = {}

# Aliases associados às ações internas
ALIAS_ACTION_MAP = {
    'financeiro': 'financeiro',
    'financeiro_api': 'financeiro',
    'feegow_finance': 'financeiro',
    'faturamento': 'faturamento',
    'faturamento_scraping': 'faturamento',
    'worker_faturamento_scraping': 'faturamento',
    'comercial': 'comercial',
    'propostas': 'comercial',
    'contratos': 'contratos',
    'auth': 'auth',
    'auth_feegow': 'auth',
    'worker_clinia': 'clinia',
}

# Mapeia ação para nome canônico no `system_status`
CANONICAL_NAME = {
    'financeiro': 'Financeiro (API)',
    'faturamento': 'Faturamento (Scraping)',
    'comercial': 'Propostas (API)',
    'contratos': 'Cartão de Beneficios (API)',
    'auth': 'Auth Feegow',
    'clinia': 'Worker Clinia'
}

def canonicalize(service_raw: str):
    if not service_raw: return service_raw
    s = service_raw.lower().strip()
    action = ALIAS_ACTION_MAP.get(s, s)
    display = CANONICAL_NAME.get(action, action.capitalize())
    return action, display


def run_service(key: str):
    """Executa um worker mapeado por `key` (ou seu alias), sem concorrência.
    Resolve um nome canônico para heartbeat e usa locks por ação."""
    action, display_name = canonicalize(key)
    lock = service_locks.setdefault(action, threading.Lock())
    if not lock.acquire(blocking=False):
        print(f"⏭️ Serviço já em execução: {display_name} — pulando execução.")
        return

    db = DatabaseManager()
    try:
        db.update_heartbeat(display_name, "RUNNING", "Agendado/executando...")
        start = time.time()

        if action == 'financeiro':
            update_financial_data()
        elif action == 'faturamento':
            # Scraper específico
            run_scraper()
        elif action == 'comercial':
            update_proposals()
        elif action == 'contratos':
            run_worker_contracts()
        elif action == 'auth':
            run_token_renewal()
        elif action == 'clinia':
            clinia_cycle()
        else:
            print(f"⚠️ Ação desconhecida solicitada: {action}")

        elapsed = round(time.time() - start, 2)
        db.update_heartbeat(display_name, "COMPLETED", f"Concluído em {elapsed}s")

    except Exception as e:
        print(f"❌ Erro ao rodar serviço {display_name}: {e}")
        db.update_heartbeat(display_name, "ERROR", str(e))
    finally:
        try:
            lock.release()
        except RuntimeError:
            pass

def run_hourly_workers():
    """Executa todos os workers não real-time uma vez (usa run_service)."""
    print("⏰ Executando jobs horários: iniciando workers não real-time...")
    # Ordem: financeiro (inclui scraper), comercial, contratos, auth
    run_service('financeiro')
    run_service('comercial')
    run_service('contratos')
    run_service('auth')

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
    poll_interval = int(os.getenv("ON_DEMAND_POLL_INTERVAL_SEC", "30"))
    
    while True:
        try:
            pedidos = db.execute_query("""
                SELECT service_name 
                FROM system_status 
                WHERE status IN ('PENDING', 'ERROR', 'QUEUED')
            """)

            for row in pedidos:
                service = row[0] if isinstance(row, (tuple, list)) else row['service_name']
                
                print(f"\n⚡ GATILHO RECEBIDO: {service}")

                try:
                    start_time = time.time()
                    # Delegate to shared executor which uses locks and writes canonical heartbeat
                    run_service(service)
                    
                except Exception as e:
                    print(f"❌ Erro {service}: {e}")
                    db.update_heartbeat(service, "ERROR", str(e))

        except Exception as e:
            print(f"⚠️ Erro Listener: {e}")
            time.sleep(poll_interval)
        
        time.sleep(poll_interval)

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
    # JOB HORÁRIO: executa workers não real-time a cada hora
    schedule.every().hour.do(run_hourly_workers)

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
