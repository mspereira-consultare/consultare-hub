import type { DbInterface } from '@/lib/db';
import { getCurrentSystemStatusTimestamp } from '@/lib/system_status_time';

type UpsertSystemStatusInput = {
  serviceName: string;
  status: string;
  details: string;
  lastRun?: string | null;
};

export async function upsertSystemStatus(
  db: DbInterface,
  input: UpsertSystemStatusInput,
) {
  const lastRun = String(input.lastRun || '').trim() || getCurrentSystemStatusTimestamp();
  await db.execute(
    `
    INSERT INTO system_status (service_name, status, last_run, details)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(service_name) DO UPDATE SET
      status = excluded.status,
      last_run = excluded.last_run,
      details = excluded.details
    `,
    [input.serviceName, input.status, lastRun, input.details],
  );
}
