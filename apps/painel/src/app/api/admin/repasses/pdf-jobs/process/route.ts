import { NextResponse } from 'next/server';
import { requireRepassesPermission } from '@/lib/repasses/auth';
import { processPendingRepassePdfJobs } from '@/lib/repasses/pdf_processor';
import { isRepassesModuleEnabledServer } from '@/lib/repasses/feature';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    if (!isRepassesModuleEnabledServer()) {
      return NextResponse.json({ error: 'Modulo de repasses desabilitado.' }, { status: 404 });
    }

    const auth = await requireRepassesPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const maxJobs = Number(body?.maxJobs || 1);

    const result = await processPendingRepassePdfJobs(auth.db, { maxJobs });

    return NextResponse.json({ status: 'success', data: result });
  } catch (error: any) {
    console.error('Erro ao processar jobs de PDF de repasse:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao processar jobs de PDF de repasse.' },
      { status }
    );
  }
}
