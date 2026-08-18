import { NextResponse } from 'next/server';
import {
  buildRecepcaoChecklistPayload,
  buildRecepcaoChecklistPdf,
  requireRecepcaoChecklistAccess,
} from '@/lib/checklist_recepcao';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const errorStatus = (error: unknown) =>
  typeof error === 'object' && error && 'status' in error ? Number((error as { status?: unknown }).status) || 500 : 500;

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

export async function GET(request: Request) {
  try {
    const auth = await requireRecepcaoChecklistAccess('view');
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const payload = await buildRecepcaoChecklistPayload(auth, {
      configId: url.searchParams.get('configId'),
      unitKey: url.searchParams.get('unitKey'),
      viewMode: url.searchParams.get('viewMode'),
      referenceDate: url.searchParams.get('referenceDate'),
      versionId: url.searchParams.get('versionId'),
    });

    const pdf = await buildRecepcaoChecklistPdf(payload);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="checklist-recepcao-${payload.selectedUnitKey}-${payload.referenceDate}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    console.error('Erro GET checklist recepcao export.pdf:', error);
    return NextResponse.json(
      { status: 'error', error: errorMessage(error, 'Erro ao exportar PDF da checklist.') },
      { status: errorStatus(error) },
    );
  }
}
