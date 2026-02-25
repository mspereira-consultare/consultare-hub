import datetime
import json
import os
import sys
import time

import pandas as pd

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    import libsql_client
except ImportError:
    libsql_client = None

from database_manager import DatabaseManager
from feegow_client import fetch_procedures_catalog


def _to_int(value, default=None):
    if value is None:
        return default
    try:
        if isinstance(value, str) and value.strip() == "":
            return default
        return int(float(value))
    except Exception:
        return default


def _to_float(value, default=0.0):
    if value is None:
        return default
    if isinstance(value, (int, float)):
        try:
            return float(value)
        except Exception:
            return default

    raw = str(value).strip()
    if not raw:
        return default
    try:
        normalized = raw.replace("R$", "").replace(" ", "")
        has_dot = "." in normalized
        has_comma = "," in normalized
        if has_dot and has_comma:
            normalized = normalized.replace(".", "").replace(",", ".")
        elif has_comma:
            normalized = normalized.replace(",", ".")
        return float(normalized)
    except Exception:
        return default


def _normalize_specialties(raw):
    if raw is None:
        return "[]"
    if isinstance(raw, list):
        return json.dumps(raw, ensure_ascii=False)

    text = str(raw).strip()
    if not text:
        return "[]"
    if text.startswith("[") and text.endswith("]"):
        return text
    if "," in text:
        parts = [part.strip() for part in text.split(",") if part.strip()]
        return json.dumps(parts, ensure_ascii=False)
    return json.dumps([text], ensure_ascii=False)


def _fetch_all_catalog():
    """
    Tenta obter o catalogo em uma chamada.
    Se vier vazio, tenta alguns tipo_procedimento para ampliar cobertura.
    """
    full = fetch_procedures_catalog()
    if not full.empty:
        return full

    chunks = []
    for tipo in [1, 2, 3, 4]:
        partial = fetch_procedures_catalog({"tipo_procedimento": tipo})
        if not partial.empty:
            chunks.append(partial)
        time.sleep(0.2)

    if not chunks:
        return pd.DataFrame()
    return pd.concat(chunks, ignore_index=True)


def _ensure_table(db: DatabaseManager):
    conn = db.get_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS feegow_procedures_catalog (
                procedimento_id INTEGER PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                codigo VARCHAR(80) NULL,
                tipo_procedimento INTEGER NULL,
                grupo_procedimento INTEGER NULL,
                valor REAL NOT NULL DEFAULT 0,
                especialidades_json TEXT NULL,
                raw_json TEXT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )

        if db.use_turso:
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_feegow_procedures_catalog_nome ON feegow_procedures_catalog(nome)"
            )
            return

        try:
            rs = conn.execute(
                """
                SELECT COUNT(1)
                FROM information_schema.statistics
                WHERE table_schema = DATABASE()
                  AND table_name = 'feegow_procedures_catalog'
                  AND index_name = 'idx_feegow_procedures_catalog_nome'
                """
            )
            row = rs.fetchone() if hasattr(rs, "fetchone") else None
            if row and row[0] == 0:
                conn.execute(
                    "CREATE INDEX idx_feegow_procedures_catalog_nome ON feegow_procedures_catalog(nome)"
                )
            conn.commit()
        except Exception as idx_err:
            # Nao interrompe o worker por causa de indice.
            print(f"Aviso criando indice do catalogo: {idx_err}")
            conn.commit()
    finally:
        try:
            conn.close()
        except Exception:
            pass


def update_procedures_catalog():
    print(f"--- Worker Feegow Procedures Catalog: {datetime.datetime.now().strftime('%H:%M:%S')} ---")
    db = DatabaseManager()
    db.update_heartbeat("procedures_catalog", "RUNNING", "Baixando catalogo de procedimentos...")

    try:
        _ensure_table(db)
    except Exception as e:
        print(f"Erro criando tabela de catalogo: {e}")
        db.update_heartbeat("procedures_catalog", "ERROR", f"Erro tabela: {e}")
        return

    try:
        df = _fetch_all_catalog()
    except Exception as e:
        print(f"Erro ao buscar catalogo na API: {e}")
        db.update_heartbeat("procedures_catalog", "ERROR", f"Erro API: {e}")
        return

    if df.empty:
        msg = "Feegow retornou catalogo vazio."
        print(msg)
        db.update_heartbeat("procedures_catalog", "WARNING", msg)
        return

    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    dedup = {}

    for _, row in df.iterrows():
        procedimento_id = _to_int(
            row.get("procedimento_id") if "procedimento_id" in row else row.get("id"),
            default=0,
        )
        if not procedimento_id:
            continue

        nome = str(row.get("nome") or "").strip()
        if not nome:
            continue

        dedup[procedimento_id] = (
            procedimento_id,
            nome,
            str(row.get("codigo") or "").strip() or None,
            _to_int(row.get("tipo_procedimento"), default=None),
            _to_int(row.get("grupo_procedimento"), default=None),
            _to_float(row.get("valor"), default=0.0),
            _normalize_specialties(row.get("especialidade_id")),
            json.dumps(row.to_dict(), ensure_ascii=False, default=str),
            now,
        )

    data_params = list(dedup.values())
    if not data_params:
        msg = "Catalogo sem registros validos apos normalizacao."
        print(msg)
        db.update_heartbeat("procedures_catalog", "WARNING", msg)
        return

    save_conn = db.get_connection()
    try:
        sql = """
            INSERT INTO feegow_procedures_catalog (
                procedimento_id,
                nome,
                codigo,
                tipo_procedimento,
                grupo_procedimento,
                valor,
                especialidades_json,
                raw_json,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(procedimento_id) DO UPDATE SET
                nome = excluded.nome,
                codigo = excluded.codigo,
                tipo_procedimento = excluded.tipo_procedimento,
                grupo_procedimento = excluded.grupo_procedimento,
                valor = excluded.valor,
                especialidades_json = excluded.especialidades_json,
                raw_json = excluded.raw_json,
                updated_at = excluded.updated_at
        """

        if db.use_turso:
            if not libsql_client:
                raise RuntimeError("libsql_client nao disponivel para batch no Turso.")
            chunk_size = 400
            for i in range(0, len(data_params), chunk_size):
                chunk = data_params[i : i + chunk_size]
                stmts = [libsql_client.Statement(sql, p) for p in chunk]
                save_conn.batch(stmts)
        else:
            save_conn.executemany(sql, data_params)
            save_conn.commit()

        msg = f"Catalogo atualizado: {len(data_params)} procedimentos."
        print(f"[OK] {msg}")
        db.update_heartbeat("procedures_catalog", "ONLINE", msg)
    except Exception as e:
        print(f"[ERRO] Erro salvando catalogo: {e}")
        db.update_heartbeat("procedures_catalog", "ERROR", str(e))
    finally:
        try:
            save_conn.close()
        except Exception:
            pass


if __name__ == "__main__":
    update_procedures_catalog()
