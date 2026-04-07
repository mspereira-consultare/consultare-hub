import threading
import time
import os
import sys
import datetime
import uuid
import schedule
import builtins
import re
import unicodedata
from collections import deque

# --- TIMEZONE (Railway normalmente roda em UTC) ---
WORK_TZ_NAME = os.getenv("WORK_TZ", "America/Sao_Paulo")
try:
    from zoneinfo import ZoneInfo  # py>=3.9
    WORK_TZ = ZoneInfo(WORK_TZ_NAME)
except Exception:
    try:
        import pytz
        WORK_TZ = pytz.timezone(WORK_TZ_NAME)
    except Exception:
        WORK_TZ = None

# Para bibliotecas que usam datetime.now() sem tz (ex: schedule), tenta aplicar TZ do processo (Linux).
if hasattr(time, "tzset"):
    try:
        os.environ["TZ"] = WORK_TZ_NAME
        time.tzset()
    except Exception as e:
        print(f"⚠️ Falha ao aplicar TZ='{WORK_TZ_NAME}': {e}")

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
    from worker_feegow_appointments import update_appointments_data
    from worker_feegow_procedures import update_procedures_catalog
    from worker_feegow_professionals_sync import run_sync as run_professionals_sync
    from worker_proposals import update_proposals
    from worker_feegow_patients import sync_feegow_patients
    from worker_faturamento_scraping import run_scraper
    from worker_contracts import run_worker_contracts
    from worker_repasse_consolidado import process_pending_repasse_jobs_once
    from worker_consolidacao_profissionais import process_pending_consolidacao_jobs_once
    from worker_agenda_ocupacao import process_pending_agenda_occupancy_jobs_once
    from worker_marketing_funnel_google import process_pending_marketing_funnel_jobs_once
    from worker_clinia_crm import process_pending_clinia_crm_jobs_once
    from worker_clinia_ads import process_pending_clinia_ads_jobs_once
    from worker_auth import FeegowTokenRenewer
    from worker_auth_clinia import CliniaCookieRenewer
    
    # Monitores (Loops infinitos)
    from monitor_recepcao import run_monitor_recepcao
    from monitor_medico import run_monitor_medico, run_medico_prewarm
    
    # Worker Clinia (Ciclo único que precisa de loop externo)
    from worker_clinia import process_and_save as clinia_cycle
    
except ImportError as e:
    print(f"❌ Erro de Importação no Main: {e}")
    sys.exit(1)

def _parse_hhmm(raw_value: str, default_h: int, default_m: int):
    try:
        raw = str(raw_value or "").strip()
        if not raw:
            return default_h, default_m
        parts = raw.split(":")
        if len(parts) != 2:
            return default_h, default_m
        h = int(parts[0])
        m = int(parts[1])
        if not (0 <= h <= 23 and 0 <= m <= 59):
            return default_h, default_m
        return h, m
    except Exception:
        return default_h, default_m


def _is_within_window(now_dt: datetime.datetime, start_hhmm: str, end_hhmm: str, default_start="08:00", default_end="19:00"):
    ds_h, ds_m = _parse_hhmm(default_start, 8, 0)
    de_h, de_m = _parse_hhmm(default_end, 19, 0)
    start_h, start_m = _parse_hhmm(start_hhmm, ds_h, ds_m)
    end_h, end_m = _parse_hhmm(end_hhmm, de_h, de_m)

    start = now_dt.replace(hour=start_h, minute=start_m, second=0, microsecond=0)
    end = now_dt.replace(hour=end_h, minute=end_m, second=0, microsecond=0)
    if end <= start:
        return now_dt >= start or now_dt < end
    return start <= now_dt < end

WORK_START_HHMM = os.getenv("WORK_START", "06:30")
WORK_END_HHMM = os.getenv("WORK_END", "20:00")
START_HOUR, START_MINUTE = _parse_hhmm(WORK_START_HHMM, 6, 30)
END_HOUR, END_MINUTE = _parse_hhmm(WORK_END_HHMM, 20, 0)

def _now_work_tz():
    if WORK_TZ is not None:
        return datetime.datetime.now(WORK_TZ)
    return datetime.datetime.now()

def is_working_hours():
    now = _now_work_tz()
    start = now.replace(hour=START_HOUR, minute=START_MINUTE, second=0, microsecond=0)
    end = now.replace(hour=END_HOUR, minute=END_MINUTE, second=0, microsecond=0)

    # Janela "overnight" (ex.: 22:00 -> 06:00)
    if end <= start:
        return now >= start or now < end
    return start <= now < end

