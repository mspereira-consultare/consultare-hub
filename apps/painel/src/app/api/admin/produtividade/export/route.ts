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

const formatDateTime = (value: Date) =>
  value.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
  });

const formatPercent = (value: number) => `${Number(value || 0).toFixed(2).replace('.', ',')}%`;

const buildXlsx = async (args: {
  startDate: string;
  endDate: string;
  selectedTeam: string;
  generatedAt: string;
  globalStats: { total: number; confirmados: number; nao_compareceu: number };
  teamStats: { total: number; confirmados: number; active_members: number; name: string };
  rows: Array<{ user: string; team_name: string; total: number; confirmados: number; taxa_confirmacao: number }>;
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
  summary.getCell('A1').value = 'Relatório de Produtividade';
  summary.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  summary.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF053F74' } };

  summary.mergeCells('A2:B2');
  summary.getCell('A2').value = `Período: ${args.startDate} até ${args.endDate} | Equipe selecionada: ${args.selectedTeam}`;
  summary.mergeCells('A3:B3');
  summary.getCell('A3').value = `Gerado em: ${args.generatedAt}`;

  summary.getRow(5).values = ['Indicador', 'Valor'];
  summary.getRow(5).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summary.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

  const globalRate = args.globalStats.total > 0 ? (args.globalStats.confirmados * 100) / args.globalStats.total : 0;
  const teamRate = args.teamStats.total > 0 ? (args.teamStats.confirmados * 100) / args.teamStats.total : 0;

  [
    ['Visão geral - total agendado', args.globalStats.total],
    ['Visão geral - taxa confirmação real', formatPercent(globalRate)],
    ['Visão geral - não compareceu', args.globalStats.nao_compareceu],
    [`Equipe ${args.teamStats.name} - agendados`, args.teamStats.total],
    [`Equipe ${args.teamStats.name} - taxa confirmação real`, formatPercent(teamRate)],
    [`Equipe ${args.teamStats.name} - membros ativos`, args.teamStats.active_members],
  ].forEach((row) => summary.addRow(row));

  const details = wb.addWorksheet('Ranking');
  details.columns = [
    { header: 'Usuário', key: 'user', width: 32 },
    { header: 'Equipe(s)', key: 'teamName', width: 24 },
    { header: 'Agendados', key: 'total', width: 14 },
    { header: 'Confirmados reais', key: 'confirmados', width: 18 },
    { header: 'Taxa de confirmação', key: 'taxaConfirmacao', width: 18 },
  ];
  details.getRow(1).values = details.columns.map((column) => column.header as string);
  details.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  details.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

  for (const row of args.rows) {
    details.addRow({
      user: row.user,
      teamName: row.team_name || '-',
      total: row.total,
      confirmados: row.confirmados,
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
  selectedTeam: string;
  generatedAt: string;
  globalStats: { total: number; confirmados: number; nao_compareceu: number };
  teamStats: { total: number; confirmados: number; active_members: number; name: string };
  rows: Array<{ user: string; team_name: string; total: number; confirmados: number; taxa_confirmacao: number }>;
}) => {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [842, 595];
  const margin = 28;
  const rowHeight = 18;
  const cols = [
    { label: 'Usuário', w: 220 },
    { label: 'Equipe(s)', w: 150 },
    { label: 'Agendados', w: 100 },
    { label: 'Confirmados', w: 110 },
    { label: 'Taxa confirmação', w: 110 },
  ];

  const globalRate = args.globalStats.total > 0 ? (args.globalStats.confirmados * 100) / args.globalStats.total : 0;
  const teamRate = args.teamStats.total > 0 ? (args.teamStats.confirmados * 100) / args.teamStats.total : 0;

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
      target.drawText('Relatório de Produtividade', {
        x: margin + 10,
        y: height - 48,
        size: 14,
        font: bold,
        color: rgb(1, 1, 1),
      });
      target.drawText(`Período: ${args.startDate} até ${args.endDate} | Equipe: ${args.selectedTeam}`, {
        x: margin,
        y: height - 78,
        size: 9,
        font: regular,
        color: rgb(0.2, 0.2, 0.2),
      });
      target.drawText(`Visão geral: ${args.globalStats.total} agendados | ${formatPercent(globalRate)} confirmação real`, {
        x: margin,
        y: height - 92,
        size: 9,
        font: regular,
        color: rgb(0.2, 0.2, 0.2),
      });
      target.drawText(`Equipe ${args.teamStats.name}: ${args.teamStats.total} agendados | ${formatPercent(teamRate)} confirmação real | ${args.teamStats.active_members} membros`, {
        x: margin,
        y: height - 106,
        size: 9,
        font: regular,
        color: rgb(0.2, 0.2, 0.2),
      });
      target.drawText(`Gerado em: ${args.generatedAt}`, {
        x: margin,
        y: height - 120,
        size: 9,
        font: regular,
        color: rgb(0.2, 0.2, 0.2),
      });
      return height - 152;
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
      row.user,
      row.team_name || '-',
      String(row.total),
      String(row.confirmados),
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
      page.drawText(String(values[i]).slice(0, i === 0 ? 28 : 22), {
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
    const selectedTeam = searchParams.get('team') || 'CRC';
    const search = String(searchParams.get('search') || '').trim().toLowerCase();
    const format = String(searchParams.get('format') || 'xlsx').toLowerCase();

    const dbStart = `${startDate} 00:00:00`;
    const dbEnd = `${endDate} 23:59:59`;
    const db = getDbConnection();
    const confirmationContext = await getAppointmentConfirmationContext(db);
    const hybridCte = buildAppointmentConfirmationHybridCte(confirmationContext);

    const userStatsRows = await db.query(
      `
      ${hybridCte.sql}
      SELECT
        f.scheduled_by as user,
        GROUP_CONCAT(DISTINCT tm.name) as team_name,
        COUNT(DISTINCT f.appointment_id) as total,
        COUNT(DISTINCT CASE WHEN COALESCE(f.effective_confirmed_d1, 0) = 1 THEN f.appointment_id END) as confirmados
      FROM appointment_confirmation_base f
      LEFT JOIN user_teams ut ON ut.user_name = f.scheduled_by
      LEFT JOIN teams_master tm ON tm.id = ut.team_id
      WHERE f.scheduled_at BETWEEN ? AND ?
        AND f.scheduled_by IS NOT NULL AND f.scheduled_by != '' AND f.scheduled_by != 'Sistema'
      GROUP BY f.scheduled_by
      ORDER BY total DESC
      `,
      [...hybridCte.params, dbStart, dbEnd],
    );

    const globalStatsRes = await db.query(
      `
      ${hybridCte.sql}
      SELECT
        COUNT(DISTINCT appointment_id) as total,
        COUNT(DISTINCT CASE WHEN COALESCE(effective_confirmed_d1, 0) = 1 THEN appointment_id END) as confirmados,
        SUM(CASE WHEN effective_status_id = 6 THEN 1 ELSE 0 END) as nao_compareceu
      FROM appointment_confirmation_base
      WHERE scheduled_at BETWEEN ? AND ?
      `,
      [...hybridCte.params, dbStart, dbEnd],
    );

    const teamStatsRes = await db.query(
      `
      ${hybridCte.sql}
      SELECT
        COUNT(DISTINCT f.appointment_id) as total,
        COUNT(DISTINCT CASE WHEN COALESCE(f.effective_confirmed_d1, 0) = 1 THEN f.appointment_id END) as confirmados,
        COUNT(DISTINCT f.scheduled_by) as active_members
      FROM appointment_confirmation_base f
      JOIN user_teams ut ON ut.user_name = f.scheduled_by
      JOIN teams_master tm ON tm.id = ut.team_id
      WHERE f.scheduled_at BETWEEN ? AND ?
        AND tm.name = ?
      `,
      [...hybridCte.params, dbStart, dbEnd, selectedTeam],
    );

    const rows = (userStatsRows || [])
      .map((row: any) => {
        const total = Number(row?.total || 0);
        const confirmados = Number(row?.confirmados || 0);
        return {
          user: String(row?.user || ''),
          team_name: String(row?.team_name || ''),
          total,
          confirmados,
          taxa_confirmacao: total > 0 ? (confirmados * 100) / total : 0,
        };
      })
      .filter((row) => !search || row.user.toLowerCase().includes(search));

    const generatedAt = formatDateTime(new Date());
    const globalStats = {
      total: Number(globalStatsRes?.[0]?.total || 0),
      confirmados: Number(globalStatsRes?.[0]?.confirmados || 0),
      nao_compareceu: Number(globalStatsRes?.[0]?.nao_compareceu || 0),
    };
    const teamStats = {
      total: Number(teamStatsRes?.[0]?.total || 0),
      confirmados: Number(teamStatsRes?.[0]?.confirmados || 0),
      active_members: Number(teamStatsRes?.[0]?.active_members || 0),
      name: selectedTeam,
    };

    if (format === 'pdf') {
      const buffer = await buildPdf({
        startDate,
        endDate,
        selectedTeam,
        generatedAt,
        globalStats,
        teamStats,
        rows,
      });
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="produtividade-${startDate}_${endDate}.pdf"`,
        },
      });
    }

    const buffer = await buildXlsx({
      startDate,
      endDate,
      selectedTeam,
      generatedAt,
      globalStats,
      teamStats,
      rows,
    });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="produtividade-${startDate}_${endDate}.xlsx"`,
      },
    });
  } catch (error: any) {
    console.error('Erro API produtividade export:', error);
    return NextResponse.json({ error: error.message || 'Erro interno.' }, { status: error?.status || 500 });
  }
}
