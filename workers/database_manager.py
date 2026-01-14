import sqlite3
import datetime
import os
import hashlib
import pandas as pd

DB_PATH = os.path.join(os.getcwd(), 'data', 'dados_clinica.db')

class DatabaseManager:
    def __init__(self, db_name="dados_clinica.db"):
        # Define o caminho para a pasta /data na raiz
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.db_path = os.path.join(base_dir, "data", db_name)
        
        # Garante que a pasta existe
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("PRAGMA journal_mode=WAL;") 
            
            # Recepção (Mantido)
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
            
            # Médico (Mantido + Coluna nova)
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
                espera_min INTEGER,  -- NOVA COLUNA
                dia_referencia DATE
            )""")
            
            # Migração silenciosa: Se a coluna espera_min não existir (banco antigo), cria ela
            try:
                conn.execute("ALTER TABLE espera_medica_historico ADD COLUMN espera_min INTEGER")
            except sqlite3.OperationalError:
                pass # Coluna já existe

            conn.execute("CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_rec_dia ON recepcao_historico (dia_referencia)")

    # --- CONFIGURAÇÃO (TOKEN MANUAL) ---
    def ler_cookie(self):
        with sqlite3.connect(self.db_path) as conn:
            res = conn.execute("SELECT valor FROM config WHERE chave='feegow_cookie'").fetchone()
            return res[0] if res else None

    def salvar_cookie(self, valor):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("INSERT OR REPLACE INTO config (chave, valor) VALUES (?, ?)", ('feegow_cookie', valor))

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
                ON CONFLICT(id) DO UPDATE SET status=excluded.status
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
                
                # Pega os dados processados no parse_html
                status_real = row.get('STATUS_DETECTADO', 'Espera')
                espera_real = row.get('ESPERA_MINUTOS', 0)
                
                # INSERT com o novo campo 'espera_min' e status dinâmico
                # ON CONFLICT: Atualiza o status e o tempo de espera se o paciente já estiver lá
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
                    status_real,   # 'Espera' ou 'Em Atendimento'
                    espera_real,   # Inteiro vindo do HTML
                    hoje
                ))

    def finalizar_ausentes_medicos(self, nome_unidade, lista_hashes_presentes):
        hoje = datetime.date.today().isoformat()
        agora = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        placeholders = ",".join([f"'{h}'" for h in lista_hashes_presentes]) if lista_hashes_presentes else "'NO_IDS'"
        
        with sqlite3.connect(self.db_path) as conn:
            # Só finaliza quem estava na fila ou em atendimento e sumiu do HTML
            conn.execute(f"""
                UPDATE espera_medica_historico SET dt_atendimento = ?, status = 'Atendido_Inferido'
                WHERE unidade_nome = ? AND dia_referencia = ? 
                AND (status = 'Espera' OR status = 'Em Atendimento')
                AND hash_id NOT IN ({placeholders})
            """, (agora, nome_unidade, hoje))
            
    def limpar_dias_anteriores(self):
        hoje = datetime.date.today().isoformat()
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM recepcao_historico WHERE dia_referencia < ?", (hoje,))
            conn.execute("DELETE FROM espera_medica_historico WHERE dia_referencia < ?", (hoje,))

def setup_goals_table():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Tabela de Configuração de Metas
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS goals_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sector TEXT NOT NULL,       -- Ex: 'Comercial', 'Financeiro', 'Recepção'
            name TEXT NOT NULL,         -- Ex: 'Agendamentos', 'Faturamento', 'T.M.E'
            period TEXT NOT NULL,       -- Ex: 'daily', 'weekly', 'monthly'
            target_value REAL NOT NULL, -- O valor da meta (ex: 484, 100000.00)
            unit TEXT DEFAULT 'qtd',    -- Ex: 'qtd', 'currency', 'percent', 'minutes'
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()
    print("Tabela de metas configurada.")

