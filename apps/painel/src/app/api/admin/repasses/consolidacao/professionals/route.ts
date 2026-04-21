import { NextResponse } from 'next/server';
import { requireRepassesPermission } from '@/lib/repasses/auth';
import {
  listRepasseConsolidacaoProfessionalIds,
  listRepasseConsolidacaoProfessionalOptions,
  listRepasseConsolidacaoProfessionalSummaries,
} from '@/lib/repasses/repository';
import { isRepassesModuleEnabledServer } from '@/lib/repasses/feature';
import type {
  RepasseConsolidacaoBooleanFilter,
  RepasseConsolidacaoProfessionalStatusFilter,
  RepasseConsolidacaoStatusFilter,
} from '@/lib/repasses/types';

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
    const mode = String(searchParams.get('mode') || '').trim().toLowerCase();
    const statusRaw = String(searchParams.get('status') || '').trim();

    if (mode === 'options') {
      const options = await listRepasseConsolidacaoProfessionalOptions(auth.db, {
        search: String(searchParams.get('search') || '').trim() || undefined,
        limit: Number(searchParams.get('limit') || 500),
      });
      return NextResponse.json({ status: 'success', data: { items: options } });
    }

    if (mode === 'ids') {
      const ids = await listRepasseConsolidacaoProfessionalIds(auth.db, {
        periodRef: String(searchParams.get('periodRef') || '').trim() || undefined,
        search: String(searchParams.get('search') || '').trim() || undefined,
        status: (statusRaw || undefined) as RepasseConsolidacaoProfessionalStatusFilter | undefined,
        hasPaymentMinimum: (String(searchParams.get('hasPaymentMinimum') || '').trim() ||
          undefined) as RepasseConsolidacaoBooleanFilter | undefined,
        consolidacaoStatus: (String(searchParams.get('consolidacaoStatus') || '').trim() ||
          undefined) as RepasseConsolidacaoStatusFilter | undefined,
        hasDivergence: (String(searchParams.get('hasDivergence') || '').trim() ||
          undefined) as RepasseConsolidacaoBooleanFilter | undefined,
        attendanceDateStart: String(searchParams.get('attendanceDateStart') || '').trim() || undefined,
        attendanceDateEnd: String(searchParams.get('attendanceDateEnd') || '').trim() || undefined,
        patientName: String(searchParams.get('patientName') || '').trim() || undefined,
      });
      return NextResponse.json({ status: 'success', data: { items: ids } });
    }

    const data = await listRepasseConsolidacaoProfessionalSummaries(auth.db, {
      periodRef: String(searchParams.get('periodRef') || '').trim() || undefined,
      search: String(searchParams.get('search') || '').trim() || undefined,
      status: (statusRaw || undefined) as RepasseConsolidacaoProfessionalStatusFilter | undefined,
      hasPaymentMinimum: (String(searchParams.get('hasPaymentMinimum') || '').trim() ||
        undefined) as RepasseConsolidacaoBooleanFilter | undefined,
      consolidacaoStatus: (String(searchParams.get('consolidacaoStatus') || '').trim() ||
        undefined) as RepasseConsolidacaoStatusFilter | undefined,
      hasDivergence: (String(searchParams.get('hasDivergence') || '').trim() ||
        undefined) as RepasseConsolidacaoBooleanFilter | undefined,
      attendanceDateStart: String(searchParams.get('attendanceDateStart') || '').trim() || undefined,
      attendanceDateEnd: String(searchParams.get('attendanceDateEnd') || '').trim() || undefined,
      patientName: String(searchParams.get('patientName') || '').trim() || undefined,
      page: Number(searchParams.get('page') || 1),
      pageSize: Number(searchParams.get('pageSize') || 50),
    });

    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar resumo de profissionais de repasse a consolidar:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      {
        error:
          error?.message || 'Erro interno ao listar resumo de repasse a consolidar por profissional.',
      },
      { status }
    );
  }
}
