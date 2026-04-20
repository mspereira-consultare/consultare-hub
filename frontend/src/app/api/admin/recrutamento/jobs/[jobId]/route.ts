import { NextResponse } from 'next/server';
import { requireRecrutamentoPermission } from '@/lib/recrutamento/auth';
import { RecruitmentValidationError, updateRecruitmentJob } from '@/lib/recrutamento/repository';

export const dynamic = 'force-dynamic';

type ParamsContext = {
  params: Promise<{ jobId: string }>;
};

export async function PATCH(request: Request, context: ParamsContext) {
  try {
    const auth = await requireRecrutamentoPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { jobId } = await context.params;
    const body = await request.json();
    const data = await updateRecruitmentJob(auth.db, String(jobId || ''), body);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    const details = error as { message?: unknown; status?: unknown };
    console.error('Erro ao atualizar vaga de recrutamento:', error);
    const status = error instanceof RecruitmentValidationError ? error.status : Number(details?.status) || 500;
    return NextResponse.json({ error: details?.message || 'Erro interno ao atualizar vaga.' }, { status });
  }
}
