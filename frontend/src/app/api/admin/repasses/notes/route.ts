import { NextResponse } from 'next/server';
import { requireRepassesPermission } from '@/lib/repasses/auth';
import { upsertRepasseProfessionalNote } from '@/lib/repasses/repository';
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
    const saved = await upsertRepasseProfessionalNote(
      auth.db,
      {
        periodRef: body?.periodRef,
        professionalId: body?.professionalId,
        note: body?.note,
      },
      auth.userId
    );

    return NextResponse.json({ status: 'success', data: saved });
  } catch (error: any) {
    console.error('Erro ao salvar observacao de repasse:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao salvar observacao de repasse.' },
      { status: Number(error?.status) || 500 }
    );
  }
}

