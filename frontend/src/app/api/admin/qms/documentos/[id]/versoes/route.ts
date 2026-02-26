import { NextResponse } from 'next/server';
import { requireQmsPermission } from '@/lib/qms/auth';
import { createQmsDocumentVersion, QmsValidationError } from '@/lib/qms/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requireQmsPermission('qualidade_documentos', 'edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const { id } = await context.params;
    const data = await createQmsDocumentVersion(auth.db, String(id || ''), body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao criar nova versao QMS:', error);
    const status =
      error instanceof QmsValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao criar nova versao.' },
      { status }
    );
  }
}
