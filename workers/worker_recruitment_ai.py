import io
import json
import os
import tempfile
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional
from xml.etree import ElementTree

from database_manager import DatabaseManager
from storage_s3 import download_s3_object_bytes

try:
    from pypdf import PdfReader
except Exception:
    PdfReader = None

try:
    from openai import OpenAI
except Exception:
    OpenAI = None


SERVICE_NAME = "recruitment_ai"
STATUS_PENDING = "PENDING"
STATUS_RUNNING = "RUNNING"
STATUS_COMPLETED = "COMPLETED"
STATUS_FAILED = "FAILED"
STATUS_UNSUPPORTED = "UNSUPPORTED"

PROMPT_VERSION = "recruitment-triage-v1"
SCHEMA_VERSION = "recruitment-analysis-v1"
DEFAULT_MODEL = os.getenv("RECRUITMENT_AI_MODEL", "gpt-5.4-mini").strip() or "gpt-5.4-mini"
POLL_SECONDS = max(5, int(os.getenv("RECRUITMENT_AI_POLL_SEC", "15")))
MIN_TEXT_CHARS = max(120, int(os.getenv("RECRUITMENT_AI_MIN_TEXT_CHARS", "350")))
MAX_JOB_TEXT_CHARS = max(2000, int(os.getenv("RECRUITMENT_AI_MAX_JOB_TEXT_CHARS", "12000")))
MAX_RESUME_TEXT_CHARS = max(4000, int(os.getenv("RECRUITMENT_AI_MAX_RESUME_TEXT_CHARS", "18000")))
OPENAI_BASE_URL = str(os.getenv("OPENAI_BASE_URL", "") or "").strip() or None

ANALYSIS_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "score": {"type": "integer", "minimum": 0, "maximum": 100},
        "short_verdict": {"type": "string"},
        "detailed_report": {"type": "string"},
        "matched_requirements": {"type": "array", "items": {"type": "string"}},
        "missing_requirements": {"type": "array", "items": {"type": "string"}},
        "strengths": {"type": "array", "items": {"type": "string"}},
        "weaknesses": {"type": "array", "items": {"type": "string"}},
        "risks_or_gaps": {"type": "array", "items": {"type": "string"}},
        "evidence": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "title": {"type": "string"},
                    "details": {"type": "string"},
                },
                "required": ["title", "details"],
            },
        },
        "recommended_human_next_step": {"type": "string"},
    },
    "required": [
        "score",
        "short_verdict",
        "detailed_report",
        "matched_requirements",
        "missing_requirements",
        "strengths",
        "weaknesses",
        "risks_or_gaps",
        "evidence",
        "recommended_human_next_step",
    ],
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _row_get(row: Any, key: str, index: int = 0):
    if isinstance(row, dict):
        return row.get(key)
    if hasattr(row, key):
        return getattr(row, key)
    if isinstance(row, (list, tuple)):
        return row[index] if len(row) > index else None
    return None


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _truncate_text(value: str, max_chars: int) -> str:
    raw = _clean(value)
    if len(raw) <= max_chars:
        return raw
    return raw[:max_chars].rstrip() + "\n\n[Texto truncado para caber na análise.]"


def _normalize_whitespace(value: str) -> str:
    return " ".join(_clean(value).split())


def _execute(db: DatabaseManager, sql: str, params=()):
    conn = db.get_connection()
    try:
        result = conn.execute(sql, params)
        if not db.use_turso:
            conn.commit()
        return result
    finally:
        conn.close()


def _get_openai_client():
    api_key = _clean(os.getenv("OPENAI_API_KEY"))
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY não configurada para o worker de recrutamento.")
    if OpenAI is None:
        raise RuntimeError("Biblioteca openai não instalada no ambiente do worker.")
    kwargs = {"api_key": api_key}
    if OPENAI_BASE_URL:
        kwargs["base_url"] = OPENAI_BASE_URL
    return OpenAI(**kwargs)


def _extract_response_text(response: Any) -> str:
    output_text = _clean(getattr(response, "output_text", ""))
    if output_text:
        return output_text
    if isinstance(response, dict):
        return _clean(response.get("output_text"))
    if hasattr(response, "model_dump"):
        payload = response.model_dump()
        return _clean(payload.get("output_text"))
    return ""


def _serialize_response(response: Any) -> str:
    if hasattr(response, "model_dump"):
        return _json_dumps(response.model_dump())
    if isinstance(response, dict):
        return _json_dumps(response)
    return _clean(response)


