import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { requireBlockedAgendasPermission } from '@/lib/agendas_bloqueadas/auth';
import { getBlockedAgendasDefaultRange } from '@/lib/agendas_bloqueadas/date_range';
import type { BlockedAgendaRecurrenceFilter, BlockedAgendaSituationFilter } from '@/lib/agendas_bloqueadas/types';
import { formatBlockedAgendaWeekDaysShort } from '@/lib/agendas_bloqueadas/types';
import {
  BlockedAgendasValidationError,
  listBlockedAgendaRows,
  normalizeBlockedAgendaFilters,
} from '@/lib/agendas_bloqueadas/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const unitLabel = (unitId: 'all' | '2' | '3' | '12') => {
  if (unitId === '2') return 'Ouro Verde';
  if (unitId === '3') return 'Centro Cambui';
  if (unitId === '12') return 'Shopping Campinas';
  return 'Todas as unidades';
};

const normalizeUnitParam = (value: string | null): 'all' | '2' | '3' | '12' => {
  if (value === '2' || value === '3' || value === '12') return value;
  return 'all';
};

const formatDateTime = (value: Date) =>
  value.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
  });

const buildXlsx = async (args: {
  startDate: string;
  endDate: string;
  unit: 'all' | '2' | '3' | '12';
  generatedAt: string;
  totals: {
    totalBlocks: number;
    activeBlocks: number;
    professionalsWithActiveBlocks: number;
    recurringBlocks: number;
  };
  rows: Awaited<ReturnType<typeof listBlockedAgendaRows>>['rows'];
}) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hub Consultare';
  wb.created = new Date();

  const summary = wb.addWorksheet('Resumo');
  summary.columns = [
    { header: 'Indicador', key: 'label', width: 34 },
    { header: 'Valor', key: 'value', width: 16 },
  ];

  summary.mergeCells('A1:B1');
  summary.getCell('A1').value = 'Relatório de Agendas Bloqueadas';
  summary.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  summary.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF053F74' } };

  summary.mergeCells('A2:B2');
  summary.getCell('A2').value = `Período: ${args.startDate} até ${args.endDate} | Unidade: ${unitLabel(args.unit)}`;
  summary.mergeCells('A3:B3');
  summary.getCell('A3').value = `Gerado em: ${args.generatedAt}`;

  summary.getRow(5).values = ['Indicador', 'Valor'];
  summary.getRow(5).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summary.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

  const summaryRows = [
    ['Bloqueios no recorte', args.totals.totalBlocks],
    ['Bloqueios ativos', args.totals.activeBlocks],
    ['Médicos com bloqueio ativo', args.totals.professionalsWithActiveBlocks],
    ['Bloqueios recorrentes', args.totals.recurringBlocks],
  ];

  summaryRows.forEach((item) => summary.addRow(item));

  const details = wb.addWorksheet('Detalhes');
  details.columns = [
    { header: 'Médico', key: 'professionalName', width: 32 },
    { header: 'ID Feegow', key: 'professionalId', width: 12 },
    { header: 'Origem do nome', key: 'source', width: 18 },
    { header: 'Unidade(s)', key: 'units', width: 34 },
    { header: 'Data inicial', key: 'dateStart', width: 14 },
    { header: 'Data final', key: 'dateEnd', width: 14 },
    { header: 'Hora inicial', key: 'timeStart', width: 12 },
    { header: 'Hora final', key: 'timeEnd', width: 12 },
    { header: 'Dias da semana', key: 'weekDays', width: 22 },
    { header: 'Recorrente', key: 'recurring', width: 12 },
    { header: 'Ativo no recorte', key: 'active', width: 14 },
    { header: 'Motivo', key: 'description', width: 48 },
    { header: 'Status operacional', key: 'status', width: 38 },
  ];

  details.getRow(1).values = details.columns.map((column) => column.header as string);
  details.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  details.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

  for (const row of args.rows) {
    details.addRow({
      professionalName: row.professionalName,
      professionalId: row.professionalId,
      source: row.professionalSourceStatus,
      units: row.unitNamesText,
      dateStart: row.dateStart,
      dateEnd: row.dateEnd,
      timeStart: row.timeStart,
      timeEnd: row.timeEnd,
      weekDays: row.isRecurring ? formatBlockedAgendaWeekDaysShort(row.weekDays) || 'Recorrente' : 'Pontual',
      recurring: row.isRecurring ? 'Sim' : 'Não',
      active: row.isActiveInRange ? 'Sim' : 'Não',
      description: row.description || 'Sem descrição',
      status: row.statusLabels.join(' | '),
    });
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
};

