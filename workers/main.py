import threading
import time
import os
import sys
import sqlite3

# --- FIX CRÍTICO PARA WINDOWS ---
# Força o Python a usar UTF-8 no terminal para não travar com emojis
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass # Python antigo, ignora

# Adiciona diretório atual ao path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Tenta importar schedule (instala se faltar)
try:
    import schedule
except ImportError:
    print("📦 Instalando dependência 'schedule'...")
    os.system(f"{sys.executable} -m pip install schedule")
    import schedule

# --- IMPORTS DOS WORKERS ---
try:
    from worker_feegow import update_financial_data
    from worker_proposals import update_proposals
    from worker_clinia import process_and_save as clinia_cycle
    from worker_faturamento_scraping import run_scraper
    from worker_contracts import run_worker_contracts
    
    # Monitores
    from monitor_recepcao import run_monitor_recepcao
    from monitor_medico import run_monitor_medico
except ImportError as e:
    print(f"❌ Erro de Importação: {e}")
    sys.exit(1)

# --- OTIMIZAÇÃO DO BANCO ---
def optimize_database():
    db_path = os.path.join(os.path.dirname(__file__), '../data/dados_clinica.db')
    try:
        conn = sqlite3.connect(db_path)
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.close()
        print("✅ Banco de dados otimizado (Modo WAL ativado).")
    except Exception as e:
        print(f"⚠️ Aviso: Não foi possível otimizar o banco: {e}")

# --- WRAPPERS ---
def run_clinia_loop():
    print("🚀 Thread Clinia iniciada.")
    while True:
        try:
            clinia_cycle()
        except Exception as e:
            print(f"Erro Clinia: {e}")
        time.sleep(30)

def run_periodic_tasks():
    print("🚀 Thread Agendador (Financeiro/Propostas/Scraper) iniciada.")
    
    # Carga inicial
    try: update_financial_data() 
    except: pass
    
    try: update_proposals() 
    except: pass

    try: run_worker_contracts()
    except: pass

    # Agenda
    schedule.every(30).minutes.do(update_financial_data)
    schedule.every(30).minutes.do(update_proposals)
    schedule.every(4).hours.do(run_scraper)
    schedule.every(2).hours.do(run_worker_contracts)

    while True:
        schedule.run_pending()
        time.sleep(60)

# --- FUNÇÃO PRINCIPAL ---
def start_orchestrator():
    # Se o encoding falhar, removemos o emoji do print para garantir
    try:
        print("\n🎹 INICIANDO ORQUESTRADOR DE WORKERS 🎹")
    except UnicodeEncodeError:
        print("\n=== INICIANDO ORQUESTRADOR DE WORKERS ===")
        
    print("===========================================")
    
    optimize_database()

    threads = [
        threading.Thread(target=run_monitor_recepcao, name="MonitorRecepcao", daemon=True),
        threading.Thread(target=run_monitor_medico, name="MonitorMedico", daemon=True),
        threading.Thread(target=run_clinia_loop, name="WorkerClinia", daemon=True),
        threading.Thread(target=run_periodic_tasks, name="Scheduler", daemon=True)
    ]

    for t in threads:
        t.start()
        time.sleep(1)

    try:
        while True:
            time.sleep(5)
    except KeyboardInterrupt:
        print("\n🛑 Parando Orquestrador...")

if __name__ == "__main__":
    start_orchestrator()