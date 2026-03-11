import { NextResponse } from 'next/server';
import { requireRepassesPermission } from '@/lib/repasses/auth';
import {
  listRepasseConsolidacaoLineMarks,
  upsertRepasseConsolidacaoLineMarks,
} from '@/lib/repasses/repository';
import { isRepassesModuleEnabledServer } from '@/lib/repasses/feature';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    if (!isRepassesModuleEnabledServer()) {
      return NextResponse.json({ error: 'Modulo de repasses desabilitado.' }, { status: 404 });
    }

    const auth = await requireRepassesPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const professionalId = String(searchParams.get('professionalId') || '').trim();
    if (!professionalId) {
      return NextResponse.json({ error: 'Profissional invalido.' }, { status: 400 });
    }

    const items = await listRepasseConsolidacaoLineMarks(auth.db, {
      periodRef: String(searchParams.get('periodRef') || '').trim() || undefined,
      professionalId,
      userId: auth.userId,
    });

    return NextResponse.json({ status: 'success', data: { items } });
  } catch (error: any) {
    console.error('Erro ao listar marcacoes de consolidacao:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao listar marcacoes.' },
      { status: Number(error?.status) || 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    if (!isRepassesModuleEnabledServer()) {
      return NextResponse.json({ error: 'Modulo de repasses desabilitado.' }, { status: 404 });
    }

    const auth = await requireRepassesPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const professionalId = String(body?.professionalId || '').trim();
    if (!professionalId) {
      return NextResponse.json({ error: 'Profissional invalido.' }, { status: 400 });
    }

    const items = await upsertRepasseConsolidacaoLineMarks(auth.db, {
      periodRef: body?.periodRef,
      professionalId,
      userId: auth.userId,
      marks: Array.isArray(body?.marks) ? body.marks : [],
    });

    return NextResponse.json({ status: 'success', data: { items } });
  } catch (error: any) {
    console.error('Erro ao salvar marcacoes de consolidacao:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao salvar marcacoes.' },
      { status: Number(error?.status) || 500 }
    );
  }
}
