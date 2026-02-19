import sqlite3
import os
import sys
import logging
import pandas as pd
import traceback
import hashlib
import pytz
import time
import threading
import re
from urllib.parse import urlparse, parse_qs, unquote
from dotenv import load_dotenv
from datetime import datetime, timedelta

tz = pytz.timezone("America/Sao_Paulo")

# Tenta importar o cliente Turso (HTTP)
try:
    import libsql_client
    HAS_TURSO_LIB = True
except ImportError:
    HAS_TURSO_LIB = False

try:
    import pymysql
    HAS_MYSQL_LIB = True
except ImportError:
    HAS_MYSQL_LIB = False

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(BASE_DIR)
load_dotenv()

LOCAL_DB_PATH = os.path.join(BASE_DIR, 'data', 'dados_clinica.db')

# ---- Logging ----
LOG_LEVEL = str(os.getenv("LOG_LEVEL", "info")).strip().lower()
DB_DEBUG = str(os.getenv("DB_DEBUG", "")).strip().lower() in ("1", "true", "yes", "debug")
_logged_messages = set()

def _log_once(message, key):
    if key in _logged_messages:
        return
    print(message)
    _logged_messages.add(key)

def _log_debug_once(message, key):
    if not (DB_DEBUG or LOG_LEVEL == "debug"):
        return
    _log_once(message, key)

# ---- Cache/Ratelimit (in-memory) ----
# Defaults can be overridden via env vars.
HEARTBEAT_MIN_INTERVAL_SEC = max(0, int(os.getenv("HEARTBEAT_MIN_INTERVAL_SEC", "30")))
ESPERA_UPSERT_MIN_INTERVAL_SEC = max(0, int(os.getenv("ESPERA_UPSERT_MIN_INTERVAL_SEC", "60")))
RECEPCAO_UPSERT_MIN_INTERVAL_SEC = max(0, int(os.getenv("RECEPCAO_UPSERT_MIN_INTERVAL_SEC", "60")))

_heartbeat_cache = {}
_heartbeat_lock = threading.Lock()

_espera_cache = {}
_espera_lock = threading.Lock()

_recepcao_cache = {}
_recepcao_lock = threading.Lock()


class MySQLResultAdapter:
    def __init__(self, rows=None):
        self._rows = rows or []

    @property
    def rows(self):
        return self._rows

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return self._rows

    def __iter__(self):
        return iter(self._rows)


class MySQLConnectionAdapter:
    def __init__(self, conn, translator):
        self._conn = conn
        self._translator = translator

    def execute(self, sql, params=()):
        translated, translated_params = self._translator(sql, params)
        final_params = tuple(translated_params) if translated_params else ()
        with self._conn.cursor() as cursor:
            cursor.execute(translated, final_params)
            rows = cursor.fetchall() if cursor.description else []
        return MySQLResultAdapter(rows)

    def executemany(self, sql, seq_of_params):
        translated, _ = self._translator(sql, ())
        with self._conn.cursor() as cursor:
            cursor.executemany(translated, seq_of_params)
        return None

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()

    def cursor(self):
        return self._conn.cursor()

def _should_write_heartbeat(service_name, status, details):
    if HEARTBEAT_MIN_INTERVAL_SEC <= 0:
        return True
    now = time.time()
    details_str = "" if details is None else str(details)
    with _heartbeat_lock:
        prev = _heartbeat_cache.get(service_name)
        if not prev:
            _heartbeat_cache[service_name] = {
                "status": status,
                "details": details_str,
                "last_write": now
            }
            return True
        changed = (prev["status"] != status) or (prev["details"] != details_str)
        stale = (now - prev["last_write"]) >= HEARTBEAT_MIN_INTERVAL_SEC
        if changed or stale:
            _heartbeat_cache[service_name] = {
                "status": status,
                "details": details_str,
                "last_write": now
            }
            return True
        return False

