import time
import os
import sys
import pandas as pd
import datetime
import re
import math
import unicodedata
import calendar
import hashlib
import hashlib
import unicodedata
from playwright.sync_api import sync_playwright
from io import StringIO

# --- SETUP DE IMPORTS ---
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database_manager import DatabaseManager
    import libsql_client
except ImportError:
    pass

def clean_column_name(name):
    name = str(name).lower().strip()
    name = name.replace(" ", "_").replace(".", "").replace("/", "_")
    name = re.sub(r'[^\w\s]', '', name)
    return name

def _fetch_scalar(result):
    if result is None:
        return None
    if hasattr(result, "fetchone"):
        row = result.fetchone()
        if row is None:
            return None
        if isinstance(row, dict):
            return next(iter(row.values()), None)
        return row[0]
    rows = list(result)
    if not rows:
        return None
    row = rows[0]
    if isinstance(row, dict):
        return next(iter(row.values()), None)
    return row[0]

def _ensure_mysql_index(conn, table_name, index_name, columns_sql):
    res = conn.execute(
        """
        SELECT COUNT(1)
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = ?
          AND index_name = ?
        """,
        (table_name, index_name)
    )
    cnt = _fetch_scalar(res) or 0
    if cnt == 0:
        conn.execute(f"CREATE INDEX {index_name} ON {table_name} ({columns_sql})")

def _mysql_pk_has_column(conn, table_name, column_name):
    res = conn.execute(
        """
        SELECT COUNT(1)
        FROM information_schema.key_column_usage
        WHERE table_schema = DATABASE()
          AND table_name = ?
          AND constraint_name = 'PRIMARY'
          AND column_name = ?
        """,
        (table_name, column_name)
    )
    cnt = _fetch_scalar(res) or 0
    return cnt > 0

def _ensure_mysql_procedure_key(conn, table_name, pk_cols):
    try:
        conn.execute(
            f"ALTER TABLE {table_name} "
            "ADD COLUMN procedimento_key VARCHAR(32) NOT NULL DEFAULT ''"
        )
    except Exception:
        pass
    try:
        conn.execute(
            f"UPDATE {table_name} "
            "SET procedimento_key = MD5(COALESCE(TRIM(procedimento), '')) "
            "WHERE procedimento_key IS NULL OR procedimento_key = ''"
        )
    except Exception:
        pass
    try:
        if not _mysql_pk_has_column(conn, table_name, "procedimento_key"):
            pk_cols_sql = ", ".join([*pk_cols, "procedimento_key"])
            conn.execute(
                f"ALTER TABLE {table_name} DROP PRIMARY KEY, "
                f"ADD PRIMARY KEY ({pk_cols_sql})"
            )
    except Exception:
        pass

def _select_usuario_da_conta_column(page):
    last_error = None
    for _ in range(3):
        try:
            page.wait_for_selector('[title="Definir colunas"]', state="visible", timeout=10000)
            page.locator('[title="Definir colunas"]').first.click()
            time.sleep(0.5)
            try:
                checkbox = page.locator("input[type='checkbox'][name='Colunas'][value='|162|']")
                if checkbox.count() > 0:
                    checkbox.first.scroll_into_view_if_needed()
                    if not checkbox.first.is_checked():
                        checkbox.first.check(force=True)
            except Exception:
                pass
            page.evaluate(
                """
                () => {
                    const inputs = Array.from(document.querySelectorAll("input[type='checkbox'][name='Colunas']"));
                    if (!inputs.length) return false;
                    const normalize = (txt) => (txt || "")
                        .toString()
                        .normalize("NFD")
                        .replace(/[\\u0300-\\u036f]/g, "")
                        .toLowerCase();
                    let target = inputs.find(i => i.value === "|162|");
                    if (!target) {
                        target = inputs.find(i => {
                            const label = i.closest("label");
                            const text = label ? label.innerText : (i.parentElement ? i.parentElement.innerText : "");
                            const n = normalize(text);
                            return n.includes("usuario da conta");
                        });
                    }
                    if (!target) return false;
                    target.checked = true;
                    target.dispatchEvent(new Event("change", { bubbles: true }));
                    return true;
                }
                """
            )
            page.locator(".btn.btn-primary.btn-block").filter(has_text="Selecionar").first.click()
            page.wait_for_selector("#table-resultado tbody tr", timeout=30000)
            return True
        except Exception as e:
            last_error = e
            try:
                page.keyboard.press("Escape")
            except Exception:
                pass
            time.sleep(1)
    if last_error:
        print(f"⚠️ Falha ao selecionar colunas: {last_error}")
    return False