const buildPdf = async (args: {
  startDate: string;
  endDate: string;
  unit: 'all' | '2' | '3' | '12';
  generatedAt: string;
  rows: Awaited<ReturnType<typeof listBlockedAgendaRows>>['rows'];
}) => {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize: [number, number] = [842, 595];
  const margin = 24;
  const rowHeight = 18;
  const cols = [
    { label: 'Médico', w: 145 },
    { label: 'Unidade(s)', w: 120 },
    { label: 'Período', w: 115 },
    { label: 'Horário', w: 80 },
    { label: 'Recorrência', w: 110 },
    { label: 'Motivo', w: 150 },
    { label: 'Status', w: 74 },
  ];

  let page = pdfDoc.addPage(pageSize);
  const drawMainHeader = (target: typeof page, first: boolean) => {
    const { width, height } = target.getSize();
    if (first) {
      target.drawRectangle({
        x: margin,
        y: height - 62,
        width: width - margin * 2,
        height: 36,
        color: rgb(0.02, 0.24, 0.45),
      });
      target.drawText('Relatório de Agendas Bloqueadas', {
        x: margin + 10,
        y: height - 48,
        size: 14,
        font: bold,
        color: rgb(1, 1, 1),
      });
      target.drawText(`Período: ${args.startDate} até ${args.endDate} | Unidade: ${unitLabel(args.unit)}`, {
        x: margin,
        y: height - 78,
        size: 9,
        font: regular,
        color: rgb(0.2, 0.2, 0.2),
      });
      target.drawText(`Gerado em: ${args.generatedAt}`, {
        x: margin,
        y: height - 92,
        size: 9,
        font: regular,
        color: rgb(0.2, 0.2, 0.2),
      });
      return height - 124;
    }
    return height - 42;
  };

  const drawColumnsHeader = (target: typeof page, y: number) => {
    let x = margin;
    for (const col of cols) {
      target.drawRectangle({ x, y, width: col.w, height: rowHeight, color: rgb(0.09, 0.25, 0.49) });
      target.drawText(col.label, { x: x + 4, y: y + 5, size: 8, font: bold, color: rgb(1, 1, 1) });
      x += col.w;
    }
  };

  let y = drawMainHeader(page, true);
  drawColumnsHeader(page, y);
  y -= rowHeight;

  for (const row of args.rows) {
    if (y < 36) {
      page = pdfDoc.addPage(pageSize);
      y = drawMainHeader(page, false);
      drawColumnsHeader(page, y);
      y -= rowHeight;
    }

    const values = [
      row.professionalName,
      row.unitNamesText,
      row.dateStart === row.dateEnd ? row.dateStart : `${row.dateStart} a ${row.dateEnd}`,
      `${row.timeStart} - ${row.timeEnd}`,
      row.isRecurring ? formatBlockedAgendaWeekDaysShort(row.weekDays) || 'Recorrente' : 'Pontual',
      row.description || 'Sem descricao',
      row.statusLabels.join(', '),
    ];

    let x = margin;
    for (let i = 0; i < cols.length; i += 1) {
      page.drawRectangle({
        x,
        y,
        width: cols[i].w,
        height: rowHeight,
        borderColor: rgb(0.85, 0.88, 0.92),
        borderWidth: 0.5,
      });
      page.drawText(String(values[i]).slice(0, i === 5 ? 34 : 22), {
        x: x + 4,
        y: y + 5,
        size: 7.5,
        font: regular,
        color: rgb(0.1, 0.1, 0.1),
      });
      x += cols[i].w;
    }
    y -= rowHeight;
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
};

export async function GET(request: Request) {
  try {
    const auth = await requireBlockedAgendasPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const defaults = getBlockedAgendasDefaultRange();
    const format = String(searchParams.get('format') || 'xlsx').toLowerCase();
    const unit = normalizeUnitParam(searchParams.get('unit'));
    const filters = normalizeBlockedAgendaFilters({
      startDate: searchParams.get('startDate') || defaults.startDate,
      endDate: searchParams.get('endDate') || defaults.endDate,
      unitId: unit,
      professionalId: searchParams.get('professionalId') || '',
      recurrence: (searchParams.get('recurrence') || 'all') as BlockedAgendaRecurrenceFilter,
      situation: (searchParams.get('situation') || 'active') as BlockedAgendaSituationFilter,
      search: searchParams.get('search') || '',
    });

    const data = await listBlockedAgendaRows(auth.db, filters);
    const generatedAt = formatDateTime(new Date());

    if (format === 'pdf') {
      const buffer = await buildPdf({
        startDate: filters.startDate,
        endDate: filters.endDate,
        unit: filters.unitId,
        generatedAt,
        rows: data.rows,
      });

      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="agendas-bloqueadas-${filters.startDate}_${filters.endDate}.pdf"`,
        },
      });
    }

    const buffer = await buildXlsx({
      startDate: filters.startDate,
      endDate: filters.endDate,
      unit: filters.unitId,
      generatedAt,
      totals: data.totals,
      rows: data.rows,
    });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="agendas-bloqueadas-${filters.startDate}_${filters.endDate}.xlsx"`,
      },
    });
  } catch (error: unknown) {
    const status = error instanceof BlockedAgendasValidationError ? error.status : 500;
    console.error('Erro API agendas-bloqueadas export:', error);
    const message = error instanceof Error ? error.message : 'Erro interno.';
    return NextResponse.json({ error: message }, { status });
  }
}
