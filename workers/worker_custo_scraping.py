import os
import sys
import time
import math
import datetime
import re
import json
import requests
import pandas as pd

# --- SETUP DE IMPORTS ---
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database_manager import DatabaseManager
    import libsql_client
except ImportError:
    pass

API_BASE_URL = "https://api.feegow.com/v1/api"
API_ENDPOINT = "financial/list-invoice"

def clean_currency(value):
    if pd.isna(value):
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    val_str = str(value).strip()
    if not val_str:
        return 0.0
    is_negative = '-' in val_str or '−' in val_str or '(' in val_str
    clean = val_str.replace('R$', '').replace('.', '').replace(' ', '')
    clean = re.sub(r'[^\d,]', '', clean)
    if not clean:
        return 0.0
    try:
        val_float = float(clean.replace(',', '.'))
        return -val_float if is_negative else val_float
    except:
        return 0.0

def normalize_date_str(value):
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d"):
        try:
            return datetime.datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except:
            pass
    return None

def save_dataframe_to_db(db, df, table_name, delete_condition=None):
    if df.empty:
        return
    conn = db.get_connection()
    try:
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

        if delete_condition:
            del_sql = f"DELETE FROM {table_name} WHERE {delete_condition}"
            print(f"   🗑️  Executando limpeza: {del_sql}")
            conn.execute(del_sql)

        cols = list(df.columns)
        placeholders = ', '.join(['?'] * len(cols))
        insert_sql = f"INSERT INTO {table_name} ({', '.join(cols)}) VALUES ({placeholders})"
        data = df.where(pd.notnull(df), None).values.tolist()

        clean_data = []
        for row in data:
            clean_row = []
            for item in row:
                if hasattr(item, 'item'):
                    try:
                        item = item.item()
                    except Exception:
                        item = None
                if isinstance(item, (dict, list)):
                    try:
                        item = json.dumps(item, ensure_ascii=False)
                    except Exception:
                        item = str(item)
                if isinstance(item, float) and not math.isfinite(item):
                    item = None
                clean_row.append(item)
            clean_data.append(tuple(clean_row))

        print(f"   💾 Salvando {len(clean_data)} registros...")
        if db.use_turso:
            stmts = [libsql_client.Statement(insert_sql, row) for row in clean_data]
            CHUNK_SIZE = 500
            for i in range(0, len(stmts), CHUNK_SIZE):
                conn.batch(stmts[i:i + CHUNK_SIZE])
        else:
            conn.executemany(insert_sql, clean_data)
            conn.commit()
    except Exception as e:
        print(f"❌ Erro ao salvar no banco: {e}")
        raise
    finally:
        conn.close()

