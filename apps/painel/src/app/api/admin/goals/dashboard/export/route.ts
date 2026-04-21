import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
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
  projectionLabel: string;
  remainingLabel: string;
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

const formatFilterLine = (filters: ExportPayload['filters']) => {
  if (!Array.isArray(filters) || filters.length === 0) return 'Sem filtros adicionais.';
  return filters.map((item) => `${cleanText(item.label)}: ${cleanText(item.value)}`).join(' | ');
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
    path.join(process.cwd(), 'apps', 'painel', 'public', 'logo-color.png'),
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

const buildGoalDetails = (goal: ExportGoalRow) => {
  return [
    goal.sector !== '—' ? `Setor: ${goal.sector}` : '',
    goal.groupLabel !== '—' ? `Grupo: ${goal.groupLabel}` : '',
    goal.clinicUnitLabel !== '—' ? `Unidade: ${goal.clinicUnitLabel}` : '',
    goal.collaboratorLabel !== '—' ? `Colaborador: ${goal.collaboratorLabel}` : '',
    goal.teamLabel !== '—' ? `Equipe: ${goal.teamLabel}` : '',
    goal.startDate !== '—' || goal.endDate !== '—' ? `Vigência: ${goal.startDate} a ${goal.endDate}` : '',
  ]
    .filter(Boolean)
    .join(' • ');
};

const fitTextWithEllipsis = (font: PDFFont, text: string, maxWidth: number, fontSize: number) => {
  const safeText = cleanText(text);
  if (font.widthOfTextAtSize(safeText, fontSize) <= maxWidth) return safeText;

  let result = safeText;
  while (result.length > 1 && font.widthOfTextAtSize(`${result}...`, fontSize) > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result.trimEnd()}...`;
};

const splitLongWord = (font: PDFFont, word: string, maxWidth: number, fontSize: number) => {
  const parts: string[] = [];
  let current = '';

  for (const char of word) {
    const next = current + char;
    if (current && font.widthOfTextAtSize(next, fontSize) > maxWidth) {
      parts.push(current);
      current = char;
    } else {
      current = next;
    }
  }

  if (current) parts.push(current);
  return parts;
};

const wrapTextByWidth = (
  font: PDFFont,
  text: string,
  maxWidth: number,
  fontSize: number,
  maxLines = 3
) => {
  const safeText = cleanText(text);
  if (!safeText) return ['—'];

  const tokens = safeText.split(/\s+/).flatMap((word) => {
    if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) return [word];
    return splitLongWord(font, word, maxWidth, fontSize);
  });

  const lines: string[] = [];
  let current = '';

  for (const token of tokens) {
    const candidate = current ? `${current} ${token}` : token;
    if (current && font.widthOfTextAtSize(candidate, fontSize) > maxWidth) {
      lines.push(current);
      current = token;
    } else {
      current = candidate;
    }

    if (lines.length === maxLines) break;
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  }

  if (lines.length > maxLines) {
    lines.length = maxLines;
  }

  const consumedText = lines.join(' ').trim();
  if (consumedText.length < safeText.length) {
    lines[lines.length - 1] = fitTextWithEllipsis(font, `${lines[lines.length - 1]} ${safeText.slice(consumedText.length)}`.trim(), maxWidth, fontSize);
  }

  return lines;
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
  summarySheet.getCell('A3').alignment = { wrapText: true };
  summarySheet.getCell('A3').font = { size: 10 };
  summarySheet.getRow(3).height = 32;

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
    { header: 'Meta', key: 'name', width: 30 },
    { header: 'Escopo', key: 'scopeLabel', width: 14 },
    { header: 'Periodicidade', key: 'periodicityLabel', width: 18 },
    { header: 'KPI', key: 'indicatorLabel', width: 22 },
    { header: 'Detalhes', key: 'details', width: 38 },
    { header: 'Meta', key: 'targetLabel', width: 16 },
    { header: 'Atual', key: 'currentLabel', width: 16 },
    { header: 'Projeção', key: 'projectionLabel', width: 16 },
    { header: 'Falta', key: 'remainingLabel', width: 16 },
    { header: '%', key: 'percentageLabel', width: 10 },
    { header: 'Status', key: 'statusLabel', width: 16 },
  ];

  const headerRow = goalsSheet.getRow(1);
  headerRow.values = goalsSheet.columns.map((column) => column.header as string);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

  payload.goals.forEach((goal) => {
    const row = goalsSheet.addRow({
      name: goal.name,
      scopeLabel: goal.scopeLabel,
      periodicityLabel: goal.periodicityLabel,
      indicatorLabel: goal.indicatorLabel,
      details: buildGoalDetails(goal),
      targetLabel: goal.targetLabel,
      currentLabel: goal.currentLabel,
      projectionLabel: goal.projectionLabel,
      remainingLabel: goal.remainingLabel,
      percentageLabel: goal.percentageLabel,
      statusLabel: goal.statusLabel,
    });

    row.alignment = { vertical: 'top', wrapText: true };
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

  const pageSize: [number, number] = [1191, 842];
  const margin = 34;
  const contentWidth = pageSize[0] - margin * 2;
  const tableHeaderHeight = 20;
  const bodyFontSize = 7.4;
  const headerFontSize = 7.8;
  const lineHeight = 8.8;
  const cellPaddingX = 4;
  const cellPaddingTop = 4;
  const bottomSafeArea = 34;
  const sectionGap = 12;

  const columns = [
    { label: 'Meta', width: 170, align: 'left' as const, maxLines: 3 },
    { label: 'Escopo', width: 64, align: 'left' as const, maxLines: 2 },
    { label: 'Periodicidade', width: 70, align: 'left' as const, maxLines: 2 },
    { label: 'KPI', width: 95, align: 'left' as const, maxLines: 3 },
    { label: 'Detalhes', width: 315, align: 'left' as const, maxLines: 5 },
    { label: 'Meta', width: 74, align: 'right' as const, maxLines: 2 },
    { label: 'Atual', width: 74, align: 'right' as const, maxLines: 2 },
    { label: 'Projeção', width: 78, align: 'right' as const, maxLines: 2 },
    { label: 'Falta', width: 82, align: 'right' as const, maxLines: 2 },
    { label: '%', width: 32, align: 'center' as const, maxLines: 1 },
    { label: 'Status', width: 69, align: 'center' as const, maxLines: 2 },
  ];

  const drawLines = (
    page: PDFPage,
    lines: string[],
    x: number,
    y: number,
    width: number,
    font: PDFFont,
    fontSize: number,
    color: ReturnType<typeof rgb>,
    align: 'left' | 'center' | 'right',
    cellHeight: number
  ) => {
    const textBlockHeight = lines.length * lineHeight;
    const startY = y + cellHeight - cellPaddingTop - fontSize;
    const centeredYOffset = Math.max(0, (cellHeight - textBlockHeight) / 2 - 1);
    const baseY = align === 'center' ? y + cellHeight - centeredYOffset - fontSize - 1 : startY;

    lines.forEach((line, index) => {
      const lineWidth = font.widthOfTextAtSize(line, fontSize);
      const textX =
        align === 'right'
          ? x + width - cellPaddingX - lineWidth
          : align === 'center'
            ? x + Math.max((width - lineWidth) / 2, cellPaddingX)
            : x + cellPaddingX;

      page.drawText(line, {
        x: textX,
        y: baseY - index * lineHeight,
        size: fontSize,
        font,
        color,
      });
    });
  };

  const drawHeader = (page: PDFPage, showSummary: boolean) => {
    const { width, height } = page.getSize();
    page.drawRectangle({
      x: margin,
      y: height - 60,
      width: width - margin * 2,
      height: 34,
      color: rgb(0.09, 0.25, 0.49),
    });
    page.drawText('Painel de Metas - Relatório Executivo', {
      x: margin + 14,
      y: height - 46,
      size: 15,
      font: bold,
      color: rgb(1, 1, 1),
    });

    if (logo) {
      const scaled = logo.scale(0.17);
      page.drawImage(logo, {
        x: width - margin - scaled.width,
        y: height - 56,
        width: scaled.width,
        height: scaled.height,
      });
    }

    const filterLines = wrapTextByWidth(regular, formatFilterLine(payload.filters), contentWidth, 8, 3);
    page.drawText(`Gerado em: ${cleanText(payload.generatedAt)}`, {
      x: margin,
      y: height - 78,
      size: 9,
      font: regular,
      color: rgb(0.2, 0.2, 0.2),
    });

    filterLines.forEach((line, index) => {
      page.drawText(line, {
        x: margin,
        y: height - 92 - index * 10,
        size: 8,
        font: regular,
        color: rgb(0.28, 0.28, 0.28),
      });
    });

    let y = height - 112 - Math.max(0, filterLines.length - 1) * 10;
    if (showSummary) {
      const cards = [
        { label: 'Metas visíveis', value: String(payload.summary.totalGoals) },
        { label: 'Batidas', value: String(payload.summary.successGoals) },
        { label: 'Atenção', value: String(payload.summary.warningGoals) },
        { label: 'Progresso global', value: `${payload.summary.globalProgress}%` },
      ];

      const cardWidth = 254;
      const cardGap = 14;
      const cardHeight = 38;
      const cardBottomY = y - 46;
      cards.forEach((card, index) => {
        const x = margin + index * (cardWidth + cardGap);
        page.drawRectangle({
          x,
          y: cardBottomY,
          width: cardWidth,
          height: cardHeight,
          color: rgb(0.96, 0.97, 0.99),
          borderColor: rgb(0.84, 0.88, 0.95),
          borderWidth: 0.8,
        });
        page.drawText(card.label, {
          x: x + 10,
          y: cardBottomY + 22,
          size: 8,
          font: regular,
          color: rgb(0.35, 0.4, 0.47),
        });
        page.drawText(card.value, {
          x: x + 10,
          y: cardBottomY + 8,
          size: 13,
          font: bold,
          color: rgb(0.09, 0.25, 0.49),
        });
      });
      y = cardBottomY - sectionGap - tableHeaderHeight;
    } else {
      y -= sectionGap + tableHeaderHeight;
    }

    return y;
  };

  const drawTableHeader = (page: PDFPage, y: number) => {
    let x = margin;
    columns.forEach((column) => {
      page.drawRectangle({
        x,
        y,
        width: column.width,
        height: tableHeaderHeight,
        color: rgb(0.09, 0.25, 0.49),
      });

      drawLines(
        page,
        [column.label],
        x,
        y,
        column.width,
        bold,
        headerFontSize,
        rgb(1, 1, 1),
        column.align === 'right' ? 'right' : column.align === 'center' ? 'center' : 'left',
        tableHeaderHeight
      );
      x += column.width;
    });
  };

  let page = pdfDoc.addPage(pageSize);
  let y = drawHeader(page, true);
  drawTableHeader(page, y);
  y -= tableHeaderHeight;

  payload.goals.forEach((goal, rowIndex) => {
    const details = buildGoalDetails(goal);
    const cellValues = [
      goal.name,
      goal.scopeLabel,
      goal.periodicityLabel,
      goal.indicatorLabel,
      details,
      goal.targetLabel,
      goal.currentLabel,
      goal.projectionLabel,
      goal.remainingLabel,
      goal.percentageLabel,
      goal.statusLabel,
    ];

    const wrappedCells = cellValues.map((value, index) =>
      wrapTextByWidth(
        index === cellValues.length - 1 ? bold : regular,
        value,
        columns[index].width - cellPaddingX * 2,
        bodyFontSize,
        columns[index].maxLines
      )
    );

    const maxLines = Math.max(...wrappedCells.map((lines) => lines.length));
    const rowHeight = Math.max(18, maxLines * lineHeight + cellPaddingTop * 2);

    if (y - rowHeight < bottomSafeArea) {
      page = pdfDoc.addPage(pageSize);
      y = drawHeader(page, false);
      drawTableHeader(page, y);
      y -= tableHeaderHeight;
    }

    let x = margin;
    wrappedCells.forEach((lines, index) => {
      const isStatusCell = index === wrappedCells.length - 1;
      const zebra = rowIndex % 2 === 0 ? rgb(1, 1, 1) : rgb(0.985, 0.988, 0.994);
      const colors = isStatusCell ? statusPdfColors(goal.status) : null;

      page.drawRectangle({
        x,
        y: y - rowHeight,
        width: columns[index].width,
        height: rowHeight,
        color: colors?.background ?? zebra,
        borderColor: rgb(0.85, 0.88, 0.92),
        borderWidth: 0.5,
      });

      drawLines(
        page,
        lines,
        x,
        y - rowHeight,
        columns[index].width,
        isStatusCell ? bold : regular,
        bodyFontSize,
        colors?.text ?? rgb(0.12, 0.12, 0.12),
        columns[index].align,
        rowHeight
      );

      x += columns[index].width;
    });

    y -= rowHeight;
  });

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
          'Content-Disposition': 'attachment; filename="metas-dashboard.pdf"',
          'Cache-Control': 'no-store',
        },
      });
    }

    const xlsx = await buildWorkbook(payload);
    return new NextResponse(xlsx, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="metas-dashboard.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Erro ao exportar dashboard de metas:', error);
    const message = error instanceof Error ? error.message : 'Erro interno ao exportar.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
