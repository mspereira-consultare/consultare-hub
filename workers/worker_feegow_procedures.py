import datetime
import json
import os
import statistics
import sys
import time
from collections import Counter

import pandas as pd

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    import libsql_client
except ImportError:
    libsql_client = None

from database_manager import DatabaseManager
from feegow_client import fetch_procedures_catalog


DEFAULT_UNITS = [2, 3, 12]
DEFAULT_TYPES = [1, 2, 3, 4]


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


def _parse_list_env(name, default):
    raw = str(os.getenv(name, "")).strip()
    if not raw:
        return list(default)
    items = []
    for part in raw.split(","):
        val = _to_int(part, default=None)
        if val is not None and val > 0:
            items.append(val)
    return items or list(default)


def _normalize_specialties(raw):
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(v).strip() for v in raw if str(v).strip()]
    text = str(raw).strip()
    if not text:
        return []
    if text.startswith("[") and text.endswith("]"):
        try:
            arr = json.loads(text)
            if isinstance(arr, list):
                return [str(v).strip() for v in arr if str(v).strip()]
        except Exception:
            pass
    if "," in text:
        return [part.strip() for part in text.split(",") if part.strip()]
    return [text]


def _resolve_value_scale(raw_values):
    """
    Resolve escala do campo valor:
    - auto (default): detecta padrão provável de centavos.
    - override: FEEGOW_PROCEDURES_VALUE_SCALE = 1 | 0.01 | reais | centavos
    """
    mode = str(os.getenv("FEEGOW_PROCEDURES_VALUE_SCALE", "auto")).strip().lower()
    if mode in ("0.01", "centavos", "centavo", "cents", "cent"):
        return 0.01, "forced_centavos"
    if mode in ("1", "1.0", "reais", "real"):
        return 1.0, "forced_reais"

    values = [v for v in raw_values if v is not None and v > 0]
    if not values:
        return 1.0, "auto_no_values"

    integer_ratio = sum(1 for v in values if abs(v - round(v)) < 1e-9) / len(values)
    ge_1000_ratio = sum(1 for v in values if v >= 1000) / len(values)
    ge_10000_ratio = sum(1 for v in values if v >= 10000) / len(values)

    # Heurística pragmática:
    # se maioria é inteiro e muitos valores estão altos, geralmente a API está em centavos.
    if integer_ratio >= 0.95 and (ge_1000_ratio >= 0.40 or ge_10000_ratio >= 0.15):
        return 0.01, "auto_centavos_detected"
    return 1.0, "auto_reais_detected"


def _fetch_catalog_for_units(unit_ids, type_ids):
    frames = []
    total_calls = 0
    success_calls = 0

    for unit_id in unit_ids:
        for type_id in type_ids:
            total_calls += 1
            params = {"unidade_id": unit_id, "tipo_procedimento": type_id}
            try:
                df = fetch_procedures_catalog(params)
            except Exception as e:
                print(f"Aviso: falha API unidade={unit_id} tipo={type_id}: {e}")
                time.sleep(0.2)
                continue

            if df.empty:
                time.sleep(0.2)
                continue

            success_calls += 1
            df = df.copy()
            df["_source_unidade"] = unit_id
            df["_source_tipo"] = type_id
            frames.append(df)
            time.sleep(0.2)

    if not frames:
        print(f"Chamadas API sem retorno. total_calls={total_calls}, success_calls={success_calls}")
        return pd.DataFrame()

    merged = pd.concat(frames, ignore_index=True)
    print(
        f"Catalogo bruto carregado: linhas={len(merged)} | "
        f"calls={total_calls} | calls_com_dados={success_calls} | unidades={unit_ids}"
    )
    return merged


