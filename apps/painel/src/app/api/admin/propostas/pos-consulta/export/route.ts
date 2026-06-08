import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { requirePropostasPosConsultaPermission } from '@/lib/proposals/auth';
import { listPostConsultExportRows, normalizePostConsultFilters } from '@/lib/post_consulta/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

const formatDateOnly = (value?: string | null) => {
  if (!value) return '-';
  const [year, month, day] = String(value).split('-');
  if (!year || !month || !day) return String(value);
  return `${day}/${month}/${year}`;
};

const formatCurrency = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const buildXlsx = async (args: {
  generatedAt: string;
  filters: ReturnType<typeof normalizePostConsultFilters>;
  rows: Awaited<ReturnType<typeof listPostConsultExportRows>>;
}) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Hub Consultare';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Pós-consulta');
  worksheet.columns = [
    { header: 'Data da consulta', key: 'consultDate', width: 16 },
    { header: 'Paciente', key: 'patientName', width: 34 },
    { header: 'Prontuário', key: 'patientId', width: 14 },
    { header: 'Telefone', key: 'patientPhone', width: 18 },
    { header: 'E-mail', key: 'patientEmail', width: 28 },
    { header: 'Unidade da consulta', key: 'consultUnit', width: 24 },
    { header: 'Atendente responsável', key: 'attendantResponsible', width: 28 },
    { header: 'Consulta', key: 'consultProcedure', width: 30 },
    { header: 'Qtd. propostas', key: 'proposalCount', width: 14 },
    { header: 'IDs das propostas', key: 'proposalIds', width: 24 },
    { header: 'Status resumo', key: 'proposalStatusSummary', width: 24 },
    { header: 'Detalhe das propostas', key: 'proposalDetail', width: 72 },
    { header: 'Fechou?', key: 'closed', width: 12 },
    { header: '1º contato fechou?', key: 'firstContactClosed', width: 18 },
    { header: 'Data/hora do contato', key: 'firstContactAt', width: 22 },
    { header: '2º contato fechou?', key: 'secondContactClosed', width: 18 },
    { header: 'Data/hora da ligação', key: 'secondContactAt', width: 22 },
    { header: 'Observações', key: 'observation', width: 36 },
    { header: 'Última edição por', key: 'updatedByUserName', width: 22 },
    { header: 'Última edição em', key: 'updatedAt', width: 22 },
  ];

  worksheet.mergeCells('A1:T1');
  worksheet.getCell('A1').value = 'Propostas - base operacional de pós-consulta';
  worksheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

  worksheet.mergeCells('A2:T2');
  worksheet.getCell('A2').value =
    `Período: ${args.filters.startDate} até ${args.filters.endDate} | Unidade: ${args.filters.unit === 'all' ? 'Todas as unidades' : args.filters.unit} | Status: ${args.filters.status === 'all' ? 'Todos' : args.filters.status} | Atendente: ${args.filters.responsible === 'all' ? 'Todos' : args.filters.responsible} | Fechou: ${args.filters.closed === 'all' ? 'Todos' : args.filters.closed}`;
  worksheet.getCell('A2').font = { size: 10 };

  worksheet.mergeCells('A3:T3');
  worksheet.getCell('A3').value = `Gerado em: ${args.generatedAt}`;
  worksheet.getCell('A3').font = { size: 10 };

  const headerRow = worksheet.getRow(5);
  headerRow.values = worksheet.columns.map((column) => column.header as string);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

  let rowIndex = 6;
  for (const row of args.rows) {
    const proposalDetail = row.proposals
      .map(
        (proposal) =>
          `#${proposal.proposalId} | ${proposal.status} | ${proposal.unitName} | ${proposal.professionalName} | ${formatCurrency(proposal.totalValue)}`,
      )
      .join(' || ');

    const excelRow = worksheet.getRow(rowIndex);
    excelRow.values = [
      formatDateOnly(row.consultDate),
      row.patientName,
      row.patientId || '-',
      row.patientPhone,
      row.patientEmail || '-',
      row.consultUnit,
      row.attendantResponsible,
      row.consultProcedure,
      row.proposalCount,
      row.proposals.map((proposal) => `#${proposal.proposalId}`).join(', '),
      row.proposalStatusSummary,
      proposalDetail || '-',
      row.closed ? 'Sim' : 'Não',
      row.firstContactClosed === null ? 'Não definido' : row.firstContactClosed ? 'Sim' : 'Não',
      formatDateTime(row.firstContactAt),
      row.secondContactClosed === null ? 'Não definido' : row.secondContactClosed ? 'Sim' : 'Não',
      formatDateTime(row.secondContactAt),
      row.observation || '-',
      row.updatedByUserName || '-',
      formatDateTime(row.updatedAt),
    ];
    rowIndex += 1;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
};

