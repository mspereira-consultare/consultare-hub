import { NextResponse } from 'next/server';
import { requireRecrutamentoPermission } from '@/lib/recrutamento/auth';
import { saveRecruitmentIndeedIntegrationSetup } from '@/lib/recrutamento/indeed';
import { getRecruitmentIndeedSummary } from '@/lib/recrutamento/repository';
import { RecruitmentValidationError } from '@/lib/recrutamento/repository';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireRecrutamentoPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const data = await getRecruitmentIndeedSummary(auth.db);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    const details = error as { message?: unknown; status?: unknown };
    console.error('Erro ao carregar integração Indeed:', error);
    return NextResponse.json({ error: details?.message || 'Erro interno ao carregar integração Indeed.' }, { status: Number(details?.status) || 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireRecrutamentoPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const data = await saveRecruitmentIndeedIntegrationSetup(auth.db, body);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    const details = error as { message?: unknown; status?: unknown };
    console.error('Erro ao salvar integração Indeed:', error);
    const status = error instanceof RecruitmentValidationError ? error.status : Number(details?.status) || 500;
    return NextResponse.json({ error: details?.message || 'Erro interno ao salvar integração Indeed.' }, { status });
  }
}
