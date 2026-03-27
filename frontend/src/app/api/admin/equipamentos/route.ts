import { NextResponse } from 'next/server';
import { requireEquipamentosPermission } from '@/lib/equipamentos/auth';
import { listEquipment, normalizeEquipmentFilters, createEquipment } from '@/lib/equipamentos/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const auth = await requireEquipamentosPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const filters = normalizeEquipmentFilters(searchParams);
    const data = await listEquipment(auth.db, filters);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar equipamentos:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao listar equipamentos.' },
      { status: Number(error?.status) || 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireEquipamentosPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const payload = await request.json();
    const data = await createEquipment(auth.db, payload);
    return NextResponse.json({ status: 'success', data }, { status: 201 });
  } catch (error: any) {
    console.error('Erro ao criar equipamento:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao criar equipamento.' },
      { status: Number(error?.status) || 500 },
    );
  }
}
