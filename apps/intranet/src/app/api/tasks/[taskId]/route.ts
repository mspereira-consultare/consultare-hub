import { NextResponse } from 'next/server';
import { getEquipmentWorkOrderLinkByTaskId } from '@consultare/core/equipment-work-orders';
import { getTaskById, updateTask } from '@consultare/core/tasks/repository';
import { requireIntranetTasksPermission } from '@/lib/intranet/tasks-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const errorMessage = (error: unknown, fallback: string) => String((error as { message?: string } | null)?.message || fallback);
const errorStatus = (error: unknown) => Number((error as { status?: number } | null)?.status) || 500;

type ParamsContext = {
  params: Promise<{ taskId: string }>;
};

export async function GET(_: Request, context: ParamsContext) {
  try {
    const auth = await requireIntranetTasksPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { taskId } = await context.params;
    const painelUrl = String(process.env.PAINEL_PUBLIC_URL || process.env.NEXT_PUBLIC_PAINEL_URL || '').trim();
    const [task, linkedEquipmentWorkOrderRaw] = await Promise.all([
      getTaskById(auth.db, String(taskId || ''), auth.viewer),
      getEquipmentWorkOrderLinkByTaskId(auth.db, String(taskId || '')),
    ]);
    const linkedEquipmentWorkOrder = linkedEquipmentWorkOrderRaw
      ? {
          ...linkedEquipmentWorkOrderRaw,
          panelPath: painelUrl
            ? `${painelUrl.replace(/\/+$/g, '')}${linkedEquipmentWorkOrderRaw.panelPath}`
            : '',
        }
      : null;
    const data = { ...task, linkedEquipmentWorkOrder };
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao detalhar tarefa da intranet:', error);
    return NextResponse.json({ error: errorMessage(error, 'Erro interno ao detalhar tarefa.') }, { status: errorStatus(error) });
  }
}

export async function PATCH(request: Request, context: ParamsContext) {
  try {
    const auth = await requireIntranetTasksPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { taskId } = await context.params;
    const body = await request.json();
    const linkedEquipmentWorkOrder = await getEquipmentWorkOrderLinkByTaskId(auth.db, String(taskId || ''));
    if (linkedEquipmentWorkOrder && Object.prototype.hasOwnProperty.call(body, 'status') && !linkedEquipmentWorkOrder.canMutateTaskStatus) {
      return NextResponse.json(
        { error: 'O status desta tarefa é controlado pela OS vinculada. Atualize a OS no módulo de equipamentos.' },
        { status: 409 },
      );
    }
    const data = await updateTask(auth.db, String(taskId || ''), body, auth.userId, auth.viewer);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao atualizar tarefa da intranet:', error);
    return NextResponse.json({ error: errorMessage(error, 'Erro interno ao atualizar tarefa.') }, { status: errorStatus(error) });
  }
}