def _should_upsert_espera(hash_id, status, espera_minutos, profissional):
    if ESPERA_UPSERT_MIN_INTERVAL_SEC <= 0:
        return True
    now = time.time()
    status_str = "" if status is None else str(status)
    prof_str = "" if profissional is None else str(profissional)
    espera_val = espera_minutos if espera_minutos is None else int(espera_minutos)
    with _espera_lock:
        prev = _espera_cache.get(hash_id)
        if not prev:
            _espera_cache[hash_id] = {
                "status": status_str,
                "espera": espera_val,
                "prof": prof_str,
                "last_write": now
            }
            return True
        changed = (
            prev["status"] != status_str or
            prev["espera"] != espera_val or
            prev["prof"] != prof_str
        )
        stale = (now - prev["last_write"]) >= ESPERA_UPSERT_MIN_INTERVAL_SEC
        if changed or stale:
            _espera_cache[hash_id] = {
                "status": status_str,
                "espera": espera_val,
                "prof": prof_str,
                "last_write": now
            }
            return True
        return False

def _clear_espera_cache():
    with _espera_lock:
        _espera_cache.clear()

def _should_upsert_recepcao(hash_id, status, dt_atendimento):
    if RECEPCAO_UPSERT_MIN_INTERVAL_SEC <= 0:
        return True
    now = time.time()
    status_str = "" if status is None else str(status)
    dt_str = "" if dt_atendimento is None else str(dt_atendimento)
    with _recepcao_lock:
        prev = _recepcao_cache.get(hash_id)
        if not prev:
            _recepcao_cache[hash_id] = {
                "status": status_str,
                "dt_atendimento": dt_str,
                "last_write": now
            }
            return True
        changed = (
            prev["status"] != status_str or
            prev["dt_atendimento"] != dt_str
        )
        stale = (now - prev["last_write"]) >= RECEPCAO_UPSERT_MIN_INTERVAL_SEC
        if changed or stale:
            _recepcao_cache[hash_id] = {
                "status": status_str,
                "dt_atendimento": dt_str,
                "last_write": now
            }
            return True
        return False

def gerar_hash(raw_id):
    return hashlib.md5(raw_id.encode()).hexdigest()

