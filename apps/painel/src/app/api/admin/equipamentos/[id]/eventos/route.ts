import { NextResponse } from 'next/server';
import { requireEquipamentosPermission } from '@/lib/equipamentos/auth';
import { listEquipmentEvents, createEquipmentEvent } from '@/lib/equipamentos/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: ParamsContext) {
  try {
    const auth = await requireEquipamentosPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const data = await listEquipmentEvents(auth.db, String(id || ''));
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar eventos do equipamento:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao listar eventos.' },
      { status: Number(error?.status) || 500 },
    );
  }
}

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requireEquipamentosPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const payload = await request.json();
    const data = await createEquipmentEvent(auth.db, String(id || ''), payload);
    return NextResponse.json({ status: 'success', data }, { status: 201 });
  } catch (error: any) {
    console.error('Erro ao criar evento do equipamento:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao criar evento.' },
      { status: Number(error?.status) || 500 },
    );
  }
}
