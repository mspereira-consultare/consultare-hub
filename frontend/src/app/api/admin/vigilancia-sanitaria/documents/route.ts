import { NextResponse } from 'next/server';
import { requireVigilanciaSanitariaPermission } from '@/lib/vigilancia_sanitaria/auth';
import { createSurveillanceDocument, listSurveillanceDocuments, normalizeDocumentFilters } from '@/lib/vigilancia_sanitaria/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const auth = await requireVigilanciaSanitariaPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { searchParams } = new URL(request.url);
    const data = await listSurveillanceDocuments(auth.db, normalizeDocumentFilters(searchParams));
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar documentos da Vigilância Sanitária:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao listar documentos.' }, { status: Number(error?.status) || 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireVigilanciaSanitariaPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const payload = await request.json();
    const data = await createSurveillanceDocument(auth.db, payload, auth.userId);
    return NextResponse.json({ status: 'success', data }, { status: 201 });
  } catch (error: any) {
    console.error('Erro ao criar documento da Vigilância Sanitária:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao criar documento.' }, { status: Number(error?.status) || 500 });
  }
}
