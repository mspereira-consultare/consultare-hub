import { NextResponse } from 'next/server';
import { requireRepassesPermission } from '@/lib/repasses/auth';
import { isRepassesModuleEnabledServer } from '@/lib/repasses/feature';
import {
  createRepasseEmailJob,
  listRepasseEmailJobs,
  RepasseValidationError,
} from '@/lib/repasses/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    if (!isRepassesModuleEnabledServer()) {
      return NextResponse.json({ error: 'Modulo de repasses desabilitado.' }, { status: 404 });
    }
    const auth = await requireRepassesPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const data = await listRepasseEmailJobs(auth.db, {
      batchId: String(searchParams.get('batchId') || '').trim() || undefined,
      periodRef: String(searchParams.get('periodRef') || '').trim() || undefined,
      limit: Number(searchParams.get('limit') || 20),
    });

    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao listar jobs de e-mail de repasse:', error);
    const status = Number((error as { status?: number }).status) || 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Erro interno ao listar jobs de e-mail de repasse.',
      },
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
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => ({}));
    const data = await createRepasseEmailJob(
      auth.db,
      {
        batchId: body?.batchId,
        scope: body?.scope,
        recipientIds: Array.isArray(body?.recipientIds) ? body.recipientIds : [],
      },
      auth.userId
    );

    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao criar job de e-mail de repasse:', error);
    const status =
      error instanceof RepasseValidationError
        ? error.status
        : Number((error as { status?: number }).status) || 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Erro interno ao criar job de e-mail de repasse.',
      },
      { status }
    );
  }
}
