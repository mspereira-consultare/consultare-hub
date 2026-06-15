import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import type { DbInterface } from '@consultare/core/db';
import { getTaskProjectById } from '@consultare/core/tasks/repository';
import { buildProjectTaskExportRows } from '@consultare/core/tasks/export';
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
    const rows = buildProjectTaskExportRows(project);
    const userMap = await resolveUserNames(
      auth.db,
      rows.flatMap((row) => [row.primaryAssigneeUserId || '', row.approverUserId || '', ...row.assigneeUserIds])
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Hub Consultare';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Projeto');
    worksheet.columns = [
      { header: 'Protocolo', key: 'protocolId', width: 16 },
      { header: 'Projeto', key: 'project', width: 28 },
      { header: 'Título', key: 'title', width: 34 },
      { header: 'Status', key: 'status', width: 18 },
      { header: 'Prioridade', key: 'priority', width: 14 },
      { header: 'Setor', key: 'department', width: 18 },
      { header: 'Responsável principal', key: 'primaryAssignee', width: 24 },
      { header: 'Responsáveis adicionais', key: 'assignees', width: 30 },
      { header: 'Aprovador', key: 'approver', width: 24 },
      { header: 'Início', key: 'startDate', width: 14 },
      { header: 'Prazo', key: 'dueDate', width: 14 },
      { header: 'Duração (dias)', key: 'durationDays', width: 16 },
      { header: 'Progresso checklist', key: 'checklistProgressPercent', width: 18 },
      { header: 'Predecessoras', key: 'predecessors', width: 26 },
    ];

    worksheet.mergeCells('A1:N1');
    worksheet.getCell('A1').value = `Projeto: ${project.name}`;
    worksheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

    worksheet.mergeCells('A2:N2');
    worksheet.getCell('A2').value = project.description || 'Cronograma exportado da governança de tarefas.';
    worksheet.getCell('A2').font = { size: 10 };

    const headerRow = worksheet.getRow(4);
    headerRow.values = worksheet.columns.map((column) => column.header as string);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

    let rowIndex = 5;
    for (const row of rows) {
      worksheet.getRow(rowIndex).values = [
        row.protocolId,
        row.project,
        row.title,
        row.status,
        row.priority,
        row.department,
        row.primaryAssigneeUserId ? userMap.get(row.primaryAssigneeUserId) || row.primaryAssigneeUserId : '-',
        row.assigneeUserIds.length ? row.assigneeUserIds.map((userId: string) => userMap.get(userId) || userId).join(', ') : '-',
        row.approverUserId ? userMap.get(row.approverUserId) || row.approverUserId : '-',
        row.startDate || '-',
        row.dueDate || '-',
        row.durationDays ?? '-',
        `${row.checklistProgressPercent}%`,
        row.predecessors || '-',
      ];
      rowIndex += 1;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const output = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);

    return new NextResponse(output, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="governanca-projeto-${project.name.toLowerCase().replace(/\s+/g, '-')}.xlsx"`,
      },
    });
  } catch (error: any) {
    console.error('Erro ao exportar projeto de tarefas do painel em XLSX:', error);
    return NextResponse.json({ error: error?.message || 'Erro ao exportar projeto em XLSX.' }, { status: Number(error?.status) || 500 });
  }
}
