import { NextResponse } from 'next/server';
import { requireRepassesPermission } from '@/lib/repasses/auth';
import {
  getRepasseProfessionalPaymentMinimum,
  getRepasseProfessionalNote,
  listRepasseConsolidatedLinesByProfessional,
} from '@/lib/repasses/repository';
import { isRepassesModuleEnabledServer } from '@/lib/repasses/feature';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ professionalId: string }>;
};

export async function GET(request: Request, context: ParamsContext) {
  try {
    if (!isRepassesModuleEnabledServer()) {
      return NextResponse.json({ error: 'Modulo de repasses desabilitado.' }, { status: 404 });
    }

    const auth = await requireRepassesPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const periodRef = String(searchParams.get('periodRef') || '').trim() || undefined;
    const { professionalId: rawProfessionalId } = await context.params;
    const professionalId = decodeURIComponent(String(rawProfessionalId || '').trim());
    if (!professionalId) {
      return NextResponse.json({ error: 'Profissional invalido.' }, { status: 400 });
    }

    const [rows, notes, paymentMinimumText] = await Promise.all([
      listRepasseConsolidatedLinesByProfessional(auth.db, periodRef || '', professionalId),
      getRepasseProfessionalNote(auth.db, { periodRef, professionalId }),
      getRepasseProfessionalPaymentMinimum(auth.db, professionalId),
    ]);

    return NextResponse.json({
      status: 'success',
      data: {
        rows,
        note: notes.note,
        internalNote: notes.internalNote,
        paymentMinimumText: paymentMinimumText || null,
      },
    });
  } catch (error: any) {
    console.error('Erro ao buscar detalhes de repasse por profissional:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao buscar detalhes de repasse por profissional.' },
      { status }
    );
  }
}
