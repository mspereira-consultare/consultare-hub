import datetime
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database_manager import DatabaseManager, tz

SNAPSHOT_TABLE = "feegow_appointments_confirmation_d1_snapshot"
SNAPSHOT_SERVICE = "appointments_confirmation_snapshot"
CONFIRMED_STATUS_ID = 7


def _now_sp():
    return datetime.datetime.now(tz)


def _today_iso():
    return _now_sp().strftime("%Y-%m-%d")


def _tomorrow_iso():
    return (_now_sp() + datetime.timedelta(days=1)).strftime("%Y-%m-%d")


def _captured_at_iso():
    return _now_sp().strftime("%Y-%m-%d %H:%M:%S")


def _target_date():
    override = str(os.getenv("APPOINTMENTS_CONFIRMATION_SNAPSHOT_TARGET_DATE", "")).strip()
    return override or _tomorrow_iso()


def ensure_snapshot_schema(conn, use_turso=False, use_mysql=False):
    sql = f"""
        CREATE TABLE IF NOT EXISTS {SNAPSHOT_TABLE} (
            appointment_id BIGINT NOT NULL,
            target_date VARCHAR(10) NOT NULL,
            snapshot_business_date VARCHAR(10) NOT NULL,
            captured_at VARCHAR(19) NOT NULL,
            snapshot_status_id INTEGER NULL,
            is_confirmed_d1 INTEGER NOT NULL DEFAULT 0,
            unit_name VARCHAR(191) NULL,
            scheduled_by VARCHAR(191) NULL,
            specialty VARCHAR(191) NULL,
            professional_name VARCHAR(191) NULL,
            scheduled_at VARCHAR(50) NULL,
            procedure_group VARCHAR(191) NULL,
            patient_id BIGINT NULL,
            procedure_id BIGINT NULL,
            first_appointment_flag INTEGER NULL,
            PRIMARY KEY (appointment_id, target_date)
        )
    """
    conn.execute(sql)
    if not use_turso:
        conn.commit()


def update_appointments_confirmation_snapshot():
    print(f"--- Worker Appointments Confirmation Snapshot: {_captured_at_iso()} ---")
    db = DatabaseManager()
    business_date = _today_iso()
    target_date = _target_date()
    captured_at = _captured_at_iso()
    db.update_heartbeat(
        SNAPSHOT_SERVICE,
        "RUNNING",
        f"Gerando snapshot D+1 | target_date={target_date} business_date={business_date}",
    )

    conn = db.get_connection()
    try:
        ensure_snapshot_schema(conn, use_turso=db.use_turso, use_mysql=db.use_mysql)

        rows = db.execute_query(
            """
            SELECT
                appointment_id,
                date,
                status_id,
                unit_name,
                scheduled_by,
                specialty,
                professional_name,
                scheduled_at,
                procedure_group,
                patient_id,
                procedure_id,
                first_appointment_flag
            FROM feegow_appointments
            WHERE SUBSTR(date, 1, 10) = ?
              AND appointment_id IS NOT NULL
            """,
            (target_date,),
        )

        params_batch = []
        for row in rows or []:
            if isinstance(row, (tuple, list)):
                appointment_id = row[0]
                status_id = row[2]
                unit_name = row[3]
                scheduled_by = row[4]
                specialty = row[5]
                professional_name = row[6]
                scheduled_at = row[7]
                procedure_group = row[8]
                patient_id = row[9]
                procedure_id = row[10]
                first_appointment_flag = row[11]
            else:
                appointment_id = row.get("appointment_id")
                status_id = row.get("status_id")
                unit_name = row.get("unit_name")
                scheduled_by = row.get("scheduled_by")
                specialty = row.get("specialty")
                professional_name = row.get("professional_name")
                scheduled_at = row.get("scheduled_at")
                procedure_group = row.get("procedure_group")
                patient_id = row.get("patient_id")
                procedure_id = row.get("procedure_id")
                first_appointment_flag = row.get("first_appointment_flag")

            if not appointment_id:
                continue

            snapshot_status_id = int(status_id or 0)
            is_confirmed_d1 = 1 if snapshot_status_id == CONFIRMED_STATUS_ID else 0
            params_batch.append(
                (
                    int(appointment_id),
                    target_date,
                    business_date,
                    captured_at,
                    snapshot_status_id,
                    is_confirmed_d1,
                    str(unit_name or ""),
                    str(scheduled_by or ""),
                    str(specialty or ""),
                    str(professional_name or ""),
                    str(scheduled_at or ""),
                    str(procedure_group or ""),
                    int(patient_id or 0) if patient_id is not None else None,
                    int(procedure_id or 0) if procedure_id is not None else None,
                    int(first_appointment_flag or 0) if first_appointment_flag is not None else None,
                )
            )

        upsert_sql = f"""
            INSERT INTO {SNAPSHOT_TABLE} (
                appointment_id,
                target_date,
                snapshot_business_date,
                captured_at,
                snapshot_status_id,
                is_confirmed_d1,
                unit_name,
                scheduled_by,
                specialty,
                professional_name,
                scheduled_at,
                procedure_group,
                patient_id,
                procedure_id,
                first_appointment_flag
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(appointment_id, target_date) DO UPDATE SET
                snapshot_business_date = excluded.snapshot_business_date,
                captured_at = excluded.captured_at,
                snapshot_status_id = excluded.snapshot_status_id,
                is_confirmed_d1 = excluded.is_confirmed_d1,
                unit_name = excluded.unit_name,
                scheduled_by = excluded.scheduled_by,
                specialty = excluded.specialty,
                professional_name = excluded.professional_name,
                scheduled_at = excluded.scheduled_at,
                procedure_group = excluded.procedure_group,
                patient_id = excluded.patient_id,
                procedure_id = excluded.procedure_id,
                first_appointment_flag = excluded.first_appointment_flag
        """

        if params_batch:
            if db.use_turso:
                for params in params_batch:
                    conn.execute(upsert_sql, params)
            else:
                conn.executemany(upsert_sql, params_batch)
                conn.commit()

        msg = (
            f"Snapshot D+1 concluido | target_date={target_date} "
            f"business_date={business_date} rows={len(params_batch)}"
        )
        print(f"✅ {msg}")
        db.update_heartbeat(SNAPSHOT_SERVICE, "COMPLETED", msg)
    except Exception as exc:
        msg = f"Falha snapshot D+1: {exc}"
        print(f"❌ {msg}")
        db.update_heartbeat(SNAPSHOT_SERVICE, "ERROR", msg)
        raise
    finally:
        try:
            conn.close()
        except Exception:
            pass


if __name__ == "__main__":
    update_appointments_confirmation_snapshot()
