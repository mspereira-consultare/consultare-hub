import { NextResponse } from 'next/server';
import { requireVigilanciaSanitariaPermission } from '@/lib/vigilancia_sanitaria/auth';
import { deleteSurveillanceLicense, getSurveillanceLicenseById, updateSurveillanceLicense } from '@/lib/vigilancia_sanitaria/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: ParamsContext) {
  try {
    const auth = await requireVigilanciaSanitariaPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const data = await getSurveillanceLicenseById(auth.db, String(id || ''));
    if (!data) return NextResponse.json({ error: 'Licença não encontrada.' }, { status: 404 });
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao carregar licença:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao carregar licença.' }, { status: Number(error?.status) || 500 });
  }
}

export async function PUT(request: Request, context: ParamsContext) {
  try {
    const auth = await requireVigilanciaSanitariaPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const payload = await request.json();
    const data = await updateSurveillanceLicense(auth.db, String(id || ''), payload, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao atualizar licença:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao atualizar licença.' }, { status: Number(error?.status) || 500 });
  }
}

export async function DELETE(_: Request, context: ParamsContext) {
  try {
    const auth = await requireVigilanciaSanitariaPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    await deleteSurveillanceLicense(auth.db, String(id || ''), auth.userId);
    return NextResponse.json({ status: 'success' });
  } catch (error: any) {
    console.error('Erro ao excluir licença:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao excluir licença.' }, { status: Number(error?.status) || 500 });
  }
}