def _strip_accents(value: str) -> str:
    if value is None:
        return ''
    return ''.join(
        ch for ch in unicodedata.normalize('NFD', str(value))
        if unicodedata.category(ch) != 'Mn'
    )

def _normalize_col_key(value: str) -> str:
    return _strip_accents(str(value or '')).lower().replace(" ", "_").replace(".", "").replace("/", "_").strip()

def _prefer_accented(a: str, b: str) -> str:
    def has_accent(s: str) -> bool:
        return any(ord(ch) > 127 for ch in s)
    if has_accent(a) and not has_accent(b):
        return a
    if has_accent(b) and not has_accent(a):
        return b
    return a

def clean_currency(value):
    """Lógica original de limpeza de moeda mantida"""
    if pd.isna(value): return 0.0
    if isinstance(value, (int, float)): return float(value)
    
    val_str = str(value).strip()
    if not val_str: return 0.0

    is_negative = '-' in val_str or '−' in val_str or '(' in val_str
    
    clean = val_str.replace('R$', '').replace('.', '').replace(' ', '')
    clean = re.sub(r'[^\d,]', '', clean)
    
    if not clean: return 0.0
    
    try:
        val_float = float(clean.replace(',', '.'))
        return -val_float if is_negative else val_float
    except: return 0.0

def remove_total_pago_outliers(df, abs_threshold=1_000_000.0, context=""):
    """
    Remove lançamentos analíticos claramente inválidos (ex.: sentinelas como -99.999.999,99).
    Em nível de linha analítica, valores com módulo >= 1 milhão são tratados como outlier.
    """
    if df is None or df.empty or 'total_pago' not in df.columns:
        return df

    vals = pd.to_numeric(df['total_pago'], errors='coerce').fillna(0)
    mask = vals.abs() >= float(abs_threshold)
    qtd = int(mask.sum())
    if qtd <= 0:
        return df

    tag = f" ({context})" if context else ""
    print(f"   ⚠️ Outlier detectado{tag}: removendo {qtd} linha(s) com |total_pago| >= {abs_threshold:,.0f}.")
    try:
        cols = [c for c in ['data_do_pagamento', 'paciente', 'total_pago', 'tipo', 'forma_de_pagamento', 'unidade'] if c in df.columns]
        if cols:
            sample = df.loc[mask, cols].head(3).to_dict('records')
            print(f"   🔎 Exemplo outlier(s): {sample}")
    except Exception:
        pass

    return df.loc[~mask].copy()

