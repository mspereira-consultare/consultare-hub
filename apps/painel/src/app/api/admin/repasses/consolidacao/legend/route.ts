import { NextResponse } from 'next/server';
import { requireRepassesPermission } from '@/lib/repasses/auth';
import {
  getRepasseConsolidacaoMarkLegend,
  upsertRepasseConsolidacaoMarkLegend,
} from '@/lib/repasses/repository';
import { isRepassesModuleEnabledServer } from '@/lib/repasses/feature';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    if (!isRepassesModuleEnabledServer()) {
      return NextResponse.json({ error: 'Modulo de repasses desabilitado.' }, { status: 404 });
    }

    const auth = await requireRepassesPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const legend = await getRepasseConsolidacaoMarkLegend(auth.db, auth.userId);
    return NextResponse.json({ status: 'success', data: legend });
  } catch (error: any) {
    console.error('Erro ao buscar legenda de marcacoes de consolidacao:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao buscar legenda.' },
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
    const legend = await upsertRepasseConsolidacaoMarkLegend(auth.db, auth.userId, {
      green: body?.green,
      yellow: body?.yellow,
      red: body?.red,
    });
    return NextResponse.json({ status: 'success', data: legend });
  } catch (error: any) {
    console.error('Erro ao salvar legenda de marcacoes de consolidacao:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao salvar legenda.' },
      { status: Number(error?.status) || 500 }
    );
  }
}
