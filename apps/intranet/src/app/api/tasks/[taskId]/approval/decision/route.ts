import { NextResponse } from 'next/server';
import { getEquipmentWorkOrderLinkByTaskId } from '@consultare/core/equipment-work-orders';
import { decideTaskApproval } from '@consultare/core/tasks/repository';
import { requireIntranetTasksPermission } from '@/lib/intranet/tasks-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const errorMessage = (error: unknown, fallback: string) => String((error as { message?: string } | null)?.message || fallback);
const errorStatus = (error: unknown) => Number((error as { status?: number } | null)?.status) || 500;

type ParamsContext = {
  params: Promise<{ taskId: string }>;
};

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requireIntranetTasksPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { taskId } = await context.params;
    const linkedEquipmentWorkOrder = await getEquipmentWorkOrderLinkByTaskId(auth.db, String(taskId || ''));
    if (linkedEquipmentWorkOrder && !linkedEquipmentWorkOrder.canMutateTaskStatus) {
      return NextResponse.json(
        { error: 'A aprovação desta tarefa precisa ser concluída pela OS vinculada no painel.' },
        { status: 409 },
      );
    }
    const body = await request.json();
    const data = await decideTaskApproval(auth.db, String(taskId || ''), body, auth.userId, auth.viewer);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao decidir aprovação da tarefa:', error);
    return NextResponse.json({ error: errorMessage(error, 'Erro interno ao decidir aprovação.') }, { status: errorStatus(error) });
  }
}
