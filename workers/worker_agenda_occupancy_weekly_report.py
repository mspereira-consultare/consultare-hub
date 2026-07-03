import json
import os
import sys
from datetime import datetime, timedelta
from typing import Tuple

import requests

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database_manager import DatabaseManager
from worker_agenda_ocupacao import (
    DEFAULT_UNITS,
    STATUS_COMPLETED,
    STATUS_FAILED,
    STATUS_RUNNING,
    _mark_job_done,
    _process_job,
    enqueue_agenda_occupancy_job,
)

WORK_TZ_NAME = os.getenv("WORK_TZ", "America/Sao_Paulo")

try:
    from zoneinfo import ZoneInfo

    WORK_TZ = ZoneInfo(WORK_TZ_NAME)
except Exception:
    WORK_TZ = None


def _now() -> datetime:
    if WORK_TZ is not None:
        return datetime.now(WORK_TZ)
    return datetime.now()


def _resolve_base_url() -> str:
    raw = (
        os.getenv("PAINEL_BASE_URL")
        or os.getenv("NEXTAUTH_URL")
        or os.getenv("NEXT_PUBLIC_PAINEL_URL")
        or ""
    ).strip()
    if not raw:
        raise RuntimeError(
            "Base URL do painel não configurada. Defina PAINEL_BASE_URL ou NEXTAUTH_URL para o cron semanal."
        )
    return raw.rstrip("/")


def _next_week_window() -> Tuple[str, str]:
    today = _now().date()
    weekday = today.weekday()
    days_until_next_monday = (7 - weekday) % 7
    if days_until_next_monday == 0:
        days_until_next_monday = 7
    start_date = today + timedelta(days=days_until_next_monday)
    end_date = start_date + timedelta(days=5)
    return start_date.isoformat(), end_date.isoformat()


def _refresh_weekly_window(start_date: str, end_date: str) -> str:
    requested_by = "system_cron_agenda_occupancy_weekly_report"
    db = DatabaseManager()
    created = enqueue_agenda_occupancy_job(
        start_date=start_date,
        end_date=end_date,
        unit_scope=list(DEFAULT_UNITS),
        requested_by=requested_by,
        db=db,
        initial_status=STATUS_RUNNING,
    )
    job = {
        "id": created["id"],
        "start_date": created["start_date"],
        "end_date": created["end_date"],
        "units": created["unit_scope"],
        "requested_by": created["requested_by"],
    }

    print(
        f"[agenda_occupancy_weekly_report] Atualizando snapshot antes do envio | "
        f"job={job['id']} periodo={job['start_date']}..{job['end_date']} unidades={job['units']}"
    )

    try:
        _process_job(db, job)
        _mark_job_done(db, str(job["id"]), STATUS_COMPLETED, None)
        return str(job["id"])
    except Exception as exc:
        _mark_job_done(db, str(job["id"]), STATUS_FAILED, str(exc))
        raise


def _trigger_panel_report(start_date: str, end_date: str, refresh_job_id: str) -> dict:
    cron_secret = str(os.getenv("AGENDA_OCCUPANCY_REPORT_CRON_SECRET") or "").strip()
    if not cron_secret:
        raise RuntimeError(
            "AGENDA_OCCUPANCY_REPORT_CRON_SECRET não configurado para acionar o endpoint do report semanal."
        )

    url = f"{_resolve_base_url()}/api/admin/agenda-ocupacao/report/process"
    payload = {
        "force": True,
        "startDate": start_date,
        "endDate": end_date,
        "refreshJobId": refresh_job_id,
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {cron_secret}",
        "X-Cron-Secret": cron_secret,
    }

    print(
        f"[agenda_occupancy_weekly_report] Disparando processamento do report | "
        f"url={url} periodo={start_date}..{end_date}"
    )
    response = requests.post(url, headers=headers, data=json.dumps(payload), timeout=180)
    response.raise_for_status()
    data = response.json()
    if not isinstance(data, dict):
        raise RuntimeError("Resposta inválida do painel ao processar o report semanal de ocupação.")
    return data


def main():
    start_date, end_date = _next_week_window()
    print(
        f"[agenda_occupancy_weekly_report] Iniciando cron semanal | "
        f"periodo={start_date}..{end_date} tz={WORK_TZ_NAME}"
    )
    refresh_job_id = _refresh_weekly_window(start_date, end_date)
    result = _trigger_panel_report(start_date, end_date, refresh_job_id)
    print(
        "[agenda_occupancy_weekly_report] Cron concluído com sucesso | "
        f"refresh_job_id={refresh_job_id} result={json.dumps(result, ensure_ascii=False)}"
    )


if __name__ == "__main__":
    main()
