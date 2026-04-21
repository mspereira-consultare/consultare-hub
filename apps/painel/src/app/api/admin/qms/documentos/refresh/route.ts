import { NextResponse } from 'next/server';
import { requireQmsPermission } from '@/lib/qms/auth';
import { refreshQmsDocumentStatuses } from '@/lib/qms/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  try {
    const auth = await requireQmsPermission('qualidade_documentos', 'refresh');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const data = await refreshQmsDocumentStatuses(auth.db, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro no refresh de documentos QMS:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno no refresh de documentos.' },
      { status }
    );
  }
}