def _get_pending_job(db: DatabaseManager) -> Optional[Dict[str, Any]]:
    rows = db.execute_query(
        """
        SELECT
          aj.id,
          aj.candidate_id,
          aj.job_id,
          aj.source_file_id,
          aj.attempts,
          aj.requested_by,
          aj.created_at,
          c.full_name,
          c.email,
          c.notes AS candidate_notes,
          c.stage,
          j.title,
          j.description_text,
          j.requirements_text,
          j.benefits_text,
          j.notes AS job_notes,
          f.storage_provider,
          f.storage_bucket,
          f.storage_key,
          f.original_name,
          f.mime_type
        FROM recruitment_ai_analysis_jobs aj
        INNER JOIN recruitment_candidates c ON c.id = aj.candidate_id
        INNER JOIN recruitment_jobs j ON j.id = aj.job_id
        LEFT JOIN recruitment_candidate_files f ON f.id = aj.source_file_id
        WHERE aj.status = ?
        ORDER BY aj.created_at ASC
        LIMIT 1
        """,
        (STATUS_PENDING,),
    ) or []
    if not rows:
        return None

    row = rows[0]
    return {
        "id": _clean(_row_get(row, "id", 0)),
        "candidate_id": _clean(_row_get(row, "candidate_id", 1)),
        "job_id": _clean(_row_get(row, "job_id", 2)),
        "source_file_id": _clean(_row_get(row, "source_file_id", 3)) or None,
        "attempts": int(_row_get(row, "attempts", 4) or 0),
        "requested_by": _clean(_row_get(row, "requested_by", 5)) or None,
        "created_at": _clean(_row_get(row, "created_at", 6)),
        "candidate_name": _clean(_row_get(row, "full_name", 7)),
        "candidate_email": _clean(_row_get(row, "email", 8)) or None,
        "candidate_notes": _clean(_row_get(row, "candidate_notes", 9)) or None,
        "candidate_stage": _clean(_row_get(row, "stage", 10)) or "RECEBIDO",
        "job_title": _clean(_row_get(row, "title", 11)),
        "job_description_text": _clean(_row_get(row, "description_text", 12)) or None,
        "job_requirements_text": _clean(_row_get(row, "requirements_text", 13)) or None,
        "job_benefits_text": _clean(_row_get(row, "benefits_text", 14)) or None,
        "job_notes": _clean(_row_get(row, "job_notes", 15)) or None,
        "storage_provider": _clean(_row_get(row, "storage_provider", 16)) or "s3",
        "storage_bucket": _clean(_row_get(row, "storage_bucket", 17)) or None,
        "storage_key": _clean(_row_get(row, "storage_key", 18)),
        "original_name": _clean(_row_get(row, "original_name", 19)) or "curriculo.bin",
        "mime_type": _clean(_row_get(row, "mime_type", 20)) or "application/octet-stream",
    }


def _mark_job_running(db: DatabaseManager, job_id: str):
    now = _now_iso()
    _execute(
        db,
        """
        UPDATE recruitment_ai_analysis_jobs
        SET status = ?, attempts = COALESCE(attempts, 0) + 1, last_error = NULL, model = ?, prompt_version = ?, updated_at = ?
        WHERE id = ?
        """,
        (STATUS_RUNNING, DEFAULT_MODEL, PROMPT_VERSION, now, job_id),
    )


def _mark_job_done(db: DatabaseManager, job_id: str, status: str, error_message: Optional[str] = None):
    now = _now_iso()
    completed_at = now if status in (STATUS_COMPLETED, STATUS_FAILED, STATUS_UNSUPPORTED) else None
    _execute(
        db,
        """
        UPDATE recruitment_ai_analysis_jobs
        SET status = ?, last_error = ?, completed_at = ?, updated_at = ?
        WHERE id = ?
        """,
        (status, _clean(error_message) or None, completed_at, now, job_id),
    )


def _update_candidate_ai_state(
    db: DatabaseManager,
    candidate_id: str,
    ai_status: str,
    ai_score: Optional[int] = None,
    analyzed_at: Optional[str] = None,
):
    now = _now_iso()
    _execute(
        db,
        """
        UPDATE recruitment_candidates
        SET ai_status = ?, ai_score = ?, ai_last_analyzed_at = ?, updated_at = ?
        WHERE id = ?
        """,
        (ai_status, ai_score, analyzed_at, now, candidate_id),
    )


