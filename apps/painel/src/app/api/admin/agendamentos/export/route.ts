import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  buildAppointmentConfirmationHybridCte,
  getAppointmentConfirmationContext,
} from '@/lib/appointments_confirmation_repository';
import { getDbConnection } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UNIT_OPTIONS: Record<string, string> = {
  all: 'Todas as unidades',
  '2': 'Ouro Verde',
  '3': 'Centro Cambui',
  '12': 'Shopping Campinas',
};

const AGGREGATE_LABELS: Record<string, string> = {
  day: 'Dia',
  month: 'Mês',
  year: 'Ano',
};

const formatDateTime = (value: Date) =>
  value.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
  });

const formatPercent = (value: number) => `${Number(value || 0).toFixed(2).replace('.', ',')}%`;

const buildXlsx = async (args: {
  startDate: string;
  endDate: string;
  aggregateBy: 'day' | 'month' | 'year';
  unit: string;
  generatedAt: string;
  totals: { totalPeriod: number; confirmedRate: number };
  rows: Array<{ period: string; total: number; confirmados: number; nao_compareceu: number; taxa_confirmacao: number }>;
}) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hub Consultare';
  wb.created = new Date();

  const summary = wb.addWorksheet('Resumo');
  summary.columns = [
    { header: 'Indicador', key: 'label', width: 34 },
    { header: 'Valor', key: 'value', width: 22 },
  ];

  summary.mergeCells('A1:B1');
  summary.getCell('A1').value = 'Relatório de Agendamentos';
  summary.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  summary.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF053F74' } };

  summary.mergeCells('A2:B2');
  summary.getCell('A2').value = `Período: ${args.startDate} até ${args.endDate} | Unidade: ${UNIT_OPTIONS[args.unit] || UNIT_OPTIONS.all}`;
  summary.mergeCells('A3:B3');
  summary.getCell('A3').value = `Agrupamento: ${AGGREGATE_LABELS[args.aggregateBy] || 'Dia'} | Gerado em: ${args.generatedAt}`;

  summary.getRow(5).values = ['Indicador', 'Valor'];
  summary.getRow(5).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summary.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

  [
    ['Agendamentos no período', args.totals.totalPeriod],
    ['Taxa de confirmação real', formatPercent(args.totals.confirmedRate * 100)],
  ].forEach((row) => summary.addRow(row));

  const details = wb.addWorksheet('Dados');
  details.columns = [
    { header: 'Período', key: 'period', width: 18 },
    { header: 'Total', key: 'total', width: 14 },
    { header: 'Confirmados', key: 'confirmados', width: 16 },
    { header: 'Não compareceu', key: 'naoCompareceu', width: 18 },
    { header: 'Taxa de confirmação', key: 'taxaConfirmacao', width: 18 },
  ];

  details.getRow(1).values = details.columns.map((column) => column.header as string);
  details.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  details.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

  for (const row of args.rows) {
    details.addRow({
      period: row.period,
      total: row.total,
      confirmados: row.confirmados,
      naoCompareceu: row.nao_compareceu,
      taxaConfirmacao: row.taxa_confirmacao / 100,
    });
  }
  details.getColumn('taxaConfirmacao').numFmt = '0.00%';

  const out = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
};

