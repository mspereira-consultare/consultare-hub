import requests
import datetime
import os
import time
import sys
from dotenv import load_dotenv

# Garante path para imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database_manager import DatabaseManager
except ImportError:
    from .database_manager import DatabaseManager

load_dotenv()

# --- CONFIGURAÇÕES DE URL E HEADERS (MANTIDOS ORIGINAIS) ---
API_URL_METADATA = "https://dashboard.clinia.io/api/users-group"
API_URL_MONITOR = "https://dashboard.clinia.io/api/statistics/group/card"
API_URL_REPORT = "https://dashboard.clinia.io/api/statistics/group/chart"
API_URL_APPOINTMENTS = "https://dashboard.clinia.io/api/statistics/appointments"
API_URL_WHATSAPP_COUNT = "https://dashboard.clinia.io/api/whatsapp/chat/count"

# Mapeamento fixo de grupos para o monitor (IDs -> nomes)
CENTRAL_GROUP_ID = "da45d882-5702-439b-8133-3d896d6a8810"
CENTRAL_GROUP_NAME = "Central de relacionamento"
WHATSAPP_GROUP_NAMES = {
    "27a55f28-fcc9-464a-b309-46eae46cac71": "Cancelados",
    CENTRAL_GROUP_ID: CENTRAL_GROUP_NAME,
    "dbfa4605-60ec-4f17-92c5-05c7d90ebcb4": "Resolvesaude",
    "e4f34a9b-6b42-4ab5-9cd8-70f248ef422d": "Verificar pagamentos",
    "4bb619b3-7c61-417a-b175-9ddbffa07e0e": "Aniversariantes",
    "4e20ab85-5a52-454b-8e3a-742afea03e3a": "Aguardando Confirmação"
}

HEADERS = {
    "accept": "application/json",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "priority": "u=1, i",
    "referer": "https://dashboard.clinia.io/statistics",
    "sec-ch-ua": '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
}

# --- FUNÇÕES AUXILIARES ---

def get_clinia_cookie_from_db(db):
    """Busca o token usando o DatabaseManager compatível com Turso/SQLite"""
    try:
        res = db.execute_query("SELECT token FROM integrations_config WHERE service = 'clinia'")
        if res:
            row = res[0]
            # Compatibilidade: Turso retorna objeto ou tupla dependendo do driver
            if isinstance(row, (tuple, list)):
                return row[0]
            if hasattr(row, 'token'): # Objeto linha
                return row.token
            if hasattr(row, '__getitem__'): # Dicionário ou Row
                return row['token']
    except Exception as e:
        print(f"Erro buscando token: {e}")
    return None

def get_params(mode="this-week"):
    now = datetime.datetime.now()
    start_str = now.strftime('%Y-%m-%d') + "T00:00:00.000Z"
    end_str = now.strftime('%Y-%m-%d') + "T23:59:59.999Z"
    
    params = {"type": "this-week", "startDate": start_str, "endDate": end_str}
    if mode == "monitor_current":
        params["search"] = "current"
    return params

def safe_request(url, params=None):
    try:
        response = requests.get(url, params=params, headers=HEADERS, timeout=20)
        if response.status_code in [401, 403]:
            print(f" [401/403] Acesso Negado em {url}. O Cookie pode ter expirado.")
            return None
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Erro na request ({url}): {e}")
        return None

# --- LOOP PRINCIPAL ---