# --- EXECUTOR SEGURO POR SERVIÇO (evita concorrência entre agendador e trigger manual) ---
service_locks = {}

SERIALIZED_SCRAPER_SERVICES = {"faturamento", "repasses", "repasse_consolidacao"}
SERIAL_QUEUE_POLL_SEC = max(1, int(os.getenv("FEGOW_SERIAL_QUEUE_POLL_SEC", "5")))
REPASSE_JOB_DISPATCH_POLL_SEC = max(5, int(os.getenv("REPASSE_JOB_DISPATCH_POLL_SEC", "20")))
REPASSE_JOB_STALE_MINUTES = max(5, int(os.getenv("REPASSE_JOB_STALE_MINUTES", "20")))

_serial_queue = deque()
_serial_queue_lock = threading.Lock()
_serial_queue_actions = set()
_serial_running_action = None

KNOWN_ACTIONS = {
    'appointments',
    'patients_registry',
    'procedures_catalog',
    'professionals_sync',
    'faturamento', # Receita bruta analítica
    'comercial', # Propostas (API)
    'repasses', # Repasses consolidados (scraping)
    'repasse_consolidacao', # Repasses a consolidar (scraping)
    'contratos', # Cartão de Benefícios (API)
    'auth', # Obtém cookies e x-access-token Feegow
    'auth_clinia', # Obtém cookie Clinia
    'clinia', # Fila de atendimento WhatsApp
    'monitor_medico', # Espera para atendimento médico
    'monitor_recepcao', # Espera para atendimento recepção
    'agenda_occupancy', # Ocupacao da agenda por especialidade
    'marketing_funnel', # Funil de Marketing (Google Ads + GA4)
    'clinia_crm', # CRM Clinia (boards e cards)
    'clinia_ads', # Estatisticas de anuncios do Clinia
}

def _normalize_service_key(service_raw: str) -> str:
    if service_raw is None:
        return ""
    s = str(service_raw).strip().lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s

# Aliases associados às ações internas
ALIAS_ACTION_MAP = {
    'appointments': 'appointments',
    'agendamentos': 'appointments',
    'financeiro': 'appointments',
    'financeiro_api': 'appointments',
    'feegow_finance': 'appointments',
    'worker_feegow': 'appointments',
    'worker_feegow_appointments': 'appointments',
    'patients_registry': 'patients_registry',
    'patients': 'patients_registry',
    'pacientes': 'patients_registry',
    'feegow_patients': 'patients_registry',
    'worker_feegow_patients': 'patients_registry',
    'procedures_catalog': 'procedures_catalog',
    'procedures': 'procedures_catalog',
    'catalogo_procedimentos': 'procedures_catalog',
    'feegow_procedures': 'procedures_catalog',
    'worker_feegow_procedures': 'procedures_catalog',
    'professionals_sync': 'professionals_sync',
    'profissionais_sync': 'professionals_sync',
    'feegow_professionals_sync': 'professionals_sync',
    'worker_feegow_professionals_sync': 'professionals_sync',
    'faturamento': 'faturamento',
    'faturamento_scraping': 'faturamento',
    'faturamento_scraper': 'faturamento',
    'worker_faturamento_scraping': 'faturamento',
    'comercial': 'comercial',
    'propostas': 'comercial',
    'propostas_api': 'comercial',
    'repasses': 'repasses',
    'repasse': 'repasses',
    'repasse_sync': 'repasses',
    'worker_repasse_consolidado': 'repasses',
    'repasse_consolidacao': 'repasse_consolidacao',
    'consolidacao_repasses': 'repasse_consolidacao',
    'consolidacao': 'repasse_consolidacao',
    'worker_consolidacao_profissionais': 'repasse_consolidacao',
    'contratos': 'contratos',
    'contratos_api': 'contratos',
    'cartao_de_beneficios_api': 'contratos',
    'auth': 'auth',
    'auth_feegow': 'auth',
    'auth_clinia': 'auth_clinia',
    'clinia_auth': 'auth_clinia',
    'worker_clinia': 'clinia',
    'clinia': 'clinia',
    'monitor_medico': 'monitor_medico',
    'monitor_recepcao': 'monitor_recepcao',
    'agenda_occupancy': 'agenda_occupancy',
    'agenda_ocupacao': 'agenda_occupancy',
    'ocupacao_agenda': 'agenda_occupancy',
    'marketing_funnel': 'marketing_funnel',
    'marketing_funil': 'marketing_funnel',
    'funil_marketing': 'marketing_funnel',
    'worker_marketing_funnel_google': 'marketing_funnel',
    'clinia_crm': 'clinia_crm',
    'crm_clinia': 'clinia_crm',
    'worker_clinia_crm': 'clinia_crm',
    'clinia_ads': 'clinia_ads',
    'ads_clinia': 'clinia_ads',
    'worker_clinia_ads': 'clinia_ads',
}

