import { NextResponse } from 'next/server';
import type { DbInterface } from '@consultare/core/db';
import { getTaskProjectById } from '@consultare/core/tasks/repository';
import { buildTaskProjectGanttPdf } from '@consultare/core/tasks/gantt-pdf';
import { requireTaskGovernanceAccess } from '@/lib/tasks/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ projectId: string }>;
};

const buildInClause = (size: number) => Array.from({ length: size }, () => '?').join(', ');

const resolveUserNames = async (db: DbInterface, userIds: string[]) => {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (!uniqueIds.length) return new Map<string, string>();
  const rows = await db.query(`SELECT id, name FROM users WHERE id IN (${buildInClause(uniqueIds.length)})`, uniqueIds);
  return new Map(rows.map((row) => [String((row as any).id), String((row as any).name || (row as any).id)]));
};

export async function GET(_: Request, context: ParamsContext) {
  try {
    const auth = await requireTaskGovernanceAccess('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { projectId } = await context.params;
    const project = await getTaskProjectById(auth.db, String(projectId || ''), auth.viewer);
    const userMap = await resolveUserNames(
      auth.db,
      project.tasks.flatMap((task) => [
        task.primaryAssigneeUserId || '',
        task.approverUserId || '',
        ...task.assignees.map((assignee) => assignee.userId),
      ])
    );
    const output = await buildTaskProjectGanttPdf({
      project,
      title: project.name,
      subtitle: project.description || 'Cronograma exportado da governança de tarefas.',
      summaryTitle: 'Resumo executivo',
      summaryNote: 'Este PDF combina o resumo gerencial com o diagrama Gantt do projeto para leitura cronológica.',
      assigneeMap: userMap,
    });
    return new NextResponse(Buffer.from(output), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="governanca-projeto-${project.name.toLowerCase().replace(/\s+/g, '-')}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('Erro ao exportar projeto de tarefas do painel em PDF:', error);
    return NextResponse.json({ error: error?.message || 'Erro ao exportar projeto em PDF.' }, { status: Number(error?.status) || 500 });
  }
}