def _insert_history(
    db: DatabaseManager,
    candidate_id: str,
    stage: str,
    action: str,
    notes: str,
    actor_user_id: str = "recruitment-ai-worker",
):
    _execute(
        db,
        """
        INSERT INTO recruitment_candidate_history (
          id, candidate_id, action, from_stage, to_stage, notes, actor_user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            os.urandom(16).hex(),
            candidate_id,
            action,
            stage,
            stage,
            _clean(notes) or None,
            actor_user_id,
            _now_iso(),
        ),
    )


def _create_extraction_record(db: DatabaseManager, job: Dict[str, Any], status: str, file_format: str) -> str:
    extraction_id = os.urandom(16).hex()
    now = _now_iso()
    _execute(
        db,
        """
        INSERT INTO recruitment_resume_extractions (
          id, candidate_id, file_id, extraction_status, file_format, extracted_text, quality_score, fallback_used, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            extraction_id,
            job["candidate_id"],
            job["source_file_id"],
            status,
            file_format,
            None,
            None,
            None,
            now,
            now,
        ),
    )
    return extraction_id


def _update_extraction_record(
    db: DatabaseManager,
    extraction_id: str,
    status: str,
    extracted_text: Optional[str],
    quality_score: Optional[int],
    fallback_used: Optional[str],
):
    _execute(
        db,
        """
        UPDATE recruitment_resume_extractions
        SET extraction_status = ?, extracted_text = ?, quality_score = ?, fallback_used = ?, updated_at = ?
        WHERE id = ?
        """,
        (status, extracted_text, quality_score, fallback_used, _now_iso(), extraction_id),
    )


def _get_file_format(file_name: str, mime_type: str) -> str:
    ext = Path(file_name or "").suffix.lower().replace(".", "")
    mime = _clean(mime_type).lower()
    if ext == "pdf" or mime == "application/pdf":
        return "PDF"
    if ext == "docx" or mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return "DOCX"
    if ext == "doc" or mime == "application/msword":
        return "DOC"
    return ext.upper() if ext else "DESCONHECIDO"


def _extract_pdf_text(file_bytes: bytes) -> str:
    if PdfReader is None:
        raise RuntimeError("pypdf não está instalado no ambiente do worker.")
    with io.BytesIO(file_bytes) as buffer:
        reader = PdfReader(buffer)
        parts = []
        for page in reader.pages:
            try:
                parts.append(page.extract_text() or "")
            except Exception:
                continue
    return "\n".join(part for part in parts if _clean(part))