# Mapeia ação para nome canônico no `system_status`
CANONICAL_NAME = {
    'appointments': 'Appointments (Feegow API)',
    'patients_registry': 'Pacientes (Feegow API)',
    'procedures_catalog': 'Catalogo de Procedimentos (Feegow API)',
    'professionals_sync': 'Profissionais (Feegow API)',
    'faturamento': 'Faturamento (Scraping)',
    'comercial': 'Propostas (API)',
    'repasses': 'Repasses Consolidados (Scraping)',
    'repasse_consolidacao': 'Repasses A Consolidar (Scraping)',
    'contratos': 'Cartão de Beneficios (API)',
    'auth': 'Auth Feegow',
    'auth_clinia': 'Auth Clinia',
    'clinia': 'Worker Clinia',
    'monitor_medico': 'Monitor Médico',
    'monitor_recepcao': 'Monitor Recepção',
    'agenda_occupancy': 'Agenda Ocupacao (Feegow API)',
    'marketing_funnel': 'Marketing Funil (Google API)',
    'clinia_crm': 'CRM Clinia (API nao oficial)',
    'clinia_ads': 'Clinia Ads (API nao oficial)',
}

def canonicalize(service_raw: str):
    if not service_raw:
        return service_raw, service_raw
    norm = _normalize_service_key(service_raw)
    action = ALIAS_ACTION_MAP.get(norm, norm)
    display = CANONICAL_NAME.get(action, action.replace('_', ' ').title())
    return action, display


def normalize_system_status_rows():
    """Normaliza nomes duplicados na tabela system_status."""
    db = DatabaseManager()
    rows = db.execute_query("""
        SELECT service_name, status, last_run, details
        FROM system_status
    """)
    if not rows:
        return

    def _row_val(row, key, idx):
        if isinstance(row, (tuple, list)):
            return row[idx]
        if hasattr(row, key):
            return getattr(row, key)
        try:
            return row.get(key)
        except Exception:
            return None

    best_by_action = {}
    to_delete = []

    for row in rows:
        service = _row_val(row, 'service_name', 0)
        status = _row_val(row, 'status', 1) or ''
        last_run = _row_val(row, 'last_run', 2) or ''
        details = _row_val(row, 'details', 3) or ''

        if not service:
            continue

        action, _ = canonicalize(service)
        if action not in KNOWN_ACTIONS:
            to_delete.append(service)
            continue

        if service != action:
            to_delete.append(service)

        prev = best_by_action.get(action)
        if not prev or (last_run or '') > (prev['last_run'] or ''):
            best_by_action[action] = {
                'status': status,
                'last_run': last_run,
                'details': details
            }

    if not best_by_action and not to_delete:
        return

    conn = db.get_connection()
    try:
        for action, data in best_by_action.items():
            conn.execute("""
                INSERT INTO system_status (service_name, status, last_run, details)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(service_name) DO UPDATE SET
                    status = excluded.status,
                    last_run = excluded.last_run,
                    details = excluded.details
            """, (action, data['status'], data['last_run'], data['details']))

        for name in to_delete:
            conn.execute("DELETE FROM system_status WHERE service_name = ?", (name,))

        if not db.use_turso:
            conn.commit()
    except Exception as e:
        print(f"⚠️ Falha ao normalizar system_status: {e}")
    finally:
        conn.close()


def _enqueue_serial_service(action: str, display_name: str, reason: str, raw_key: str = "") -> bool:
    global _serial_running_action
    with _serial_queue_lock:
        if action == _serial_running_action or action in _serial_queue_actions:
            return False
        _serial_queue.append(
            {
                "action": action,
                "display_name": display_name,
                "raw_key": raw_key or action,
                "reason": reason,
                "queued_at": time.time(),
            }
        )
        _serial_queue_actions.add(action)

    details = f"Fila serial ({reason})"
    try:
        db = DatabaseManager()
        db.update_heartbeat(action, "QUEUED", details)
        if raw_key and raw_key != action:
            db.update_heartbeat(raw_key, "QUEUED", details)
    except Exception:
        pass

    print(f"📥 Enfileirado na fila serial: {display_name} | motivo={reason}")
    return True


