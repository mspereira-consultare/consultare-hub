import { NextResponse } from 'next/server';
import { requireEquipmentWorkOrderPermission } from '@/lib/equipamentos/auth';
import {
  getEquipmentWorkOrderById,
  updateEquipmentWorkOrder,
} from '@/lib/equipamentos/work_orders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const errorMessage = (error: unknown, fallback: string) => String((error as { message?: string } | null)?.message || fallback);
const errorStatus = (error: unknown) => Number((error as { status?: number } | null)?.status) || 500;

type ParamsContext = {
  params: Promise<{ osId: string }>;
};

export async function GET(_: Request, context: ParamsContext) {
  try {
    const auth = await requireEquipmentWorkOrderPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { osId } = await context.params;
    const data = await getEquipmentWorkOrderById(auth.db, String(osId || ''));
    if (!data) return NextResponse.json({ error: 'OS não encontrada.' }, { status: 404 });
    return NextResponse.json({ status: 'success', data, meta: { canManage: auth.canManage } });
  } catch (error: unknown) {
    console.error('Erro ao detalhar OS:', error);
    return NextResponse.json({ error: errorMessage(error, 'Erro interno ao detalhar OS.') }, { status: errorStatus(error) });
  }
}

export async function PATCH(request: Request, context: ParamsContext) {
  try {
    const auth = await requireEquipmentWorkOrderPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { osId } = await context.params;
    const body = await request.json();
    const data = await updateEquipmentWorkOrder(auth.db, String(osId || ''), body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao atualizar OS:', error);
    return NextResponse.json({ error: errorMessage(error, 'Erro interno ao atualizar OS.') }, { status: errorStatus(error) });
  }
}
