import { NextResponse } from 'next/server';
import { getTaskPortfolioGantt } from '@consultare/core/tasks/repository';
import { requireIntranetTasksPermission } from '@/lib/intranet/tasks-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await requireIntranetTasksPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const data = await getTaskPortfolioGantt(auth.db, auth.viewer);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao carregar portfólio gantt da intranet:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao carregar portfólio gantt.' }, { status: Number(error?.status) || 500 });
  }
}
