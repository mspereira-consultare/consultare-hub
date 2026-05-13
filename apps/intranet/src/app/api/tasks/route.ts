import { NextResponse } from 'next/server';
import { createTask, listTasks } from '@consultare/core/tasks/repository';
import type { TaskListFilters, TaskPriority, TaskStatus } from '@consultare/core/tasks/types';
import { requireIntranetTasksPermission } from '@/lib/intranet/tasks-auth';

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
    includeCanceled: String(searchParams.get('includeCanceled') || '').trim() === '1',
    dueBucket: (String(searchParams.get('dueBucket') || '').trim().toUpperCase() || undefined) as TaskListFilters['dueBucket'],
  };
};

export async function GET(request: Request) {
  try {
    const auth = await requireIntranetTasksPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const data = await listTasks(auth.db, auth.viewer, filtersFromRequest(request));
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao listar tarefas da intranet:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao listar tarefas.' }, { status: Number(error?.status) || 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireIntranetTasksPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json();
    const data = await createTask(auth.db, body, auth.userId);
    return NextResponse.json({ status: 'success', data }, { status: 201 });
  } catch (error: any) {
    console.error('Erro ao criar tarefa da intranet:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao criar tarefa.' }, { status: Number(error?.status) || 500 });
  }
}
