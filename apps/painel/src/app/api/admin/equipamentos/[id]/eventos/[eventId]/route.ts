import { NextResponse } from 'next/server';
import { requireEquipamentosPermission } from '@/lib/equipamentos/auth';
import { updateEquipmentEvent, deleteEquipmentEvent } from '@/lib/equipamentos/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ id: string; eventId: string }>;
};

export async function PUT(request: Request, context: ParamsContext) {
  try {
    const auth = await requireEquipamentosPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id, eventId } = await context.params;
    const payload = await request.json();
    const data = await updateEquipmentEvent(auth.db, String(id || ''), String(eventId || ''), payload);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao atualizar evento do equipamento:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao atualizar evento.' },
      { status: Number(error?.status) || 500 },
    );
  }
}

export async function DELETE(_: Request, context: ParamsContext) {
  try {
    const auth = await requireEquipamentosPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id, eventId } = await context.params;
    await deleteEquipmentEvent(auth.db, String(id || ''), String(eventId || ''));
    return NextResponse.json({ status: 'success' });
  } catch (error: any) {
    console.error('Erro ao excluir evento do equipamento:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao excluir evento.' },
      { status: Number(error?.status) || 500 },
    );
  }
}