const buildPdf = async (args: {
  startDate: string;
  endDate: string;
  aggregateBy: 'day' | 'month' | 'year';
  unit: string;
  generatedAt: string;
  rows: Array<{ period: string; total: number; confirmados: number; nao_compareceu: number; taxa_confirmacao: number }>;
}) => {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [842, 595];
  const margin = 28;
  const rowHeight = 18;
  const cols = [
    { label: 'Período', w: 120 },
    { label: 'Total', w: 90 },
    { label: 'Confirmados', w: 110 },
    { label: 'Não compareceu', w: 120 },
    { label: 'Taxa confirmação', w: 120 },
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
      target.drawText('Relatório de Agendamentos', {
        x: margin + 10,
        y: height - 48,
        size: 14,
        font: bold,
        color: rgb(1, 1, 1),
      });
      target.drawText(`Período: ${args.startDate} até ${args.endDate} | Unidade: ${UNIT_OPTIONS[args.unit] || UNIT_OPTIONS.all}`, {
        x: margin,
        y: height - 78,
        size: 9,
        font: regular,
        color: rgb(0.2, 0.2, 0.2),
      });
      target.drawText(`Agrupamento: ${AGGREGATE_LABELS[args.aggregateBy] || 'Dia'} | Gerado em: ${args.generatedAt}`, {
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
      row.period,
      String(row.total),
      String(row.confirmados),
      String(row.nao_compareceu),
      formatPercent(row.taxa_confirmacao),
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
      page.drawText(String(values[i]).slice(0, 24), {
        x: x + 4,
        y: y + 5,
        size: 8,
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
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || new Date().toISOString().split('T')[0];
    const endDate = searchParams.get('endDate') || startDate;
    const aggregateBy = ((searchParams.get('aggregateBy') || 'day').toLowerCase() as 'day' | 'month' | 'year');
    const unit = searchParams.get('unit') || 'all';
    const scheduledBy = searchParams.get('scheduled_by') || '';
    const specialty = searchParams.get('specialty') || '';
    const professional = searchParams.get('professional') || '';
    const status = searchParams.get('status') || '';
    const format = String(searchParams.get('format') || 'xlsx').toLowerCase();

    const dbStart = `${startDate} 00:00:00`;
    const dbEnd = `${endDate} 23:59:59`;
    const db = getDbConnection();
    const confirmationContext = await getAppointmentConfirmationContext(db);
    const hybridCte = buildAppointmentConfirmationHybridCte(confirmationContext);

    let dateExpr = 'SUBSTR(f.scheduled_at,1,10)';
    if (aggregateBy === 'month') dateExpr = 'SUBSTR(f.scheduled_at,1,7)';
    if (aggregateBy === 'year') dateExpr = 'SUBSTR(f.scheduled_at,1,4)';

    let whereSql = 'WHERE f.scheduled_at BETWEEN ? AND ?';
    const params: Array<string | number> = [dbStart, dbEnd];

    if (unit && unit !== 'all') {
      const patternsById: Record<string, string[]> = {
        '2': ['OURO VERDE'],
        '3': ['CENTRO CAMBUI', 'CENTRO CAMBUÍ'],
        '12': ['CAMPINAS SHOPPING', 'SHOPPING CAMPINAS'],
      };
      const patterns = patternsById[String(unit)] || [String(unit).toUpperCase()];
      whereSql += ` AND (${patterns.map(() => 'UPPER(TRIM(f.unit_name)) LIKE ?').join(' OR ')})`;
      params.push(...patterns.map((pattern) => `%${pattern}%`));
    }
    if (scheduledBy && scheduledBy !== 'all') {
      whereSql += ' AND UPPER(TRIM(f.scheduled_by)) = UPPER(TRIM(?))';
      params.push(scheduledBy);
    }
    if (specialty && specialty !== 'all') {
      whereSql += ' AND UPPER(TRIM(f.specialty)) = UPPER(TRIM(?))';
      params.push(specialty);
    }
    if (professional && professional !== 'all') {
      whereSql += ' AND UPPER(TRIM(f.professional_name)) = UPPER(TRIM(?))';
      params.push(professional);
    }
    if (status && status !== 'all') {
      whereSql += ' AND f.effective_status_id = ?';
      params.push(Number(status));
    }

    const rows = await db.query(
      `
      ${hybridCte.sql}
      SELECT
        ${dateExpr} as period,
        COUNT(DISTINCT f.appointment_id) as total,
        SUM(COALESCE(f.effective_confirmed_d1, 0)) as confirmados,
        SUM(CASE WHEN f.effective_status_id = 6 THEN 1 ELSE 0 END) as nao_compareceu
      FROM appointment_confirmation_base f
      ${whereSql}
      GROUP BY period
      ORDER BY period ASC
      `,
      [...hybridCte.params, ...params],
    );

    const normalizedRows = (rows || []).map((row: any) => {
      const total = Number(row?.total || 0);
      const confirmados = Number(row?.confirmados || 0);
      return {
        period: String(row?.period || ''),
        total,
        confirmados,
        nao_compareceu: Number(row?.nao_compareceu || 0),
        taxa_confirmacao: total > 0 ? (confirmados * 100) / total : 0,
      };
    });

    const totalPeriod = normalizedRows.reduce((acc, row) => acc + row.total, 0);
    const totalConfirmed = normalizedRows.reduce((acc, row) => acc + row.confirmados, 0);
    const generatedAt = formatDateTime(new Date());

    if (format === 'pdf') {
      const buffer = await buildPdf({
        startDate,
        endDate,
        aggregateBy,
        unit,
        generatedAt,
        rows: normalizedRows,
      });
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="agendamentos-${startDate}_${endDate}.pdf"`,
        },
      });
    }

    const buffer = await buildXlsx({
      startDate,
      endDate,
      aggregateBy,
      unit,
      generatedAt,
      totals: {
        totalPeriod,
        confirmedRate: totalPeriod > 0 ? totalConfirmed / totalPeriod : 0,
      },
      rows: normalizedRows,
    });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="agendamentos-${startDate}_${endDate}.xlsx"`,
      },
    });
  } catch (error: any) {
    console.error('Erro API agendamentos export:', error);
    return NextResponse.json({ error: error.message || 'Erro interno.' }, { status: error?.status || 500 });
  }
}
