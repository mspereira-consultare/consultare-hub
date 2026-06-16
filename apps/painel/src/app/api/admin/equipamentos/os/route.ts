import { NextResponse } from 'next/server';
import { requireEquipmentWorkOrderPermission } from '@/lib/equipamentos/auth';
import {
  listEquipmentWorkOrders,
  normalizeEquipmentWorkOrderFilters,
} from '@/lib/equipamentos/work_orders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const errorMessage = (error: unknown, fallback: string) => String((error as { message?: string } | null)?.message || fallback);
const errorStatus = (error: unknown) => Number((error as { status?: number } | null)?.status) || 500;

export async function GET(request: Request) {
  try {
    const auth = await requireEquipmentWorkOrderPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { searchParams } = new URL(request.url);
    const data = await listEquipmentWorkOrders(auth.db, normalizeEquipmentWorkOrderFilters(searchParams));
    return NextResponse.json({ status: 'success', data, meta: { canManage: auth.canManage } });
  } catch (error: unknown) {
    console.error('Erro ao listar OS de equipamentos:', error);
    return NextResponse.json({ error: errorMessage(error, 'Erro interno ao listar OS.') }, { status: errorStatus(error) });
  }
}
