import type { DbInterface } from './db';

export type TaskLinkedEquipmentWorkOrderRef = {
  workOrderId: string;
  equipmentId: string;
  equipmentDescription: string | null;
  equipmentIdentificationNumber: string | null;
  status: string;
  panelPath: string;
  canMutateTaskStatus: boolean;
};

const clean = (value: unknown) => String(value ?? '').trim();

const safeQuery = async (db: DbInterface, sql: string, params: unknown[] = []) => {
  try {
    return await db.query(sql, params);
  } catch (error: unknown) {
    const message = String((error as { message?: string })?.message || '');
    if (/doesn't exist|no such table|Table .* doesn't exist|Unknown column/i.test(message)) return [];
    throw error;
  }
};

export const buildEquipmentWorkOrderPanelPath = (workOrderId: string) =>
  `/equipamentos/os?osId=${encodeURIComponent(clean(workOrderId))}`;

export const getEquipmentWorkOrderLinkByTaskId = async (
  db: DbInterface,
  taskId: string,
): Promise<TaskLinkedEquipmentWorkOrderRef | null> => {
  const cleanTaskId = clean(taskId);
  if (!cleanTaskId) return null;

  const rows = await safeQuery(
    db,
    `
    SELECT
      wo.id,
      wo.equipment_id,
      wo.status,
      e.description,
      e.identification_number
    FROM clinic_equipment_work_orders wo
    LEFT JOIN clinic_equipment e ON e.id = wo.equipment_id
    WHERE wo.linked_task_id = ?
    ORDER BY wo.created_at DESC
    LIMIT 1
    `,
    [cleanTaskId],
  );

  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  const status = clean(row.status).toUpperCase();
  const active = status === 'ABERTA' || status === 'EM_ANDAMENTO';

  return {
    workOrderId: clean(row.id),
    equipmentId: clean(row.equipment_id),
    equipmentDescription: clean(row.description) || null,
    equipmentIdentificationNumber: clean(row.identification_number) || null,
    status,
    panelPath: buildEquipmentWorkOrderPanelPath(clean(row.id)),
    canMutateTaskStatus: !active,
  };
};
