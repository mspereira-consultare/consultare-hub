import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { requireAgendaOcupacaoPermission } from '@/lib/agenda_ocupacao/auth';
import {
  AgendaOcupacaoValidationError,
  listAgendaOcupacaoBySpecialty,
  listAgendaOcupacaoDailyRows,
  normalizeAgendaFilters,
} from '@/lib/agenda_ocupacao/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const formatNumber = (value: number) => Number(value || 0).toLocaleString('pt-BR');
const formatPercent = (value: number) => `${Number(value || 0).toFixed(2).replace('.', ',')}%`;

const getDefaultRange = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const byType = new Map(parts.map((p) => [p.type, p.value]));
  const year = String(byType.get('year') || '1970');
  const month = String(byType.get('month') || '01');
  const day = String(byType.get('day') || '01');
  return {
    startDate: `${year}-${month}-01`,
    endDate: `${year}-${month}-${day}`,
  };
};

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

const buildXlsx = async (args: {
  startDate: string;
  endDate: string;
  unit: 'all' | '2' | '3' | '12';
  generatedAt: string;
  rows: Awaited<ReturnType<typeof listAgendaOcupacaoBySpecialty>>['rows'];
  dailyRows: Awaited<ReturnType<typeof listAgendaOcupacaoDailyRows>>;
}) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hub Consultare';
  wb.created = new Date();

  const ws = wb.addWorksheet('Resumo');
  ws.columns = [
    { header: 'Especialidade', key: 'especialidade', width: 40 },
    { header: 'Agendamentos', key: 'ag', width: 16 },
    { header: 'Horários Disponíveis', key: 'disp', width: 20 },
    { header: 'Horários Bloqueados', key: 'bloq', width: 20 },
    { header: 'Base Ofertável', key: 'base', width: 18 },
    { header: 'Tx. Ocupação (%)', key: 'taxa_ocupacao', width: 18 },
    { header: 'Taxa de Bloqueio (%)', key: 'taxa_bloqueio', width: 20 },
  ];

  ws.mergeCells('A1:G1');
  ws.getCell('A1').value = 'Relatório de Ocupação da Agenda';
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF053F74' } };

  ws.mergeCells('A2:G2');
  ws.getCell('A2').value = `Período: ${args.startDate} até ${args.endDate} | Unidade: ${unitLabel(args.unit)}`;
  ws.getCell('A2').font = { size: 10 };

  ws.mergeCells('A3:G3');
  ws.getCell('A3').value = `Gerado em: ${args.generatedAt}`;
  ws.getCell('A3').font = { size: 10 };

  const headerRow = ws.getRow(5);
  headerRow.values = ws.columns.map((c) => c.header as string);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

  let rowIdx = 6;
  for (const row of args.rows) {
    const excelRow = ws.getRow(rowIdx);
    excelRow.values = [
      row.especialidadeNome,
      row.agendamentosCount,
      row.horariosDisponiveisCount,
      row.horariosBloqueadosCount,
      row.capacidadeLiquidaCount,
      row.taxaOcupacaoComercialPct / 100,
      row.taxaBloqueioPct / 100,
    ];
    excelRow.getCell(6).numFmt = '0.00%';
    excelRow.getCell(7).numFmt = '0.00%';
    rowIdx += 1;
  }

  const wsDaily = wb.addWorksheet('Diario');
  wsDaily.columns = [
    { header: 'Data', key: 'data', width: 12 },
    { header: 'Unidade', key: 'unidade', width: 24 },
    { header: 'Especialidade', key: 'especialidade', width: 34 },
    { header: 'Agendamentos', key: 'ag', width: 14 },
    { header: 'Disponíveis', key: 'disp', width: 14 },
    { header: 'Bloqueados', key: 'bloq', width: 14 },
    { header: 'Base Ofertável', key: 'base', width: 14 },
    { header: 'Tx. Ocupação (%)', key: 'taxaOcupacao', width: 14 },
    { header: 'Taxa de Bloqueio (%)', key: 'taxaBloqueio', width: 16 },
  ];

  wsDaily.getRow(1).values = wsDaily.columns.map((c) => c.header as string);
  wsDaily.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  wsDaily.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

  for (const row of args.dailyRows) {
    wsDaily.addRow({
      data: row.dataRef,
      unidade: row.unidadeNome,
      especialidade: row.especialidadeNome,
      ag: row.agendamentosCount,
      disp: row.horariosDisponiveisCount,
      bloq: row.horariosBloqueadosCount,
      base: row.capacidadeLiquidaCount,
      taxaOcupacao: row.taxaOcupacaoComercialPct / 100,
      taxaBloqueio: row.taxaBloqueioPct / 100,
    });
  }

  wsDaily.getColumn('taxaOcupacao').numFmt = '0.00%';
  wsDaily.getColumn('taxaBloqueio').numFmt = '0.00%';

  const out = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
};