def _run_service_direct(action: str, display_name: str, raw_key: str = ""):
    lock = service_locks.setdefault(action, threading.Lock())
    if not lock.acquire(blocking=False):
        print(f"⏭️ Serviço já em execução: {display_name} — pulando execução.")
        return

    db = DatabaseManager()

    def _update_status(status: str, details: str):
        db.update_heartbeat(action, status, details)
        if raw_key and raw_key != action:
            db.update_heartbeat(raw_key, status, details)

    try:
        _update_status("RUNNING", "Agendado/executando...")
        start = time.time()

        if action == "appointments":
            update_appointments_data()
        elif action == "patients_registry":
            sync_feegow_patients()
        elif action == "procedures_catalog":
            update_procedures_catalog()
        elif action == "professionals_sync":
            run_professionals_sync(dry_run=False)
        elif action == "faturamento":
            run_scraper()
        elif action == "comercial":
            update_proposals()
        elif action == "repasses":
            drained = 0
            while process_pending_repasse_jobs_once(
                auto_enqueue_if_empty=False,
                requested_by="system_status",
            ):
                drained += 1
            print(f"🔁 Repasses: jobs drenados={drained}")
        elif action == "repasse_consolidacao":
            drained = 0
            while process_pending_consolidacao_jobs_once(
                auto_enqueue_if_empty=False,
                requested_by="system_status",
                headless=True,
            ):
                drained += 1
            print(f"🔁 Repasse consolidação: jobs drenados={drained}")
        elif action == "contratos":
            run_worker_contracts()
        elif action == "auth":
            run_token_renewal()
        elif action == "auth_clinia":
            run_clinia_token_renewal()
        elif action == "clinia":
            clinia_cycle()
        elif action == "agenda_occupancy":
            process_pending_agenda_occupancy_jobs_once()
        elif action == "marketing_funnel":
            drained = 0
            while process_pending_marketing_funnel_jobs_once(
                auto_enqueue_if_empty=False,
                requested_by="system_status",
            ):
                drained += 1
            print(f"Marketing funil: jobs drenados={drained}")
        elif action == "clinia_crm":
            drained = 0
            while process_pending_clinia_crm_jobs_once(
                auto_enqueue_if_empty=(drained == 0),
                requested_by="system_status",
            ):
                drained += 1
            print(f"Clinia CRM: jobs drenados={drained}")
        elif action == "clinia_ads":
            drained = 0
            while process_pending_clinia_ads_jobs_once(
                auto_enqueue_if_empty=(drained == 0),
                requested_by="system_status",
            ):
                drained += 1
            print(f"Clinia Ads: jobs drenados={drained}")
        else:
            print(f"⚠️ Ação desconhecida solicitada: {action}")

        elapsed = round(time.time() - start, 2)
        _update_status("COMPLETED", f"Concluído em {elapsed}s")

    except Exception as e:
        print(f"❌ Erro ao rodar serviço {display_name}: {e}")
        _update_status("ERROR", str(e))
    finally:
        try:
            lock.release()
        except RuntimeError:
            pass


def run_service(key: str):
    """Executa/agenda worker por chave mapeada.
    Serviços de scraping de lote que fazem login Feegow são serializados em fila dedicada."""
    action, display_name = canonicalize(key)
    raw_key = str(key).strip() if key is not None else ""

    if action in SERIALIZED_SCRAPER_SERVICES:
        enqueued = _enqueue_serial_service(action, display_name, "run_service", raw_key)
        if not enqueued:
            print(f"⏭️ Serviço já na fila serial/em execução: {display_name}")
        return

    _run_service_direct(action, display_name, raw_key)

def run_hourly_workers():
    """Executa todos os workers não real-time uma vez (usa run_service)."""
    print("⏰ Executando jobs horários: iniciando workers não real-time...")
    # Ordem: appointments (apenas se habilitado), comercial, contratos, auth
    auto_appointments = os.getenv("AUTO_APPOINTMENTS", os.getenv("AUTO_FINANCEIRO", "0")) == "1"
    if auto_appointments:
        run_service('appointments')
    else:
        print("⏭️ Auto-appointments desativado (rodará apenas sob demanda).")
    run_service('comercial')
    run_service('contratos')
    run_service('auth')

def run_heavy_workers():
    """Executa os workers mais pesados em lote."""
    print("⏰ Executando jobs pesados: faturamento, feegow, pacientes, propostas, contratos...")
    run_service('faturamento')
    run_service('appointments')  # Feegow (agendamentos)
    run_service('patients_registry')
    run_service('comercial')
    run_service('contratos')