def update_custo_summary(db, table_name, date_col, sum_col, start_date_iso, end_date_iso, dim_cols, where_extra=None, extra_params=None):
    conn = db.get_connection()
    try:
        date_expr = f"(CASE WHEN instr({date_col}, '/') > 0 THEN substr({date_col}, 7, 4) || '-' || substr({date_col}, 4, 2) || '-' || substr({date_col}, 1, 2) ELSE {date_col} END)"
        dim_cols = [c for c in dim_cols if c and c != date_col]
        dim_select = ", ".join([f"COALESCE(TRIM({c}), '') as {c}" for c in dim_cols])
        dim_group = ", ".join(dim_cols)
        dim_cols_def = ", ".join([f"{c} TEXT NOT NULL" for c in dim_cols])
        dim_cols_insert = ", ".join(dim_cols)
        dim_cols_select = (", " + dim_select) if dim_select else ""
        dim_cols_group = (", " + dim_group) if dim_group else ""
        dim_cols_pk = (", " + dim_cols_insert) if dim_cols_insert else ""

        # Tabela resumo diário
        conn.execute(f"""
            CREATE TABLE IF NOT EXISTS custo_resumo_diario (
                data_ref TEXT NOT NULL
                {", " + dim_cols_def if dim_cols_def else ""},
                total_valor REAL,
                qtd INTEGER,
                updated_at TEXT,
                PRIMARY KEY (data_ref{dim_cols_pk})
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_custo_resumo_diario_data ON custo_resumo_diario(data_ref)")

        # Limpa período atual
        conn.execute(
            "DELETE FROM custo_resumo_diario WHERE data_ref BETWEEN ? AND ?",
            (start_date_iso, end_date_iso)
        )

        where_sql = f"WHERE {date_expr} BETWEEN ? AND ?"
        params = [start_date_iso, end_date_iso]
        if where_extra:
            where_sql += f" AND {where_extra}"
            if extra_params:
                params.extend(extra_params)

        conn.execute(f"""
            INSERT INTO custo_resumo_diario (
                data_ref{dim_cols_pk}, total_valor, qtd, updated_at
            )
            SELECT
                {date_expr} as data_ref
                {dim_cols_select},
                SUM({sum_col}) as total_valor,
                COUNT(*) as qtd,
                datetime('now') as updated_at
            FROM {table_name}
            {where_sql}
            GROUP BY data_ref{dim_cols_group}
        """, params)

        if not db.use_turso:
            conn.commit()
        print(f"   ✅ Resumo diário atualizado: {start_date_iso} a {end_date_iso}")

        # Tabela resumo mensal
        conn.execute(f"""
            CREATE TABLE IF NOT EXISTS custo_resumo_mensal (
                month_ref TEXT NOT NULL
                {", " + dim_cols_def if dim_cols_def else ""},
                total_valor REAL,
                qtd INTEGER,
                updated_at TEXT,
                PRIMARY KEY (month_ref{dim_cols_pk})
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_custo_resumo_mensal_month ON custo_resumo_mensal(month_ref)")

        start_month = start_date_iso[:7]
        end_month = end_date_iso[:7]
        conn.execute(
            "DELETE FROM custo_resumo_mensal WHERE month_ref BETWEEN ? AND ?",
            (start_month, end_month)
        )

        conn.execute(f"""
            INSERT INTO custo_resumo_mensal (
                month_ref{dim_cols_pk}, total_valor, qtd, updated_at
            )
            SELECT
                substr(data_ref, 1, 7) as month_ref
                {dim_cols_select},
                SUM(total_valor) as total_valor,
                SUM(qtd) as qtd,
                datetime('now') as updated_at
            FROM custo_resumo_diario
            WHERE data_ref BETWEEN ? AND ?
            GROUP BY month_ref{dim_cols_group}
        """, (start_date_iso, end_date_iso))

        if not db.use_turso:
            conn.commit()
        print(f"   ✅ Resumo mensal atualizado: {start_month} a {end_month}")
    except Exception as e:
        print(f"   ⚠️ Erro ao atualizar resumo: {e}")
    finally:
        conn.close()

def _get_any_token(db: DatabaseManager):
    env_token = os.getenv("FEEGOW_ACCESS_TOKEN") or os.getenv("FEEGOW_TOKEN")
    if env_token:
        return env_token

    try:
        tokens = db.obter_todos_tokens_feegow()
        for preferred in ["12", "3", "2", "0"]:
            if preferred in tokens and tokens[preferred].get("x-access-token"):
                return tokens[preferred]["x-access-token"]
        for t in tokens.values():
            if t and t.get("x-access-token"):
                return t["x-access-token"]
    except Exception:
        pass

    try:
        rows = db.execute_query("""
            SELECT token FROM integrations_config
            WHERE service = 'feegow' AND token IS NOT NULL
            ORDER BY updated_at DESC
            LIMIT 1
        """)
        if rows:
            row = rows[0]
            if isinstance(row, (tuple, list)):
                return row[0]
            if hasattr(row, 'token'):
                return row.token
            if hasattr(row, '__getitem__'):
                return row['token']
    except Exception:
        pass

    return None

def _request_invoices(token, start_date, end_date, tipo_transacao):
    params = {
        "data_start": start_date,
        "data_end": end_date,
        "tipo_transacao": tipo_transacao
    }
    headers = {"x-access-token": token, "Content-Type": "application/json"}
    url = f"{API_BASE_URL}/{API_ENDPOINT}"

    print(f"🔎 Requisição tipo={tipo_transacao} -> {url}")
    print(f"    Params: {params}")

    try:
        response = requests.get(url, params=params, headers=headers, timeout=60)
        status_code = response.status_code
        if not response.ok:
            print(f"❌ HTTP {status_code} para tipo {tipo_transacao}: {response.text[:500]}")
            return None, status_code
        data = response.json() or {}
        print(f"✅ HTTP {status_code} tipo {tipo_transacao} | success={data.get('success')} | total={data.get('total')}")
        return data, status_code
    except Exception as e:
        print(f"❌ Erro request tipo {tipo_transacao}: {e}")
        return None, None

def run_scraper():
    print(f"--- Custo (API Feegow): {datetime.datetime.now().strftime('%H:%M:%S')} ---")

    db = DatabaseManager()

    hoje = datetime.datetime.now()
    inicio_vis = hoje.replace(day=1).strftime("%d-%m-%Y")
    fim_vis = hoje.strftime("%d-%m-%Y")
    iso_inicio = hoje.replace(day=1).strftime("%Y-%m-%d")
    iso_fim = hoje.strftime("%Y-%m-%d")

    print(f"📆 Janela: {inicio_vis} até {fim_vis}")
    db.update_heartbeat("custo", "RUNNING", f"Extraindo {inicio_vis}-{fim_vis} (API)")

    token = _get_any_token(db)
    if not token:
        msg = "Token Feegow não encontrado. Rode o worker_auth."
        print(f"❌ {msg}")
        db.update_heartbeat("custo", "ERROR", msg)
        return

    try:
        tipos = ["C", "D"]
        data = None
        status_codes = {}
        for t in tipos:
            resp, status = _request_invoices(token, inicio_vis, fim_vis, t)
            status_codes[t] = status
            if resp and resp.get("success"):
                content = resp.get("content") or []
                if content:
                    data = resp
                    break
                print(f"⚠️ Tipo {t}: success=true mas content vazio.")
            elif resp is not None:
                print(f"❌ Tipo {t}: success=false -> {resp}")

        if not data:
            msg = f"API retornou vazio ou erro. HTTP C={status_codes.get('C')} D={status_codes.get('D')}"
            print(f"⚠️ {msg}")
            db.update_heartbeat("custo", "WARNING", msg)
            return

        content = data.get("content") or []
        total = data.get("total")
        if total is not None and isinstance(total, int) and len(content) < total:
            print(f"⚠️ API retornou {len(content)} registros de {total}. Pode existir paginação.")

        rows = []
        for entry in content:
            detalhes = entry.get("detalhes") or []
            pagamentos = entry.get("pagamentos") or []
            itens = entry.get("itens") or []

            invoice_id = None
            if detalhes:
                invoice_id = detalhes[0].get("invoice_id")
            if not invoice_id:
                invoice_id = entry.get("invoice_id")

            for d in detalhes:
                rows.append({
                    "record_type": "detalhe",
                    "invoice_id": d.get("invoice_id", invoice_id),
                    "movement_id": d.get("movement_id"),
                    "tipo_conta": d.get("tipo_conta"),
                    "conta_id": d.get("conta_id"),
                    "valor": d.get("valor"),
                    "descricao": d.get("descricao"),
                    "responsavel": d.get("responsavel"),
                    "nfe": d.get("NFe") or d.get("nfe"),
                    "data": d.get("data"),
                    "data_nfe": d.get("dataNFe") or d.get("datanfe"),
                })

            for p in pagamentos:
                rows.append({
                    "record_type": "pagamento",
                    "invoice_id": invoice_id,
                    "pagamento_id": p.get("pagamento_id"),
                    "descricao": p.get("descricao"),
                    "valor": p.get("valor"),
                    "data": p.get("data"),
                    "forma_pagamento": p.get("forma_pagamento"),
                    "tipo_conta": p.get("tipo_conta"),
                    "conta_id": p.get("conta_id"),
                    "tipo_conta_destino": p.get("tipo_conta_destino"),
                    "conta_id_destino": p.get("conta_id_destino"),
                    "parcelas": p.get("parcelas"),
                    "bandeira_id": p.get("bandeira_id"),
                    "transacao_numero": p.get("transacao_numero"),
                    "transacao_autorizacao": p.get("transacao_autorizacao"),
                    "transacao_parcelas": p.get("transacao_parcelas"),
                })

            for it in itens:
                rows.append({
                    "record_type": "item",
                    "invoice_id": invoice_id,
                    "item_id": it.get("item_id"),
                    "agendamento_id": it.get("agendamento_id"),
                    "procedimento_id": it.get("procedimento_id"),
                    "descricao": it.get("descricao"),
                    "tipo": it.get("tipo"),
                    "valor": it.get("valor"),
                    "desconto": it.get("desconto"),
                    "acrescimo": it.get("acrescimo"),
                    "quantidade": it.get("quantidade"),
                    "is_executado": it.get("is_executado"),
                    "is_cancelado": it.get("is_cancelado"),
                    "data": it.get("data_execucao") or it.get("data"),
                    "executante_id": it.get("executante_id"),
                    "associacao_executante_id": it.get("associacao_executante_id"),
                    "pacote_id": it.get("pacote_id"),
                    "centro_custo_id": it.get("centro_custo_id"),
                    "categoria_id": it.get("categoria_id"),
                })

        if not rows:
            msg = "API retornou vazio."
            print(f"⚠️ {msg}")
            db.update_heartbeat("custo", "WARNING", msg)
            return

        df = pd.DataFrame(rows)

        if "valor" in df.columns:
            df["valor"] = df["valor"].apply(clean_currency)

        if "data" not in df.columns:
            raise Exception("Não foi possível identificar coluna de data.")

        df["data"] = df["data"].apply(normalize_date_str)
        df = df[df["data"].notna()].copy()
        df["updated_at"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Limpa o mês atual e salva
        condition = f"data >= '{iso_inicio}' AND data <= '{iso_fim}'"
        save_dataframe_to_db(db, df, 'custo_analitico', delete_condition=condition)

        # Resumos diário e mensal (prioriza pagamentos, se existirem)
        primary_type = "pagamento" if (df["record_type"] == "pagamento").any() else "detalhe"
        dim_candidates = ['forma_pagamento', 'tipo_conta', 'tipo_conta_destino']
        dim_cols = [c for c in dim_candidates if c in df.columns]
        update_custo_summary(
            db,
            'custo_analitico',
            'data',
            'valor',
            iso_inicio,
            iso_fim,
            dim_cols,
            where_extra="record_type = ?",
            extra_params=[primary_type]
        )

        print("🚀 Finalizado com Sucesso.")
        db.update_heartbeat("custo", "ONLINE", f"{len(df)} registros")

    except Exception as e:
        print(f"❌ Erro API: {e}")
        db.update_heartbeat("custo", "ERROR", str(e))

if __name__ == "__main__":
    run_scraper()
