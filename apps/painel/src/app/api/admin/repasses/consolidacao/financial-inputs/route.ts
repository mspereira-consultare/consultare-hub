import { NextResponse } from 'next/server';
import { requireRepassesPermission } from '@/lib/repasses/auth';
import {
  RepasseValidationError,
  upsertRepasseConsolidacaoFinancialInput,
} from '@/lib/repasses/repository';
import { isRepassesModuleEnabledServer } from '@/lib/repasses/feature';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

    const item = await upsertRepasseConsolidacaoFinancialInput(
      auth.db,
      {
        periodRef: String(body?.periodRef || '').trim() || undefined,
        professionalId,
        repasseFinalValue: Object.prototype.hasOwnProperty.call(body || {}, 'repasseFinalValue')
          ? body?.repasseFinalValue
          : undefined,
        produtividadeValue: Object.prototype.hasOwnProperty.call(body || {}, 'produtividadeValue')
          ? body?.produtividadeValue
          : undefined,
      },
      auth.userId
    );

    return NextResponse.json({ status: 'success', data: { item } });
  } catch (error: any) {
    console.error('Erro ao salvar inputs financeiros de repasse consolidacao:', error);
    const status =
      error instanceof RepasseValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao salvar inputs financeiros.' },
      { status }
    );
  }
}

