import { NextResponse } from 'next/server';
import { requireQmsPermission } from '@/lib/qms/auth';
import {
  createQmsDocument,
  listQmsDocuments,
  QmsValidationError,
} from '@/lib/qms/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const auth = await requireQmsPermission('qualidade_documentos', 'view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const search = String(searchParams.get('search') || '').trim();
    const sector = String(searchParams.get('sector') || '').trim();
    const status = String(searchParams.get('status') || 'all').trim().toLowerCase();

    const data = await listQmsDocuments(auth.db, {
      search,
      sector,
      status: status as any,
    });

    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar documentos QMS:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao listar documentos.' },
      { status }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireQmsPermission('qualidade_documentos', 'edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const data = await createQmsDocument(auth.db, body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao criar documento QMS:', error);
    const status =
      error instanceof QmsValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao criar documento.' },
      { status }
    );
  }
}