class DatabaseManager:
    def __init__(self):
        self.db_provider = str(os.getenv("DB_PROVIDER", "")).strip().lower()
        self.turso_url = os.getenv("TURSO_URL")
        self.turso_token = os.getenv("TURSO_TOKEN")
        self.mysql_url = os.getenv("MYSQL_URL")
        self.use_mysql = False
        self.mysql_config = None

        debug_msg = (
            f"DEBUG [DB] provider={self.db_provider or 'auto'} "
            f"turso_url={'set' if os.getenv('TURSO_URL') else 'missing'} "
            f"turso_token={'set' if os.getenv('TURSO_TOKEN') else 'missing'} "
            f"turso_lib={HAS_TURSO_LIB} mysql_lib={HAS_MYSQL_LIB} "
            f"mysql_url={'set' if self.mysql_url else 'missing'}"
        )
        _log_debug_once(debug_msg, "db_debug")
        
        # --- FIX PARA ERRO 505 ---
        # Força o uso de HTTPS em vez de libsql:// ou wss://
        # O cliente Python funciona melhor com HTTP puro em alguns ambientes
        if self.turso_url:
            self.turso_url = self.turso_url.replace("libsql://", "https://").replace("wss://", "https://")

        if self.db_provider == "mysql":
            if not HAS_MYSQL_LIB:
                raise RuntimeError("DB_PROVIDER=mysql, mas pymysql nao esta instalado.")
            self.mysql_url = self._resolve_mysql_url(self.mysql_url)
            if not self.mysql_url:
                raise RuntimeError("DB_PROVIDER=mysql, mas MYSQL_URL nao esta configurada.")
            self.mysql_config = self._parse_mysql_url(self.mysql_url)
            self.use_mysql = True
            self.use_turso = False
        elif self.db_provider == "turso":
            self.use_turso = HAS_TURSO_LIB and self.turso_url and "https" in self.turso_url
            self.use_mysql = False
        else:
            # Modo legado: Turso quando disponível; caso contrário local SQLite
            self.use_turso = HAS_TURSO_LIB and self.turso_url and "https" in self.turso_url
            self.use_mysql = False

        self.db_path = LOCAL_DB_PATH
        
        if self.use_mysql:
            _log_once(
                f"🛢️ [DB] Usando MYSQL: {self.mysql_config.get('host')}:{self.mysql_config.get('port')}/{self.mysql_config.get('database')}",
                "db_provider:mysql",
            )
        elif not self.use_turso:
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            _log_once(f"🔌 [DB] Usando LOCAL (SQLite): {self.db_path}", "db_provider:local")
        else:
            _log_once("☁️ [DB] Usando NUVEM (Turso HTTPS)", "db_provider:turso")

        self._init_db()

    def _parse_mysql_url(self, raw_url):
        parsed = urlparse(raw_url)
        if not parsed.scheme.lower().startswith("mysql"):
            raise RuntimeError("MYSQL_URL invalida: esquema deve ser mysql://")

        qs = parse_qs(parsed.query or "")
        ssl_mode = str((qs.get("sslmode", [""])[0] or "")).lower()
        disable_ssl_by_url = ssl_mode in ("disable", "false")
        disable_ssl_by_env = str(os.getenv("MYSQL_FORCE_SSL", "")).lower() in ("0", "false", "no")
        use_ssl = not (disable_ssl_by_url or disable_ssl_by_env)

        cfg = {
            "host": parsed.hostname,
            "port": int(parsed.port or 3306),
            "user": unquote(parsed.username or ""),
            "password": unquote(parsed.password or ""),
            "database": unquote((parsed.path or "").lstrip("/")),
            "charset": "utf8mb4",
            "autocommit": False,
            "connect_timeout": int(os.getenv("MYSQL_CONNECT_TIMEOUT_SEC", "10")),
            "cursorclass": pymysql.cursors.Cursor
        }
        if use_ssl:
            cfg["ssl"] = {}
        return cfg

    def _resolve_mysql_url(self, raw_url):
        internal = raw_url or ""
        public = os.getenv("MYSQL_PUBLIC_URL") or ""
        if not internal and public:
            return public
        if not internal:
            return internal

        try:
            parsed = urlparse(internal)
            host = (parsed.hostname or "").lower()
            is_internal = host.endswith(".railway.internal")
            is_railway_runtime = bool(os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("RAILWAY_PROJECT_ID"))
            if is_internal and not is_railway_runtime and public:
                _log_once(
                    "Host MySQL interno detectado fora do Railway. Usando MYSQL_PUBLIC_URL.",
                    "mysql_public_fallback"
                )
                return public
        except Exception:
            pass

        return internal

    def _translate_sql_for_mysql(self, sql, params=()):
        if not sql:
            return sql, params
        translated = str(sql)

        pragma_match = re.match(r"^\s*PRAGMA\s+table_info\((.+)\)\s*;?\s*$", translated, flags=re.IGNORECASE)
        if pragma_match:
            raw_table = str(pragma_match.group(1) or "").strip()
            table_name = raw_table.strip("`'\"")
            translated = """
                SELECT COLUMN_NAME as name
                FROM information_schema.columns
                WHERE table_schema = DATABASE() AND table_name = %s
                ORDER BY ORDINAL_POSITION
            """
            return translated, (table_name,)

        translated = re.sub(r"datetime\('now'\)", "NOW()", translated, flags=re.IGNORECASE)
        translated = re.sub(r"date\('now'\)", "CURDATE()", translated, flags=re.IGNORECASE)
        translated = re.sub(r"INSERT\s+OR\s+REPLACE\s+INTO", "REPLACE INTO", translated, flags=re.IGNORECASE)
        if re.search(r"ON\s+CONFLICT\s*\(", translated, flags=re.IGNORECASE):
            translated = re.sub(
                r"ON\s+CONFLICT\s*\([^)]+\)\s*DO\s+UPDATE\s+SET",
                "ON DUPLICATE KEY UPDATE",
                translated,
                flags=re.IGNORECASE
            )
            translated = re.sub(r"\bexcluded\.([A-Za-z0-9_]+)", r"VALUES(\1)", translated, flags=re.IGNORECASE)
        translated = translated.replace("?", "%s")
        # Escapa percentuais literais para evitar erro de formatting do PyMySQL
        translated = re.sub(r"%(?!s|%)", "%%", translated)
        return translated, params

    def get_connection(self):
        """Retorna conexão apropriada (Objeto Turso ou SQLite Connection)"""
        if self.use_mysql:
            raw_conn = pymysql.connect(**self.mysql_config)
            return MySQLConnectionAdapter(raw_conn, self._translate_sql_for_mysql)
        if self.use_turso:
            # Usa 'auth_token' (snake_case) para o Python
            return libsql_client.create_client_sync(url=self.turso_url, auth_token=self.turso_token)
        else:
            return sqlite3.connect(self.db_path)

    def _init_db(self):
        """Cria as tabelas necessárias"""
        conn = self.get_connection()
        try:
            queries = [
                # Tabela de Status do Sistema (Heartbeat)
                """CREATE TABLE IF NOT EXISTS system_status (
                    service_name TEXT PRIMARY KEY, status TEXT, last_run TEXT, details TEXT
                )""",
                # Tabela de Configurações
                """CREATE TABLE IF NOT EXISTS integrations_config (
                    service TEXT, 
                    username TEXT, 
                    password TEXT, 
                    token TEXT, 
                    unit_id TEXT, 
                    cookies TEXT,
                    updated_at TEXT,
                    PRIMARY KEY (service, unit_id)
                )""",
                # Tabela Fila Médica
                """CREATE TABLE IF NOT EXISTS espera_medica (
                    hash_id TEXT PRIMARY KEY,
                    unidade TEXT,
                    paciente TEXT,
                    chegada TEXT,
                    espera TEXT,
                    status TEXT,
                    profissional TEXT,
                    updated_at TEXT
                )""",
                # Tabela Fila Recepção
                """CREATE TABLE IF NOT EXISTS recepcao_historico (
                    hash_id TEXT PRIMARY KEY,
                    id_externo INTEGER,
                    unidade_id INTEGER,
                    unidade_nome TEXT,
                    paciente_nome TEXT,
                    dt_chegada TEXT,
                    dt_atendimento TEXT,
                    status TEXT,
                    dia_referencia TEXT,
                    updated_at TEXT
                )"""
            ]

            if self.use_turso:
                for q in queries: conn.execute(q)
            elif self.use_mysql:
                for q in queries:
                    conn.execute(q)
                conn.commit()
            else:
                cursor = conn.cursor()
                cursor.execute("PRAGMA journal_mode=WAL;")
                for q in queries: cursor.execute(q)
                conn.commit()
                
        except Exception as e:
            print(f"⚠️ Erro _init_db: {e}")
        finally:
            conn.close()

    # --- MÉTODO GENÉRICO PARA HEARTBEAT ---
    def update_heartbeat(self, service_name, status, details=""):
        if not _should_write_heartbeat(service_name, status, details):
            return
        conn = self.get_connection()
        try:
            agora = datetime.now(tz).strftime('%Y-%m-%d %H:%M:%S')
            sql = """
                INSERT INTO system_status (service_name, status, last_run, details)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(service_name) DO UPDATE SET
                    status = excluded.status,
                    last_run = excluded.last_run,
                    details = excluded.details
            """
            params = (service_name, status, agora, str(details))
            
            if self.use_turso:
                conn.execute(sql, params)
            else:
                conn.execute(sql, params)
                conn.commit()
        except Exception as e:
            print(f"⚠️ Erro Heartbeat ({service_name}): {e}")
        finally:
            conn.close()

    # --- MÉTODO GENÉRICO DE QUERY ---
    def execute_query(self, sql, params=()):
        conn = self.get_connection()
        try:
            if self.use_turso:
                rs = conn.execute(sql, params)
                return rs.rows
            elif self.use_mysql:
                rs = conn.execute(sql, params)
                rows = rs.fetchall() if hasattr(rs, 'fetchall') else []
                conn.commit()
                return rows
            else:
                cursor = conn.cursor()
                rs = cursor.execute(sql, params).fetchall()
                conn.commit()
                return rs
        except Exception as e:
            print(f"❌ Erro Query: {e}")
            return []
        finally:
            conn.close()

    # --- LÓGICA MÉDICA ---
    def salvar_dados_medicos(self, df):
        if df.empty: return
        conn = self.get_connection()
        try:
            agora = datetime.now(tz).strftime('%Y-%m-%d %H:%M:%S')

            for _, row in df.iterrows():
                hash_id = str(row.get('hash_id') or '').strip()
                if not hash_id:
                    raw_id = f"{row.get('UNIDADE')}-{row.get('PACIENTE')}-{row.get('CHEGADA')}"
                    hash_id = gerar_hash(raw_id)

                espera_raw = row.get('ESPERA_MINUTOS')
                try:
                    espera = int(espera_raw)
                except:
                    espera = None

                sql = """
                    INSERT INTO espera_medica 
                    (hash_id, unidade, paciente, chegada, espera_minutos, status, profissional, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(hash_id) DO UPDATE SET
                        espera_minutos = excluded.espera_minutos,
                        status = excluded.status,
                        profissional = excluded.profissional,
                        updated_at = excluded.updated_at
                """
                params = (
                    hash_id, row.get('UNIDADE'), row.get('PACIENTE'),
                    row.get('CHEGADA'), espera,
                    row.get('STATUS_DETECTADO'), row.get('PROFISSIONAL'), agora
                )

                if _should_upsert_espera(
                    hash_id,
                    row.get('STATUS_DETECTADO'),
                    espera,
                    row.get('PROFISSIONAL')
                ):
                    conn.execute(sql, params)

            if not self.use_turso:
                conn.commit()

        except Exception as e:
            print(f"Erro salvar médicos: {e}")
        finally:
            conn.close()


    def finalizar_expirados_medicos(self, nome_unidade, minutos=60):
        conn = self.get_connection()
        try:
            agora = datetime.now(tz).strftime('%Y-%m-%d %H:%M:%S')
            limite = (datetime.now(tz) - timedelta(minutes=minutos)).strftime('%Y-%m-%d %H:%M:%S')
            limite_hard = (datetime.now(tz) - timedelta(hours=24)).strftime('%Y-%m-%d %H:%M:%S')

            # Remove registros ativos muito antigos (ruido de sessoes passadas).
            sql_delete = """
                DELETE FROM espera_medica
                WHERE unidade = ?
                AND (status IS NULL OR status NOT LIKE ?)
                AND updated_at < ?
            """
            conn.execute(sql_delete, (nome_unidade, "Finalizado%", limite_hard))

            sql = """
                UPDATE espera_medica
                SET status = 'Finalizado (Saiu)', updated_at = ?
                WHERE unidade = ?
                AND (status IS NULL OR status NOT LIKE ?)
                AND updated_at < ?
                AND updated_at >= ?
            """

            conn.execute(sql, (agora, nome_unidade, "Finalizado%", limite, limite_hard))

            if not self.use_turso:
                conn.commit()

            # Sem invalidar esse cache, pacientes podem ficar presos como finalizados.
            _clear_espera_cache()

        except Exception as e:
            print(f"Erro finalizar expirados medicos: {e}")
        finally:
            conn.close()

    # --- LÓGICA RECEPÇÃO ---
    def salvar_dados_recepcao(self, dados_brutos):
        if not dados_brutos: return
        conn = self.get_connection()
        try:
            agora = datetime.now(tz).strftime('%Y-%m-%d %H:%M:%S')
            horario_atual = datetime.now(tz).strftime('%H:%M:%S') # Captura apenas a hora
            dia_ref = datetime.now(tz).strftime('%Y-%m-%d')

            for item in dados_brutos:
                id_ext = item.get('id')
                uid = item.get('UnidadeID') or item.get('UnidadeID_Coleta')
                unidade_nome = "Desconhecida"
                if uid == 2: unidade_nome = "Ouro Verde"
                elif uid == 3: unidade_nome = "Centro Cambui"
                elif uid == 12: unidade_nome = "Campinas Shopping"

                paciente = (
                    item.get('PacienteNome')
                    or item.get('Paciente')
                    or item.get('NomePaciente')
                    or item.get('patient_name')
                    or item.get('name')
                    or 'Desconhecido'
                )

                dt_chegada_raw = (
                    item.get('DataChegada')
                    or item.get('Chegada')
                    or item.get('DataEntrada')
                    or item.get('arrived_at')
                    or dia_ref
                )
                dt_chegada_raw = str(dt_chegada_raw).strip()
                # Se veio apenas data (YYYY-MM-DD), anexa hora atual para manter datetime.
                if len(dt_chegada_raw) <= 10 and ' ' not in dt_chegada_raw and 'T' not in dt_chegada_raw:
                    dt_chegada = f"{dt_chegada_raw} {horario_atual}"
                else:
                    dt_chegada = dt_chegada_raw.replace('T', ' ')

                dt_atend = (
                    item.get('DataAtendimento')
                    or item.get('Atendimento')
                    or item.get('DataFinalizacao')
                    or item.get('finished_at')
                )
                if dt_atend is not None:
                    dt_atend = str(dt_atend).strip().replace('T', ' ')

                status = (
                    item.get('StatusNome')
                    or item.get('Status')
                    or item.get('status')
                    or 'Indefinido'
                )


                hash_id = f"REC_{id_ext}_{uid}"

                sql = """
                    INSERT INTO recepcao_historico (
                        hash_id, id_externo, unidade_id, unidade_nome, paciente_nome,
                        dt_chegada, dt_atendimento, status, dia_referencia, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(hash_id) DO UPDATE SET
                        status = excluded.status,
                        updated_at = excluded.updated_at
                """
                # Removido dt_atendimento do UPDATE para que o finalizar_ausentes tenha prioridade sobre ele
                
                params = (hash_id, id_ext, uid, unidade_nome, paciente, dt_chegada, dt_atend, status, dia_ref, agora)

                if _should_upsert_recepcao(hash_id, status, dt_atend):
                    conn.execute(sql, params)

            if not self.use_turso: conn.commit()
        except Exception as e:
            print(f"Erro salvar recepção: {e}")
        finally:
            conn.close()

    def finalizar_ausentes_recepcao(self, unidade_id, ids_ativos):
        """Marca como finalizado quem sumiu da lista da API"""
        conn = self.get_connection()
        try:
            agora = datetime.now(tz).strftime('%Y-%m-%d %H:%M:%S')
            hoje = datetime.now(tz).date().isoformat()
            
            # Converte IDs ativos para string
            ativos_str = [str(i) for i in ids_ativos]
            placeholder = ','.join(['?'] * len(ativos_str))
            
            # REMOVIDO: status = 'Aguardando' (substituído por NOT LIKE 'Finalizado')
            # Isso garante que mesmo que o status venha vazio do Feegow, ele seja atualizado
            if ativos_str:
                sql = f'''
                    UPDATE recepcao_historico 
                    SET status = 'Finalizado (Saiu)', 
                        dt_atendimento = ?, 
                        updated_at = ?
                    WHERE unidade_id = ? 
                    AND dia_referencia = ?
                    AND status NOT LIKE ?
                    AND id_externo NOT IN ({placeholder})
                '''
                params = [agora, agora, str(unidade_id), hoje, "Finalizado%"] + ativos_str
            else:
                sql = '''
                    UPDATE recepcao_historico 
                    SET status = 'Finalizado (Saiu)', 
                        dt_atendimento = ?, 
                        updated_at = ?
                    WHERE unidade_id = ? 
                    AND dia_referencia = ?
                    AND status NOT LIKE ?
                '''
                params = [agora, agora, str(unidade_id), hoje, "Finalizado%"]
            
            if self.use_turso: conn.execute(sql, params)
            else: conn.execute(sql, params)
            
            if not self.use_turso: conn.commit()
        except Exception as e:
            print(f"Erro finalizar recepção: {e}")
        finally:
            conn.close()

    def limpar_dias_anteriores(self):
        conn = self.get_connection()
        try:
            limit = (datetime.now(tz) - timedelta(days=3)).strftime('%Y-%m-%d')
            if self.use_turso:
                conn.execute("DELETE FROM espera_medica WHERE updated_at < ?", (limit,))
            else:
                conn.execute("DELETE FROM espera_medica WHERE updated_at < ?", (limit,))
                conn.commit()
        except: pass
        finally:
            conn.close()

    def obter_credenciais_feegow(self):
        """Retorna (username, password) da tabela integrations_config"""
        conn = self.get_connection()
        try:
            # Garante que a tabela existe (Segurança)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS integrations_config (
                    service TEXT PRIMARY KEY,
                    username TEXT,
                    password TEXT,
                    token TEXT,
                    updated_at TEXT
                )
            """)
            
            sql = "SELECT username, password FROM integrations_config WHERE service='feegow'"
            
            # Executa a query
            cursor = conn.execute(sql)
            
            # Lógica para pegar o resultado (compatível com SQLite e Turso)
            # Em SQLite conn.execute retorna cursor, em Turso retorna ResultSet
            row = None
            if hasattr(cursor, 'fetchone'):
                row = cursor.fetchone()
            else:
                # Fallback para Turso/LibSQL se comportar como lista
                rows = list(cursor)
                if rows: row = rows[0]

            if row:
                # Retorna username (col 0) e password (col 1)
                # Acessa por índice para garantir compatibilidade tuple vs Row object
                return row[0], row[1]
            return None, None

        except Exception as e:
            print(f"Erro ao obter credenciais: {e}")
            return None, None
        finally:
            conn.close()

    def salvar_unidade_feegow(self, unit_id, dados):
        """Salva os dados de uma única unidade por vez de forma estruturada"""
        conn = self.get_connection()
        try:
            from datetime import datetime
            agora = datetime.now(tz).strftime('%Y-%m-%d %H:%M:%S')
            
            u_id = str(unit_id).strip()
            token = str(dados.get('x-access-token', '')).strip()
            cookie = str(dados.get('cookie', '')).strip()

            # Agora o ON CONFLICT vai funcionar porque não há mais PRIMARY KEY no service
            sql = """
                INSERT INTO integrations_config (service, token, cookies, unit_id, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(service, unit_id) DO UPDATE SET
                    token = excluded.token,
                    cookies = excluded.cookies,
                    updated_at = excluded.updated_at
            """
            
            params = ('feegow', token, cookie, u_id, agora)
            conn.execute(sql, params)
            
            if not getattr(self, 'use_turso', False):
                conn.commit()
                
            logging.info(f"✅ Unidade {u_id} salva com sucesso.")
                    
        except Exception as e:
            logging.error(f"❌ Erro ao salvar unidade {unit_id}: {e}")
        finally:
            conn.close()

    def obter_token_unidade_feegow(self, unit_id):
        """Retorna o token e cookies de uma unidade específica com tratamento para Turso/SQLite"""
        conn = self.get_connection()
        try:
            sql = "SELECT token, cookies FROM integrations_config WHERE service = ? AND unit_id = ?"
            cursor = conn.execute(sql, ('feegow', str(unit_id)))
            
            # Tratamento de retorno para compatibilidade total
            row = None
            if hasattr(cursor, 'fetchone'):
                row = cursor.fetchone()
            else:
                rows = list(cursor)
                if rows: row = rows[0]
            
            if row:
                return {
                    "x-access-token": row[0], # feegow_client espera exatamente esta chave
                    "cookie": row[1]
                }
            return None

        except Exception as e:
            logging.error(f"❌ Erro ao ler token da unidade {unit_id}: {e}")
            return None
        finally:
            conn.close()

    def obter_todos_tokens_feegow(self):
        """Retorna um dicionário com todas as unidades e seus respectivos tokens"""
        conn = self.get_connection()
        try:
            # Selecionamos explicitamente para evitar problemas de ordem de coluna
            sql = "SELECT unit_id, token, cookies FROM integrations_config WHERE service = 'feegow' AND unit_id IS NOT NULL"
            cursor = conn.execute(sql)
            
            # Para o Turso/LibSQL, precisamos garantir que lemos os resultados antes de fechar a conn
            rows = cursor.fetchall() if hasattr(cursor, 'fetchall') else list(cursor)
            
            tokens = {}
            for row in rows:
                u_id = str(row[0]).strip() # Remove espaços em branco
                tokens[u_id] = {
                    "x-access-token": row[1],
                    "cookie": row[2]
                }
            return tokens
        except Exception as e:
            logging.error(f"Erro ao ler todos os tokens: {e}")
            return {}
        finally:
            conn.close()