def save_dataframe_to_db(db, df, table_name, delete_condition=None):
    """
    Função auxiliar para salvar DataFrame no Turso ou SQLite.
    Substitui o pandas.to_sql que falha com drivers HTTP.
    """
    if df.empty: return
    
    conn = db.get_connection()
    try:
        # 1. Tenta mapear colunas do DF para colunas já existentes (evita duplicar versões com/sem acento)
        existing_cols = set()
        try:
            pragma = conn.execute(f"PRAGMA table_info({table_name})")
            if hasattr(pragma, 'fetchall'):
                rows = pragma.fetchall()
            else:
                rows = list(pragma)
            for row in rows:
                if isinstance(row, dict):
                    col_name = row.get('name')
                elif hasattr(row, '__getitem__'):
                    col_name = row[1] if len(row) > 1 else row[0]
                else:
                    col_name = None
                if col_name:
                    existing_cols.add(col_name)
        except Exception:
            existing_cols = set()

        if existing_cols:
            canonical_by_key = {}
            for col in existing_cols:
                key = _normalize_col_key(col)
                if key not in canonical_by_key:
                    canonical_by_key[key] = col
                else:
                    canonical_by_key[key] = _prefer_accented(canonical_by_key[key], col)

            rename_map = {}
            for col in df.columns:
                key = _normalize_col_key(col)
                if key in canonical_by_key:
                    rename_map[col] = canonical_by_key[key]
            if rename_map:
                df = df.rename(columns=rename_map)

        # 2. Garante a tabela (Criação Dinâmica baseada no DF)
        # Mapeia tipos do Pandas para SQLite
        type_map = {
            'int64': 'INTEGER', 'float64': 'REAL', 'object': 'TEXT',
            'bool': 'INTEGER', 'datetime64[ns]': 'TEXT'
        }
        cols_def = []
        for col, dtype in df.dtypes.items():
            sql_type = type_map.get(str(dtype), 'TEXT')
            cols_def.append(f"{col} {sql_type}")
        
        create_sql = f"CREATE TABLE IF NOT EXISTS {table_name} ({', '.join(cols_def)})"
        conn.execute(create_sql)

        # 2.1 Garante que novas colunas sejam adicionadas (ALTER TABLE) quando a tabela já existe
        try:
            pragma = conn.execute(f"PRAGMA table_info({table_name})")
            if hasattr(pragma, 'fetchall'):
                rows = pragma.fetchall()
            else:
                rows = list(pragma)
            existing_cols = set()
            for row in rows:
                if isinstance(row, dict):
                    col_name = row.get('name')
                elif hasattr(row, '__getitem__'):
                    col_name = row[1] if len(row) > 1 else row[0]
                else:
                    col_name = None
                if col_name:
                    existing_cols.add(col_name)

            for col, dtype in df.dtypes.items():
                if col not in existing_cols:
                    sql_type = type_map.get(str(dtype), 'TEXT')
                    conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {col} {sql_type}")
        except Exception as e:
            print(f"⚠️ Não foi possível ajustar colunas da tabela {table_name}: {e}")

        # 2. Limpeza (Delete prévio)
        if delete_condition:
            del_sql = f"DELETE FROM {table_name} WHERE {delete_condition}"
            print(f"   🗑️  Executando limpeza: {del_sql}")
            if db.use_turso: conn.execute(del_sql)
            else: conn.execute(del_sql)

        # 3. Inserção em Lote (Batch)
        cols = list(df.columns)
        placeholders = ', '.join(['?'] * len(cols))
        insert_sql = f"INSERT INTO {table_name} ({', '.join(cols)}) VALUES ({placeholders})"
        
        # Converte DataFrame para lista de tuplas (tratando NaNs como None)
        data = df.where(pd.notnull(df), None).values.tolist()
        
        # Conversão extra para garantir tipos primitivos (int, float, str)
        # O driver do Turso pode reclamar de tipos numpy
        clean_data = []
        for row in data:
            clean_row = []
            for item in row:
                # Convert numpy scalars to Python types
                if hasattr(item, 'item'):
                    try:
                        item = item.item()
                    except Exception:
                        item = None

                # Replace non-finite floats (inf, -inf, nan) with None to avoid driver errors
                if isinstance(item, float):
                    if not math.isfinite(item):
                        item = None

                clean_row.append(item)
            clean_data.append(tuple(clean_row))

        print(f"   💾 Salvando {len(clean_data)} registros...")

        if db.use_turso:
            # Batch Turso
            stmts = [libsql_client.Statement(insert_sql, row) for row in clean_data]
            # O Turso tem limite de batch. Vamos dividir em chunks de 500.
            CHUNK_SIZE = 500
            for i in range(0, len(stmts), CHUNK_SIZE):
                conn.batch(stmts[i:i + CHUNK_SIZE])
        else:
            # Batch Local
            conn.executemany(insert_sql, clean_data)
            conn.commit()
            
    except Exception as e:
        print(f"❌ Erro ao salvar no banco: {e}")
        raise
    finally:
        conn.close()

