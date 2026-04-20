import { NextResponse } from 'next/server';
import { requireRecrutamentoPermission } from '@/lib/recrutamento/auth';
import { RecruitmentValidationError, convertRecruitmentCandidateToEmployee } from '@/lib/recrutamento/repository';

export const dynamic = 'force-dynamic';

type ParamsContext = {
  params: Promise<{ candidateId: string }>;
};

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requireRecrutamentoPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { candidateId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const data = await convertRecruitmentCandidateToEmployee(auth.db, String(candidateId || ''), body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    const details = error as { message?: unknown; status?: unknown };
    console.error('Erro ao converter candidato em colaborador:', error);
    const status = error instanceof RecruitmentValidationError ? error.status : Number(details?.status) || 500;
    return NextResponse.json({ error: details?.message || 'Erro interno ao converter candidato.' }, { status });
  }
}
