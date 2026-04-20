import { NextResponse } from 'next/server';
import { requireRecrutamentoPermission } from '@/lib/recrutamento/auth';
import { RecruitmentValidationError, createRecruitmentCandidateFileRecord } from '@/lib/recrutamento/repository';
import { getStorageProvider } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ candidateId: string }>;
};

const sanitizePart = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

const buildStorageKey = (candidateId: string, originalName: string) => {
  const prefix = String(process.env.AWS_S3_PREFIX || 'recrutamento/').replace(/^\/+|\/+$/g, '');
  const fileName = sanitizePart(originalName) || 'curriculo.bin';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}/candidatos/${candidateId}/${stamp}-${fileName}`;
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

    const provider = getStorageProvider();
    const bodyBuffer = Buffer.from(await filePart.arrayBuffer());
    let uploaded: { provider: string; bucket: string | null; key: string } | null = null;

    try {
      const upload = await provider.uploadFile({
        key: buildStorageKey(normalizedCandidateId, originalName),
        body: bodyBuffer,
        contentType: mimeType,
        metadata: { candidateId: normalizedCandidateId },
      });
      uploaded = { provider: upload.provider, bucket: upload.bucket, key: upload.key };

      const data = await createRecruitmentCandidateFileRecord(
        auth.db,
        normalizedCandidateId,
        {
          originalName,
          mimeType,
          sizeBytes,
          storageProvider: upload.provider,
          storageBucket: upload.bucket,
          storageKey: upload.key,
          uploadedBy: auth.userId,
        },
        auth.userId,
      );

      return NextResponse.json({ status: 'success', data });
    } catch (error) {
      if (uploaded?.key) {
        try {
          await provider.deleteFile({ bucket: uploaded.bucket, key: uploaded.key });
        } catch (cleanupError) {
          console.error('Falha ao limpar anexo de candidato apos erro:', cleanupError);
        }
      }
      throw error;
    }
  } catch (error: unknown) {
    const details = error as { message?: unknown; status?: unknown };
    console.error('Erro ao anexar arquivo de candidato:', error);
    const status = error instanceof RecruitmentValidationError ? error.status : Number(details?.status) || 500;
    return NextResponse.json({ error: details?.message || 'Erro interno ao anexar arquivo.' }, { status });
  }
}