const buildPdf = async (args: {
  startDate: string;
  endDate: string;
  unit: 'all' | '2' | '3' | '12';
  generatedAt: string;
  rows: Awaited<ReturnType<typeof listAgendaOcupacaoBySpecialty>>['rows'];
}) => {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize: [number, number] = [842, 595]; // A4 landscape
  const margin = 28;
  const rowHeight = 18;

  const cols = [
    { key: 'especialidade', label: 'Especialidade', w: 255 },
    { key: 'ag', label: 'Agend.', w: 75 },
    { key: 'disp', label: 'Disponíveis', w: 90 },
    { key: 'bloq', label: 'Bloqueados', w: 85 },
    { key: 'base', label: 'Base Ofertável', w: 95 },
    { key: 'taxa_ocup', label: 'Tx. Ocupação (%)', w: 85 },
    { key: 'taxa_bloq', label: 'Taxa Bloqueio (%)', w: 85 },
  ];

  let page = pdfDoc.addPage(pageSize);
  const drawMainHeader = (target: (typeof page), isFirst: boolean) => {
    const { width, height } = target.getSize();
    if (isFirst) {
      target.drawRectangle({
        x: margin,
        y: height - 62,
        width: width - margin * 2,
        height: 36,
        color: rgb(0.02, 0.24, 0.45),
      });
      target.drawText('Relatório de Ocupação da Agenda', {
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

  const drawColumnsHeader = (target: (typeof page), y: number) => {
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

    const data = [
      row.especialidadeNome,
      formatNumber(row.agendamentosCount),
      formatNumber(row.horariosDisponiveisCount),
      formatNumber(row.horariosBloqueadosCount),
      formatNumber(row.capacidadeLiquidaCount),
      formatPercent(row.taxaOcupacaoComercialPct),
      formatPercent(row.taxaBloqueioPct),
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
      page.drawText(String(data[i]), { x: x + 4, y: y + 5, size: 8, font: regular, color: rgb(0.1, 0.1, 0.1) });
      x += cols[i].w;
    }
    y -= rowHeight;
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
};

export async function GET(request: Request) {
  try {
    const auth = await requireAgendaOcupacaoPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const defaults = getDefaultRange();
    const format = String(searchParams.get('format') || 'xlsx').toLowerCase();

    const filters = normalizeAgendaFilters({
      startDate: searchParams.get('startDate') || defaults.startDate,
      endDate: searchParams.get('endDate') || defaults.endDate,
      unitId: normalizeUnitParam(searchParams.get('unit')),
    });

    const [summary, dailyRows] = await Promise.all([
      listAgendaOcupacaoBySpecialty(auth.db, filters),
      listAgendaOcupacaoDailyRows(auth.db, filters),
    ]);

    const generatedAt = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    if (format === 'pdf') {
      const pdf = await buildPdf({
        startDate: filters.startDate,
        endDate: filters.endDate,
        unit: filters.unitId,
        generatedAt,
        rows: summary.rows,
      });
      return new NextResponse(pdf, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="agenda-ocupacao-${filters.startDate}_${filters.endDate}.pdf"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const xlsx = await buildXlsx({
      startDate: filters.startDate,
      endDate: filters.endDate,
      unit: filters.unitId,
      generatedAt,
      rows: summary.rows,
      dailyRows,
    });
    return new NextResponse(xlsx, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="agenda-ocupacao-${filters.startDate}_${filters.endDate}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    const status = error instanceof AgendaOcupacaoValidationError ? error.status : 500;
    console.error('Erro API agenda-ocupacao export:', error);
    const message = error instanceof Error ? error.message : 'Erro interno.';
    return NextResponse.json({ error: message }, { status });
  }
}
