import { NextResponse } from 'next/server';
import { requireRepassesPermission } from '@/lib/repasses/auth';
import {
  listRepasseProfessionalIds,
  listRepasseProfessionalOptions,
  listRepasseProfessionalSummaries,
} from '@/lib/repasses/repository';
import { isRepassesModuleEnabledServer } from '@/lib/repasses/feature';
import type { RepasseProfessionalStatusFilter } from '@/lib/repasses/types';

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
      const options = await listRepasseProfessionalOptions(auth.db, {
        search: String(searchParams.get('search') || '').trim() || undefined,
        limit: Number(searchParams.get('limit') || 500),
      });
      return NextResponse.json({ status: 'success', data: { items: options } });
    }


    if (mode === 'ids') {
      const ids = await listRepasseProfessionalIds(auth.db, {
        periodRef: String(searchParams.get('periodRef') || '').trim() || undefined,
        search: String(searchParams.get('search') || '').trim() || undefined,
        status: (statusRaw || undefined) as RepasseProfessionalStatusFilter | undefined,
      });
      return NextResponse.json({ status: 'success', data: { items: ids } });
    }

    const data = await listRepasseProfessionalSummaries(auth.db, {
      periodRef: String(searchParams.get('periodRef') || '').trim() || undefined,
      search: String(searchParams.get('search') || '').trim() || undefined,
      status: (statusRaw || undefined) as RepasseProfessionalStatusFilter | undefined,
      page: Number(searchParams.get('page') || 1),
      pageSize: Number(searchParams.get('pageSize') || 50),
    });

    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar resumo de profissionais de repasse:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao listar resumo de repasse por profissional.' },
      { status }
    );
  }
}