def _aggregate_catalog(df, scale):
    buckets = {}
    for _, row in df.iterrows():
        procedimento_id = _to_int(
            row.get("procedimento_id") if "procedimento_id" in row else row.get("id"),
            default=0,
        )
        if not procedimento_id:
            continue

        bucket = buckets.setdefault(
            procedimento_id,
            {
                "names": Counter(),
                "codes": Counter(),
                "type_ids": [],
                "group_ids": [],
                "values_raw": [],
                "specialties": set(),
                "sample_row": None,
                "sources": set(),
            },
        )

        name = str(row.get("nome") or "").strip()
        if name:
            bucket["names"][name] += 1

        code = str(row.get("codigo") or "").strip()
        if code:
            bucket["codes"][code] += 1

        tpid = _to_int(row.get("tipo_procedimento"), default=None)
        if tpid is not None:
            bucket["type_ids"].append(tpid)

        gpid = _to_int(row.get("grupo_procedimento"), default=None)
        if gpid is not None:
            bucket["group_ids"].append(gpid)

        raw_val = _to_float(row.get("valor"), default=0.0)
        if raw_val > 0:
            bucket["values_raw"].append(raw_val)

        for spec in _normalize_specialties(row.get("especialidade_id")):
            bucket["specialties"].add(spec)

        source_unit = _to_int(row.get("_source_unidade"), default=None)
        source_type = _to_int(row.get("_source_tipo"), default=None)
        bucket["sources"].add(f"u{source_unit}_t{source_type}")

        if bucket["sample_row"] is None:
            try:
                bucket["sample_row"] = row.to_dict()
            except Exception:
                bucket["sample_row"] = {}

    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    data_params = []

    for procedimento_id, item in buckets.items():
        if item["names"]:
            nome = item["names"].most_common(1)[0][0]
        else:
            nome = ""
        if not nome:
            continue

        codigo = item["codes"].most_common(1)[0][0] if item["codes"] else None
        tipo_procedimento = statistics.mode(item["type_ids"]) if item["type_ids"] else None
        grupo_procedimento = statistics.mode(item["group_ids"]) if item["group_ids"] else None

        values_scaled = [round(v * scale, 2) for v in item["values_raw"] if v > 0]
        if values_scaled:
            valor = round(statistics.median(values_scaled), 2)
        else:
            valor = 0.0

        especialidades_json = json.dumps(sorted(item["specialties"]), ensure_ascii=False)
        raw_json = json.dumps(
            {
                "source": "worker_feegow_procedures_v2",
                "applied_scale": scale,
                "sources": sorted(item["sources"]),
                "sample_row": item["sample_row"],
                "observed_values_raw": item["values_raw"][:10],
                "observed_values_scaled": values_scaled[:10],
            },
            ensure_ascii=False,
            default=str,
        )

        data_params.append(
            (
                procedimento_id,
                nome,
                codigo,
                tipo_procedimento,
                grupo_procedimento,
                valor,
                especialidades_json,
                raw_json,
                now,
            )
        )

    return data_params


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

    unit_ids = _parse_list_env("FEEGOW_PROCEDURES_UNITS", DEFAULT_UNITS)
    type_ids = _parse_list_env("FEEGOW_PROCEDURES_TYPES", DEFAULT_TYPES)

    try:
        _ensure_table(db)
    except Exception as e:
        print(f"Erro criando tabela de catalogo: {e}")
        db.update_heartbeat("procedures_catalog", "ERROR", f"Erro tabela: {e}")
        return

    try:
        raw_df = _fetch_catalog_for_units(unit_ids, type_ids)
    except Exception as e:
        print(f"Erro ao buscar catalogo na API: {e}")
        db.update_heartbeat("procedures_catalog", "ERROR", f"Erro API: {e}")
        return

    if raw_df.empty:
        msg = "Feegow retornou catalogo vazio."
        print(msg)
        db.update_heartbeat("procedures_catalog", "WARNING", msg)
        return

    raw_values = []
    for _, row in raw_df.iterrows():
        rv = _to_float(row.get("valor"), default=0.0)
        if rv > 0:
            raw_values.append(rv)

    scale, scale_reason = _resolve_value_scale(raw_values)
    print(
        f"Escala de valor aplicada: {scale} ({scale_reason}) | "
        f"positivos={len(raw_values)}"
    )

    data_params = _aggregate_catalog(raw_df, scale)
    if not data_params:
        msg = "Catalogo sem registros validos apos agregacao."
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

        msg = (
            f"Catalogo atualizado: {len(data_params)} procedimentos | "
            f"unidades={unit_ids} | escala={scale} ({scale_reason})"
        )
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
