import { NextResponse } from 'next/server';
import { requireQmsPermission } from '@/lib/qms/auth';
import { listQmsDocumentOptions, listQmsTrainingPlans } from '@/lib/qms/trainings_repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await requireQmsPermission('qualidade_treinamentos', 'view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const [documents, plans] = await Promise.all([
      listQmsDocumentOptions(auth.db),
      listQmsTrainingPlans(auth.db, { status: 'all' }),
    ]);

    return NextResponse.json({
      status: 'success',
      data: {
        documents,
        plans: plans.map((item) => ({
          id: item.id,
          code: item.code,
          theme: item.theme,
          status: item.status,
        })),
      },
    });
  } catch (error: any) {
    console.error('Erro ao listar opcoes de treinamentos:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao listar opcoes.' },
      { status }
    );
  }
}
