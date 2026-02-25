import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { requireProfissionaisPermission } from '@/lib/profissionais/auth';
import {
  getProfessionalContractById,
  resolveProfessionalContractFile,
} from '@/lib/profissionais/contracts';
import { getStorageProviderByName } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ id: string; contractId: string }>;
};

const parseFormat = (value: string | null): 'pdf' | 'docx' =>
  String(value || '').trim().toLowerCase() === 'docx' ? 'docx' : 'pdf';

const defaultNameByFormat = (contractId: string, format: 'pdf' | 'docx') =>
  `contrato-${contractId}.${format}`;

export async function GET(request: Request, context: ParamsContext) {
  try {
    const auth = await requireProfissionaisPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id, contractId } = await context.params;
    const professionalId = String(id || '').trim();
    const cleanContractId = String(contractId || '').trim();
    if (!professionalId || !cleanContractId) {
      return NextResponse.json({ error: 'Parametros invalidos.' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const format = parseFormat(searchParams.get('format'));
    const wantsInline = searchParams.get('inline') === '1';

    const contract = await getProfessionalContractById(auth.db, professionalId, cleanContractId);
    if (!contract) {
      return NextResponse.json({ error: 'Contrato nao encontrado.' }, { status: 404 });
    }

    const file = await resolveProfessionalContractFile(auth.db, contract, format);
    if (!file) {
      return NextResponse.json(
        { error: `Arquivo ${format.toUpperCase()} indisponivel para este contrato.` },
        { status: 404 }
      );
    }

    const provider = getStorageProviderByName(file.storageProvider);
    const stream = await provider.getFileStream({
      bucket: file.storageBucket,
      key: file.storageKey,
    });

    const webStream = Readable.toWeb(stream) as ReadableStream;
    const fileName = file.originalName || defaultNameByFormat(contract.id, format);
    const contentType =
      file.mimeType ||
      (format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const canInline = wantsInline && format === 'pdf';

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `${canInline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    console.error('Erro no download de contrato:', error);
    const message = error instanceof Error ? error.message : 'Erro interno.';
    const status = Number((error as { status?: number })?.status) || 500;
    return NextResponse.json({ error: message }, { status });
  }
}
