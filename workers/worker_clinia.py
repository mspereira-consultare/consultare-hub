import requests
import sqlite3
import datetime
import os
import time
import json

# --- CONFIGURAÇÕES ---
DB_PATH = os.path.join(os.path.dirname(__file__), '../data/dados_clinica.db')

# URLs
API_URL_METADATA = "https://dashboard.clinia.io/api/users-group"
API_URL_MONITOR = "https://dashboard.clinia.io/api/statistics/group/card" # Fila Agora
API_URL_REPORT = "https://dashboard.clinia.io/api/statistics/group/chart"  # Histórico/Dia
API_URL_APPOINTMENTS = "https://dashboard.clinia.io/api/statistics/appointments"

# HEADER (Mantenha seu Cookie atualizado aqui)
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
    # INSIRA SEU COOKIE ATUALIZADO ABAIXO
    "cookie": "_hjSessionUser_5172862=eyJpZCI6IjFkNzg0YmM4LWQ2ZmUtNTQxNC1hNWRlLWNjOTM5ODJlNTkyZCIsImNyZWF0ZWQiOjE3Njc3MDc0NTQyNTYsImV4aXN0aW5nIjp0cnVlfQ==; _gcl_au=1.1.2106454193.1767788884; _ga=GA1.1.1855253267.1767788884; _fbp=fb.1.1767788884415.997373546558420173; _ga_NKRK03SR2L=GS2.1.s1767791522$o2$g1$t1767791691$j32$l0$h355565389; __Host-next-auth.csrf-token=6742b8785587b091b48b20be4b3064f9222e095eb99a5b799cbc4b448036bc90%7C4ed542cf42453fea07bf9fc8d0b51036dcdc139ca8297fedc835acc8c00f3b2b; __Secure-next-auth.callback-url=https%3A%2F%2Fdashboard.clinia.io%2F%2F; _hjSession_5172862=eyJpZCI6ImRlMWUxN2UzLTNhOTMtNGI0Ni04MTA3LTgwNzMxOTdiOWZiMCIsImMiOjE3NjgyNDYwMTQxMzYsInMiOjAsInIiOjAsInNiIjowLCJzciI6MCwic2UiOjAsImZzIjowLCJzcCI6MH0=; __Secure-next-auth.session-token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..yOtb9D8ph6k5IU8q.t4iSOylteTkj4UzpgVd9WARoxsYnSW--k8Nc1bmgKQK8_SNstKatRFfOgnWHb5rSzRaoS_2dDOYPOC_c-E54ZOPtrPeCkCXjzup8AGP_eyXYDFZRqgTZ54vj0zHmVF9cPVE8xfv7jEQRddbaRZnaytelJXfBNjNeidTcuAcWqN6-WyB4KDj4-a8Y12KmdGrKZTK3HF4DfC7olx7T-enBt-uKaSxBsQewUq-gBNiJhnyLwrou-CdI-sDVoEZMR9Ttc9anWrNLNNCI6ywJL9zVZI478wkvX2FkKyc8btMSaFawP5q1OFiGGDc9-Dc24qS6NN_4b5IUeje2ZdLds10TJPQ9zBUV8EqLuksZSF1YasWD7vvfIKbewVejrSOaT-lcRsUdE6FH8XQ.gznwRM2Ijc_5HeXf1lHGCA"
}

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def get_params(mode="this-week"):
    now = datetime.datetime.now()
    start_str = now.strftime('%Y-%m-%d') + "T00:00:00.000Z"
    end_str = now.strftime('%Y-%m-%d') + "T23:59:59.999Z"
    
    params = {
        "type": "this-week", 
        "startDate": start_str,
        "endDate": end_str
    }
    
    if mode == "monitor_current":
        params["search"] = "current"
        
    return params

def safe_request(url, params=None):
    try:
        response = requests.get(url, params=params, headers=HEADERS, timeout=20)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Erro na request ({url}): {e}")
        return None

