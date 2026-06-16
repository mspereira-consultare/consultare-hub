import { NextResponse } from 'next/server';
import { requireEquipmentWorkOrderPermission } from '@/lib/equipamentos/auth';
import {
  createEquipmentWorkOrder,
  listEquipmentWorkOrdersByEquipmentId,
} from '@/lib/equipamentos/work_orders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const errorMessage = (error: unknown, fallback: string) => String((error as { message?: string } | null)?.message || fallback);
const errorStatus = (error: unknown) => Number((error as { status?: number } | null)?.status) || 500;

type ParamsContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: ParamsContext) {
  try {
    const auth = await requireEquipmentWorkOrderPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const data = await listEquipmentWorkOrdersByEquipmentId(auth.db, String(id || ''));
    return NextResponse.json({ status: 'success', data, meta: { canManage: auth.canManage } });
  } catch (error: unknown) {
    console.error('Erro ao listar OS do equipamento:', error);
    return NextResponse.json({ error: errorMessage(error, 'Erro interno ao listar OS do equipamento.') }, { status: errorStatus(error) });
  }
}

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requireEquipmentWorkOrderPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const body = await request.json();
    const data = await createEquipmentWorkOrder(auth.db, String(id || ''), body, auth.userId);
    return NextResponse.json({ status: 'success', data }, { status: 201 });
  } catch (error: unknown) {
    console.error('Erro ao criar OS do equipamento:', error);
    return NextResponse.json({ error: errorMessage(error, 'Erro interno ao criar OS.') }, { status: errorStatus(error) });
  }
}