def run_feegow_hourly():
    """Executa o Feegow (agendamentos) em janela de horário."""
    if not is_working_hours():
        return
    print("⏱️ Executando Feegow (agendamentos) no horário de operação...")
    run_service('appointments')

def run_token_renewal():
    """Roda o Playwright para renovar tokens e salvar no banco"""
    print("\n🔑 Iniciando Renovação de Tokens (Auth)...")
    db = DatabaseManager()
    try:
        db.update_heartbeat("auth", "RUNNING", "Renovando tokens...")
        renewer = FeegowTokenRenewer()
        summary = renewer.obter_tokens() # Isso popula as linhas unit_id 2, 3, 12 no banco
        print("✅ Tokens renovados com sucesso.")
        db.update_heartbeat("auth", "COMPLETED", summary or "Tokens atualizados")
    except Exception as e:
        print(f"❌ Falha na renovação de tokens: {e}")
        db.update_heartbeat("auth", "ERROR", str(e))

def run_clinia_token_renewal():
    """Renova cookie do Clinia e salva no banco"""
    print("\n🔐 Iniciando Renovação de Cookie Clinia (Auth)...")
    db = DatabaseManager()
    try:
        db.update_heartbeat("auth_clinia", "RUNNING", "Renovando cookie Clinia...")
        renewer = CliniaCookieRenewer(db=db)
        cookie = renewer.renew_cookie()
        if not cookie:
            raise RuntimeError("Falha ao obter cookie Clinia")
        print("✅ Cookie Clinia renovado com sucesso.")
        db.update_heartbeat("auth_clinia", "COMPLETED", "Cookie atualizado")
    except Exception as e:
        print(f"❌ Falha na renovação de cookie Clinia: {e}")
        db.update_heartbeat("auth_clinia", "ERROR", str(e))

