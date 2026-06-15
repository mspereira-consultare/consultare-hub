import { NextResponse } from 'next/server';
import { getTaskDashboardSummary } from '@consultare/core/tasks/repository';
import type { TaskListFilters, TaskPriority, TaskStatus } from '@consultare/core/tasks/types';
import { requireTaskGovernanceAccess } from '@/lib/tasks/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const csv = (value: string | null) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const filtersFromRequest = (request: Request): TaskListFilters => {
  const { searchParams } = new URL(request.url);
  return {
    search: String(searchParams.get('search') || '').trim() || undefined,
    statuses: csv(searchParams.get('statuses')) as TaskStatus[],
    priorities: csv(searchParams.get('priorities')) as TaskPriority[],
    createdBy: String(searchParams.get('createdBy') || '').trim() || undefined,
    assigneeUserId: String(searchParams.get('assigneeUserId') || '').trim() || undefined,
    approverUserId: String(searchParams.get('approverUserId') || '').trim() || undefined,
    department: String(searchParams.get('department') || '').trim() || undefined,
    projectId: String(searchParams.get('projectId') || '').trim() || undefined,
    includeStandalone: String(searchParams.get('includeStandalone') || '').trim() === '0' ? false : undefined,
    scheduledOnly: String(searchParams.get('scheduledOnly') || '').trim() === '1',
    includeCanceled: String(searchParams.get('includeCanceled') || '').trim() === '1',
    dueBucket: (String(searchParams.get('dueBucket') || '').trim().toUpperCase() || undefined) as TaskListFilters['dueBucket'],
  };
};

export async function GET(request: Request) {
  try {
    const auth = await requireTaskGovernanceAccess('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const data = await getTaskDashboardSummary(auth.db, auth.viewer, filtersFromRequest(request));
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao carregar resumo de tarefas no painel:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao carregar resumo.' }, { status: Number(error?.status) || 500 });
  }
}
