import { NextResponse } from 'next/server';
import { requireVigilanciaSanitariaPermission } from '@/lib/vigilancia_sanitaria/auth';
import { deleteSurveillanceDocument, getSurveillanceDocumentById, updateSurveillanceDocument } from '@/lib/vigilancia_sanitaria/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: ParamsContext) {
  try {
    const auth = await requireVigilanciaSanitariaPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const data = await getSurveillanceDocumentById(auth.db, String(id || ''));
    if (!data) return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 });
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao carregar documento:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao carregar documento.' }, { status: Number(error?.status) || 500 });
  }
}

export async function PUT(request: Request, context: ParamsContext) {
  try {
    const auth = await requireVigilanciaSanitariaPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const payload = await request.json();
    const data = await updateSurveillanceDocument(auth.db, String(id || ''), payload, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao atualizar documento:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao atualizar documento.' }, { status: Number(error?.status) || 500 });
  }
}

export async function DELETE(_: Request, context: ParamsContext) {
  try {
    const auth = await requireVigilanciaSanitariaPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    await deleteSurveillanceDocument(auth.db, String(id || ''), auth.userId);
    return NextResponse.json({ status: 'success' });
  } catch (error: any) {
    console.error('Erro ao excluir documento:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao excluir documento.' }, { status: Number(error?.status) || 500 });
  }
}
