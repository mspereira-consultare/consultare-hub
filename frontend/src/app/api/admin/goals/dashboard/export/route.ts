import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getServerSession } from 'next-auth';
import { readFile } from 'fs/promises';
import path from 'path';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { loadUserPermissionMatrix } from '@/lib/permissions_server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ExportGoalRow = {
  name: string;
  scopeLabel: string;
  sector: string;
  periodicityLabel: string;
  unitLabel: string;
  indicatorLabel: string;
  groupLabel: string;
  clinicUnitLabel: string;
  collaboratorLabel: string;
  teamLabel: string;
  startDate: string;
  endDate: string;
  targetLabel: string;
  currentLabel: string;
  percentageLabel: string;
  statusLabel: string;
  status: 'SUCCESS' | 'WARNING' | 'DANGER';
};

type ExportPayload = {
  format: 'xlsx' | 'pdf';
  generatedAt: string;
  filters: Array<{ label: string; value: string }>;
  summary: {
    totalGoals: number;
    successGoals: number;
    warningGoals: number;
    globalProgress: number;
  };
  goals: ExportGoalRow[];
};

const ensurePermission = async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, status: 401, error: 'Não autenticado.' };
  }

  type SessionUser = { role?: string };
  const sessionUser = session.user as SessionUser;
  const userId = String(session.user.id);
  const role = String(sessionUser.role || 'OPERADOR').toUpperCase();
  const db = getDbConnection();
  const permissions = await loadUserPermissionMatrix(db, userId, role);
  const allowed = hasPermission(permissions, 'metas_dashboard', 'view', role);

  if (!allowed) {
    return { ok: false as const, status: 403, error: 'Sem permissão para exportar o painel de metas.' };
  }

  return { ok: true as const };
};

const cleanText = (value: unknown) => {
  const text = String(value ?? '').trim();
  return text || '—';
};

const truncateText = (value: string, maxLength: number) => {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};

const formatFilterLine = (filters: ExportPayload['filters']) => {
  if (!Array.isArray(filters) || filters.length === 0) return 'Sem filtros adicionais.';
  return filters.map((item) => `${cleanText(item.label)}: ${cleanText(item.value)}`).join(' | ');
};

const wrapByLength = (text: string, maxLength = 110) => {
  const words = cleanText(text).split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines;
};

const statusPdfColors = (status: ExportGoalRow['status']) => {
  if (status === 'SUCCESS') return { background: rgb(0.91, 0.97, 0.93), text: rgb(0.05, 0.45, 0.19) };
  if (status === 'WARNING') return { background: rgb(1, 0.96, 0.88), text: rgb(0.67, 0.4, 0.02) };
  return { background: rgb(1, 0.93, 0.93), text: rgb(0.67, 0.1, 0.1) };
};

const statusExcelColor = (status: ExportGoalRow['status']) => {
  if (status === 'SUCCESS') return 'FFE8F5EC';
  if (status === 'WARNING') return 'FFFFF4D6';
  return 'FFFFE6E6';
};

const resolveLogoBuffer = async () => {
  const candidates = [
    path.join(process.cwd(), 'public', 'logo-color.png'),
    path.join(process.cwd(), 'frontend', 'public', 'logo-color.png'),
  ];

  for (const candidate of candidates) {
    try {
      return await readFile(candidate);
    } catch {
      // continua
    }
  }

  return null;
};

