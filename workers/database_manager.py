import sqlite3
import datetime
import os
import sys
import logging
import pandas as pd
import traceback
from dotenv import load_dotenv

# Tenta importar o cliente Turso (HTTP)
try:
    import libsql_client
    HAS_TURSO_LIB = True
except ImportError:
    HAS_TURSO_LIB = False

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(BASE_DIR)
load_dotenv()

LOCAL_DB_PATH = os.path.join(BASE_DIR, 'data', 'dados_clinica.db')

class DatabaseManager:
    def __init__(self):
        self.turso_url = os.getenv("TURSO_URL")
        self.turso_token = os.getenv("TURSO_TOKEN")
        
        # --- FIX PARA ERRO 505 ---
        # Força o uso de HTTPS em vez de libsql:// ou wss://
        # O cliente Python funciona melhor com HTTP puro em alguns ambientes
        if self.turso_url:
            self.turso_url = self.turso_url.replace("libsql://", "https://").replace("wss://", "https://")

        # Usa Turso se tiver URL configurada E a lib instalada
        self.use_turso = HAS_TURSO_LIB and self.turso_url and "https" in self.turso_url
        self.db_path = LOCAL_DB_PATH
        
        if not self.use_turso:
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            print(f"🔌 [DB] Usando LOCAL (SQLite): {self.db_path}")
        else:
            print(f"☁️ [DB] Usando NUVEM (Turso HTTPS)")

        self._init_db()

    def get_connection(self):
        """Retorna conexão apropriada (Objeto Turso ou SQLite Connection)"""
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
        conn = self.get_connection()
        try:
            agora = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
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
            agora = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            for _, row in df.iterrows():
                # Cria ID único
                raw_id = f"{row.get('UNIDADE')}-{row.get('PACIENTE')}-{row.get('CHEGADA')}"
                hash_id = str(hash(raw_id)).replace("-", "N") 
                
                sql = """
                    INSERT INTO espera_medica (hash_id, unidade, paciente, chegada, espera, status, profissional, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(hash_id) DO UPDATE SET
                        espera = excluded.espera,
                        status = excluded.status,
                        profissional = excluded.profissional,
                        updated_at = excluded.updated_at
                """
                params = (
                    hash_id, row.get('UNIDADE'), row.get('PACIENTE'), 
                    row.get('CHEGADA'), row.get('ESPERA_MINUTOS'), 
                    row.get('STATUS_DETECTADO'), row.get('PROFISSIONAL'), agora
                )
                
                if self.use_turso: conn.execute(sql, params)
                else: conn.execute(sql, params)
            
            if not self.use_turso: conn.commit()
        except Exception as e:
            print(f"Erro salvar médicos: {e}")
        finally:
            conn.close()

    def finalizar_ausentes_medicos(self, nome_unidade, hashes_presentes):
        conn = self.get_connection()
        try:
            agora = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            if not hashes_presentes: return

            placeholders = ','.join(['?'] * len(hashes_presentes))
            sql = f"""
                UPDATE espera_medica SET status = 'Finalizado (Saiu)', updated_at = ?
                WHERE unidade = ? AND status NOT LIKE 'Finalizado%' 
                AND hash_id NOT IN ({placeholders})
            """
            params = [agora, nome_unidade] + hashes_presentes
            
            if self.use_turso: conn.execute(sql, params)
            else: 
                conn.execute(sql, params)
                conn.commit()
        except Exception as e:
            print(f"Erro finalizar médicos: {e}")
        finally:
            conn.close()

    # --- LÓGICA RECEPÇÃO ---
    def salvar_dados_recepcao(self, dados_brutos):
        if not dados_brutos: return
        conn = self.get_connection()
        try:
            agora = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            dia_ref = datetime.datetime.now().strftime('%Y-%m-%d')

            for item in dados_brutos:
                id_ext = item.get('id')
                uid = item.get('UnidadeID') or item.get('UnidadeID_Coleta')
                unidade_nome = "Desconhecida"
                if uid == 2: unidade_nome = "Ouro Verde"
                elif uid == 3: unidade_nome = "Centro Cambui"
                elif uid == 12: unidade_nome = "Campinas Shopping"

                paciente = item.get('PacienteNome', 'Desconhecido')
                dt_chegada = item.get('DataChegada') 
                dt_atend = item.get('DataAtendimento') 
                status = item.get('StatusNome', 'Indefinido')

                hash_id = f"REC_{id_ext}_{uid}"

                sql = """
                    INSERT INTO recepcao_historico (
                        hash_id, id_externo, unidade_id, unidade_nome, paciente_nome,
                        dt_chegada, dt_atendimento, status, dia_referencia, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(hash_id) DO UPDATE SET
                        dt_atendimento = excluded.dt_atendimento,
                        status = excluded.status,
                        updated_at = excluded.updated_at
                """
                params = (hash_id, id_ext, uid, unidade_nome, paciente, dt_chegada, dt_atend, status, dia_ref, agora)

                if self.use_turso: conn.execute(sql, params)
                else: conn.execute(sql, params)

            if not self.use_turso: conn.commit()
        except Exception as e:
            print(f"Erro salvar recepção: {e}")
        finally:
            conn.close()

    def finalizar_ausentes_recepcao(self, unidade_id, ids_presentes):
        conn = self.get_connection()
        try:
            agora = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            dia_ref = datetime.datetime.now().strftime('%Y-%m-%d')
            
            if not ids_presentes: return

            placeholders = ','.join(['?'] * len(ids_presentes))
            
            # Atualiza para 'Finalizado' quem sumiu da lista da API (foi atendido/foi embora)
            sql = f"""
                UPDATE recepcao_historico 
                SET status = 'Finalizado (Saiu)', updated_at = ?
                WHERE unidade_id = ? 
                AND dia_referencia = ?
                AND status NOT LIKE 'Finalizado%'
                AND id_externo NOT IN ({placeholders})
            """
            params = [agora, unidade_id, dia_ref] + ids_presentes
            
            if self.use_turso:
                conn.execute(sql, params)
            else:
                conn.execute(sql, params)
                conn.commit()
        except Exception as e:
            print(f"Erro finalizar recepção: {e}")
        finally:
            conn.close()

    def limpar_dias_anteriores(self):
        conn = self.get_connection()
        try:
            limit = (datetime.datetime.now() - datetime.timedelta(days=3)).strftime('%Y-%m-%d')
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
            agora = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
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
        """Retorna um dicionário com todas as unidades e seus respectivos tokens (útil para loops)"""
        conn = self.get_connection()
        try:
            sql = "SELECT unit_id, token, cookies FROM integrations_config WHERE service = 'feegow' AND unit_id IS NOT NULL"
            cursor = conn.execute(sql)
            
            tokens = {}
            for row in cursor:
                tokens[row[0]] = {
                    "x-access-token": row[1],
                    "cookie": row[2]
                }
            return tokens

        except Exception as e:
            logging.error(f"Erro ao ler todos os tokens: {e}")
            return {}
        finally:
            conn.close()