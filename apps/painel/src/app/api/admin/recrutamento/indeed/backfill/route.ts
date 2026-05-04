import { NextResponse } from 'next/server';
import { requireRecrutamentoPermission } from '@/lib/recrutamento/auth';
import { executeRecruitmentIndeedBackfillAction } from '@/lib/recrutamento/indeed';
import { RecruitmentValidationError } from '@/lib/recrutamento/repository';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const auth = await requireRecrutamentoPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const data = await executeRecruitmentIndeedBackfillAction(auth.db, body);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    const details = error as { message?: unknown; status?: unknown };
    console.error('Erro ao executar fase 2 da Indeed:', error);
    const status = error instanceof RecruitmentValidationError ? error.status : Number(details?.status) || 500;
    return NextResponse.json({ error: details?.message || 'Erro interno ao executar a fase 2 da Indeed.' }, { status });
  }
}