const buildWorkbook = async (payload: ExportPayload) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Hub Consultare';
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('Resumo');
  summarySheet.columns = [
    { header: 'Indicador', key: 'label', width: 28 },
    { header: 'Valor', key: 'value', width: 20 },
  ];

  summarySheet.mergeCells('A1:B1');
  summarySheet.getCell('A1').value = 'Painel de Metas - Resumo Executivo';
  summarySheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

  summarySheet.mergeCells('A2:B2');
  summarySheet.getCell('A2').value = `Gerado em: ${cleanText(payload.generatedAt)}`;
  summarySheet.getCell('A2').font = { size: 10 };

  summarySheet.mergeCells('A3:B3');
  summarySheet.getCell('A3').value = formatFilterLine(payload.filters);
  summarySheet.getCell('A3').font = { size: 10 };

  summarySheet.addRows([
    { label: 'Metas visíveis', value: payload.summary.totalGoals },
    { label: 'Metas batidas', value: payload.summary.successGoals },
    { label: 'Metas em atenção', value: payload.summary.warningGoals },
    { label: 'Progresso global', value: `${payload.summary.globalProgress}%` },
  ]);

  const summaryHeader = summarySheet.getRow(5);
  summaryHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summaryHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

  const goalsSheet = workbook.addWorksheet('Metas');
  goalsSheet.columns = [
    { header: 'Meta', key: 'name', width: 34 },
    { header: 'Escopo', key: 'scopeLabel', width: 18 },
    { header: 'Setor', key: 'sector', width: 22 },
    { header: 'Periodicidade', key: 'periodicityLabel', width: 18 },
    { header: 'KPI', key: 'indicatorLabel', width: 24 },
    { header: 'Grupo de procedimento', key: 'groupLabel', width: 24 },
    { header: 'Unidade clínica', key: 'clinicUnitLabel', width: 22 },
    { header: 'Colaborador', key: 'collaboratorLabel', width: 22 },
    { header: 'Equipe', key: 'teamLabel', width: 22 },
    { header: 'Vigência início', key: 'startDate', width: 16 },
    { header: 'Vigência fim', key: 'endDate', width: 16 },
    { header: 'Meta', key: 'targetLabel', width: 18 },
    { header: 'Atual', key: 'currentLabel', width: 18 },
    { header: '%', key: 'percentageLabel', width: 12 },
    { header: 'Status', key: 'statusLabel', width: 18 },
  ];

  const goalsHeader = goalsSheet.getRow(1);
  goalsHeader.values = goalsSheet.columns.map((column) => column.header as string);
  goalsHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  goalsHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

  payload.goals.forEach((goal) => {
    const row = goalsSheet.addRow(goal);
    row.getCell('statusLabel').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: statusExcelColor(goal.status) },
    };
  });

  const output = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(output) ? output : Buffer.from(output as ArrayBuffer);
};

