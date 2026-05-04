import { NextResponse } from 'next/server';
import { requireRecrutamentoPermission } from '@/lib/recrutamento/auth';
import {
  enqueueRecruitmentCandidateAiAnalysis,
  getRecruitmentCandidateAnalysisDetails,
  RecruitmentValidationError,
} from '@/lib/recrutamento/repository';

export const dynamic = 'force-dynamic';

type ParamsContext = {
  params: Promise<{ candidateId: string }>;
};

export async function GET(_request: Request, context: ParamsContext) {
  try {
    const auth = await requireRecrutamentoPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { candidateId } = await context.params;
    const data = await getRecruitmentCandidateAnalysisDetails(auth.db, String(candidateId || ''));
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    const details = error as { message?: unknown; status?: unknown };
    console.error('Erro ao carregar análise do candidato:', error);
    const status = error instanceof RecruitmentValidationError ? error.status : Number(details?.status) || 500;
    return NextResponse.json({ error: details?.message || 'Erro interno ao carregar análise do candidato.' }, { status });
  }
}

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requireRecrutamentoPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { candidateId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const data = await enqueueRecruitmentCandidateAiAnalysis(auth.db, String(candidateId || ''), auth.userId, {
      sourceFileId: String(body?.sourceFileId || body?.source_file_id || '').trim() || null,
      force: Boolean(body?.force),
    });
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    const details = error as { message?: unknown; status?: unknown };
    console.error('Erro ao enfileirar análise do candidato:', error);
    const status = error instanceof RecruitmentValidationError ? error.status : Number(details?.status) || 500;
    return NextResponse.json({ error: details?.message || 'Erro interno ao enfileirar análise do candidato.' }, { status });
  }
}
