import io
import hashlib
import json
import os
import time
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from xml.etree import ElementTree

from database_manager import DatabaseManager
from storage_s3 import download_s3_object_bytes

try:
    from openai import OpenAI
except Exception:
    OpenAI = None

try:
    from pypdf import PdfReader
except Exception:
    PdfReader = None


SERVICE_NAME = "intranet_knowledge_index"
STATUS_PENDING = "pending"
STATUS_RUNNING = "running"
STATUS_COMPLETED = "completed"
STATUS_FAILED = "failed"

HEARTBEAT_RUNNING = "RUNNING"
HEARTBEAT_COMPLETED = "COMPLETED"
HEARTBEAT_FAILED = "FAILED"

POLL_SECONDS = max(5, int(os.getenv("INTRANET_KNOWLEDGE_POLL_SEC", "15")))
REINDEX_BATCH_SIZE = max(1, int(os.getenv("INTRANET_KNOWLEDGE_BATCH_SIZE", "80")))
EMBED_BATCH_SIZE = max(1, int(os.getenv("INTRANET_KNOWLEDGE_EMBED_BATCH_SIZE", "20")))
CHUNK_TARGET_TOKENS = max(300, int(os.getenv("KNOWLEDGE_CHUNK_TARGET_TOKENS", "1000")))
CHUNK_OVERLAP_TOKENS = max(60, int(os.getenv("KNOWLEDGE_CHUNK_OVERLAP_TOKENS", "160")))
EMBEDDING_MODEL = str(os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small") or "").strip() or "text-embedding-3-small"
OPENAI_BASE_URL = str(os.getenv("OPENAI_BASE_URL", "") or "").strip() or None


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _nullable(value: Any) -> Optional[str]:
    text = _clean(value)
    return text or None


def _json_loads(value: Any, fallback):
    if value is None or value == "":
        return fallback
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(str(value))
    except Exception:
        return fallback


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _row_get(row: Any, key: str, index: int = 0):
    if isinstance(row, dict):
        return row.get(key)
    if hasattr(row, key):
        return getattr(row, key)
    if isinstance(row, (tuple, list)):
        return row[index] if len(row) > index else None
    return None


def _execute(db: DatabaseManager, sql: str, params=()):
    conn = db.get_connection()
    try:
        result = conn.execute(sql, params)
        if not db.use_turso:
            conn.commit()
        return result
    finally:
        conn.close()


def _query(db: DatabaseManager, sql: str, params=()):
    return db.execute_query(sql, params) or []


def _query_one(db: DatabaseManager, sql: str, params=()):
    rows = _query(db, sql, params)
    return rows[0] if rows else None


def _approximate_token_count(value: str) -> int:
    return max(1, (len(_clean(value)) + 3) // 4)


def _chunk_text(text_raw: str) -> List[str]:
    text = _clean(text_raw)
    if not text:
        return []

    approx_chars_per_token = 4
    target_chars = max(1200, int(CHUNK_TARGET_TOKENS * approx_chars_per_token))
    overlap_chars = max(200, int(CHUNK_OVERLAP_TOKENS * approx_chars_per_token))
    if len(text) <= target_chars:
        return [text]

    chunks: List[str] = []
    cursor = 0
    text_length = len(text)

    while cursor < text_length:
        end = min(text_length, cursor + target_chars)
        if end < text_length:
            slice_text = text[cursor:end]
            last_break = max(
                slice_text.rfind("\n\n"),
                slice_text.rfind(". "),
                slice_text.rfind("! "),
                slice_text.rfind("? "),
            )
            if last_break > int(len(slice_text) * 0.55):
                end = cursor + last_break + 1

        chunk = text[cursor:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= text_length:
            break
        cursor = max(end - overlap_chars, cursor + 1)

    return chunks


def _build_chunks(source: Dict[str, Any]) -> List[Dict[str, Any]]:
    visibility_refs = _json_loads(source.get("visibility_ref_json"), [])
    chunks = []
    for index, chunk_text in enumerate(_chunk_text(source.get("content_text") or "")):
        chunks.append(
            {
                "chunk_index": index,
                "chunk_text": chunk_text,
                "token_count": _approximate_token_count(chunk_text),
                "visibility_ref_json": visibility_refs,
            }
        )
    return chunks


def _get_openai_client():
    api_key = _clean(os.getenv("OPENAI_API_KEY"))
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY nao configurada para o worker de conhecimento da intranet.")
    if OpenAI is None:
        raise RuntimeError("Biblioteca openai nao instalada no ambiente do worker.")
    kwargs = {"api_key": api_key}
    if OPENAI_BASE_URL:
        kwargs["base_url"] = OPENAI_BASE_URL
    return OpenAI(**kwargs)


def _embed_many(texts: List[str]) -> List[List[float]]:
    if not texts:
        return []

    client = _get_openai_client()
    embeddings: List[List[float]] = []

    for start in range(0, len(texts), EMBED_BATCH_SIZE):
        batch = texts[start : start + EMBED_BATCH_SIZE]
        response = client.embeddings.create(model=EMBEDDING_MODEL, input=batch)
        for item in response.data:
            embeddings.append(list(item.embedding))

    return embeddings


def _get_pending_job(db: DatabaseManager) -> Optional[Dict[str, Any]]:
    row = _query_one(
        db,
        """
        SELECT id, knowledge_source_id, job_type, status, requested_by, started_at, finished_at, error_message, created_at
        FROM intranet_knowledge_jobs
        WHERE status = ?
        ORDER BY created_at ASC
        LIMIT 1
        """,
        (STATUS_PENDING,),
    )
    if not row:
        return None
    return {
        "id": _clean(_row_get(row, "id", 0)),
        "knowledge_source_id": _nullable(_row_get(row, "knowledge_source_id", 1)),
        "job_type": _clean(_row_get(row, "job_type", 2)).lower() or "index",
        "status": _clean(_row_get(row, "status", 3)).lower() or STATUS_PENDING,
        "requested_by": _nullable(_row_get(row, "requested_by", 4)),
        "started_at": _nullable(_row_get(row, "started_at", 5)),
        "finished_at": _nullable(_row_get(row, "finished_at", 6)),
        "error_message": _nullable(_row_get(row, "error_message", 7)),
        "created_at": _clean(_row_get(row, "created_at", 8)),
    }


def _mark_job_running(db: DatabaseManager, job_id: str):
    _execute(
        db,
        """
        UPDATE intranet_knowledge_jobs
        SET status = ?, started_at = ?, finished_at = NULL, error_message = NULL
        WHERE id = ?
        """,
        (STATUS_RUNNING, _now_iso(), _clean(job_id)),
    )


def _mark_job_done(db: DatabaseManager, job_id: str, status: str, error_message: Optional[str] = None):
    _execute(
        db,
        """
        UPDATE intranet_knowledge_jobs
        SET status = ?, finished_at = ?, error_message = ?
        WHERE id = ?
        """,
        (status, _now_iso(), _nullable(error_message), _clean(job_id)),
    )


def _get_source_by_id(db: DatabaseManager, source_id: str) -> Optional[Dict[str, Any]]:
    row = _query_one(
        db,
        """
        SELECT
          id, source_type, source_entity_id, source_revision_ref, title, canonical_url, status,
          visibility_ref_json, content_text, meta_json, last_indexed_at, last_error, updated_at
        FROM intranet_knowledge_sources
        WHERE id = ?
        LIMIT 1
        """,
        (_clean(source_id),),
    )
    if not row:
        return None
    return {
        "id": _clean(_row_get(row, "id", 0)),
        "source_type": _clean(_row_get(row, "source_type", 1)).lower(),
        "source_entity_id": _clean(_row_get(row, "source_entity_id", 2)),
        "source_revision_ref": _nullable(_row_get(row, "source_revision_ref", 3)),
        "title": _clean(_row_get(row, "title", 4)),
        "canonical_url": _nullable(_row_get(row, "canonical_url", 5)),
        "status": _clean(_row_get(row, "status", 6)).lower() or STATUS_PENDING,
        "visibility_ref_json": _json_loads(_row_get(row, "visibility_ref_json", 7), []),
        "content_text": _nullable(_row_get(row, "content_text", 8)),
        "meta_json": _json_loads(_row_get(row, "meta_json", 9), {}),
        "last_indexed_at": _nullable(_row_get(row, "last_indexed_at", 10)),
        "last_error": _nullable(_row_get(row, "last_error", 11)),
        "updated_at": _clean(_row_get(row, "updated_at", 12)),
    }


def _list_pending_sources(db: DatabaseManager, limit: int) -> List[Dict[str, Any]]:
    rows = _query(
        db,
        f"""
        SELECT
          id, source_type, source_entity_id, source_revision_ref, title, canonical_url, status,
          visibility_ref_json, content_text, meta_json, last_indexed_at, last_error, updated_at
        FROM intranet_knowledge_sources
        WHERE status IN ('pending', 'stale', 'failed')
        ORDER BY updated_at ASC
        LIMIT {int(limit)}
        """
    )
    return [_get_source_by_id(db, _clean(_row_get(row, "id", 0))) for row in rows if _clean(_row_get(row, "id", 0))]


def _mark_source_failed(db: DatabaseManager, source_id: str, error_message: str):
    _execute(
        db,
        """
        UPDATE intranet_knowledge_sources
        SET status = 'failed', last_error = ?, updated_at = ?
        WHERE id = ?
        """,
        (_clean(error_message), _now_iso(), _clean(source_id)),
    )


def _replace_source_chunks(db: DatabaseManager, source: Dict[str, Any], chunks: List[Dict[str, Any]], embeddings: List[List[float]]):
    source_id = _clean(source["id"])
    now = _now_iso()
    _execute(db, "DELETE FROM intranet_knowledge_chunks WHERE knowledge_source_id = ?", (source_id,))

    for index, item in enumerate(chunks):
        _execute(
            db,
            """
            INSERT INTO intranet_knowledge_chunks (
              id, knowledge_source_id, chunk_index, chunk_text, chunk_hash,
              embedding_model, embedding_json, token_count, visibility_ref_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                source_id,
                int(item["chunk_index"]),
                _clean(item["chunk_text"]),
                f"h{hashlib.md5(_clean(item['chunk_text']).encode('utf-8')).hexdigest()}",
                EMBEDDING_MODEL,
                _json_dumps(embeddings[index] if index < len(embeddings) else []),
                int(item["token_count"]),
                _json_dumps(item["visibility_ref_json"]),
                now,
            ),
        )

    _execute(
        db,
        """
        UPDATE intranet_knowledge_sources
        SET status = 'indexed', last_indexed_at = ?, last_error = NULL, updated_at = ?
        WHERE id = ?
        """,
        (now, now, source_id),
    )


def _get_file_format(file_name: str, mime_type: str) -> str:
    ext = Path(file_name or "").suffix.lower().replace(".", "")
    mime = _clean(mime_type).lower()
    if ext == "pdf" or mime == "application/pdf":
        return "PDF"
    if ext == "docx" or mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return "DOCX"
    if ext in {"md", "markdown"} or "markdown" in mime:
        return "MARKDOWN"
    if ext in {"txt", "csv"} or mime.startswith("text/"):
        return "TEXT"
    return ext.upper() if ext else "UNKNOWN"


def _extract_pdf_text(file_bytes: bytes) -> str:
    if PdfReader is None:
        raise RuntimeError("pypdf nao esta instalado no ambiente do worker.")
    with io.BytesIO(file_bytes) as buffer:
        reader = PdfReader(buffer)
        parts: List[str] = []
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
    parts: List[str] = []
    for paragraph in root.findall(".//w:p", namespace):
        texts = [node.text for node in paragraph.findall(".//w:t", namespace) if node.text]
        if texts:
            parts.append("".join(texts))
    return "\n".join(parts)


def _extract_asset_text(source: Dict[str, Any]) -> str:
    meta = source.get("meta_json") or {}
    provider = _clean(meta.get("storageProvider") or "s3").lower()
    if provider != "s3":
        raise RuntimeError(f"Storage provider nao suportado pelo worker: {provider}.")

    storage_key = _clean(meta.get("storageKey"))
    storage_bucket = _nullable(meta.get("storageBucket"))
    mime_type = _clean(meta.get("mimeType"))
    original_name = _clean(meta.get("originalName")) or Path(storage_key).name or _clean(source.get("title"))

    file_bytes = download_s3_object_bytes(storage_key, storage_bucket)
    file_format = _get_file_format(original_name, mime_type)

    if file_format in {"TEXT", "MARKDOWN"}:
        return file_bytes.decode("utf-8", errors="ignore")
    if file_format == "PDF":
        return _extract_pdf_text(file_bytes)
    if file_format == "DOCX":
        return _extract_docx_text(file_bytes)
    raise RuntimeError("Formato de arquivo ainda nao suportado para indexacao. Use TXT, Markdown, PDF ou DOCX.")


def _ensure_source_content_text(db: DatabaseManager, source: Dict[str, Any]) -> Dict[str, Any]:
    if _clean(source.get("content_text")):
        return source
    if _clean(source.get("source_type")) != "asset_file":
        return source

    extracted_text = _extract_asset_text(source)
    now = _now_iso()
    _execute(
        db,
        """
        UPDATE intranet_knowledge_sources
        SET content_text = ?, status = 'pending', last_error = NULL, updated_at = ?
        WHERE id = ?
        """,
        (extracted_text, now, _clean(source["id"])),
    )
    refreshed = _get_source_by_id(db, source["id"])
    if not refreshed:
        raise RuntimeError("Fonte de conhecimento nao encontrada apos extracao de conteudo.")
    return refreshed


def _index_source(db: DatabaseManager, source: Dict[str, Any]):
    hydrated = _ensure_source_content_text(db, source)
    chunks = _build_chunks(hydrated)
    if not chunks:
        raise RuntimeError("A fonte nao possui texto suficiente para indexacao.")
    embeddings = _embed_many([item["chunk_text"] for item in chunks])
    _replace_source_chunks(db, hydrated, chunks, embeddings)


def _process_specific_source_job(db: DatabaseManager, source_id: str) -> Dict[str, int]:
    source = _get_source_by_id(db, source_id)
    if not source:
        raise RuntimeError("Fonte de conhecimento nao encontrada para o job.")
    if source["status"] == "archived":
        return {"indexed": 0, "failed": 0, "skipped": 1}

    _index_source(db, source)
    return {"indexed": 1, "failed": 0, "skipped": 0}


def _process_global_reindex_job(db: DatabaseManager) -> Dict[str, int]:
    indexed = 0
    failed = 0
    skipped = 0

    while True:
        sources = [item for item in _list_pending_sources(db, REINDEX_BATCH_SIZE) if item]
        if not sources:
            break

        for source in sources:
            title = _clean(source.get("title")) or _clean(source.get("id"))
            db.update_heartbeat(SERVICE_NAME, HEARTBEAT_RUNNING, f"Indexando fonte: {title}")
            try:
                if source["status"] == "archived":
                    skipped += 1
                    continue
                _index_source(db, source)
                indexed += 1
            except Exception as exc:
                failed += 1
                _mark_source_failed(db, source["id"], str(exc))

    return {"indexed": indexed, "failed": failed, "skipped": skipped}


def process_pending_knowledge_jobs_once() -> bool:
    db = DatabaseManager()
    job = _get_pending_job(db)
    if not job:
        db.update_heartbeat(SERVICE_NAME, HEARTBEAT_COMPLETED, "Sem jobs pendentes")
        return False

    _mark_job_running(db, job["id"])
    db.update_heartbeat(
        SERVICE_NAME,
        HEARTBEAT_RUNNING,
        f"job={job['id']} type={job['job_type']} source={job['knowledge_source_id'] or 'global'}",
    )

    try:
        if job["job_type"] == "delete" and job["knowledge_source_id"]:
            _execute(
                db,
                "DELETE FROM intranet_knowledge_chunks WHERE knowledge_source_id = ?",
                (_clean(job["knowledge_source_id"]),),
            )
            result = {"indexed": 0, "failed": 0, "skipped": 1}
        elif job["knowledge_source_id"]:
            result = _process_specific_source_job(db, job["knowledge_source_id"])
        else:
            result = _process_global_reindex_job(db)

        summary = (
            f"job={job['id']} concluido | indexed={result['indexed']} failed={result['failed']} skipped={result['skipped']}"
        )
        if result["failed"] > 0:
            _mark_job_done(
                db,
                job["id"],
                STATUS_FAILED,
                f"Indexacao com falhas parciais. indexed={result['indexed']} failed={result['failed']}",
            )
            db.update_heartbeat(SERVICE_NAME, HEARTBEAT_FAILED, summary)
        else:
            _mark_job_done(db, job["id"], STATUS_COMPLETED, None)
            db.update_heartbeat(SERVICE_NAME, HEARTBEAT_COMPLETED, summary)
        return True
    except Exception as exc:
        message = str(exc) or "Falha ao processar job de conhecimento."
        if job["knowledge_source_id"]:
            try:
                _mark_source_failed(db, job["knowledge_source_id"], message)
            except Exception:
                pass
        _mark_job_done(db, job["id"], STATUS_FAILED, message)
        db.update_heartbeat(SERVICE_NAME, HEARTBEAT_FAILED, f"job={job['id']} erro={message}")
        return True


def run_intranet_knowledge_index_loop():
    db = DatabaseManager()
    db.update_heartbeat(SERVICE_NAME, HEARTBEAT_COMPLETED, "Worker de conhecimento da intranet iniciado")
    while True:
        try:
            processed = process_pending_knowledge_jobs_once()
            if not processed:
                time.sleep(POLL_SECONDS)
        except Exception as exc:
            db.update_heartbeat(SERVICE_NAME, HEARTBEAT_FAILED, f"loop_error={exc}")
            time.sleep(POLL_SECONDS)
