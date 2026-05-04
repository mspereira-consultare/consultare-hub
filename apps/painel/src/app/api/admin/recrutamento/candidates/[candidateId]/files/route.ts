import { NextResponse } from 'next/server';
import { requireRecrutamentoPermission } from '@/lib/recrutamento/auth';
import { storeRecruitmentCandidateFile } from '@/lib/recrutamento/files';
import { listRecruitmentDashboard, RecruitmentValidationError } from '@/lib/recrutamento/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ candidateId: string }>;
};

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requireRecrutamentoPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { candidateId } = await context.params;
    const normalizedCandidateId = String(candidateId || '').trim();
    if (!normalizedCandidateId) return NextResponse.json({ error: 'Candidato inválido.' }, { status: 400 });

    const formData = await request.formData();
    const filePart = formData.get('file');
    if (!(filePart instanceof File)) return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 });

    const mimeType = String(filePart.type || 'application/octet-stream');
    const originalName = String(filePart.name || 'curriculo.bin');
    const sizeBytes = Number(filePart.size || 0);
    if (sizeBytes <= 0) return NextResponse.json({ error: 'Arquivo vazio.' }, { status: 400 });

    const bodyBuffer = Buffer.from(await filePart.arrayBuffer());
    await storeRecruitmentCandidateFile(
      auth.db,
      {
        candidateId: normalizedCandidateId,
        originalName,
        mimeType,
        sizeBytes,
        content: bodyBuffer,
        uploadedBy: auth.userId,
      },
      auth.userId,
    );

    return NextResponse.json({ status: 'success', data: await listRecruitmentDashboard(auth.db) });
  } catch (error: unknown) {
    const details = error as { message?: unknown; status?: unknown };
    console.error('Erro ao anexar arquivo de candidato:', error);
    const status = error instanceof RecruitmentValidationError ? error.status : Number(details?.status) || 500;
    return NextResponse.json({ error: details?.message || 'Erro interno ao anexar arquivo.' }, { status });
  }
}