def _extract_docx_text(file_bytes: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
        xml_payload = archive.read("word/document.xml")
    root = ElementTree.fromstring(xml_payload)
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    parts = []
    for paragraph in root.findall(".//w:p", namespace):
        texts = [node.text for node in paragraph.findall(".//w:t", namespace) if node.text]
        if texts:
            parts.append("".join(texts))
    return "\n".join(parts)


def _extract_text_locally(file_format: str, file_bytes: bytes) -> str:
    if file_format == "PDF":
        return _extract_pdf_text(file_bytes)
    if file_format == "DOCX":
        return _extract_docx_text(file_bytes)
    raise RuntimeError(f"Formato {file_format} não suportado para extração local.")


def _quality_score(text: str) -> int:
    size = len(_clean(text))
    if size >= 6000:
        return 95
    if size >= 2500:
        return 85
    if size >= 1000:
        return 70
    if size >= MIN_TEXT_CHARS:
        return 55
    return 20


def _build_system_prompt() -> str:
    return (
        "Você atua na triagem inicial de currículos para RH. "
        "Analise apenas a aderência profissional do candidato à vaga com base nas informações fornecidas. "
        "Não invente experiências, certificações ou resultados que não estejam evidentes. "
        "Se faltar informação, trate isso como lacuna e deixe explícito. "
        "Retorne somente o JSON exigido pelo schema."
    )


def _build_text_analysis_prompt(job: Dict[str, Any], resume_text: str) -> str:
    sections = [
        f"Título da vaga: {job['job_title']}",
        f"Descrição da vaga:\n{_truncate_text(job.get('job_description_text') or '', MAX_JOB_TEXT_CHARS)}",
        f"Requisitos:\n{_truncate_text(job.get('job_requirements_text') or '', MAX_JOB_TEXT_CHARS)}",
        f"Benefícios:\n{_truncate_text(job.get('job_benefits_text') or '', 4000)}",
        f"Observações da vaga:\n{_truncate_text(job.get('job_notes') or '', 3000)}",
        f"Nome do candidato: {job['candidate_name']}",
        f"Observações do candidato:\n{_truncate_text(job.get('candidate_notes') or '', 3000)}",
        f"Currículo extraído:\n{_truncate_text(resume_text, MAX_RESUME_TEXT_CHARS)}",
    ]
    return "\n\n".join(part for part in sections if _clean(part))


def _analysis_messages_from_text(job: Dict[str, Any], resume_text: str):
    return [
        {
            "role": "system",
            "content": [{"type": "input_text", "text": _build_system_prompt()}],
        },
        {
            "role": "user",
            "content": [{"type": "input_text", "text": _build_text_analysis_prompt(job, resume_text)}],
        },
    ]


def _create_response_with_schema(client: Any, input_payload: list[dict]) -> Any:
    return client.responses.create(
        model=DEFAULT_MODEL,
        input=input_payload,
        temperature=0.2,
        text={
            "format": {
                "type": "json_schema",
                "name": "recruitment_ai_analysis",
                "schema": ANALYSIS_SCHEMA,
                "strict": True,
            }
        },
        max_output_tokens=3500,
    )


def _parse_analysis_response(response: Any) -> Dict[str, Any]:
    output_text = _extract_response_text(response)
    if not output_text:
        raise RuntimeError("A OpenAI não retornou conteúdo estruturado para a análise.")
    parsed = json.loads(output_text)
    parsed["raw_response_json"] = _serialize_response(response)
    return parsed


def _analyze_resume_text(job: Dict[str, Any], resume_text: str) -> Dict[str, Any]:
    client = _get_openai_client()
    response = _create_response_with_schema(client, _analysis_messages_from_text(job, resume_text))
    return _parse_analysis_response(response)


def _analyze_resume_file(job: Dict[str, Any], file_bytes: bytes, file_name: str, mime_type: str) -> Dict[str, Any]:
    client = _get_openai_client()
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file_name).suffix or ".bin") as temp_file:
        temp_file.write(file_bytes)
        temp_path = temp_file.name
    uploaded_file = None
    try:
        with open(temp_path, "rb") as file_handle:
            uploaded_file = client.files.create(
                file=file_handle,
                purpose="user_data",
            )
        prompt = "\n\n".join(
            [
                "Leia o currículo anexado e faça a triagem inicial com base no schema exigido.",
                f"Título da vaga: {job['job_title']}",
                f"Descrição da vaga:\n{_truncate_text(job.get('job_description_text') or '', MAX_JOB_TEXT_CHARS)}",
                f"Requisitos:\n{_truncate_text(job.get('job_requirements_text') or '', MAX_JOB_TEXT_CHARS)}",
                f"Benefícios:\n{_truncate_text(job.get('job_benefits_text') or '', 4000)}",
                f"Observações da vaga:\n{_truncate_text(job.get('job_notes') or '', 3000)}",
                f"Nome do candidato: {job['candidate_name']}",
                f"Observações do candidato:\n{_truncate_text(job.get('candidate_notes') or '', 3000)}",
            ]
        )
        response = _create_response_with_schema(
            client,
            [
                {
                    "role": "system",
                    "content": [{"type": "input_text", "text": _build_system_prompt()}],
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "input_file", "file_id": uploaded_file.id},
                        {"type": "input_text", "text": prompt},
                    ],
                },
            ],
        )
        return _parse_analysis_response(response)
    finally:
        try:
            os.unlink(temp_path)
        except Exception:
            pass
        if uploaded_file is not None:
            try:
                client.files.delete(uploaded_file.id)
            except Exception:
                pass


