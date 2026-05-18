import argparse
import json
import os
import re
import sys
import time
import uuid
from datetime import datetime
import unicodedata

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from database_manager import DatabaseManager
from feegow_client import request_endpoint


DEFAULT_UNITS = [2, 3, 12]
UNIT_LABELS = {
    2: "OURO VERDE",
    3: "CENTRO CAMBUI",
    12: "SHOPPING CAMPINAS",
}
BRAZIL_UFS = {
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
    "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
    "SP", "SE", "TO",
}
DEFAULT_DELAY_SECONDS = 0.15
DEFAULT_CONTRACT_TYPE = "PADRAO_CLT"
SYSTEM_ACTOR = "system:feegow_professionals_sync"
EXCLUDED_PROFESSIONAL_NAMES = {
    "LABORATORIO CAMPINAS SHOPPING",
    "LABORATORIO OURO VERDE SP",
    "LABORATORIO CENTRO SP",
    "RAIO X MATRIZ",
    "RAIO X OURO VERDE SP",
    "ESTETICISTA",
    "EMPRESA FONO",
    "VACINA CAMPINAS SHOPPING"
}


def _now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _clean(value):
    return str(value or "").strip()


def _normalize_name_key(value):
    raw = _clean(value)
    if not raw:
        return ""
    normalized = (
        unicodedata.normalize("NFD", raw)
        .encode("ascii", "ignore")
        .decode("ascii")
        .upper()
    )
    normalized = re.sub(r"[^A-Z0-9]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def _digits(value):
    return re.sub(r"\D", "", _clean(value))


def _format_cpf(value):
    digits = _digits(value)[:11]
    if len(digits) != 11:
        return ""
    return f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"


def _parse_int(value, default=None):
    raw = _clean(value)
    if raw == "":
        return default
    try:
        return int(float(raw))
    except Exception:
        return default


def _is_valid_uf(value):
    return _clean(value).upper() in BRAZIL_UFS


def _parse_units(raw):
    text = _clean(raw)
    if not text:
        return list(DEFAULT_UNITS)
    result = []
    for part in text.split(","):
        unit_id = _parse_int(part, default=None)
        if unit_id and unit_id not in result:
            result.append(unit_id)
    return result or list(DEFAULT_UNITS)


def _get_col(row, index, key=None):
    if row is None:
        return None
    if key and isinstance(row, dict):
        return row.get(key)
    try:
        return row[index]
    except Exception:
        pass
    if key:
        try:
            return row[key]
        except Exception:
            pass
        return getattr(row, key, None)
    return None


def _query_all(db, sql, params=()):
    conn = db.get_connection()
    try:
        rs = conn.execute(sql, params)
        if hasattr(rs, "fetchall"):
            return rs.fetchall()
        if hasattr(rs, "rows"):
            return rs.rows
        return []
    finally:
        try:
            conn.close()
        except Exception:
            pass


def _query_one(db, sql, params=()):
    rows = _query_all(db, sql, params)
    return rows[0] if rows else None


def _safe_add_column(conn, sql):
    try:
        conn.execute(sql)
        conn.commit()
    except Exception as exc:
        msg = str(exc)
        if "Duplicate column name" in msg or "ER_DUP_FIELDNAME" in msg:
            return
        raise


def _optional_text(value):
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _result_rows(rs):
    if hasattr(rs, "fetchall"):
        return rs.fetchall()
    if hasattr(rs, "rows"):
        return rs.rows
    return []


def _registration_key(council_type, council_number, council_uf):
    return (
        _clean(council_type).upper(),
        _clean(council_number),
        _clean(council_uf).upper(),
    )


def _ensure_tables(db):
    conn = db.get_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS professionals (
              id VARCHAR(64) PRIMARY KEY,
              name VARCHAR(180) NOT NULL,
              contract_party_type VARCHAR(2) NOT NULL,
              contract_type VARCHAR(40) NOT NULL,
              cpf VARCHAR(14) UNIQUE,
              cnpj VARCHAR(18) UNIQUE,
              legal_name VARCHAR(180),
              specialty VARCHAR(120) NOT NULL,
              primary_specialty VARCHAR(120),
              specialties_json LONGTEXT,
              phone VARCHAR(40),
              email VARCHAR(180),
              age_range VARCHAR(60),
              service_units_json LONGTEXT,
              has_feegow_permissions INTEGER NOT NULL DEFAULT 0,
              personal_doc_type VARCHAR(10) NOT NULL,
              personal_doc_number VARCHAR(40) NOT NULL,
              address_text TEXT NOT NULL,
              is_active INTEGER NOT NULL DEFAULT 1,
              has_physical_folder INTEGER NOT NULL DEFAULT 0,
              physical_folder_note TEXT,
              payment_minimum_text TEXT,
              contract_template_id VARCHAR(64) NULL,
              contract_start_date DATE NULL,
              contract_end_date DATE NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS professional_registrations (
              id VARCHAR(64) PRIMARY KEY,
              professional_id VARCHAR(64) NOT NULL,
              council_type VARCHAR(10) NOT NULL,
              council_number VARCHAR(40) NOT NULL,
              rqe VARCHAR(40),
              council_uf VARCHAR(2) NOT NULL,
              is_primary INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              UNIQUE(council_type, council_number, council_uf)
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS professional_document_checklist (
              id VARCHAR(64) PRIMARY KEY,
              professional_id VARCHAR(64) NOT NULL,
              doc_type VARCHAR(40) NOT NULL,
              has_physical_copy INTEGER NOT NULL DEFAULT 0,
              has_digital_copy INTEGER NOT NULL DEFAULT 0,
              expires_at DATE,
              notes TEXT,
              verified_by VARCHAR(64) NOT NULL,
              verified_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              UNIQUE(professional_id, doc_type)
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS professional_audit_log (
              id VARCHAR(64) PRIMARY KEY,
              professional_id VARCHAR(64),
              action VARCHAR(60) NOT NULL,
              actor_user_id VARCHAR(64) NOT NULL,
              payload_json LONGTEXT,
              created_at TEXT NOT NULL
            )
            """
        )

        _safe_add_column(conn, "ALTER TABLE professionals ADD COLUMN attendance_modes_json LONGTEXT NULL")
        _safe_add_column(conn, "ALTER TABLE professionals ADD COLUMN service_locations_text_json LONGTEXT NULL")
        _safe_add_column(conn, "ALTER TABLE professionals ADD COLUMN patient_age_text TEXT NULL")
        _safe_add_column(conn, "ALTER TABLE professionals ADD COLUMN walk_in_policy_text TEXT NULL")
        _safe_add_column(conn, "ALTER TABLE professionals ADD COLUMN ideal_room_text TEXT NULL")
        _safe_add_column(conn, "ALTER TABLE professionals ADD COLUMN intranet_notes_text TEXT NULL")
        _safe_add_column(conn, "ALTER TABLE professional_registrations ADD COLUMN rqe VARCHAR(40) NULL")
        conn.commit()
    finally:
        try:
            conn.close()
        except Exception:
            pass


def _fetch_active_by_unit(unit_id):
    payload = {
        "ativo": 1,
        "unidade_id": unit_id,
    }
    data = request_endpoint("professional/list", method="GET", json_body=payload) or {}
    content = data.get("content")
    if not isinstance(content, list):
        return []
    return content


def _fetch_professional_detail(professional_id):
    payload = {
        "profissional_id": professional_id,
    }
    data = request_endpoint("professional/search", method="GET", json_body=payload) or {}
    content = data.get("content")
    return content if isinstance(content, dict) else {}


def _extract_specialties(bucket, detail):
    names = []
    seen = set()

    for row in bucket.get("list_rows", []):
        for spec in row.get("especialidades") or []:
            name = _clean(spec.get("nome_especialidade") or spec.get("nome"))
            key = name.lower()
            if not name or key in seen:
                continue
            seen.add(key)
            names.append(name)

    for spec in detail.get("especialidades") or []:
        name = _clean(spec.get("nome_especialidade") or spec.get("nome"))
        key = name.lower()
        if not name or key in seen:
            continue
        seen.add(key)
        names.append(name)

    return names


def _extract_age_range(list_row, info_row):
    min_age = _parse_int(info_row.get("idade_minima"), default=None)
    max_age = _parse_int(info_row.get("idade_maxima"), default=None)
    if min_age is None or max_age is None:
        restrictions = list_row.get("age_restriction") or []
        if isinstance(restrictions, list) and restrictions:
            first = restrictions[0] or {}
            if min_age is None:
                min_age = _parse_int(first.get("age_from"), default=None)
            if max_age is None:
                max_age = _parse_int(first.get("age_to"), default=None)
    if min_age is None and max_age is None:
        return None
    if min_age is None:
        min_age = 0
    if max_age is None:
        max_age = 120
    min_age = max(0, min(min_age, 120))
    max_age = max(0, min(max_age, 120))
    if min_age > max_age:
        min_age, max_age = max_age, min_age
    return f"{min_age}-{max_age}"


def _pick_phone(info_row):
    candidates = []
    for key in ("celulares", "telefones"):
        values = info_row.get(key)
        if isinstance(values, list):
            candidates.extend(values)
        else:
            candidates.append(values)

    for value in candidates:
        digits = _digits(value)
        if len(digits) in (10, 11):
            return digits
    return None


def _build_address(info_row):
    street = _clean(info_row.get("rua"))
    number = _clean(info_row.get("numero_rua"))
    complement = _clean(info_row.get("complemento"))
    bairro = _clean(info_row.get("bairro"))
    cidade = _clean(info_row.get("cidade"))
    cep = _clean(info_row.get("CEP"))

    parts = []

    line1 = ", ".join([part for part in [street, number] if part])
    if line1:
        parts.append(line1)

    if complement:
        parts.append(complement)
    if bairro:
        parts.append(bairro)
    if cidade:
        parts.append(cidade)

    address = ", ".join(parts)
    if cep:
        address = f"{address} - CEP {cep}" if address else f"CEP {cep}"

    return address


def _build_registrations(bucket, detail):
    registrations = []
    seen = set()

    for spec in detail.get("especialidades") or []:
        council_type = _clean(spec.get("conselho")).upper()
        council_number = _clean(spec.get("documento_conselho"))
        council_uf = _clean(spec.get("uf_conselho")).upper()
        rqe = _clean(spec.get("rqe"))
        if not council_type or not council_number or not _is_valid_uf(council_uf):
            continue
        key = (council_type, council_number, council_uf)
        if key in seen:
            continue
        seen.add(key)
        registrations.append(
            {
                "council_type": council_type,
                "council_number": council_number,
                "council_uf": council_uf,
                "rqe": rqe or None,
            }
        )

    info_rows = detail.get("informacoes") or []
    info_row = info_rows[0] if info_rows else {}
    top_level_candidates = list(bucket.get("list_rows", []))
    if info_row:
        top_level_candidates.insert(0, info_row)

    for row in top_level_candidates:
        council_type = _clean(row.get("conselho")).upper()
        council_number = _clean(row.get("documento_conselho"))
        council_uf = _clean(row.get("uf_conselho")).upper()
        rqe = _clean(row.get("rqe"))
        if not council_type or not council_number or not _is_valid_uf(council_uf):
            continue
        key = (council_type, council_number, council_uf)
        if key in seen:
            continue
        seen.add(key)
        registrations.append(
            {
                "council_type": council_type,
                "council_number": council_number,
                "council_uf": council_uf,
                "rqe": rqe or None,
            }
        )

    for idx, row in enumerate(registrations):
        row["is_primary"] = 1 if idx == 0 else 0

    return registrations


def _build_payload(professional_id, bucket, detail):
    list_rows = bucket.get("list_rows", [])
    base_row = bucket.get("preferred_row") or (list_rows[0] if list_rows else {})
    info_rows = detail.get("informacoes") or []
    info_row = info_rows[0] if info_rows else {}

    name = (
        _clean(info_row.get("nome"))
        or _clean(base_row.get("nome"))
        or _clean(base_row.get("tratamento"))
    )
    if not name:
        return None

    cpf_digits = (
        _digits(info_row.get("CPF"))
        or _digits(base_row.get("cpf"))
    )
    specialties = _extract_specialties(bucket, detail)
    primary_specialty = specialties[0] if specialties else ""
    age_range = _extract_age_range(base_row, info_row)
    phone = _pick_phone(info_row)
    email = _clean(info_row.get("email")) or _clean(base_row.get("email")) or None
    address = _build_address(info_row)
    has_feegow_permissions = 1 if _parse_int(base_row.get("sys_user"), default=0) else 0
    unit_labels = [UNIT_LABELS[unit_id] for unit_id in sorted(bucket.get("unit_ids", set())) if unit_id in UNIT_LABELS]
    registrations = _build_registrations(bucket, detail)

    return {
        "source_professional_id": professional_id,
        "name": name,
        "cpf": cpf_digits or None,
        "specialty": primary_specialty,
        "specialties": specialties,
        "primary_specialty": primary_specialty or None,
        "phone": phone,
        "email": email,
        "age_range": age_range,
        "service_units": unit_labels,
        "has_feegow_permissions": has_feegow_permissions,
        "personal_doc_type": "CPF",
        "personal_doc_number": cpf_digits,
        "address_text": address,
        "registrations": registrations,
    }


def _find_existing_professional(db, professional_id, cpf):
    row = _query_one(
        db,
        """
        SELECT
          id,
          contract_party_type,
          contract_type,
          cnpj,
          legal_name,
          attendance_modes_json,
          service_locations_text_json,
          patient_age_text,
          walk_in_policy_text,
          ideal_room_text,
          intranet_notes_text,
          has_physical_folder,
          physical_folder_note,
          payment_minimum_text,
          contract_template_id,
          contract_start_date,
          contract_end_date,
          created_at
        FROM professionals
        WHERE id = ?
        LIMIT 1
        """,
        [f"feegow:{professional_id}"],
    )
    if not row and cpf:
        row = _query_one(
            db,
            """
            SELECT
              id,
              contract_party_type,
              contract_type,
              cnpj,
              legal_name,
              attendance_modes_json,
              service_locations_text_json,
              patient_age_text,
              walk_in_policy_text,
              ideal_room_text,
              intranet_notes_text,
              has_physical_folder,
              physical_folder_note,
              payment_minimum_text,
              contract_template_id,
              contract_start_date,
              contract_end_date,
              created_at
            FROM professionals
            WHERE cpf = ?
            LIMIT 1
            """,
            [cpf],
        )

    if not row:
        return None

    return {
        "id": _clean(_get_col(row, 0, "id")),
        "contract_party_type": _clean(_get_col(row, 1, "contract_party_type")).upper() or "PF",
        "contract_type": _clean(_get_col(row, 2, "contract_type")) or DEFAULT_CONTRACT_TYPE,
        "cnpj": _optional_text(_get_col(row, 3, "cnpj")),
        "legal_name": _optional_text(_get_col(row, 4, "legal_name")),
        "attendance_modes_json": _optional_text(_get_col(row, 5, "attendance_modes_json")),
        "service_locations_text_json": _optional_text(_get_col(row, 6, "service_locations_text_json")),
        "patient_age_text": _optional_text(_get_col(row, 7, "patient_age_text")),
        "walk_in_policy_text": _optional_text(_get_col(row, 8, "walk_in_policy_text")),
        "ideal_room_text": _optional_text(_get_col(row, 9, "ideal_room_text")),
        "intranet_notes_text": _optional_text(_get_col(row, 10, "intranet_notes_text")),
        "has_physical_folder": 1 if _get_col(row, 11, "has_physical_folder") else 0,
        "physical_folder_note": _optional_text(_get_col(row, 12, "physical_folder_note")),
        "payment_minimum_text": _optional_text(_get_col(row, 13, "payment_minimum_text")),
        "contract_template_id": _optional_text(_get_col(row, 14, "contract_template_id")),
        "contract_start_date": _optional_text(_get_col(row, 15, "contract_start_date")),
        "contract_end_date": _optional_text(_get_col(row, 16, "contract_end_date")),
        "created_at": _clean(_get_col(row, 17, "created_at")) or _now(),
    }


def _merge_professional_registrations(conn, professional_key, registrations, now):
    if not registrations:
        return

    rs = conn.execute(
        """
        SELECT
          id,
          council_type,
          council_number,
          council_uf,
          is_primary
        FROM professional_registrations
        WHERE professional_id = ?
        """,
        [professional_key],
    )
    existing_rows = _result_rows(rs)
    existing_by_key = {}
    for row in existing_rows:
        key = _registration_key(
            _get_col(row, 1, "council_type"),
            _get_col(row, 2, "council_number"),
            _get_col(row, 3, "council_uf"),
        )
        existing_by_key[key] = row

    incoming_keys = set()
    has_primary_from_feegow = False
    for reg in registrations:
        key = _registration_key(reg["council_type"], reg["council_number"], reg["council_uf"])
        incoming_keys.add(key)
        is_primary = 1 if reg.get("is_primary") else 0
        has_primary_from_feegow = has_primary_from_feegow or bool(is_primary)
        existing_row = existing_by_key.get(key)

        if existing_row:
            conn.execute(
                """
                UPDATE professional_registrations
                SET
                  rqe = ?,
                  is_primary = ?,
                  updated_at = ?
                WHERE id = ?
                """,
                [
                    reg.get("rqe"),
                    is_primary,
                    now,
                    _get_col(existing_row, 0, "id"),
                ],
            )
            continue

        conn.execute(
            """
            INSERT INTO professional_registrations (
              id, professional_id, council_type, council_number, rqe, council_uf, is_primary, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                str(uuid.uuid4()),
                professional_key,
                reg["council_type"],
                reg["council_number"],
                reg.get("rqe"),
                reg["council_uf"],
                is_primary,
                now,
                now,
            ],
        )

    if not has_primary_from_feegow:
        return

    for key, row in existing_by_key.items():
        if key in incoming_keys:
            continue
        if _get_col(row, 4, "is_primary"):
            conn.execute(
                """
                UPDATE professional_registrations
                SET
                  is_primary = 0,
                  updated_at = ?
                WHERE id = ?
                """,
                [
                    now,
                    _get_col(row, 0, "id"),
                ],
            )


def _save_professional(db, payload, existing):
    now = _now()
    professional_key = existing["id"] if existing else f"feegow:{payload['source_professional_id']}"
    created_at = existing["created_at"] if existing else now
    # Feegow updates the operational profile; panel-owned fields stay untouched once curated locally.
    feegow_managed = {
        "name": payload["name"],
        "cpf": payload["cpf"],
        "specialty": payload["specialty"],
        "primary_specialty": payload["primary_specialty"],
        "specialties_json": json.dumps(payload["specialties"], ensure_ascii=False),
        "phone": payload["phone"],
        "email": payload["email"],
        "age_range": payload["age_range"],
        "service_units_json": json.dumps(payload["service_units"], ensure_ascii=False),
        "has_feegow_permissions": payload["has_feegow_permissions"],
        "personal_doc_type": payload["personal_doc_type"],
        "personal_doc_number": payload["personal_doc_number"] or "",
        "address_text": payload["address_text"] or "",
        "is_active": 1,
    }
    panel_managed = {
        "contract_party_type": existing["contract_party_type"] if existing else "PF",
        "contract_type": existing["contract_type"] if existing else DEFAULT_CONTRACT_TYPE,
        "cnpj": existing["cnpj"] if existing else None,
        "legal_name": existing["legal_name"] if existing else None,
        "attendance_modes_json": existing["attendance_modes_json"] if existing else None,
        "service_locations_text_json": existing["service_locations_text_json"] if existing else None,
        "patient_age_text": existing["patient_age_text"] if existing else None,
        "walk_in_policy_text": existing["walk_in_policy_text"] if existing else None,
        "ideal_room_text": existing["ideal_room_text"] if existing else None,
        "intranet_notes_text": existing["intranet_notes_text"] if existing else None,
        "has_physical_folder": existing["has_physical_folder"] if existing else 0,
        "physical_folder_note": existing["physical_folder_note"] if existing else None,
        "payment_minimum_text": existing["payment_minimum_text"] if existing else None,
        "contract_template_id": existing["contract_template_id"] if existing else None,
        "contract_start_date": existing["contract_start_date"] if existing else None,
        "contract_end_date": existing["contract_end_date"] if existing else None,
    }

    conn = db.get_connection()
    try:
        if existing:
            conn.execute(
                """
                UPDATE professionals
                SET
                  name = ?,
                  contract_party_type = ?,
                  contract_type = ?,
                  cpf = ?,
                  cnpj = ?,
                  legal_name = ?,
                  specialty = ?,
                  primary_specialty = ?,
                  specialties_json = ?,
                  phone = ?,
                  email = ?,
                  age_range = ?,
                  service_units_json = ?,
                  attendance_modes_json = ?,
                  service_locations_text_json = ?,
                  patient_age_text = ?,
                  walk_in_policy_text = ?,
                  ideal_room_text = ?,
                  intranet_notes_text = ?,
                  has_feegow_permissions = ?,
                  personal_doc_type = ?,
                  personal_doc_number = ?,
                  address_text = ?,
                  is_active = ?,
                  has_physical_folder = ?,
                  physical_folder_note = ?,
                  payment_minimum_text = ?,
                  contract_template_id = ?,
                  contract_start_date = ?,
                  contract_end_date = ?,
                  updated_at = ?
                WHERE id = ?
                """,
                [
                    feegow_managed["name"],
                    panel_managed["contract_party_type"],
                    panel_managed["contract_type"],
                    feegow_managed["cpf"],
                    panel_managed["cnpj"],
                    panel_managed["legal_name"],
                    feegow_managed["specialty"],
                    feegow_managed["primary_specialty"],
                    feegow_managed["specialties_json"],
                    feegow_managed["phone"],
                    feegow_managed["email"],
                    feegow_managed["age_range"],
                    feegow_managed["service_units_json"],
                    panel_managed["attendance_modes_json"],
                    panel_managed["service_locations_text_json"],
                    panel_managed["patient_age_text"],
                    panel_managed["walk_in_policy_text"],
                    panel_managed["ideal_room_text"],
                    panel_managed["intranet_notes_text"],
                    feegow_managed["has_feegow_permissions"],
                    feegow_managed["personal_doc_type"],
                    feegow_managed["personal_doc_number"],
                    feegow_managed["address_text"],
                    feegow_managed["is_active"],
                    panel_managed["has_physical_folder"],
                    panel_managed["physical_folder_note"],
                    panel_managed["payment_minimum_text"],
                    panel_managed["contract_template_id"],
                    panel_managed["contract_start_date"],
                    panel_managed["contract_end_date"],
                    now,
                    professional_key,
                ],
            )
        else:
            conn.execute(
                """
                INSERT INTO professionals (
                  id, name, contract_party_type, contract_type, cpf, cnpj, legal_name,
                  specialty, primary_specialty, specialties_json, phone, email, age_range, service_units_json,
                  attendance_modes_json, service_locations_text_json, patient_age_text, walk_in_policy_text,
                  ideal_room_text, intranet_notes_text,
                  has_feegow_permissions, personal_doc_type, personal_doc_number, address_text, is_active,
                  has_physical_folder, physical_folder_note, contract_template_id, contract_start_date, contract_end_date,
                  payment_minimum_text, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    professional_key,
                    feegow_managed["name"],
                    panel_managed["contract_party_type"],
                    panel_managed["contract_type"],
                    feegow_managed["cpf"],
                    panel_managed["cnpj"],
                    panel_managed["legal_name"],
                    feegow_managed["specialty"],
                    feegow_managed["primary_specialty"],
                    feegow_managed["specialties_json"],
                    feegow_managed["phone"],
                    feegow_managed["email"],
                    feegow_managed["age_range"],
                    feegow_managed["service_units_json"],
                    panel_managed["attendance_modes_json"],
                    panel_managed["service_locations_text_json"],
                    panel_managed["patient_age_text"],
                    panel_managed["walk_in_policy_text"],
                    panel_managed["ideal_room_text"],
                    panel_managed["intranet_notes_text"],
                    feegow_managed["has_feegow_permissions"],
                    feegow_managed["personal_doc_type"],
                    feegow_managed["personal_doc_number"],
                    feegow_managed["address_text"],
                    feegow_managed["is_active"],
                    panel_managed["has_physical_folder"],
                    panel_managed["physical_folder_note"],
                    panel_managed["contract_template_id"],
                    panel_managed["contract_start_date"],
                    panel_managed["contract_end_date"],
                    panel_managed["payment_minimum_text"],
                    created_at,
                    now,
                ],
            )

        _merge_professional_registrations(conn, professional_key, payload["registrations"], now)

        conn.commit()
    finally:
        try:
            conn.close()
        except Exception:
            pass

    return professional_key


def _insert_audit_summary(db, summary):
    conn = db.get_connection()
    try:
        conn.execute(
            """
            INSERT INTO professional_audit_log (
              id, professional_id, action, actor_user_id, payload_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                str(uuid.uuid4()),
                None,
                "PROFESSIONALS_SYNC_FROM_FEEGOW",
                SYSTEM_ACTOR,
                json.dumps(summary, ensure_ascii=False),
                _now(),
            ],
        )
        conn.commit()
    finally:
        try:
            conn.close()
        except Exception:
            pass


def _collect_active_professionals(unit_ids, delay_seconds):
    by_id = {}
    counts_by_unit = {}

    for unit_id in unit_ids:
        rows = _fetch_active_by_unit(unit_id)
        counts_by_unit[unit_id] = len(rows)
        print(f"Unidade {unit_id} ({UNIT_LABELS.get(unit_id, unit_id)}): {len(rows)} profissionais ativos")
        for row in rows:
            professional_id = _parse_int(row.get("profissional_id"), default=None)
            if not professional_id:
                continue
            bucket = by_id.setdefault(
                professional_id,
                {
                    "unit_ids": set(),
                    "list_rows": [],
                    "preferred_row": None,
                },
            )
            bucket["unit_ids"].add(unit_id)
            bucket["list_rows"].append(row)
            if bucket["preferred_row"] is None:
                bucket["preferred_row"] = row
            elif not _clean(bucket["preferred_row"].get("nome")) and _clean(row.get("nome")):
                bucket["preferred_row"] = row
        if delay_seconds > 0:
            time.sleep(delay_seconds)

    return by_id, counts_by_unit


def _should_exclude_name(name):
    key = _normalize_name_key(name)
    if not key:
        return None
    if key in EXCLUDED_PROFESSIONAL_NAMES:
        return f"nome_excluido:{key}"
    return None


def run_sync(dry_run=False, unit_ids=None, delay_seconds=DEFAULT_DELAY_SECONDS, limit=0):
    units = unit_ids or list(DEFAULT_UNITS)
    db = DatabaseManager()
    db.update_heartbeat("professionals_sync", "RUNNING", f"Iniciando sync Feegow | dry_run={dry_run}")

    try:
        _ensure_tables(db)
        buckets_by_id, counts_by_unit = _collect_active_professionals(units, delay_seconds)
        professional_ids = sorted(buckets_by_id.keys())
        if limit and limit > 0:
            professional_ids = professional_ids[:limit]

        print(f"Total unico de profissionais a processar: {len(professional_ids)}")

        summary = {
            "dry_run": bool(dry_run),
            "units": units,
            "counts_by_unit": counts_by_unit,
            "total_unique": len(professional_ids),
            "processed": 0,
            "created": 0,
            "updated": 0,
            "skipped": 0,
            "errors": 0,
        }

        for index, professional_id in enumerate(professional_ids, start=1):
            bucket = buckets_by_id[professional_id]
            base_name = _clean((bucket.get("preferred_row") or {}).get("nome"))
            exclusion_reason = _should_exclude_name(base_name)
            if exclusion_reason:
                summary["skipped"] += 1
                print(
                    f"[{index}/{len(professional_ids)}] IGNORADO profissional {professional_id}: "
                    f"{base_name} | motivo={exclusion_reason}"
                )
                if delay_seconds > 0:
                    time.sleep(delay_seconds)
                continue

            detail = _fetch_professional_detail(professional_id)
            payload = _build_payload(professional_id, bucket, detail)
            if not payload:
                summary["skipped"] += 1
                print(f"[{index}/{len(professional_ids)}] Ignorado profissional {professional_id}: sem nome")
                if delay_seconds > 0:
                    time.sleep(delay_seconds)
                continue

            exclusion_reason = _should_exclude_name(payload["name"])
            if exclusion_reason:
                summary["skipped"] += 1
                print(
                    f"[{index}/{len(professional_ids)}] IGNORADO profissional {professional_id}: "
                    f"{payload['name']} | motivo={exclusion_reason}"
                )
                if delay_seconds > 0:
                    time.sleep(delay_seconds)
                continue

            try:
                existing = _find_existing_professional(db, professional_id, payload["cpf"])
                action = "update" if existing else "create"
                if dry_run:
                    reg_count = len(payload["registrations"])
                    unit_label = ", ".join(payload["service_units"]) or "-"
                    cpf_display = _format_cpf(payload["cpf"]) if payload["cpf"] else "-"
                    print(
                        f"[{index}/{len(professional_ids)}] DRY-RUN {action.upper()} "
                        f"{payload['name']} | cpf={cpf_display} | unidades={unit_label} | registros={reg_count}"
                    )
                else:
                    _save_professional(db, payload, existing)
                summary["processed"] += 1
                if action == "create":
                    summary["created"] += 1
                else:
                    summary["updated"] += 1
            except Exception as exc:
                summary["errors"] += 1
                print(f"[{index}/{len(professional_ids)}] Erro profissional {professional_id}: {exc}")

            if delay_seconds > 0:
                time.sleep(delay_seconds)

        if not dry_run:
            _insert_audit_summary(db, summary)

        details = (
            f"Sync concluido | unique={summary['total_unique']} | processed={summary['processed']} | "
            f"created={summary['created']} | updated={summary['updated']} | skipped={summary['skipped']} | errors={summary['errors']}"
        )
        db.update_heartbeat("professionals_sync", "COMPLETED", details)
        print(details)
        return summary
    except Exception as exc:
        db.update_heartbeat("professionals_sync", "ERROR", f"Falha no sync: {exc}")
        raise


def main():
    parser = argparse.ArgumentParser(
        description="Sincroniza profissionais ativos da Feegow para o modulo de profissionais."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Consulta e normaliza os dados sem gravar no banco.",
    )
    parser.add_argument(
        "--units",
        default="2,3,12",
        help="Lista de unidades separadas por virgula (padrao: 2,3,12).",
    )
    parser.add_argument(
        "--delay-seconds",
        type=float,
        default=DEFAULT_DELAY_SECONDS,
        help="Intervalo entre chamadas da API (padrao: 0.15).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Limita a quantidade de profissionais unicos processados (uso de teste).",
    )
    args = parser.parse_args()

    units = _parse_units(args.units)
    print(
        f"--- Feegow Professionals Sync | dry_run={bool(args.dry_run)} | "
        f"units={units} | delay={args.delay_seconds:.2f}s | limit={args.limit or 'all'} ---"
    )
    run_sync(
        dry_run=bool(args.dry_run),
        unit_ids=units,
        delay_seconds=max(0.0, float(args.delay_seconds)),
        limit=max(0, int(args.limit)),
    )


if __name__ == "__main__":
    main()
