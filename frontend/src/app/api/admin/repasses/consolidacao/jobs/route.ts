import { NextResponse } from 'next/server';
import { requireRepassesPermission } from '@/lib/repasses/auth';
import {
  createRepasseConsolidacaoJob,
  listRepasseConsolidacaoJobs,
  RepasseValidationError,
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
    const periodRef = String(searchParams.get('periodRef') || '').trim();
    const limit = Number(searchParams.get('limit') || 20);

    const data = await listRepasseConsolidacaoJobs(auth.db, {
      periodRef: periodRef || undefined,
      limit,
    });

    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar jobs de repasse a consolidar:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao listar jobs de repasse a consolidar.' },
      { status }
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!isRepassesModuleEnabledServer()) {
      return NextResponse.json({ error: 'Modulo de repasses desabilitado.' }, { status: 404 });
    }
    const auth = await requireRepassesPermission('refresh');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const job = await createRepasseConsolidacaoJob(
      auth.db,
      {
        periodRef: body?.periodRef,
        scope: body?.scope,
        professionalIds: body?.professionalIds,
      },
      auth.userId
    );

    return NextResponse.json({ status: 'success', data: job });
  } catch (error: any) {
    console.error('Erro ao criar job de repasse a consolidar:', error);
    const status =
      error instanceof RepasseValidationError
        ? error.status
        : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao criar job de repasse a consolidar.' },
      { status }
    );
  }
}
