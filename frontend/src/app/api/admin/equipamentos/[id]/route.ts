import { NextResponse } from 'next/server';
import { requireEquipamentosPermission } from '@/lib/equipamentos/auth';
import { getEquipmentById, updateEquipment } from '@/lib/equipamentos/repository';

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
    const data = await getEquipmentById(auth.db, String(id || ''));
    if (!data) return NextResponse.json({ error: 'Equipamento não encontrado.' }, { status: 404 });
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao buscar equipamento:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao buscar equipamento.' },
      { status: Number(error?.status) || 500 },
    );
  }
}

export async function PUT(request: Request, context: ParamsContext) {
  try {
    const auth = await requireEquipamentosPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await context.params;
    const payload = await request.json();
    const data = await updateEquipment(auth.db, String(id || ''), payload);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao atualizar equipamento:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao atualizar equipamento.' },
      { status: Number(error?.status) || 500 },
    );
  }
}
