import { NextResponse } from 'next/server';
import { getTaskGlobalWeeklyReportPreview, getTaskWeeklyReportSettings } from '@/lib/tasks/weekly-report';
import { getTaskWeeklyReportPreview } from '@consultare/core/tasks/repository';
import { requireTaskGovernanceAccess } from '@/lib/tasks/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await requireTaskGovernanceAccess('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const kind = String(searchParams.get('kind') || 'individual').trim().toLowerCase();
    const userId = String(searchParams.get('userId') || '').trim();
    if (!userId) {
      return NextResponse.json({ error: 'Informe o userId para gerar a prévia do report semanal.' }, { status: 400 });
    }

    if (kind === 'global') {
      const settings = await getTaskWeeklyReportSettings(auth.db);
      if (!settings.globalRecipientUserIds.includes(userId)) {
        return NextResponse.json({ error: 'Selecione um destinatário configurado no relatório global para gerar a prévia.' }, { status: 400 });
      }
      const data = await getTaskGlobalWeeklyReportPreview(auth.db, userId);
      return NextResponse.json({ status: 'success', data });
    }

    const data = await getTaskWeeklyReportPreview(auth.db, userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao gerar prévia do report semanal de tarefas:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao gerar a prévia do report semanal.' },
      { status: Number(error?.status) || 500 }
    );
  }
}