def update_faturamento_summary(db, start_date_iso, end_date_iso, update_monthly=True):
    """
    Atualiza a tabela de resumo diário baseada em faturamento_analitico.
    Mantém a granularidade necessária para filtros por unidade/grupo/procedimento.
    """
    conn = db.get_connection()
    try:
        # Normaliza data_do_pagamento para ISO (YYYY-MM-DD) se necessário
        if db.use_mysql:
            date_expr = (
                "CASE WHEN INSTR(data_do_pagamento, '/') > 0 "
                "THEN CONCAT(SUBSTR(data_do_pagamento, 7, 4), '-', SUBSTR(data_do_pagamento, 4, 2), '-', SUBSTR(data_do_pagamento, 1, 2)) "
                "ELSE data_do_pagamento END"
            )
        else:
            date_expr = (
                "(CASE WHEN instr(data_do_pagamento, '/') > 0 "
                "THEN substr(data_do_pagamento, 7, 4) || '-' || substr(data_do_pagamento, 4, 2) || '-' || substr(data_do_pagamento, 1, 2) "
                "ELSE data_do_pagamento END)"
            )

        # Cria tabela de resumo se não existir
        if db.use_mysql:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS faturamento_resumo_diario (
                    data_ref VARCHAR(191) NOT NULL,
                    unidade VARCHAR(191) NOT NULL,
                    grupo VARCHAR(191) NOT NULL,
                    procedimento VARCHAR(191) NOT NULL,
                    procedimento_key VARCHAR(32) NOT NULL DEFAULT '',
                    total_pago DOUBLE,
                    qtd BIGINT,
                    updated_at TEXT,
                    PRIMARY KEY (data_ref, unidade, grupo, procedimento_key)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            _ensure_mysql_procedure_key(conn, "faturamento_resumo_diario", ["data_ref", "unidade", "grupo"])
            _ensure_mysql_index(conn, "faturamento_resumo_diario", "idx_fat_resumo_diario_data", "data_ref")
            _ensure_mysql_index(conn, "faturamento_resumo_diario", "idx_fat_resumo_diario_unidade", "unidade")
            _ensure_mysql_index(conn, "faturamento_resumo_diario", "idx_fat_resumo_diario_grupo", "grupo")
            _ensure_mysql_index(conn, "faturamento_resumo_diario", "idx_fat_resumo_diario_proc", "procedimento")
            _ensure_mysql_index(conn, "faturamento_resumo_diario", "idx_fat_resumo_diario_data_unidade", "data_ref, unidade")
            _ensure_mysql_index(conn, "faturamento_resumo_diario", "idx_fat_resumo_diario_data_grupo", "data_ref, grupo")
        else:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS faturamento_resumo_diario (
                    data_ref TEXT NOT NULL,
                    unidade TEXT NOT NULL,
                    grupo TEXT NOT NULL,
                    procedimento TEXT NOT NULL,
                    total_pago REAL,
                    qtd INTEGER,
                    updated_at TEXT,
                    PRIMARY KEY (data_ref, unidade, grupo, procedimento)
                )
            """)
            # Índices para acelerar filtros mais comuns
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_diario_data ON faturamento_resumo_diario(data_ref)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_diario_unidade ON faturamento_resumo_diario(unidade)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_diario_grupo ON faturamento_resumo_diario(grupo)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_diario_proc ON faturamento_resumo_diario(procedimento)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_diario_data_unidade ON faturamento_resumo_diario(data_ref, unidade)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_diario_data_grupo ON faturamento_resumo_diario(data_ref, grupo)")

        # Se a tabela de resumo estiver vazia, faz backfill completo (1x)
        try:
            row = conn.execute("SELECT COUNT(*) as cnt FROM faturamento_resumo_diario")
            cnt = None
            if hasattr(row, 'fetchone'):
                cnt = row.fetchone()[0]
            else:
                rows = list(row)
                if rows:
                    cnt = rows[0][0]
            if cnt == 0:
                rng = conn.execute(f"""
                    SELECT MIN({date_expr}) as min_d, MAX({date_expr}) as max_d
                    FROM faturamento_analitico
                    WHERE {date_expr} IS NOT NULL
                """)
                min_d = max_d = None
                if hasattr(rng, 'fetchone'):
                    r = rng.fetchone()
                    if r:
                        min_d, max_d = r[0], r[1]
                else:
                    rows = list(rng)
                    if rows:
                        min_d, max_d = rows[0][0], rows[0][1]
                if min_d and max_d:
                    print(f"   🔁 Backfill resumo diário: {min_d} a {max_d}")
                    start_date_iso, end_date_iso = min_d, max_d
        except Exception:
            # Se falhar o backfill automático, seguimos com o range atual
            pass

        # Limpa o período alvo antes de recalcular
        conn.execute(
            "DELETE FROM faturamento_resumo_diario WHERE data_ref BETWEEN ? AND ?",
            (start_date_iso, end_date_iso)
        )

        # Recalcula o resumo do período
        if db.use_mysql:
            sql = f"""
                INSERT INTO faturamento_resumo_diario (
                    data_ref, unidade, grupo, procedimento, procedimento_key, total_pago, qtd, updated_at
                )
                SELECT
                    {date_expr} as data_ref,
                    COALESCE(TRIM(unidade), '') as unidade,
                    COALESCE(TRIM(grupo), '') as grupo,
                    COALESCE(TRIM(procedimento), '') as procedimento,
                    MIN(MD5(COALESCE(TRIM(procedimento), ''))) as procedimento_key,
                    SUM(total_pago) as total_pago,
                    COUNT(*) as qtd,
                    NOW() as updated_at
                FROM faturamento_analitico
                WHERE {date_expr} BETWEEN ? AND ?
                GROUP BY data_ref, unidade, grupo, procedimento
            """
        else:
            sql = f"""
                INSERT INTO faturamento_resumo_diario (
                    data_ref, unidade, grupo, procedimento, total_pago, qtd, updated_at
                )
                SELECT
                    {date_expr} as data_ref,
                    COALESCE(TRIM(unidade), '') as unidade,
                    COALESCE(TRIM(grupo), '') as grupo,
                    COALESCE(TRIM(procedimento), '') as procedimento,
                    SUM(total_pago) as total_pago,
                    COUNT(*) as qtd,
                    datetime('now') as updated_at
                FROM faturamento_analitico
                WHERE {date_expr} BETWEEN ? AND ?
                GROUP BY data_ref, unidade, grupo, procedimento
            """
        conn.execute(sql, (start_date_iso, end_date_iso))

        if not db.use_turso:
            conn.commit()
        print(f"   ✅ Resumo diário atualizado: {start_date_iso} a {end_date_iso}")

        if update_monthly:
            # ---------------------------------------------------------
            # Resumo mensal (baseado no diário para reduzir leituras)
            # ---------------------------------------------------------
            if db.use_mysql:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS faturamento_resumo_mensal (
                        month_ref VARCHAR(191) NOT NULL,
                        unidade VARCHAR(191) NOT NULL,
                        grupo VARCHAR(191) NOT NULL,
                        procedimento VARCHAR(191) NOT NULL,
                        procedimento_key VARCHAR(32) NOT NULL DEFAULT '',
                        total_pago DOUBLE,
                        qtd BIGINT,
                        updated_at TEXT,
                        PRIMARY KEY (month_ref, unidade, grupo, procedimento_key)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                    """
                )
                _ensure_mysql_procedure_key(conn, "faturamento_resumo_mensal", ["month_ref", "unidade", "grupo"])
                _ensure_mysql_index(conn, "faturamento_resumo_mensal", "idx_fat_resumo_mensal_month", "month_ref")
                _ensure_mysql_index(conn, "faturamento_resumo_mensal", "idx_fat_resumo_mensal_unidade", "unidade")
                _ensure_mysql_index(conn, "faturamento_resumo_mensal", "idx_fat_resumo_mensal_grupo", "grupo")
                _ensure_mysql_index(conn, "faturamento_resumo_mensal", "idx_fat_resumo_mensal_proc", "procedimento")
                _ensure_mysql_index(conn, "faturamento_resumo_mensal", "idx_fat_resumo_mensal_month_unidade", "month_ref, unidade")
                _ensure_mysql_index(conn, "faturamento_resumo_mensal", "idx_fat_resumo_mensal_month_grupo", "month_ref, grupo")
            else:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS faturamento_resumo_mensal (
                        month_ref TEXT NOT NULL,
                        unidade TEXT NOT NULL,
                        grupo TEXT NOT NULL,
                        procedimento TEXT NOT NULL,
                        total_pago REAL,
                        qtd INTEGER,
                        updated_at TEXT,
                        PRIMARY KEY (month_ref, unidade, grupo, procedimento)
                    )
                """)
                conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_mensal_month ON faturamento_resumo_mensal(month_ref)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_mensal_unidade ON faturamento_resumo_mensal(unidade)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_mensal_grupo ON faturamento_resumo_mensal(grupo)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_mensal_proc ON faturamento_resumo_mensal(procedimento)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_mensal_month_unidade ON faturamento_resumo_mensal(month_ref, unidade)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_mensal_month_grupo ON faturamento_resumo_mensal(month_ref, grupo)")

            monthly_start_date = start_date_iso
            monthly_end_date = end_date_iso
            start_month = monthly_start_date[:7]
            end_month = monthly_end_date[:7]

            # Se tabela mensal estiver vazia, faz backfill completo baseado no diário
            try:
                row_m = conn.execute("SELECT COUNT(*) as cnt FROM faturamento_resumo_mensal")
                cnt_m = None
                if hasattr(row_m, 'fetchone'):
                    cnt_m = row_m.fetchone()[0]
                else:
                    rows_m = list(row_m)
                    if rows_m:
                        cnt_m = rows_m[0][0]
                if cnt_m == 0:
                    rng_m = conn.execute("""
                        SELECT MIN(data_ref) as min_d, MAX(data_ref) as max_d
                        FROM faturamento_resumo_diario
                        WHERE data_ref IS NOT NULL
                    """)
                    min_m = max_m = None
                    if hasattr(rng_m, 'fetchone'):
                        r_m = rng_m.fetchone()
                        if r_m:
                            min_m, max_m = r_m[0], r_m[1]
                    else:
                        rows_m = list(rng_m)
                        if rows_m:
                            min_m, max_m = rows_m[0][0], rows_m[0][1]
                    if min_m and max_m:
                        print(f"   🔁 Backfill resumo mensal: {min_m[:7]} a {max_m[:7]}")
                        monthly_start_date = min_m
                        monthly_end_date = max_m
                        start_month = monthly_start_date[:7]
                        end_month = monthly_end_date[:7]
            except Exception:
                pass

            conn.execute(
                "DELETE FROM faturamento_resumo_mensal WHERE month_ref BETWEEN ? AND ?",
                (start_month, end_month)
            )

            if db.use_mysql:
                monthly_sql = """
                    INSERT INTO faturamento_resumo_mensal (
                        month_ref, unidade, grupo, procedimento, procedimento_key, total_pago, qtd, updated_at
                    )
                    SELECT
                        substr(data_ref, 1, 7) as month_ref,
                        unidade,
                        grupo,
                        procedimento,
                        MIN(procedimento_key) as procedimento_key,
                        SUM(total_pago) as total_pago,
                        SUM(qtd) as qtd,
                        NOW() as updated_at
                    FROM faturamento_resumo_diario
                    WHERE data_ref BETWEEN ? AND ?
                    GROUP BY month_ref, unidade, grupo, procedimento
                """
            else:
                monthly_sql = """
                    INSERT INTO faturamento_resumo_mensal (
                        month_ref, unidade, grupo, procedimento, total_pago, qtd, updated_at
                    )
                    SELECT
                        substr(data_ref, 1, 7) as month_ref,
                        unidade,
                        grupo,
                        procedimento,
                        SUM(total_pago) as total_pago,
                        SUM(qtd) as qtd,
                        datetime('now') as updated_at
                    FROM faturamento_resumo_diario
                    WHERE data_ref BETWEEN ? AND ?
                    GROUP BY month_ref, unidade, grupo, procedimento
                """
            conn.execute(monthly_sql, (monthly_start_date, monthly_end_date))

            if not db.use_turso:
                conn.commit()
            print(f"   ✅ Resumo mensal atualizado: {start_month} a {end_month}")
    except Exception as e:
        print(f"   ⚠️ Erro ao atualizar resumo diário: {e}")
    finally:
        conn.close()

def update_faturamento_monthly_from_daily(db, month_ref):
    conn = db.get_connection()
    try:
        if db.use_mysql:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS faturamento_resumo_mensal (
                    month_ref VARCHAR(191) NOT NULL,
                    unidade VARCHAR(191) NOT NULL,
                    grupo VARCHAR(191) NOT NULL,
                    procedimento VARCHAR(191) NOT NULL,
                    procedimento_key VARCHAR(32) NOT NULL DEFAULT '',
                    total_pago DOUBLE,
                    qtd BIGINT,
                    updated_at TEXT,
                    PRIMARY KEY (month_ref, unidade, grupo, procedimento_key)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            _ensure_mysql_procedure_key(conn, "faturamento_resumo_mensal", ["month_ref", "unidade", "grupo"])
            _ensure_mysql_index(conn, "faturamento_resumo_mensal", "idx_fat_resumo_mensal_month", "month_ref")
            _ensure_mysql_index(conn, "faturamento_resumo_mensal", "idx_fat_resumo_mensal_unidade", "unidade")
            _ensure_mysql_index(conn, "faturamento_resumo_mensal", "idx_fat_resumo_mensal_grupo", "grupo")
            _ensure_mysql_index(conn, "faturamento_resumo_mensal", "idx_fat_resumo_mensal_proc", "procedimento")
            _ensure_mysql_index(conn, "faturamento_resumo_mensal", "idx_fat_resumo_mensal_month_unidade", "month_ref, unidade")
            _ensure_mysql_index(conn, "faturamento_resumo_mensal", "idx_fat_resumo_mensal_month_grupo", "month_ref, grupo")
        else:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS faturamento_resumo_mensal (
                    month_ref TEXT NOT NULL,
                    unidade TEXT NOT NULL,
                    grupo TEXT NOT NULL,
                    procedimento TEXT NOT NULL,
                    total_pago REAL,
                    qtd INTEGER,
                    updated_at TEXT,
                    PRIMARY KEY (month_ref, unidade, grupo, procedimento)
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_mensal_month ON faturamento_resumo_mensal(month_ref)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_mensal_unidade ON faturamento_resumo_mensal(unidade)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_mensal_grupo ON faturamento_resumo_mensal(grupo)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_mensal_proc ON faturamento_resumo_mensal(procedimento)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_mensal_month_unidade ON faturamento_resumo_mensal(month_ref, unidade)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fat_resumo_mensal_month_grupo ON faturamento_resumo_mensal(month_ref, grupo)")

        year, month = map(int, month_ref.split('-'))
        last_day = calendar.monthrange(year, month)[1]
        month_start = f"{year:04d}-{month:02d}-01"
        month_end = f"{year:04d}-{month:02d}-{last_day:02d}"

        conn.execute("DELETE FROM faturamento_resumo_mensal WHERE month_ref = ?", (month_ref,))

        if db.use_mysql:
            monthly_sql = """
                INSERT INTO faturamento_resumo_mensal (
                    month_ref, unidade, grupo, procedimento, procedimento_key, total_pago, qtd, updated_at
                )
                SELECT
                    substr(data_ref, 1, 7) as month_ref,
                    unidade,
                    grupo,
                    procedimento,
                    MIN(procedimento_key) as procedimento_key,
                    SUM(total_pago) as total_pago,
                    SUM(qtd) as qtd,
                    NOW() as updated_at
                FROM faturamento_resumo_diario
                WHERE data_ref BETWEEN ? AND ?
                GROUP BY month_ref, unidade, grupo, procedimento
            """
        else:
            monthly_sql = """
                INSERT INTO faturamento_resumo_mensal (
                    month_ref, unidade, grupo, procedimento, total_pago, qtd, updated_at
                )
                SELECT
                    substr(data_ref, 1, 7) as month_ref,
                    unidade,
                    grupo,
                    procedimento,
                    SUM(total_pago) as total_pago,
                    SUM(qtd) as qtd,
                    datetime('now') as updated_at
                FROM faturamento_resumo_diario
                WHERE data_ref BETWEEN ? AND ?
                GROUP BY month_ref, unidade, grupo, procedimento
            """
        conn.execute(monthly_sql, (month_start, month_end))

        if not db.use_turso:
            conn.commit()
        print(f"   ✅ Resumo mensal (Mês {month_ref}) atualizado via diário")
    finally:
        conn.close()

def run_scraper():
    print(f"--- Scraping Financeiro (Híbrido): {datetime.datetime.now().strftime('%H:%M:%S')} ---")
    
    db = DatabaseManager()
    
    # 1. Busca Credenciais (Híbrido)
    try:
        # Tenta buscar no banco primeiro
        res = db.execute_query("SELECT username, password FROM integrations_config WHERE service = 'feegow'")
        if res:
            row = res[0]
            if isinstance(row, (tuple, list)):
                user, password = row[0], row[1]
            else:
                user, password = row.username, row.password
        else:
            raise Exception("Não achou no banco")
    except:
        # Fallback .env
        user = os.getenv("FEEGOW_USER")
        password = os.getenv("FEEGOW_PASS")

    if not user or not password:
        print("❌ Credenciais não encontradas (Banco ou .env).")
        return

    hoje = datetime.datetime.now()
    inicio_vis = hoje.strftime("%d/%m/%Y")
    fim_vis = hoje.strftime("%d/%m/%Y")
    iso_inicio = hoje.strftime("%Y-%m-%d")
    iso_fim = hoje.strftime("%Y-%m-%d")

    print(f"📅 Janela: {inicio_vis} até {fim_vis}")
    db.update_heartbeat("faturamento", "RUNNING", f"Extraindo {inicio_vis}-{fim_vis}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        try:
            # --- LÓGICA DE SCRAPING ORIGINAL (INTACTA) ---
            print("🔐 Login...")
            page.goto("https://franchising.feegow.com/main/?P=Login")
            try:
                if page.get_by_role("textbox", name="E-mail").is_visible(timeout=3000):
                    page.get_by_role("textbox", name="E-mail").fill(user)
                    page.get_by_role("textbox", name="Senha").fill(password)
                    page.get_by_role("button", name="Entrar ").click()
            except: pass

            time.sleep(2)
            page.goto("https://franchising.feegow.com/v8.1/?P=MudaLocal&Pers=1&MudaLocal=0", timeout=60000)
            time.sleep(3)

            print("📂 Acessando Relatório...")
            page.goto("https://franchising.feegow.com/main/?P=RelatoriosModoFranquia&Pers=1&TR=72")

            try:
                if page.get_by_role("button", name="Não, obrigada.").is_visible(timeout=3000):
                    page.get_by_role("button", name="Não, obrigada.").click()
            except: pass

            page.wait_for_selector(".multiselect.dropdown-toggle", state="visible", timeout=20000)
            page.locator(".multiselect.dropdown-toggle").first.click()
            menu = page.locator("ul.multiselect-container.dropdown-menu").first
            menu.wait_for(state="visible", timeout=5000)

            if menu.get_by_text("Selecionar tudo").is_visible():
                menu.get_by_text("Selecionar tudo").click()
            
            try:
                if menu.get_by_text("CONSULTARE FRANCHISING").is_visible():
                    menu.get_by_text("CONSULTARE FRANCHISING").click()
            except: pass

            page.keyboard.press("Escape")
            time.sleep(0.5)

            try:
                page.locator('button[onclick*="alteraUnidade"]').click()
            except: pass

            page.wait_for_selector("#De", state="visible", timeout=10000)
            script_datas = f"""() => {{
                const elDe = document.querySelector('#De');
                const elAte = document.querySelector('#Ate');
                if(elDe) {{ elDe.value = '{inicio_vis}'; elDe.dispatchEvent(new Event('change')); }}
                if(elAte) {{ elAte.value = '{fim_vis}'; elAte.dispatchEvent(new Event('change')); }}
            }}"""
            page.evaluate(script_datas)
            page.locator("body").click(force=True)

            print("🧩 Selecionando colunas...")
            if _select_usuario_da_conta_column(page):
                print("⏳ Baixando...")
                page.wait_for_selector("#table-resultado tbody tr", timeout=30000)
            else:
                print("⚠️ Falha ao selecionar colunas. Tentando filtrar...")
                print("🔎 Pesquisando...")
                page.locator("#btn-filtrar").click()
                print("⏳ Baixando...")
                page.wait_for_selector("#table-resultado tbody tr", timeout=30000)
            
            last_count = 0
            no_change_count = 0
            while no_change_count < 5: 
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                time.sleep(2.5)
                current_count = page.locator("#table-resultado tbody tr").count()
                if current_count > last_count:
                    last_count = current_count
                    no_change_count = 0
                else:
                    no_change_count += 1
            
            print(f"✅ Extraído: {last_count} linhas.")

            # --- PROCESSAMENTO DOS DADOS ---
            html = page.content()
            dfs = pd.read_html(StringIO(html), decimal=',', thousands='.')
            df_raw = max(dfs, key=lambda x: x.size)
            
            df = df_raw.copy()
            df.columns = [clean_column_name(c) for c in df.columns]

            cols_fin = [c for c in df.columns if any(t in c for t in ['valor', 'total', 'pago', 'liquido'])]
            for col in cols_fin:
                df[col] = df[col].apply(clean_currency)

            col_data = next((c for c in df.columns if 'pagamento' in c and 'data' in c), None)
            if not col_data:
                col_data = next((c for c in df.columns if 'data' in c), 'data')
            
            def normalize_accounting_date(row):
                d_str = row[col_data]
                val = row['total_pago'] if 'total_pago' in row else 0
                try:
                    d_obj = datetime.datetime.strptime(str(d_str), "%d/%m/%Y")
                    d_iso = d_obj.strftime("%Y-%m-%d")
                    # Lógica de Estorno Retroativo (Mantida)
                    if val < 0 and d_iso < iso_inicio:
                        return iso_inicio
                    return d_iso
                except:
                    return None

            df['data_contabil'] = df.apply(normalize_accounting_date, axis=1)
            df_validas = df[df['data_contabil'].notna()].copy()
            
            df_validas[col_data] = df_validas['data_contabil']
            df_validas = df_validas.drop(columns=['data_contabil'])

            df = df_validas
            df = remove_total_pago_outliers(df, abs_threshold=1_000_000.0, context="worker diario")
            df['updated_at'] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            # --- AUDITORIA ---
            ajustados = df[df[col_data] == iso_inicio]
            negativos_ajustados = ajustados[ajustados['total_pago'] < 0]
            if not negativos_ajustados.empty:
                print(f"   ⚖️  Ajuste Retroativo: {len(negativos_ajustados)} estornos movidos para {iso_inicio}.")

            # --- SALVAMENTO HÍBRIDO ---
            # Define condição de limpeza para evitar duplicidade no período
            condition = f"{col_data} >= '{iso_inicio}' AND {col_data} <= '{iso_fim}'"
            
            save_dataframe_to_db(db, df, 'faturamento_analitico', delete_condition=condition)
            update_faturamento_summary(db, iso_inicio, iso_fim, update_monthly=False)
            update_faturamento_monthly_from_daily(db, iso_inicio[:7])
            
            print(f"🚀 Finalizado com Sucesso.")
            db.update_heartbeat("faturamento", "ONLINE", f"{len(df)} registros")

        except Exception as e:
            print(f"❌ Erro Scraping: {e}")
            db.update_heartbeat("faturamento", "ERROR", str(e))
        finally:
            browser.close()

if __name__ == "__main__":
    run_scraper()

