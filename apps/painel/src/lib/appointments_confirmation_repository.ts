import type { DbInterface } from '@/lib/db';

export const APPOINTMENTS_CONFIRMATION_SNAPSHOT_TABLE = 'feegow_appointments_confirmation_d1_snapshot';
export const APPOINTMENTS_CONFIRMATION_SNAPSHOT_SERVICE = 'appointments_confirmation_snapshot';
export const LIVE_CONFIRMED_STATUS_IDS = [3, 7] as const;
export const SNAPSHOT_CONFIRMED_STATUS_ID = 7;

export type AppointmentConfirmationContext = {
  today: string;
  yesterday: string;
  snapshotCoverageStartDate: string | null;
  snapshotCoverageEndDate: string | null;
};

const toSaoPauloDate = (date: Date) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const plusDays = (dateIso: string, days: number) => {
  const [year, month, day] = String(dateIso).split('-').map(Number);
  const base = new Date(Date.UTC(year || 0, (month || 1) - 1, day || 1));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
};

export async function ensureAppointmentConfirmationSnapshotSchema(db: DbInterface) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${APPOINTMENTS_CONFIRMATION_SNAPSHOT_TABLE} (
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
  `);
}

export async function getAppointmentConfirmationContext(db: DbInterface): Promise<AppointmentConfirmationContext> {
  await ensureAppointmentConfirmationSnapshotSchema(db);

  const today = toSaoPauloDate(new Date());
  const yesterday = plusDays(today, -1);

  const rows = await db.query(`
    SELECT
      MIN(target_date) AS snapshot_coverage_start_date,
      MAX(target_date) AS snapshot_coverage_end_date
    FROM ${APPOINTMENTS_CONFIRMATION_SNAPSHOT_TABLE}
  `);

  return {
    today,
    yesterday,
    snapshotCoverageStartDate: String(rows?.[0]?.snapshot_coverage_start_date || '').trim() || null,
    snapshotCoverageEndDate: String(rows?.[0]?.snapshot_coverage_end_date || '').trim() || null,
  };
}

export function buildLiveConfirmedCase(alias = 'f') {
  return `CASE WHEN ${alias}.status_id IN (${LIVE_CONFIRMED_STATUS_IDS.join(', ')}) THEN 1 ELSE 0 END`;
}

export function buildTomorrowStrictConfirmedCase(alias = 'f') {
  return `CASE WHEN ${alias}.status_id = ${SNAPSHOT_CONFIRMED_STATUS_ID} THEN 1 ELSE 0 END`;
}

export function buildAppointmentConfirmationHybridCte(
  context: AppointmentConfirmationContext,
  cteName = 'appointment_confirmation_base',
) {
  const liveConfirmedExpr = buildLiveConfirmedCase('f');

  if (!context.snapshotCoverageStartDate) {
    return {
      sql: `
        WITH ${cteName} AS (
          SELECT
            f.*,
            f.status_id AS effective_status_id,
            ${liveConfirmedExpr} AS effective_confirmed_d1,
            'live' AS effective_confirmation_source
          FROM feegow_appointments f
        )
      `,
      params: [] as Array<string | number>,
    };
  }

  return {
    sql: `
      WITH ${cteName} AS (
        SELECT
          f.*,
          s.snapshot_status_id,
          s.is_confirmed_d1,
          CASE
            WHEN SUBSTR(f.date, 1, 10) >= ? AND SUBSTR(f.date, 1, 10) <= ?
              THEN COALESCE(s.snapshot_status_id, f.status_id)
            ELSE f.status_id
          END AS effective_status_id,
          CASE
            WHEN SUBSTR(f.date, 1, 10) >= ? AND SUBSTR(f.date, 1, 10) <= ?
              THEN COALESCE(s.is_confirmed_d1, ${liveConfirmedExpr})
            ELSE ${liveConfirmedExpr}
          END AS effective_confirmed_d1,
          CASE
            WHEN SUBSTR(f.date, 1, 10) >= ? AND SUBSTR(f.date, 1, 10) <= ? AND s.appointment_id IS NOT NULL
              THEN 'snapshot'
            WHEN SUBSTR(f.date, 1, 10) >= ? AND SUBSTR(f.date, 1, 10) <= ?
              THEN 'hybrid'
            ELSE 'live'
          END AS effective_confirmation_source
        FROM feegow_appointments f
        LEFT JOIN ${APPOINTMENTS_CONFIRMATION_SNAPSHOT_TABLE} s
          ON s.appointment_id = f.appointment_id
         AND s.target_date = SUBSTR(f.date, 1, 10)
      )
    `,
    params: [
      context.snapshotCoverageStartDate,
      context.yesterday,
      context.snapshotCoverageStartDate,
      context.yesterday,
      context.snapshotCoverageStartDate,
      context.yesterday,
      context.snapshotCoverageStartDate,
      context.yesterday,
    ] as Array<string | number>,
  };
}
