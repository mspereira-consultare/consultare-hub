import { NextResponse } from 'next/server';
import { requireVigilanciaSanitariaPermission } from '@/lib/vigilancia_sanitaria/auth';
import { createSurveillanceLicense, listSurveillanceLicenses, normalizeLicenseFilters } from '@/lib/vigilancia_sanitaria/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const auth = await requireVigilanciaSanitariaPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { searchParams } = new URL(request.url);
    const data = await listSurveillanceLicenses(auth.db, normalizeLicenseFilters(searchParams));
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar licenças da Vigilância Sanitária:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao listar licenças.' }, { status: Number(error?.status) || 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireVigilanciaSanitariaPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const payload = await request.json();
    const data = await createSurveillanceLicense(auth.db, payload, auth.userId);
    return NextResponse.json({ status: 'success', data }, { status: 201 });
  } catch (error: any) {
    console.error('Erro ao criar licença da Vigilância Sanitária:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao criar licença.' }, { status: Number(error?.status) || 500 });
  }
}
