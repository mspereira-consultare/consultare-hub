import { NextResponse } from 'next/server';
import { requireRepassesPermission } from '@/lib/repasses/auth';
import {
  createRepasseConsolidacaoJob,
  createRepasseSyncJob,
  RepasseValidationError,
} from '@/lib/repasses/repository';
import { isRepassesModuleEnabledServer } from '@/lib/repasses/feature';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
    const professionalIds = Array.isArray(body?.professionalIds)
      ? body.professionalIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
      : [];
    const scope = professionalIds.length <= 0 ? 'all' : professionalIds.length === 1 ? 'single' : 'multi';

    const [syncJob, consolidacaoJob] = await Promise.all([
      createRepasseSyncJob(
        auth.db,
        {
          periodRef: body?.periodRef,
          scope,
          professionalIds,
        },
        auth.userId
      ),
      createRepasseConsolidacaoJob(
        auth.db,
        {
          periodRef: body?.periodRef,
          scope,
          professionalIds,
        },
        auth.userId
      ),
    ]);

    return NextResponse.json({
      status: 'success',
      data: {
        syncJob,
        consolidacaoJob,
      },
    });
  } catch (error: any) {
    console.error('Erro ao criar atualizacao dupla de repasses:', error);
    const status =
      error instanceof RepasseValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao atualizar dados de repasse.' },
      { status }
    );
  }
}
