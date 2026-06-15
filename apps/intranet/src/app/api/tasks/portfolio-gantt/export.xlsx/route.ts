import { NextResponse } from 'next/server';
import type { DbInterface } from '@consultare/core/db';
import { getTaskPortfolioGantt } from '@consultare/core/tasks/repository';
import { buildPortfolioTaskExportRows } from '@consultare/core/tasks/export';
import { requireIntranetTasksPermission } from '@/lib/intranet/tasks-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const buildInClause = (size: number) => Array.from({ length: size }, () => '?').join(', ');
const slugify = (value: string) =>
  String(value || 'portfolio')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const resolveUserNames = async (db: DbInterface, userIds: string[]) => {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (!uniqueIds.length) return new Map<string, string>();
  const rows = await db.query(`SELECT id, name FROM users WHERE id IN (${buildInClause(uniqueIds.length)})`, uniqueIds);
  return new Map(rows.map((row) => [String((row as any).id), String((row as any).name || (row as any).id)]));
};

export async function GET() {
  try {
    const auth = await requireIntranetTasksPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const portfolio = await getTaskPortfolioGantt(auth.db, auth.viewer);
    const rows = buildPortfolioTaskExportRows(portfolio);
    const userMap = await resolveUserNames(
      auth.db,
      rows.flatMap((row) => [row.primaryAssigneeUserId || '', row.approverUserId || '', ...row.assigneeUserIds])
    );

    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Hub Consultare';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Portfolio consolidado');
    worksheet.columns = [
      { header: 'Projeto', key: 'project', width: 28 },
      { header: 'Protocolo', key: 'protocolId', width: 16 },
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
    worksheet.getCell('A1').value = 'Portfólio consolidado de tarefas';
    worksheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

    worksheet.mergeCells('A2:N2');
    worksheet.getCell('A2').value = 'Exportação consolidada dos projetos visíveis ao usuário e das tarefas avulsas agendadas.';
    worksheet.getCell('A2').font = { size: 10 };

    worksheet.mergeCells('A3:N3');
    worksheet.getCell('A3').value = `Gerado em ${new Date().toLocaleString('pt-BR')}`;
    worksheet.getCell('A3').font = { size: 10, italic: true };

    const headerRow = worksheet.getRow(5);
    headerRow.values = worksheet.columns.map((column) => column.header as string);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };
    worksheet.views = [{ state: 'frozen', ySplit: 5 }];

    const rowByProtocol = new Map(rows.map((row) => [row.protocolId, row]));
    let rowIndex = 6;
    for (const section of portfolio.sections) {
      const sectionRows = section.tasks
        .filter((task) => task.startDate && task.dueDate)
        .map((task) => rowByProtocol.get(task.protocolId))
        .filter(Boolean);
      if (!sectionRows.length) continue;

      worksheet.mergeCells(`A${rowIndex}:N${rowIndex}`);
      worksheet.getCell(`A${rowIndex}`).value = section.project?.name || 'Tarefas avulsas';
      worksheet.getCell(`A${rowIndex}`).font = { bold: true, color: { argb: 'FF17407E' } };
      worksheet.getCell(`A${rowIndex}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
      rowIndex += 1;

      for (const row of sectionRows) {
        worksheet.getRow(rowIndex).values = [
          row!.project,
          row!.protocolId,
          row!.title,
          row!.status,
          row!.priority,
          row!.department,
          row!.primaryAssigneeUserId ? userMap.get(row!.primaryAssigneeUserId) || row!.primaryAssigneeUserId : '-',
          row!.assigneeUserIds.length ? row!.assigneeUserIds.map((userId: string) => userMap.get(userId) || userId).join(', ') : '-',
          row!.approverUserId ? userMap.get(row!.approverUserId) || row!.approverUserId : '-',
          row!.startDate || '-',
          row!.dueDate || '-',
          row!.durationDays ?? '-',
          `${row!.checklistProgressPercent}%`,
          row!.predecessors || '-',
        ];
        rowIndex += 1;
      }

      rowIndex += 1;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const output = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
    const filename = `portfolio-consolidado-intranet-${slugify(new Date().toISOString().slice(0, 10))}.xlsx`;

    return new NextResponse(output, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('Erro ao exportar portfólio gantt da intranet em XLSX:', error);
    return NextResponse.json({ error: error?.message || 'Erro ao exportar portfólio em XLSX.' }, { status: Number(error?.status) || 500 });
  }
}
