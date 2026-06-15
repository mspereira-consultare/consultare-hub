import { NextResponse } from 'next/server';
import type { DbInterface } from '@consultare/core/db';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getTaskProjectById } from '@consultare/core/tasks/repository';
import { buildProjectTaskExportRows } from '@consultare/core/tasks/export';
import { requireIntranetTasksPermission } from '@/lib/intranet/tasks-auth';

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
    const auth = await requireIntranetTasksPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { projectId } = await context.params;
    const project = await getTaskProjectById(auth.db, String(projectId || ''), auth.viewer);
    const rows = buildProjectTaskExportRows(project);
    const userMap = await resolveUserNames(
      auth.db,
      rows.flatMap((row) => [row.primaryAssigneeUserId || '', row.approverUserId || '', ...row.assigneeUserIds])
    );

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const page = pdf.addPage([842, 595]);

    page.drawRectangle({ x: 32, y: 535, width: 778, height: 40, color: rgb(0.09, 0.25, 0.49) });
    page.drawText(project.name, { x: 42, y: 550, size: 18, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText(project.description || 'Cronograma exportado do módulo de tarefas da intranet.', {
      x: 42,
      y: 525,
      size: 9,
      font,
      color: rgb(0.34, 0.42, 0.56),
    });

    let cursorY = 500;
    page.drawText('Protocolo', { x: 42, y: cursorY, size: 9, font: fontBold });
    page.drawText('Título', { x: 120, y: cursorY, size: 9, font: fontBold });
    page.drawText('Responsável', { x: 360, y: cursorY, size: 9, font: fontBold });
    page.drawText('Início', { x: 535, y: cursorY, size: 9, font: fontBold });
    page.drawText('Prazo', { x: 610, y: cursorY, size: 9, font: fontBold });
    page.drawText('Status', { x: 685, y: cursorY, size: 9, font: fontBold });
    cursorY -= 14;

    rows.slice(0, 20).forEach((row) => {
      page.drawText(row.protocolId, { x: 42, y: cursorY, size: 8, font });
      page.drawText(row.title.slice(0, 42), { x: 120, y: cursorY, size: 8, font });
      page.drawText((row.primaryAssigneeUserId ? userMap.get(row.primaryAssigneeUserId) || row.primaryAssigneeUserId : '-').slice(0, 24), {
        x: 360,
        y: cursorY,
        size: 8,
        font,
      });
      page.drawText(row.startDate || '-', { x: 535, y: cursorY, size: 8, font });
      page.drawText(row.dueDate || '-', { x: 610, y: cursorY, size: 8, font });
      page.drawText(row.status.slice(0, 16), { x: 685, y: cursorY, size: 8, font });
      cursorY -= 16;
    });

    page.drawText('Resumo do cronograma', { x: 42, y: 135, size: 11, font: fontBold, color: rgb(0.09, 0.25, 0.49) });
    page.drawText(
      `Total de tarefas: ${project.tasks.length} | Agendadas: ${project.tasks.filter((task) => task.startDate && task.dueDate).length} | Dependências: ${project.dependencies.length}`,
      { x: 42, y: 118, size: 9, font }
    );
    page.drawText('Este PDF resume o cronograma em formato executivo. Para análise detalhada, use também a exportação XLSX.', {
      x: 42,
      y: 102,
      size: 8,
      font,
      color: rgb(0.34, 0.42, 0.56),
    });

    const output = await pdf.save();
    return new NextResponse(Buffer.from(output), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="projeto-${project.name.toLowerCase().replace(/\s+/g, '-')}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('Erro ao exportar projeto de tarefas da intranet em PDF:', error);
    return NextResponse.json({ error: error?.message || 'Erro ao exportar projeto em PDF.' }, { status: Number(error?.status) || 500 });
  }
}
