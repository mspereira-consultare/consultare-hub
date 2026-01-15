import sqlite3
import datetime
import os
import hashlib
import pandas as pd

# Define o caminho para a pasta /data na raiz de forma robusta
# Isso garante que funcione tanto rodando da raiz quanto da pasta workers
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, 'data', 'dados_clinica.db')

class DatabaseManager:
    def __init__(self, db_name="dados_clinica.db"):
        # Se for instanciado com caminho diferente, respeita, senão usa o padrão global
        self.db_path = DB_PATH
        
        # Garante que a pasta existe
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_db()

    def _init_db(self):
        """Inicializa todas as tabelas necessárias do sistema"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("PRAGMA journal_mode=WAL;") 
            
            # 1. TABELA DE CONFIGURAÇÕES (INTEGRAÇÕES - FEEGOW/CLINIA)
            # Essencial para o Painel de Admin > Configurações
            conn.execute("""
            CREATE TABLE IF NOT EXISTS integrations_config (
                service TEXT PRIMARY KEY,
                username TEXT,
                password TEXT,
                token TEXT,
                unit_id TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )""")

            # 2. TABELA DE METAS (GOALS)
            # Atualizada com todos os campos que a página de Metas exige
            conn.execute("""
            CREATE TABLE IF NOT EXISTS goals_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sector TEXT,
                name TEXT,
                periodicity TEXT,    -- 'mensal', 'semanal', etc.
                target_value REAL,
                unit TEXT,
                start_date TEXT,     -- Vigência Início
                end_date TEXT,       -- Vigência Fim
                linked_kpi_id TEXT,  -- ID técnico do indicador
                filter_group TEXT,   -- Filtros avançados (JSON ou texto)
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )""")

            # 3. RECEPÇÃO (Histórico de Senhas)
            conn.execute("""
            CREATE TABLE IF NOT EXISTS recepcao_historico (
                id INTEGER PRIMARY KEY,
                unidade_id INTEGER,
                senha TEXT,
                status TEXT,
                dt_chegada DATETIME,
                dt_atendimento DATETIME,
                tipo_senha TEXT,
                dia_referencia DATE
            )""")
            
            # 4. MÉDICO (Histórico de Espera)
            conn.execute("""
            CREATE TABLE IF NOT EXISTS espera_medica_historico (
                hash_id TEXT PRIMARY KEY,
                unidade_nome TEXT,
                paciente TEXT,
                idade TEXT,
                hora_agendada TEXT,
                profissional TEXT,
                especialidade TEXT,
                dt_chegada DATETIME,
                dt_atendimento DATETIME,
                status TEXT,
                espera_min INTEGER,
                dia_referencia DATE
            )""")
            
            # Migração silenciosa para bancos antigos (evita erro se a coluna faltar)
            try:
                conn.execute("ALTER TABLE espera_medica_historico ADD COLUMN espera_min INTEGER")
            except sqlite3.OperationalError:
                pass 

            # 5. LEGADO (Tabela simples de chave-valor, mantida por segurança)
            conn.execute("CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT)")

            # 6. FATURAMENTO (Scraping)
            # Tabela para guardar os dados do relatório "Modo Franquia"
            conn.execute("""
            CREATE TABLE IF NOT EXISTS faturamento_scraping (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                unidade TEXT,
                categoria TEXT, -- Ex: 'Total', 'Particular', 'Convênio' (depende da tabela)
                valor REAL,
                data_referencia DATE, -- Mês/Ano ou Dia da extração
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )""")
            
            # Índices
            conn.execute("CREATE INDEX IF NOT EXISTS idx_rec_dia ON recepcao_historico (dia_referencia)")

    # --- MÉTODOS DE INTEGRAÇÃO (NOVO) ---
    def get_integration_config(self, service):
        """Busca as credenciais salvas pelo Painel Admin"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            res = conn.execute("SELECT * FROM integrations_config WHERE service = ?", (service,)).fetchone()
            return dict(res) if res else None

    # --- MÉTODOS RECEPÇÃO ---
    def salvar_dados_recepcao(self, lista_dados):
        if not lista_dados: return
        hoje = datetime.date.today().isoformat()
        with sqlite3.connect(self.db_path) as conn:
            for item in lista_dados:
                dt_atend = item.get('DataHoraAtendimento') or None
                conn.execute("""
                INSERT INTO recepcao_historico (id, unidade_id, senha, status, dt_chegada, dt_atendimento, tipo_senha, dia_referencia)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET status=excluded.status, dt_atendimento=excluded.dt_atendimento
                """, (item['id'], item['UnidadeID'], item.get('Senha'), item.get('Sta'), item.get('DataHoraChegada'), dt_atend, item.get('NomeTipo'), hoje))

    def finalizar_ausentes_recepcao(self, unidade_id, lista_ids_presentes):
        hoje = datetime.date.today().isoformat()
        agora = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        placeholders = ",".join(map(str, lista_ids_presentes)) if lista_ids_presentes else "-1"
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(f"""
                UPDATE recepcao_historico SET dt_atendimento = ?, status = 'Atendido_Inferido'
                WHERE unidade_id = ? AND dia_referencia = ? AND status = 'Espera' 
                AND dt_atendimento IS NULL AND id NOT IN ({placeholders})
            """, (agora, unidade_id, hoje))

    # --- MÉTODOS MÉDICOS ---
    def _gerar_hash_medico(self, row, dia):
        raw = f"{row['UNIDADE']}-{row['PACIENTE']}-{row['CHEGADA']}-{dia}"
        return hashlib.md5(raw.encode()).hexdigest()

    def salvar_dados_medicos(self, df_medico):
        if df_medico.empty: return
        hoje = datetime.date.today().isoformat()
        data_base = datetime.date.today().strftime('%Y-%m-%d')
        
        with sqlite3.connect(self.db_path) as conn:
            for _, row in df_medico.iterrows():
                hash_id = self._gerar_hash_medico(row, hoje)
                dt_chegada_completa = f"{data_base} {row['CHEGADA']}:00"
                
                status_real = row.get('STATUS_DETECTADO', 'Espera')
                espera_real = row.get('ESPERA_MINUTOS', 0)
                
                conn.execute("""
                INSERT INTO espera_medica_historico 
                (hash_id, unidade_nome, paciente, idade, hora_agendada, profissional, especialidade, dt_chegada, status, espera_min, dia_referencia)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(hash_id) DO UPDATE SET 
                    status=excluded.status, 
                    espera_min=excluded.espera_min
                """, (
                    hash_id, 
                    row['UNIDADE'], 
                    row['PACIENTE'], 
                    row.get('IDADE',''), 
                    row.get('HORA',''), 
                    row['PROFISSIONAL'], 
                    row['COMPROMISSO'], 
                    dt_chegada_completa, 
                    status_real, 
                    espera_real, 
                    hoje
                ))

    def finalizar_ausentes_medicos(self, nome_unidade, lista_hashes_presentes):
        hoje = datetime.date.today().isoformat()
        agora = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        placeholders = ",".join([f"'{h}'" for h in lista_hashes_presentes]) if lista_hashes_presentes else "'NO_IDS'"
        
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(f"""
                UPDATE espera_medica_historico SET dt_atendimento = ?, status = 'Atendido_Inferido'
                WHERE unidade_nome = ? AND dia_referencia = ? 
                AND (status = 'Espera' OR status = 'Em Atendimento')
                AND hash_id NOT IN ({placeholders})
            """, (agora, nome_unidade, hoje))
            
    def limpar_dias_anteriores(self):
        # Opcional: Limpar dados antigos
        pass