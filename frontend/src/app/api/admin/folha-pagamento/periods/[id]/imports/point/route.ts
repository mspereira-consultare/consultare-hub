import { NextResponse } from 'next/server';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { processPayrollPointImport } from '@/lib/payroll/repository';
import { sanitizeStoragePart } from '@/lib/payroll/parsers';
import { getStorageProvider } from '@/lib/storage';

type ParamsContext = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const buildStorageKey = (periodId: string, originalName: string) => {
  const prefix = String(process.env.AWS_S3_PREFIX || 'folha-pagamento/').replace(/^\/+|\/+$/g, '');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}/${periodId}/ponto/${stamp}-${sanitizeStoragePart(originalName) || 'ponto.pdf'}`;
};

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requirePayrollPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const periodId = String(id || '').trim();
    const formData = await request.formData();
    const filePart = formData.get('file');
    if (!(filePart instanceof File)) return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 });

    const buffer = Buffer.from(await filePart.arrayBuffer());
    const provider = getStorageProvider();
    const upload = await provider.uploadFile({
      key: buildStorageKey(periodId, String(filePart.name || 'ponto.pdf')),
      body: buffer,
      contentType: String(filePart.type || 'application/pdf'),
      metadata: { periodId, fileType: 'POINT_PDF' },
    });

    const data = await processPayrollPointImport(auth.db, {
      periodId,
      fileName: String(filePart.name || 'ponto.pdf'),
      mimeType: String(filePart.type || 'application/pdf'),
      sizeBytes: Number(filePart.size || 0),
      storageProvider: upload.provider,
      storageBucket: upload.bucket,
      storageKey: upload.key,
      uploadedBy: auth.userId,
      buffer,
    });

    return NextResponse.json({ status: 'success', data }, { status: 201 });
  } catch (error: any) {
    console.error('Erro ao importar ponto da folha:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao importar ponto.' }, { status: Number(error?.status) || 500 });
  }
}