const buildPdf = async (payload: ExportPayload) => {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const logoBuffer = await resolveLogoBuffer();
  const logo = logoBuffer ? await pdfDoc.embedPng(logoBuffer) : null;

  const pageSize: [number, number] = [842, 595];
  const margin = 30;
  const rowHeight = 18;
  const columns = [
    { label: 'Meta', width: 160 },
    { label: 'Escopo', width: 58 },
    { label: 'Periodicidade', width: 66 },
    { label: 'KPI', width: 96 },
    { label: 'Detalhes', width: 170 },
    { label: 'Meta', width: 60 },
    { label: 'Atual', width: 60 },
    { label: '%', width: 40 },
    { label: 'Status', width: 62 },
  ];

  const drawHeader = (page: any, showSummary: boolean) => {
    const { width, height } = page.getSize();
    page.drawRectangle({
      x: margin,
      y: height - 62,
      width: width - margin * 2,
      height: 36,
      color: rgb(0.09, 0.25, 0.49),
    });
    page.drawText('Painel de Metas - Relatório Executivo', {
      x: margin + 14,
      y: height - 47,
      size: 15,
      font: bold,
      color: rgb(1, 1, 1),
    });

    if (logo) {
      const scaled = logo.scale(0.18);
      page.drawImage(logo, {
        x: width - margin - scaled.width,
        y: height - 58,
        width: scaled.width,
        height: scaled.height,
      });
    }

    const filterLines = wrapByLength(formatFilterLine(payload.filters), 118);
    page.drawText(`Gerado em: ${cleanText(payload.generatedAt)}`, {
      x: margin,
      y: height - 80,
      size: 9,
      font: regular,
      color: rgb(0.2, 0.2, 0.2),
    });
    filterLines.forEach((line, index) => {
      page.drawText(line, {
        x: margin,
        y: height - 94 - index * 11,
        size: 8,
        font: regular,
        color: rgb(0.28, 0.28, 0.28),
      });
    });

    let y = height - 118 - Math.max(0, filterLines.length - 1) * 11;
    if (showSummary) {
      const cards = [
        { label: 'Metas visíveis', value: String(payload.summary.totalGoals) },
        { label: 'Batidas', value: String(payload.summary.successGoals) },
        { label: 'Atenção', value: String(payload.summary.warningGoals) },
        { label: 'Progresso global', value: `${payload.summary.globalProgress}%` },
      ];

      cards.forEach((card, index) => {
        const x = margin + index * 190;
        page.drawRectangle({
          x,
          y: y - 44,
          width: 180,
          height: 36,
          color: rgb(0.96, 0.97, 0.99),
          borderColor: rgb(0.84, 0.88, 0.95),
          borderWidth: 0.8,
        });
        page.drawText(card.label, {
          x: x + 10,
          y: y - 22,
          size: 8,
          font: regular,
          color: rgb(0.35, 0.4, 0.47),
        });
        page.drawText(card.value, {
          x: x + 10,
          y: y - 36,
          size: 13,
          font: bold,
          color: rgb(0.09, 0.25, 0.49),
        });
      });
      y -= 58;
    }

    return y;
  };

  const drawTableHeader = (page: any, y: number) => {
    let x = margin;
    columns.forEach((column) => {
      page.drawRectangle({
        x,
        y,
        width: column.width,
        height: rowHeight,
        color: rgb(0.09, 0.25, 0.49),
      });
      page.drawText(column.label, {
        x: x + 4,
        y: y + 5,
        size: 8,
        font: bold,
        color: rgb(1, 1, 1),
      });
      x += column.width;
    });
  };

  let page = pdfDoc.addPage(pageSize);
  let y = drawHeader(page, true);
  drawTableHeader(page, y);
  y -= rowHeight;

  for (const goal of payload.goals) {
    if (y < 36) {
      page = pdfDoc.addPage(pageSize);
      y = drawHeader(page, false);
      drawTableHeader(page, y);
      y -= rowHeight;
    }

    const detailText = [
      goal.sector !== '—' ? `Setor: ${goal.sector}` : '',
      goal.groupLabel !== '—' ? `Grupo: ${goal.groupLabel}` : '',
      goal.clinicUnitLabel !== '—' ? `Unidade: ${goal.clinicUnitLabel}` : '',
      goal.collaboratorLabel !== '—' ? `Colaborador: ${goal.collaboratorLabel}` : '',
      goal.teamLabel !== '—' ? `Equipe: ${goal.teamLabel}` : '',
      goal.startDate !== '—' || goal.endDate !== '—' ? `Vigência: ${goal.startDate} a ${goal.endDate}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    const rowValues = [
      truncateText(goal.name, 32),
      truncateText(goal.scopeLabel, 12),
      truncateText(goal.periodicityLabel, 14),
      truncateText(goal.indicatorLabel, 20),
      truncateText(detailText, 48),
      truncateText(goal.targetLabel, 12),
      truncateText(goal.currentLabel, 12),
      truncateText(goal.percentageLabel, 7),
      truncateText(goal.statusLabel, 16),
    ];

    let x = margin;
    rowValues.forEach((value, index) => {
      const isStatusCell = index === rowValues.length - 1;
      if (isStatusCell) {
        const colors = statusPdfColors(goal.status);
        page.drawRectangle({
          x,
          y,
          width: columns[index].width,
          height: rowHeight,
          color: colors.background,
          borderColor: rgb(0.85, 0.88, 0.92),
          borderWidth: 0.5,
        });
        page.drawText(value, {
          x: x + 4,
          y: y + 5,
          size: 8,
          font: bold,
          color: colors.text,
        });
      } else {
        page.drawRectangle({
          x,
          y,
          width: columns[index].width,
          height: rowHeight,
          borderColor: rgb(0.85, 0.88, 0.92),
          borderWidth: 0.5,
        });
        page.drawText(value, {
          x: x + 4,
          y: y + 5,
          size: 8,
          font: regular,
          color: rgb(0.1, 0.1, 0.1),
        });
      }
      x += columns[index].width;
    });

    y -= rowHeight;
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
};

export async function POST(request: Request) {
  try {
    const auth = await ensurePermission();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const payload = (await request.json()) as ExportPayload;
    if (!payload || !Array.isArray(payload.goals)) {
      return NextResponse.json({ error: 'Payload inválido para exportação.' }, { status: 400 });
    }

    const format = payload.format === 'pdf' ? 'pdf' : 'xlsx';

    if (format === 'pdf') {
      const pdf = await buildPdf(payload);
      return new NextResponse(pdf, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename=\"metas-dashboard.pdf\"',
          'Cache-Control': 'no-store',
        },
      });
    }

    const xlsx = await buildWorkbook(payload);
    return new NextResponse(xlsx, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename=\"metas-dashboard.xlsx\"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Erro ao exportar dashboard de metas:', error);
    const message = error instanceof Error ? error.message : 'Erro interno ao exportar.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