def process_and_save():
    print(f"--- Atualizando Clinia (Híbrido): {datetime.datetime.now().strftime('%H:%M:%S')} ---")
    
    # 1. Conexão Híbrida
    db = DatabaseManager()
    
    # Heartbeat: Avisa que começou
    db.update_heartbeat("clinia", "RUNNING", "Iniciando ciclo...")

    # 2. Configura Cookie
    token_db = get_clinia_cookie_from_db(db)
    if token_db:
        HEADERS['cookie'] = token_db
    else:
        env_token = os.getenv("CLINIA_COOKIE") 
        if env_token: HEADERS['cookie'] = env_token
        else:
            msg = "Sem Token/Cookie configurado"
            print(f" [AVISO] {msg}")
            db.update_heartbeat("clinia", "WARNING", msg)
            return # Encerra se não tem token

    conn = db.get_connection()
    try:
        # 3. Cria Tabelas (Compatível Turso/SQLite)
        # Turso suporta CREATE TABLE IF NOT EXISTS normalmente
        conn.execute('''
            CREATE TABLE IF NOT EXISTS clinia_group_snapshots (
                group_id TEXT PRIMARY KEY, group_name TEXT, queue_size INTEGER DEFAULT 0,
                avg_wait_seconds INTEGER DEFAULT 0, updated_at DATETIME
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS clinia_chat_stats (
                date TEXT PRIMARY KEY, total_conversations INTEGER DEFAULT 0,
                total_without_response INTEGER DEFAULT 0, avg_wait_seconds INTEGER DEFAULT 0,
                updated_at DATETIME
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS clinia_appointment_stats (
                date TEXT PRIMARY KEY, total_appointments INTEGER DEFAULT 0,
                bot_appointments INTEGER DEFAULT 0, crc_appointments INTEGER DEFAULT 0,
                updated_at DATETIME
            )
        ''')
        
        # Se for local, commit nas criações
        if not db.use_turso: conn.commit()

        today_db_str = datetime.datetime.now().strftime('%Y-%m-%d')
        today_json_fmt = datetime.datetime.now().strftime('%d/%m')

        # 4. METADADOS (Request Original Mantida)
        groups_meta = safe_request(API_URL_METADATA)
        group_names_map = {}
        if groups_meta and 'groups' in groups_meta:
            for g in groups_meta['groups']:
                if 'id' in g and 'name' in g:
                    group_names_map[g['id']] = g['name']

        # 5. MONITOR TEMPO REAL (Request Original Mantida)
        monitor_params = get_params(mode="monitor_current")
        monitor_data = safe_request(API_URL_MONITOR, params=monitor_params)

        # 5.1 NOVO ENDPOINT DE CONTAGEM (tempo real)
        count_data = safe_request(API_URL_WHATSAPP_COUNT, params={"filter": "mine", "state": "OPEN"})

        # Mapas auxiliares
        avg_wait_map = {}
        if monitor_data and 'groups' in monitor_data:
            for stat in monitor_data['groups']:
                g_id = stat.get('group_id')
                if g_id:
                    avg_wait_map[g_id] = int(stat.get('avg_waiting_time') or 0)

        counts_map = {}
        count_all = 0
        if count_data and isinstance(count_data, dict):
            count_root = count_data.get('count') or {}
            count_all = int(count_root.get('all') or 0)
            for g in count_root.get('groups') or []:
                g_id = g.get('id')
                if g_id:
                    counts_map[g_id] = int(g.get('count') or 0)
        if count_all <= 0 and counts_map:
            count_all = sum(counts_map.values())

        # Decide quais grupos inserir: mapping fixo + ids retornados
        group_ids = set(WHATSAPP_GROUP_NAMES.keys()) | set(counts_map.keys())
        group_ids.add(CENTRAL_GROUP_ID)

        if group_ids:
            # Limpa tabela snapshot antes de inserir o estado atual
            conn.execute("DELETE FROM clinia_group_snapshots")

            for g_id in group_ids:
                if g_id == CENTRAL_GROUP_ID:
                    g_name = CENTRAL_GROUP_NAME
                else:
                    g_name = WHATSAPP_GROUP_NAMES.get(g_id) or "Não identificado"
                queue = int(counts_map.get(g_id, 0))
                wait_time = int(avg_wait_map.get(g_id, 0))
                conn.execute('''
                    INSERT INTO clinia_group_snapshots (group_id, group_name, queue_size, avg_wait_seconds, updated_at)
                    VALUES (?, ?, ?, ?, datetime('now'))
                ''', (g_id, g_name, queue, wait_time))

            # Linha global com o total "all" (usada pela API para o card)
            conn.execute('''
                INSERT INTO clinia_group_snapshots (group_id, group_name, queue_size, avg_wait_seconds, updated_at)
                VALUES (?, ?, ?, ?, datetime('now'))
            ''', ("__global__", "__GLOBAL__", int(count_all), 0))

            print(" -> Monitor atualizado (contagem em tempo real).")

        # 6. RELATÓRIO DIÁRIO (Request Original Mantida)
        report_params = get_params(mode="report_history")
        report_data = safe_request(API_URL_REPORT, params=report_params)

        if report_data and 'groups' in report_data:
            total_conv = 0
            total_no_resp = 0
            total_wait_sum = 0
            groups_count = 0

            for group in report_data['groups']:
                daily_convs = group.get('group_conversations_per_day', [])
                daily_waits = group.get('waiting_time_per_day', [])

                today_conv = next((item for item in daily_convs if item.get('date') == today_json_fmt), None)
                today_wait = next((item for item in daily_waits if item.get('date') == today_json_fmt), None)

                if today_conv:
                    total_conv += today_conv.get('conversation', 0)
                    total_no_resp += today_conv.get('without_response_conversation', 0)
                
                if today_wait:
                    w = today_wait.get('avg', 0)
                    if w > 0:
                        total_wait_sum += w
                        groups_count += 1
            
            avg_wait_final = int(total_wait_sum / groups_count) if groups_count > 0 else 0

            conn.execute('''
                INSERT INTO clinia_chat_stats (date, total_conversations, total_without_response, avg_wait_seconds, updated_at)
                VALUES (?, ?, ?, ?, datetime('now'))
                ON CONFLICT(date) DO UPDATE SET
                    total_conversations = excluded.total_conversations,
                    total_without_response = excluded.total_without_response,
                    avg_wait_seconds = excluded.avg_wait_seconds,
                    updated_at = excluded.updated_at
            ''', (today_db_str, total_conv, total_no_resp, avg_wait_final))
            print(f" -> Relatório do dia: {total_conv} conversas.")

        # 7. AGENDAMENTOS (Request Original Mantida)
        appt_params = {
            "type": "specific",
            "startDate": monitor_params["startDate"],
            "endDate": monitor_params["endDate"]
        }
        appt_data = safe_request(API_URL_APPOINTMENTS, params=appt_params)
        
        if appt_data and 'current' in appt_data:
            curr = appt_data['current']
            total_appts = curr.get('appointmentsTotal', 0)
            bot_appts = curr.get('appointmentsCreatedByBot', 0)
            crc_appts = total_appts - bot_appts 
            if crc_appts < 0: crc_appts = 0

            conn.execute('''
                INSERT INTO clinia_appointment_stats (date, total_appointments, bot_appointments, crc_appointments, updated_at)
                VALUES (?, ?, ?, ?, datetime('now'))
                ON CONFLICT(date) DO UPDATE SET
                    total_appointments = excluded.total_appointments,
                    bot_appointments = excluded.bot_appointments,
                    crc_appointments = excluded.crc_appointments,
                    updated_at = excluded.updated_at
            ''', (today_db_str, total_appts, bot_appts, crc_appts))
            print(" -> Agendamentos atualizados.")

        # Commit final (só necessário se local)
        if not db.use_turso: conn.commit()
        
        # Heartbeat: Sucesso
        db.update_heartbeat("clinia", "ONLINE", "Dados sincronizados")

    except Exception as e:
        err_msg = str(e)
        print(f"❌ Erro Clinia: {err_msg}")
        db.update_heartbeat("clinia", "ERROR", err_msg)
    finally:
        conn.close()

if __name__ == "__main__":
    print("--- Iniciando Worker Clinia (Loop Infinito) ---")
    while True:
        try:
            process_and_save()
        except Exception as e:
            print(f"Erro fatal no loop: {e}")
        time.sleep(30)
