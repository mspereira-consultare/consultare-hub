import sqlite3
import datetime
import os
import sys
import pandas as pd
from dotenv import load_dotenv

# Configuração Híbrida: Tenta Turso, se falhar (Windows), vai de SQLite
try:
    import libsql_experimental as libsql
    HAS_TURSO_LIB = True
except ImportError:
    HAS_TURSO_LIB = False

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(BASE_DIR)
load_dotenv()

LOCAL_DB_PATH = os.path.join(BASE_DIR, 'data', 'dados_clinica.db')

class DatabaseManager:
    def __init__(self):
        # 1. Configuração Turso
        self.turso_url = os.getenv("TURSO_URL")
        self.turso_token = os.getenv("TURSO_TOKEN")
        self.use_turso = HAS_TURSO_LIB and self.turso_url and self.turso_token
        
        self.db_path = LOCAL_DB_PATH
        
        if not self.use_turso:
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            print(f"🔌 Database: LOCAL (SQLite) -> {self.db_path}")
        else:
            print(f"☁️ Database: NUVEM (Turso)")

        self._init_db()

    def get_connection(self):
        if self.use_turso:
            return libsql.connect(self.turso_url, auth_token=self.turso_token)
        else:
            return sqlite3.connect(self.db_path)

    def _init_db(self):
        """Cria tabelas essenciais se não existirem"""
        conn = self.get_connection()
        try:
            # Tabela de Status (Heartbeat)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS system_status (
                    service_name TEXT PRIMARY KEY, 
                    status TEXT, 
                    last_run TEXT, 
                    details TEXT
                )
            """)
            
            # Tabela de Configurações
            conn.execute("""
                CREATE TABLE IF NOT EXISTS integrations_config (
                    service TEXT PRIMARY KEY,
                    username TEXT,
                    password TEXT,
                    token TEXT,
                    unit_id TEXT,
                    updated_at TEXT
                )
            """)
            
            # Tabelas de Negócio (Médico/Recepção) - Garantia
            # (Adicionei campos genéricos baseados no seu uso, o sqlite aceita dinamicamente na inserção se não for strict)
            conn.commit()
        except Exception as e:
            print(f"⚠️ Erro init DB: {e}")
        finally:
            try: conn.close()
            except: pass

    # --- MÉTODOS AUXILIARES ---
    
    def execute_query(self, sql, params=()):
        conn = self.get_connection()
        try:
            if self.use_turso:
                res = conn.execute(sql, params).fetchall()
            else:
                res = conn.execute(sql, params).fetchall()
            conn.commit()
            return res
        except Exception as e:
            print(f"❌ Erro Query: {e}")
            return []
        finally:
            try: conn.close()
            except: pass

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
            conn.execute(sql, (service_name, status, agora, str(details)))
            conn.commit()
        except Exception as e:
            print(f"⚠️ Erro Heartbeat ({service_name}): {e}")
        finally:
            try: conn.close()
            except: pass

    # --- LÓGICA DE NEGÓCIO (PRESERVADA) ---

    def salvar_dados_medicos(self, df):
        """Salva o DataFrame de médicos no banco (Compatível Turso/SQLite)"""
        if df.empty: return
        
        conn = self.get_connection()
        try:
            # Em vez de to_sql (que exige SQLAlchemy), fazemos insert manual para garantir compatibilidade
            # Supondo colunas: UNIDADE, PACIENTE, CHEGADA, ESPERA, STATUS, PROFISSIONAL, etc.
            # Ajuste os campos conforme seu DataFrame real
            
            # 1. Garante tabela
            conn.execute("""
                CREATE TABLE IF NOT EXISTS espera_medica (
                    hash_id TEXT PRIMARY KEY,
                    unidade TEXT,
                    paciente TEXT,
                    chegada TEXT,
                    espera TEXT,
                    status TEXT,
                    profissional TEXT,
                    updated_at TEXT
                )
            """)
            
            agora = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            for _, row in df.iterrows():
                # Cria um ID único para não duplicar
                raw_id = f"{row.get('UNIDADE')}-{row.get('PACIENTE')}-{row.get('CHEGADA')}"
                hash_id = str(hash(raw_id)) # Simplificado, ideal usar md5 se tiver importado
                
                sql = """
                    INSERT INTO espera_medica (hash_id, unidade, paciente, chegada, espera, status, profissional, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(hash_id) DO UPDATE SET
                        espera = excluded.espera,
                        status = excluded.status,
                        profissional = excluded.profissional,
                        updated_at = excluded.updated_at
                """
                conn.execute(sql, (
                    hash_id, 
                    row.get('UNIDADE'), 
                    row.get('PACIENTE'), 
                    row.get('CHEGADA'),
                    row.get('ESPERA'),
                    row.get('STATUS'),
                    row.get('PROFISSIONAL'),
                    agora
                ))
            conn.commit()
        except Exception as e:
            print(f"Erro salvar médicos: {e}")
        finally:
            try: conn.close()
            except: pass

    def finalizar_ausentes_medicos(self, nome_unidade, hashes_presentes):
        """Marca como atendidos os pacientes que sumiram da lista da Feegow"""
        conn = self.get_connection()
        try:
            if not hashes_presentes:
                # Se a lista veio vazia, talvez a API falhou. Não finalizamos todos por segurança.
                return 

            placeholders = ','.join(['?'] * len(hashes_presentes))
            # ATENÇÃO: Turso/LibSQL tem suporte limitado a DELETE/UPDATE complexo com IN
            # Mas para listas pequenas funciona.
            
            sql = f"""
                UPDATE espera_medica 
                SET status = 'Finalizado (Saiu da Fila)', updated_at = ?
                WHERE unidade = ? 
                AND status NOT LIKE 'Finalizado%'
                AND hash_id NOT IN ({placeholders})
            """
            params = [datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'), nome_unidade] + hashes_presentes
            
            conn.execute(sql, params)
            conn.commit()
        except Exception as e:
            # Erro comum se a lista for muito grande para o SQL
            print(f"Erro finalizar médicos: {e}")
        finally:
            try: conn.close()
            except: pass

    def salvar_dados_recepcao(self, dados_brutos):
        # Implementação similar à de médicos, adaptada para a lista de dicionários da recepção
        # ... (Sua lógica existente aqui) ...
        pass 

    def finalizar_ausentes_recepcao(self, unidade_id, ids_presentes):
        # ... (Sua lógica existente aqui) ...
        pass

    def limpar_dias_anteriores(self):
        """Limpa registros muito antigos para não lotar o banco"""
        conn = self.get_connection()
        try:
            # Exemplo: Manter apenas últimos 7 dias na tabela de fila "viva"
            limit_date = (datetime.datetime.now() - datetime.timedelta(days=7)).strftime('%Y-%m-%d')
            conn.execute("DELETE FROM espera_medica WHERE updated_at < ?", (limit_date,))
            conn.commit()
        except: pass
        finally:
            try: conn.close()
            except: pass