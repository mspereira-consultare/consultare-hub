import { NextResponse } from 'next/server';
import { requireQmsPermission } from '@/lib/qms/auth';
import {
  createQmsTrainingPlan,
  listQmsTrainingPlans,
  QmsValidationError,
} from '@/lib/qms/trainings_repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const auth = await requireQmsPermission('qualidade_treinamentos', 'view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const search = String(searchParams.get('search') || '').trim();
    const sector = String(searchParams.get('sector') || '').trim();
    const status = String(searchParams.get('status') || 'all').trim().toLowerCase();
    const data = await listQmsTrainingPlans(auth.db, { search, sector, status });
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar cronogramas:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao listar cronogramas.' },
      { status }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireQmsPermission('qualidade_treinamentos', 'edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const body = await request.json();
    const data = await createQmsTrainingPlan(auth.db, body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao criar cronograma:', error);
    const status =
      error instanceof QmsValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao criar cronograma.' },
      { status }
    );
  }
}
