import { NextResponse } from 'next/server';
import { requireEquipamentosPermission } from '@/lib/equipamentos/auth';
import { listEquipmentOptions } from '@/lib/equipamentos/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await requireEquipamentosPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const data = await listEquipmentOptions(auth.db);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao carregar opções de equipamentos:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao carregar opções.' },
      { status: Number(error?.status) || 500 },
    );
  }
}