def _save_analysis_result(
    db: DatabaseManager,
    job: Dict[str, Any],
    analysis_payload: Dict[str, Any],
):
    now = _now_iso()
    _execute(
        db,
        """
        INSERT INTO recruitment_ai_analyses (
          id, candidate_id, job_id, analysis_job_id, source_file_id, model, schema_version, score, short_verdict, detailed_report,
          strengths_json, weaknesses_json, matched_requirements_json, missing_requirements_json, risks_or_gaps_json, evidence_json,
          recommended_next_step, raw_response_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            os.urandom(16).hex(),
            job["candidate_id"],
            job["job_id"],
            job["id"],
            job["source_file_id"],
            DEFAULT_MODEL,
            SCHEMA_VERSION,
            int(analysis_payload.get("score") or 0),
            _clean(analysis_payload.get("short_verdict")) or None,
            _clean(analysis_payload.get("detailed_report")) or None,
            _json_dumps(analysis_payload.get("strengths") or []),
            _json_dumps(analysis_payload.get("weaknesses") or []),
            _json_dumps(analysis_payload.get("matched_requirements") or []),
            _json_dumps(analysis_payload.get("missing_requirements") or []),
            _json_dumps(analysis_payload.get("risks_or_gaps") or []),
            _json_dumps(analysis_payload.get("evidence") or []),
            _clean(analysis_payload.get("recommended_human_next_step")) or None,
            _clean(analysis_payload.get("raw_response_json")) or None,
            now,
            now,
        ),
    )
    _update_candidate_ai_state(
        db,
        job["candidate_id"],
        "CONCLUIDO",
        ai_score=int(analysis_payload.get("score") or 0),
        analyzed_at=now,
    )
    _insert_history(
        db,
        job["candidate_id"],
        job["candidate_stage"],
        "AI_ANALYSIS_COMPLETED",
        f"Triagem IA concluída com nota {int(analysis_payload.get('score') or 0)}/100.",
    )


def _process_job(db: DatabaseManager, job: Dict[str, Any]):
    if not job.get("storage_key"):
        raise RuntimeError("Arquivo do currículo não encontrado para o job de IA.")

    file_format = _get_file_format(job["original_name"], job["mime_type"])
    if file_format not in {"PDF", "DOCX"}:
        extraction_id = _create_extraction_record(db, job, "NAO_SUPORTADO", file_format)
        _update_extraction_record(db, extraction_id, "NAO_SUPORTADO", None, None, None)
        _update_candidate_ai_state(db, job["candidate_id"], "NAO_SUPORTADO")
        _mark_job_done(db, job["id"], STATUS_UNSUPPORTED, f"Formato {file_format} ainda não suportado.")
        db.update_heartbeat(SERVICE_NAME, STATUS_UNSUPPORTED, f"job={job['id']} formato={file_format}")
        return

    db.update_heartbeat(SERVICE_NAME, STATUS_RUNNING, f"job={job['id']} baixando currículo")
    file_bytes = download_s3_object_bytes(job["storage_key"], job["storage_bucket"])

    extraction_id = _create_extraction_record(db, job, "PENDING", file_format)
    local_text = ""
    fallback_used = None
    try:
        local_text = _normalize_whitespace(_extract_text_locally(file_format, file_bytes))
    except Exception as exc:
        fallback_used = f"ERRO_LOCAL:{exc}"
        local_text = ""

    quality = _quality_score(local_text)
    using_file_fallback = len(local_text) < MIN_TEXT_CHARS
    analysis_payload = None

    if using_file_fallback:
        fallback_used = "OPENAI_INPUT_FILE"
        db.update_heartbeat(SERVICE_NAME, STATUS_RUNNING, f"job={job['id']} fallback=openai_input_file")
        analysis_payload = _analyze_resume_file(job, file_bytes, job["original_name"], job["mime_type"])
    else:
        db.update_heartbeat(SERVICE_NAME, STATUS_RUNNING, f"job={job['id']} analisando texto extraído")
        analysis_payload = _analyze_resume_text(job, local_text)

    _update_extraction_record(
        db,
        extraction_id,
        "EXTRAIDO",
        _truncate_text(local_text, MAX_RESUME_TEXT_CHARS) if local_text else None,
        quality,
        fallback_used,
    )
    _save_analysis_result(db, job, analysis_payload)
    _mark_job_done(db, job["id"], STATUS_COMPLETED, None)
    db.update_heartbeat(
        SERVICE_NAME,
        STATUS_COMPLETED,
        f"job={job['id']} candidato={job['candidate_name']} score={int(analysis_payload.get('score') or 0)}",
    )


def process_pending_recruitment_ai_jobs_once() -> bool:
    db = DatabaseManager()
    job = _get_pending_job(db)
    if not job:
        db.update_heartbeat(SERVICE_NAME, STATUS_COMPLETED, "Sem jobs pendentes")
        return False

    _mark_job_running(db, job["id"])
    _update_candidate_ai_state(db, job["candidate_id"], "ANALISANDO")
    try:
        _process_job(db, job)
    except Exception as exc:
        message = _clean(exc) or "Falha desconhecida na triagem com IA."
        _mark_job_done(db, job["id"], STATUS_FAILED, message)
        _update_candidate_ai_state(db, job["candidate_id"], "ERRO")
        _insert_history(db, job["candidate_id"], job["candidate_stage"], "AI_ANALYSIS_FAILED", message)
        db.update_heartbeat(SERVICE_NAME, STATUS_FAILED, f"job={job['id']} erro={message}")
    return True


def run_recruitment_ai_loop():
    db = DatabaseManager()
    db.update_heartbeat(SERVICE_NAME, STATUS_COMPLETED, "Worker de triagem de recrutamento iniciado")
    while True:
        try:
            had_job = process_pending_recruitment_ai_jobs_once()
            if not had_job:
                time.sleep(POLL_SECONDS)
        except Exception as exc:
            db.update_heartbeat(SERVICE_NAME, STATUS_FAILED, f"loop_error={exc}")
            time.sleep(max(POLL_SECONDS, 10))


if __name__ == "__main__":
    run_recruitment_ai_loop()