def process_and_save():
    print(f"--- Atualizando Clinia: {datetime.datetime.now()} ---")
    conn = get_db_connection()
    cursor = conn.cursor()

    # Cria tabelas (Snapshot, Chat Stats, Appointments)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS clinia_group_snapshots (
            group_id TEXT PRIMARY KEY,
            group_name TEXT,
            queue_size INTEGER DEFAULT 0,
            avg_wait_seconds INTEGER DEFAULT 0,
            updated_at DATETIME
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS clinia_chat_stats (
            date TEXT PRIMARY KEY,
            total_conversations INTEGER DEFAULT 0,
            total_without_response INTEGER DEFAULT 0,
            avg_wait_seconds INTEGER DEFAULT 0,
            updated_at DATETIME
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS clinia_appointment_stats (
            date TEXT PRIMARY KEY,
            total_appointments INTEGER DEFAULT 0,
            bot_appointments INTEGER DEFAULT 0,
            crc_appointments INTEGER DEFAULT 0,
            updated_at DATETIME
        )
    ''')

    today_db_str = datetime.datetime.now().strftime('%Y-%m-%d')
    today_json_fmt = datetime.datetime.now().strftime('%d/%m')

    # 1. METADADOS (Nomes)
    print(" Buscando nomes (/users-group)...")
    groups_meta = safe_request(API_URL_METADATA)
    group_names_map = {}
    
    # CORREÇÃO: Acessa a chave 'groups' que descobrimos no teste
    if groups_meta and isinstance(groups_meta, dict) and 'groups' in groups_meta:
        for g in groups_meta['groups']:
            if 'id' in g and 'name' in g:
                group_names_map[g['id']] = g['name']
        print(f" -> Nomes carregados: {len(group_names_map)} grupos mapeados.")
    else:
        print(" -> [AVISO] Falha ao ler estrutura de nomes. Verifique o cookie.")

    # 2. MONITOR TEMPO REAL (Fila Agora)
    print(" Buscando Monitor (/card?search=current)...")
    monitor_params = get_params(mode="monitor_current")
    monitor_data = safe_request(API_URL_MONITOR, params=monitor_params)

    if monitor_data and 'groups' in monitor_data:
        cursor.execute("DELETE FROM clinia_group_snapshots")
        for stat in monitor_data['groups']:
            g_id = stat.get('group_id')
            # Usa o nome mapeado ou fallback
            g_name = group_names_map.get(g_id, f"Grupo {g_id[:4]}..." if g_id else "Desconhecido")
            
            queue = stat.get('number_of_without_responses', 0)
            wait_time = stat.get('avg_waiting_time') or 0
            
            if g_id:
                cursor.execute('''
                    INSERT INTO clinia_group_snapshots (group_id, group_name, queue_size, avg_wait_seconds, updated_at)
                    VALUES (?, ?, ?, ?, datetime('now'))
                ''', (g_id, g_name, int(queue), int(wait_time)))
        print(" -> Monitor atualizado.")

    # 3. RELATÓRIO DIÁRIO (Totais acumulados)
    print(" Buscando Relatório (/chart?type=this-week)...")
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

            # Filtra pelo dia de hoje (ex: 12/01)
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

        cursor.execute('''
            INSERT INTO clinia_chat_stats (date, total_conversations, total_without_response, avg_wait_seconds, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(date) DO UPDATE SET
                total_conversations = excluded.total_conversations,
                total_without_response = excluded.total_without_response,
                avg_wait_seconds = excluded.avg_wait_seconds,
                updated_at = excluded.updated_at
        ''', (today_db_str, total_conv, total_no_resp, avg_wait_final))
        print(f" -> Relatório do dia: {total_conv} conversas.")

    # 4. AGENDAMENTOS
    print(" Buscando Agendamentos...")
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

        cursor.execute('''
            INSERT INTO clinia_appointment_stats (date, total_appointments, bot_appointments, crc_appointments, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(date) DO UPDATE SET
                total_appointments = excluded.total_appointments,
                bot_appointments = excluded.bot_appointments,
                crc_appointments = excluded.crc_appointments,
                updated_at = excluded.updated_at
        ''', (today_db_str, total_appts, bot_appts, crc_appts))
        print(" -> Agendamentos atualizados.")

    conn.commit()
    conn.close()

if __name__ == "__main__":
    print("--- Iniciando Worker Clinia (Loop Infinito) ---")
    while True:
        try:
            process_and_save()
        except Exception as e:
            print(f"Erro fatal no loop: {e}")
        time.sleep(30)