const buildPdf = async (args: {
  generatedAt: string;
  filters: ReturnType<typeof normalizePostConsultFilters>;
  rows: Awaited<ReturnType<typeof listPostConsultExportRows>>;
}) => {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [842, 595];
  const margin = 24;
  const rowHeight = 18;

  const cols = [
    { label: 'Data', width: 50 },
    { label: 'Paciente', width: 145 },
    { label: 'Unidade', width: 80 },
    { label: 'Atendente', width: 95 },
    { label: 'Propostas', width: 110 },
    { label: 'Status', width: 78 },
    { label: 'Fechou', width: 45 },
    { label: '1º contato', width: 72 },
    { label: '2º contato', width: 72 },
  ];

  let page = pdfDoc.addPage(pageSize);
  const drawPageHeader = (target: typeof page, firstPage: boolean) => {
    const { width, height } = target.getSize();
    if (firstPage) {
      target.drawRectangle({
        x: margin,
        y: height - 62,
        width: width - margin * 2,
        height: 36,
        color: rgb(0.02, 0.24, 0.45),
      });
      target.drawText('Base operacional de pós-consulta', {
        x: margin + 10,
        y: height - 48,
        size: 14,
        font: bold,
        color: rgb(1, 1, 1),
      });
      target.drawText(`Período: ${args.filters.startDate} até ${args.filters.endDate}`, {
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
      target.drawRectangle({ x, y, width: col.width, height: rowHeight, color: rgb(0.09, 0.25, 0.49) });
      target.drawText(col.label, { x: x + 4, y: y + 5, size: 8, font: bold, color: rgb(1, 1, 1) });
      x += col.width;
    }
  };

  let y = drawPageHeader(page, true);
  drawColumnsHeader(page, y);
  y -= rowHeight;

  for (const row of args.rows) {
    if (y < 36) {
      page = pdfDoc.addPage(pageSize);
      y = drawPageHeader(page, false);
      drawColumnsHeader(page, y);
      y -= rowHeight;
    }

    const data = [
      formatDateOnly(row.consultDate),
      row.patientName.slice(0, 34),
      row.consultUnit.slice(0, 18),
      row.attendantResponsible.slice(0, 18),
      row.proposals.map((proposal) => `#${proposal.proposalId}`).join(', ').slice(0, 24),
      row.proposalStatusSummary.slice(0, 18),
      row.closed ? 'Sim' : 'Não',
      formatDateTime(row.firstContactAt).slice(0, 16),
      formatDateTime(row.secondContactAt).slice(0, 16),
    ];

    let x = margin;
    for (let index = 0; index < cols.length; index += 1) {
      page.drawRectangle({
        x,
        y,
        width: cols[index].width,
        height: rowHeight,
        borderColor: rgb(0.85, 0.88, 0.92),
        borderWidth: 0.5,
      });
      page.drawText(String(data[index]), { x: x + 4, y: y + 5, size: 7.5, font: regular, color: rgb(0.1, 0.1, 0.1) });
      x += cols[index].width;
    }
    y -= rowHeight;
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
};

const getErrorStatus = (error: unknown) =>
  typeof error === 'object' && error && 'status' in error ? Number((error as { status?: unknown }).status) || 500 : 500;

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export async function GET(request: Request) {
  try {
    const auth = await requirePropostasPosConsultaPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const format = String(searchParams.get('format') || 'xlsx').toLowerCase();
    const filters = normalizePostConsultFilters(searchParams);
    const rows = await listPostConsultExportRows(filters, auth.db);
    const generatedAt = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    if (format === 'pdf') {
      const pdf = await buildPdf({ generatedAt, filters, rows });
      return new NextResponse(pdf, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="pos-consulta-${filters.startDate}_${filters.endDate}.pdf"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const xlsx = await buildXlsx({ generatedAt, filters, rows });
    return new NextResponse(xlsx, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="pos-consulta-${filters.startDate}_${filters.endDate}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    console.error('Erro API Pós-consulta export:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Erro ao exportar base de pós-consulta.') },
      { status: getErrorStatus(error) },
    );
  }
}