def run_on_demand_listener():
    print("👂 Listener de Atualizações Manuais iniciado.")
    db = DatabaseManager()
    poll_interval = int(os.getenv("ON_DEMAND_POLL_INTERVAL_SEC", "30"))
    
    while True:
        try:
            pedidos = db.execute_query("""
                SELECT service_name 
                FROM system_status 
                WHERE status IN ('PENDING', 'QUEUED')
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
        try: 
            run_monitor_recepcao()
        except Exception as e: 
            print(f"[WARN] Crash Monitor Recepcao: {e}. Reiniciando em 10s...")
        time.sleep(10)

def run_monitor_medico_safe():
    while True:
        try: 
            run_monitor_medico()
        except Exception as e:
            print(f"[WARN] Crash Monitor Medico: {e}. Reiniciando em 10s...")
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
        print("🌅 Job Diário: Sincronização Auth...")
        try:
            run_token_renewal()
            print("✅ Job Diário Finalizado.")
        except Exception as e:
            print(f"❌ Falha no Job Diário: {e}")

    def run_medico_prewarm_job():
        try:
            print("🩺 Prewarm monitor médico...")
            run_medico_prewarm()
        except Exception as e:
            print(f"⚠️ Falha no prewarm monitor médico: {e}")
        
    # Agendamento
    schedule.every().day.at("05:00").do(run_token_renewal)
    schedule.every().day.at("05:10").do(run_clinia_token_renewal)
    schedule.every().day.at("05:20").do(lambda: run_service('procedures_catalog'))
    schedule.every().day.at("05:30").do(lambda: run_service('patients_registry'))
    schedule.every().day.at("05:25").do(lambda: run_service('clinia_crm'))
    schedule.every().day.at("05:35").do(lambda: run_service('clinia_ads'))
    schedule.every().day.at("05:40").do(lambda: run_service('marketing_funnel'))

    schedule.every().day.at("12:00").do(lambda: run_service('contratos'))

    schedule.every().day.at("12:00").do(run_token_renewal)
    schedule.every().day.at("12:10").do(run_clinia_token_renewal)
    schedule.every().day.at("12:20").do(lambda: run_service('procedures_catalog'))
    schedule.every().day.at("12:30").do(lambda: run_service('patients_registry'))
    schedule.every().day.at("12:25").do(lambda: run_service('clinia_crm'))
    schedule.every().day.at("12:35").do(lambda: run_service('clinia_ads'))
    schedule.every().day.at("18:10").do(lambda: run_service('marketing_funnel'))
    schedule.every().day.at("18:25").do(lambda: run_service('clinia_crm'))
    schedule.every().day.at("18:35").do(lambda: run_service('clinia_ads'))
    # Pré-aquecimento de sessão do monitor médico antes da abertura (08:00)
    schedule.every().day.at("07:40").do(run_medico_prewarm_job)
    schedule.every().day.at("07:45").do(run_medico_prewarm_job)
    schedule.every().day.at("07:50").do(run_medico_prewarm_job)
    schedule.every().day.at("07:55").do(run_medico_prewarm_job)
    # Workers pesados: 14h, 17h, 19h
    schedule.every().day.at("14:00").do(run_heavy_workers)
    schedule.every().day.at("17:00").do(run_heavy_workers)
    schedule.every().day.at("19:00").do(run_heavy_workers)
    # Feegow (agendamentos) de hora em hora dentro do horário de operação
    schedule.every().hour.at(":30").do(run_feegow_hourly)

    while True:
        try:
            schedule.run_pending()
        except Exception as e:
            print(f"⚠️ Scheduler error: {e}")
        time.sleep(60)

def _parse_db_datetime(raw_value):
    if raw_value is None:
        return None

    if isinstance(raw_value, datetime.datetime):
        dt = raw_value
    else:
        raw = str(raw_value).strip()
        if not raw:
            return None
        raw = raw.replace("T", " ").split(".")[0]
        try:
            dt = datetime.datetime.strptime(raw, "%Y-%m-%d %H:%M:%S")
        except Exception:
            return None

    if WORK_TZ is None:
        return dt

    if dt.tzinfo is None:
        # pytz exige localize(); zoneinfo aceita replace(tzinfo=...)
        if hasattr(WORK_TZ, "localize"):
            return WORK_TZ.localize(dt)
        return dt.replace(tzinfo=WORK_TZ)

    return dt.astimezone(WORK_TZ)


def _now_db_ts():
    now = _now_work_tz()
    if now.tzinfo is not None:
        now = now.astimezone(WORK_TZ) if WORK_TZ is not None else now
    return now.strftime("%Y-%m-%d %H:%M:%S")


def _run_serial_queue_executor():
    global _serial_running_action
    print(
        f"📦 Fila serial de scrapers iniciada | services={sorted(SERIALIZED_SCRAPER_SERVICES)} "
        f"poll={SERIAL_QUEUE_POLL_SEC}s"
    )
    while True:
        task = None
        with _serial_queue_lock:
            if _serial_queue:
                task = _serial_queue.popleft()
                _serial_queue_actions.discard(task["action"])
                _serial_running_action = task["action"]

        if not task:
            time.sleep(SERIAL_QUEUE_POLL_SEC)
            continue

        action = task["action"]
        display_name = task.get("display_name") or CANONICAL_NAME.get(action, action)
        raw_key = task.get("raw_key") or action
        reason = task.get("reason") or "queue"

        try:
            wait_sec = max(0, time.time() - float(task.get("queued_at") or time.time()))
            print(f"🚚 Executando da fila serial: {display_name} | wait={wait_sec:.1f}s | reason={reason}")
            _run_service_direct(action, display_name, raw_key)
        finally:
            with _serial_queue_lock:
                if _serial_running_action == action:
                    _serial_running_action = None


def _query_pending_count(db: "DatabaseManager", table_name: str) -> int:
    conn = db.get_connection()
    try:
        rs = conn.execute(
            f"SELECT COUNT(1) AS cnt FROM {table_name} WHERE status = ?",
            ("PENDING",),
        )
        rows = rs.fetchall() if hasattr(rs, "fetchall") else []
    except Exception:
        return 0
    finally:
        conn.close()

    if not rows:
        return 0
    row = rows[0]
    if isinstance(row, (tuple, list)):
        return int(row[0] or 0)
    try:
        return int(getattr(row, "cnt", None) or row.get("cnt") or row.get("COUNT(1)") or 0)
    except Exception:
        return 0


def _recover_stale_jobs(
    db: "DatabaseManager",
    table_name: str,
    service_action: str,
    stale_minutes: int,
) -> int:
    conn = db.get_connection()
    try:
        rs = conn.execute(
            f"""
            SELECT id, period_ref, scope, professional_ids_json, requested_by, started_at, updated_at
            FROM {table_name}
            WHERE status = ?
            ORDER BY updated_at ASC
            """,
            ("RUNNING",),
        )
        rows = rs.fetchall() if hasattr(rs, "fetchall") else []
    except Exception:
        return 0
    finally:
        conn.close()

    if not rows:
        return 0

    now_dt = _now_work_tz()
    now_ts = _now_db_ts()
    recovered = 0

    def _val(row, idx, key):
        if isinstance(row, (tuple, list)):
            return row[idx] if idx < len(row) else None
        if hasattr(row, key):
            return getattr(row, key)
        try:
            return row.get(key)
        except Exception:
            return None

    for row in rows:
        job_id = str(_val(row, 0, "id") or "").strip()
        period_ref = str(_val(row, 1, "period_ref") or "").strip()
        scope = str(_val(row, 2, "scope") or "all").strip() or "all"
        prof_json = _val(row, 3, "professional_ids_json")
        requested_by = str(_val(row, 4, "requested_by") or "auto_recovery").strip() or "auto_recovery"
        started_at = _val(row, 5, "started_at")
        updated_at = _val(row, 6, "updated_at")
        ref_dt = _parse_db_datetime(updated_at) or _parse_db_datetime(started_at)
        if not ref_dt:
            continue

        age_min = (now_dt - ref_dt).total_seconds() / 60.0
        if age_min <= stale_minutes:
            continue

        error_msg = f"auto-recovery: stale ({age_min:.1f}m > {stale_minutes}m)"
        db.execute_query(
            f"""
            UPDATE {table_name}
            SET status = ?, finished_at = ?, error = ?, updated_at = ?
            WHERE id = ?
            """,
            ("FAILED", now_ts, error_msg, now_ts, job_id),
        )

        new_job_id = uuid.uuid4().hex
        db.execute_query(
            f"""
            INSERT INTO {table_name} (
              id, period_ref, scope, professional_ids_json, status, requested_by,
              started_at, finished_at, error, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
            """,
            (new_job_id, period_ref, scope, prof_json, "PENDING", requested_by, now_ts, now_ts),
        )

        recovered += 1
        print(
            f"♻️ Auto-recovery {table_name}: stale job={job_id} "
            f"period={period_ref} -> new_pending={new_job_id}"
        )
        try:
            db.update_heartbeat(
                service_action,
                "WARNING",
                f"stale recovered old={job_id} new={new_job_id} period={period_ref}",
            )
        except Exception:
            pass

    return recovered


def _run_repasse_job_dispatcher():
    print(
        f"🧭 Dispatcher de jobs de repasse iniciado | poll={REPASSE_JOB_DISPATCH_POLL_SEC}s "
        f"stale={REPASSE_JOB_STALE_MINUTES}min"
    )
    db = DatabaseManager()
    while True:
        try:
            _recover_stale_jobs(db, "repasse_sync_jobs", "repasses", REPASSE_JOB_STALE_MINUTES)
            _recover_stale_jobs(db, "repasse_consolidacao_jobs", "repasse_consolidacao", REPASSE_JOB_STALE_MINUTES)

            pending_sync = _query_pending_count(db, "repasse_sync_jobs")
            if pending_sync > 0:
                _enqueue_serial_service("repasses", CANONICAL_NAME["repasses"], f"dispatcher pending={pending_sync}")

            pending_consol = _query_pending_count(db, "repasse_consolidacao_jobs")
            if pending_consol > 0:
                _enqueue_serial_service(
                    "repasse_consolidacao",
                    CANONICAL_NAME["repasse_consolidacao"],
                    f"dispatcher pending={pending_consol}",
                )
        except Exception as e:
            print(f"⚠️ Dispatcher de repasses erro: {e}")

        time.sleep(REPASSE_JOB_DISPATCH_POLL_SEC)

WATCHDOG_ENABLED = str(os.getenv("WATCHDOG_ENABLED", "1")).strip().lower() in ("1", "true", "yes", "on")
WATCHDOG_INTERVAL_SEC = max(10, int(os.getenv("WATCHDOG_INTERVAL_SEC", "60")))
WATCHDOG_STALE_SEC = max(60, int(os.getenv("WATCHDOG_STALE_SEC", "600")))
WATCHDOG_GRACE_SEC = max(0, int(os.getenv("WATCHDOG_GRACE_SEC", "180")))
WATCHDOG_BUSINESS_START = os.getenv("WATCHDOG_BUSINESS_START", "08:00")
WATCHDOG_BUSINESS_END = os.getenv("WATCHDOG_BUSINESS_END", "19:00")
WATCHDOG_STALE_BUSINESS_SEC = max(60, int(os.getenv("WATCHDOG_STALE_BUSINESS_SEC", "180")))
WATCHDOG_STALE_OFFHOURS_SEC = max(120, int(os.getenv("WATCHDOG_STALE_OFFHOURS_SEC", "900")))
WATCHDOG_SERVICES = [
    s.strip()
    for s in str(os.getenv("WATCHDOG_SERVICES", "monitor_medico")).split(",")
    if s.strip()
]

def run_watchdog():
    if not WATCHDOG_ENABLED:
        print("🛡️ Watchdog desativado.")
        return

    print(
        f"🛡️ Watchdog ativo: services={','.join(WATCHDOG_SERVICES)} "
        f"stale_default={WATCHDOG_STALE_SEC}s "
        f"stale_business={WATCHDOG_STALE_BUSINESS_SEC}s "
        f"stale_offhours={WATCHDOG_STALE_OFFHOURS_SEC}s "
        f"window={WATCHDOG_BUSINESS_START}-{WATCHDOG_BUSINESS_END} "
        f"interval={WATCHDOG_INTERVAL_SEC}s tz={WORK_TZ_NAME}"
    )

    db = DatabaseManager()
    started_at = _now_work_tz()

    while True:
        time.sleep(WATCHDOG_INTERVAL_SEC)
        try:
            now = _now_work_tz()
            if WATCHDOG_GRACE_SEC and (now - started_at).total_seconds() < WATCHDOG_GRACE_SEC:
                continue

            if not WATCHDOG_SERVICES:
                continue

            placeholders = ",".join(["?"] * len(WATCHDOG_SERVICES))
            rows = db.execute_query(
                f"""
                SELECT service_name, status, last_run, details
                FROM system_status
                WHERE service_name IN ({placeholders})
                """,
                tuple(WATCHDOG_SERVICES),
            ) or []

            by_name = {r[0]: r for r in rows if isinstance(r, (tuple, list)) and len(r) >= 4}

            for service_name in WATCHDOG_SERVICES:
                row = by_name.get(service_name)
                if not row:
                    continue

                _, status, last_run, details = row
                last_dt = _parse_db_datetime(last_run)
                if last_dt is None:
                    continue

                age_sec = (now - last_dt).total_seconds()
                in_business = _is_within_window(
                    now,
                    WATCHDOG_BUSINESS_START,
                    WATCHDOG_BUSINESS_END,
                    default_start="08:00",
                    default_end="19:00",
                )
                dynamic_stale_sec = WATCHDOG_STALE_BUSINESS_SEC if in_business else WATCHDOG_STALE_OFFHOURS_SEC
                if WATCHDOG_STALE_SEC > 0:
                    dynamic_stale_sec = min(dynamic_stale_sec, WATCHDOG_STALE_SEC)

                if age_sec <= dynamic_stale_sec:
                    continue

                print(
                    f"🛑 [WATCHDOG] {service_name} stale há {int(age_sec)}s "
                    f"(status={status}, details={details}, limit={int(dynamic_stale_sec)}s, "
                    f"in_business={in_business}). Reiniciando processo..."
                )

                try:
                    db.update_heartbeat(
                        service_name,
                        "ERROR",
                        f"Watchdog: travado há {int(age_sec)}s (status={status}). Reiniciando...",
                    )
                except Exception:
                    pass

                # Reinicia o processo para o Railway subir novamente.
                os._exit(1)

        except Exception as e:
            print(f"⚠️ [WATCHDOG] erro: {e}")
            continue

def start_orchestrator():
    # Os emojis abaixo causavam erro no Windows sem o encoding='utf-8'
    print("\n🎹 ORQUESTRADOR HÍBRIDO INICIADO 🎹")
    print(f"🌍 Ambiente: {'RAILWAY/PROD' if os.getenv('RAILWAY_ENVIRONMENT') else 'LOCAL'}")

    # Normaliza nomes duplicados na system_status antes de iniciar threads
    normalize_system_status_rows()
    
    threads = [
        threading.Thread(target=run_on_demand_listener, name="Listener", daemon=True),
        threading.Thread(target=run_scheduler, name="Scheduler", daemon=True),
        threading.Thread(target=run_monitor_recepcao_safe, name="MonRec", daemon=True),
        threading.Thread(target=run_monitor_medico_safe, name="MonMed", daemon=True),
        threading.Thread(target=run_clinia_safe, name="Clinia", daemon=True),
        threading.Thread(target=_run_serial_queue_executor, name="SerialQueue", daemon=True),
        threading.Thread(target=_run_repasse_job_dispatcher, name="RepasseDispatch", daemon=True),
        threading.Thread(target=run_watchdog, name="Watchdog", daemon=True),
    ]

    for t in threads: t.start()

    try:
        while True: time.sleep(10)
    except KeyboardInterrupt:
        print("🛑 Parando Orchestrator...")

if __name__ == "__main__":
    start_orchestrator()

