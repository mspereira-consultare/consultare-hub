import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { requireContractTemplatesPermission } from '@/lib/contract_templates/auth';
import { getContractTemplateById } from '@/lib/contract_templates/repository';
import { getStorageProviderByName } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: ParamsContext) {
  try {
    const auth = await requireContractTemplatesPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const template = await getContractTemplateById(auth.db, String(id || ''));
    if (!template) {
      return NextResponse.json({ error: 'Modelo de contrato nao encontrado.' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const inline = searchParams.get('inline') === '1';

    const provider = getStorageProviderByName(template.storageProvider);
    const stream = await provider.getFileStream({
      bucket: template.storageBucket,
      key: template.storageKey,
    });

    const webStream = Readable.toWeb(stream) as ReadableStream;
    const fileName = template.originalName || `modelo-${template.id}.docx`;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': template.mimeType || 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    console.error('Erro ao baixar modelo de contrato:', error);
    const message = error instanceof Error ? error.message : 'Erro interno.';
    const status = Number((error as { status?: number })?.status) || 500;
    return NextResponse.json({ error: message }, { status });
  }
}
