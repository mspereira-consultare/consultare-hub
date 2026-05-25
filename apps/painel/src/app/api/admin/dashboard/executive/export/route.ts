import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { requireDashboardPermission } from '@/lib/dashboard_executive/auth';
import { getExecutiveSnapshotById } from '@/lib/dashboard_executive/repository';
import type { ExecutiveAiInsightItem, ExecutiveSnapshot } from '@/lib/dashboard_executive/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN_X = 32;
const MARGIN_TOP = 34;
const MARGIN_BOTTOM = 34;

const cleanText = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim() || '—';

const truncateText = (value: unknown, maxLength: number) => {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

const formatTimestamp = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return cleanText(value);
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
};

const statusColors = (status: string) => {
  if (status === 'SUCCESS') return { bg: rgb(0.91, 0.97, 0.93), text: rgb(0.05, 0.45, 0.19) };
  if (status === 'WARNING') return { bg: rgb(1, 0.96, 0.88), text: rgb(0.67, 0.4, 0.02) };
  if (status === 'DANGER') return { bg: rgb(1, 0.93, 0.93), text: rgb(0.72, 0.12, 0.12) };
  return { bg: rgb(0.94, 0.95, 0.97), text: rgb(0.35, 0.4, 0.47) };
};

const splitText = (font: PDFFont, text: string, maxWidth: number, size: number) => {
  const words = cleanText(text).split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : ['—'];
};

const drawWrappedText = (
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  color = rgb(0.26, 0.31, 0.38)
) => {
  const lines = splitText(font, text, maxWidth, size);
  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - index * (size + 4),
      size,
      font,
      color,
    });
  });
  return y - lines.length * (size + 4);
};

const ensureSpace = (doc: PDFDocument, page: PDFPage, y: number, neededHeight: number, bold: PDFFont, regular: PDFFont) => {
  if (y - neededHeight > MARGIN_BOTTOM) return { page, y };
  const nextPage = doc.addPage([PAGE.width, PAGE.height]);
  const nextY = drawDocumentHeader(nextPage, bold, regular, false);
  return { page: nextPage, y: nextY };
};

const drawDocumentHeader = (page: PDFPage, bold: PDFFont, regular: PDFFont, firstPage: boolean) => {
  const blockHeight = firstPage ? 96 : 54;
  page.drawRectangle({
    x: MARGIN_X,
    y: PAGE.height - MARGIN_TOP - blockHeight,
    width: PAGE.width - MARGIN_X * 2,
    height: blockHeight,
    color: rgb(0.06, 0.24, 0.48),
  });

  page.drawText('Painel Executivo', {
    x: MARGIN_X + 16,
    y: PAGE.height - MARGIN_TOP - 28,
    size: 18,
    font: bold,
    color: rgb(1, 1, 1),
  });

  page.drawText('Resumo executivo consolidado', {
    x: MARGIN_X + 16,
    y: PAGE.height - MARGIN_TOP - 48,
    size: 10,
    font: regular,
    color: rgb(0.9, 0.94, 1),
  });

  return PAGE.height - MARGIN_TOP - blockHeight - 18;
};

const drawSectionTitle = (page: PDFPage, bold: PDFFont, title: string, y: number) => {
  page.drawText(title, {
    x: MARGIN_X,
    y,
    size: 13,
    font: bold,
    color: rgb(0.09, 0.17, 0.31),
  });
  return y - 18;
};

const drawMetaRow = (page: PDFPage, regular: PDFFont, label: string, value: string, x: number, y: number, width: number) => {
  page.drawText(label, {
    x,
    y,
    size: 8,
    font: regular,
    color: rgb(0.39, 0.46, 0.55),
  });
  page.drawText(truncateText(value, 72), {
    x,
    y: y - 12,
    size: 10,
    font: regular,
    color: rgb(0.13, 0.19, 0.29),
  });
  page.drawRectangle({
    x,
    y: y - 22,
    width,
    height: 0.8,
    color: rgb(0.89, 0.92, 0.96),
  });
};

const drawBadge = (page: PDFPage, bold: PDFFont, label: string, status: string, x: number, y: number) => {
  const colors = statusColors(status);
  const textWidth = bold.widthOfTextAtSize(label, 8);
  page.drawRectangle({
    x,
    y: y - 12,
    width: textWidth + 16,
    height: 16,
    color: colors.bg,
    borderColor: colors.bg,
    borderWidth: 1,
  });
  page.drawText(label, {
    x: x + 8,
    y: y - 7,
    size: 8,
    font: bold,
    color: colors.text,
  });
};

const drawCompactCard = (
  page: PDFPage,
  bold: PDFFont,
  regular: PDFFont,
  args: {
    x: number;
    y: number;
    width: number;
    title: string;
    body: string;
    footer?: string | null;
    status?: string | null;
  }
) => {
  const bodyLines = splitText(regular, args.body, args.width - 24, 10);
  const footerLines = args.footer ? splitText(regular, args.footer, args.width - 24, 8) : [];
  const height = 18 + bodyLines.length * 14 + (footerLines.length ? 10 + footerLines.length * 12 : 0) + 20;

  page.drawRectangle({
    x: args.x,
    y: args.y - height,
    width: args.width,
    height,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.88, 0.91, 0.95),
    borderWidth: 1,
  });

  page.drawText(truncateText(args.title, 48), {
    x: args.x + 12,
    y: args.y - 16,
    size: 11,
    font: bold,
    color: rgb(0.11, 0.17, 0.27),
  });

  if (args.status) {
    drawBadge(page, bold, args.status === 'DANGER' ? 'Crítico' : args.status === 'WARNING' ? 'Atenção' : 'Estável', args.status, args.x + args.width - 78, args.y - 10);
  }

  let lineY = args.y - 32;
  bodyLines.forEach((line) => {
    page.drawText(line, {
      x: args.x + 12,
      y: lineY,
      size: 10,
      font: regular,
      color: rgb(0.3, 0.36, 0.44),
    });
    lineY -= 14;
  });

  if (footerLines.length) {
    lineY -= 4;
    footerLines.forEach((line) => {
      page.drawText(line, {
        x: args.x + 12,
        y: lineY,
        size: 8,
        font: regular,
        color: rgb(0.46, 0.52, 0.59),
      });
      lineY -= 12;
    });
  }

  return height;
};

const drawInsightColumn = (
  page: PDFPage,
  bold: PDFFont,
  regular: PDFFont,
  args: {
    x: number;
    y: number;
    width: number;
    title: string;
    items: ExecutiveAiInsightItem[];
  }
) => {
  page.drawText(args.title, {
    x: args.x,
    y: args.y,
    size: 11,
    font: bold,
    color: rgb(0.1, 0.17, 0.29),
  });

  let cursorY = args.y - 16;
  const entries = args.items.slice(0, 3);
  if (!entries.length) {
    page.drawText('Sem registros relevantes neste snapshot.', {
      x: args.x,
      y: cursorY,
      size: 9,
      font: regular,
      color: rgb(0.46, 0.52, 0.59),
    });
    return cursorY - 18;
  }

  for (const item of entries) {
    const lines = splitText(regular, `${truncateText(item.title, 56)} — ${truncateText(item.description, 88)}`, args.width - 12, 9);
    page.drawCircle({
      x: args.x + 3,
      y: cursorY - 4,
      size: 2.2,
      color: rgb(0.17, 0.38, 0.72),
    });
    lines.forEach((line, index) => {
      page.drawText(line, {
        x: args.x + 12,
        y: cursorY - index * 12,
        size: 9,
        font: regular,
        color: rgb(0.31, 0.36, 0.44),
      });
    });
    cursorY -= lines.length * 12 + 10;
  }

  return cursorY;
};

const buildPdf = async (snapshot: ExecutiveSnapshot, authUser: { userId: string }) => {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let page = pdfDoc.addPage([PAGE.width, PAGE.height]);
  let y = drawDocumentHeader(page, bold, regular, true);
  const contentWidth = PAGE.width - MARGIN_X * 2;
  const halfWidth = (contentWidth - 16) / 2;

  const summary = snapshot.aiSummary?.executiveSummary || snapshot.metrics.executiveSummary;
  const priorities = snapshot.aiSummary?.topPriorities?.slice(0, 3) || snapshot.metrics.topPriorities.slice(0, 3).map((item) => ({
    areaKey: item.areaKey,
    severity: item.severity === 'high' ? 'high' : 'medium',
    horizon: null,
    title: item.title,
    description: item.description,
    rationale: null,
  }));

  drawMetaRow(page, regular, 'Gerado em', formatTimestamp(snapshot.completedAt || snapshot.createdAt), MARGIN_X, y, 120);
  drawMetaRow(page, regular, 'Usuário', authUser.userId, MARGIN_X + 150, y, 120);
  drawMetaRow(page, regular, 'Perfil', snapshot.metrics.scope.profileKey || 'Sem perfil', MARGIN_X + 300, y, 120);
  y -= 42;
  drawMetaRow(page, regular, 'Escopo', `${snapshot.metrics.scope.areas.length} área(s) • ${snapshot.metrics.scope.units.length} unidade(s) • ${snapshot.metrics.scope.departments.length} departamento(s)`, MARGIN_X, y, contentWidth);
  y -= 40;

  y = drawSectionTitle(page, bold, 'Resumo executivo', y);
  page.drawRectangle({
    x: MARGIN_X,
    y: y - 62,
    width: contentWidth,
    height: 62,
    color: rgb(0.97, 0.98, 1),
    borderColor: rgb(0.88, 0.91, 0.95),
    borderWidth: 1,
  });
  drawWrappedText(page, regular, truncateText(summary, 300), MARGIN_X + 14, y - 18, contentWidth - 28, 11, rgb(0.25, 0.31, 0.4));
  drawBadge(page, bold, snapshot.metrics.overallStatus === 'DANGER' ? 'Crítico' : snapshot.metrics.overallStatus === 'WARNING' ? 'Atenção' : snapshot.metrics.overallStatus === 'SUCCESS' ? 'Estável' : 'Sem dado', snapshot.metrics.overallStatus, MARGIN_X + contentWidth - 78, y - 8);
  y -= 84;

  y = drawSectionTitle(page, bold, 'Prioridades principais', y);
  for (const priority of priorities) {
    const space = ensureSpace(pdfDoc, page, y, 86, bold, regular);
    page = space.page;
    y = space.y;
    const status = priority.severity === 'critical' || priority.severity === 'high' ? 'DANGER' : 'WARNING';
    const height = drawCompactCard(page, bold, regular, {
      x: MARGIN_X,
      y,
      width: contentWidth,
      title: truncateText(priority.title, 72),
      body: truncateText(priority.description, 150),
      footer: priority.rationale,
      status,
    });
    y -= height + 12;
  }

  const actionPlans = snapshot.aiSummary?.actionPlans || [];
  const risks = snapshot.aiSummary?.risks || [];
  const opportunities = snapshot.aiSummary?.opportunities || [];

  const multiSectionSpace = ensureSpace(pdfDoc, page, y, 210, bold, regular);
  page = multiSectionSpace.page;
  y = multiSectionSpace.y;
  y = drawSectionTitle(page, bold, 'Ações, riscos e oportunidades', y);
  const leftBottom = drawInsightColumn(page, bold, regular, {
    x: MARGIN_X,
    y,
    width: halfWidth,
    title: 'Planos de ação',
    items: actionPlans,
  });
  const rightTop = y;
  const rightAfterRisks = drawInsightColumn(page, bold, regular, {
    x: MARGIN_X + halfWidth + 16,
    y: rightTop,
    width: halfWidth,
    title: 'Riscos',
    items: risks,
  });
  const leftAfterOpp = drawInsightColumn(page, bold, regular, {
    x: MARGIN_X,
    y: leftBottom - 12,
    width: halfWidth,
    title: 'Oportunidades',
    items: opportunities,
  });
  y = Math.min(leftAfterOpp, rightAfterRisks) - 10;

  const widgets = snapshot.metrics.widgets.slice(0, 6);
  if (widgets.length) {
    const widgetSectionSpace = ensureSpace(pdfDoc, page, y, 240, bold, regular);
    page = widgetSectionSpace.page;
    y = widgetSectionSpace.y;
    y = drawSectionTitle(page, bold, 'Indicadores-chave do perfil', y);
    let cursorY = y;
    widgets.forEach((widget, index) => {
      if (index % 2 === 0) {
        const space = ensureSpace(pdfDoc, page, cursorY, 112, bold, regular);
        page = space.page;
        cursorY = space.y;
      }
      const column = index % 2;
      const x = MARGIN_X + column * (halfWidth + 16);
      const valuesText = widget.values
        .slice(0, 3)
        .map((item) => `${item.label}: ${item.value}`)
        .join(' • ');
      drawCompactCard(page, bold, regular, {
        x,
        y: cursorY,
        width: halfWidth,
        title: widget.label,
        body: truncateText(valuesText || widget.note || widget.description || 'Sem detalhe adicional.', 160),
        footer: widget.updatedAt ? `Atualizado em ${formatTimestamp(widget.updatedAt)}` : null,
        status: widget.status,
      });
      if (column === 1 || index === widgets.length - 1) {
        cursorY -= 114;
      }
    });
    y = cursorY - 4;
  }

  const live = snapshot.metrics.liveOperations;
  const liveSectionSpace = ensureSpace(pdfDoc, page, y, 92, bold, regular);
  page = liveSectionSpace.page;
  y = liveSectionSpace.y;
  y = drawSectionTitle(page, bold, 'Operação ao vivo', y);
  const operationSummary = [
    `Fila médica: ${live.medicQueue}`,
    `Fila recepção: ${live.receptionQueue}`,
    `WhatsApp: ${live.whatsappQueue}`,
    `Espera crítica: ${live.criticalWaitCount}`,
    `Atendidos hoje: ${live.attendedToday}`,
  ].join(' • ');
  page.drawRectangle({
    x: MARGIN_X,
    y: y - 48,
    width: contentWidth,
    height: 48,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.88, 0.91, 0.95),
    borderWidth: 1,
  });
  drawWrappedText(page, regular, operationSummary, MARGIN_X + 12, y - 16, contentWidth - 24, 10, rgb(0.3, 0.36, 0.44));

  return pdfDoc.save();
};

export async function GET(request: Request) {
  try {
    const auth = await requireDashboardPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const snapshotId = cleanText(searchParams.get('snapshotId'));
    if (!snapshotId || snapshotId === '—') {
      return NextResponse.json({ error: 'snapshotId é obrigatório para exportar o PDF.' }, { status: 400 });
    }

    const snapshot = await getExecutiveSnapshotById(auth.db, auth.userId, snapshotId);
    if (!snapshot) {
      return NextResponse.json({ error: 'Snapshot executivo não encontrado para este usuário.' }, { status: 404 });
    }

    const pdfBytes = await buildPdf(snapshot, { userId: auth.userId });
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=\"painel-executivo-${snapshot.id}.pdf\"`,
      },
    });
  } catch (error: any) {
    console.error('Erro ao exportar dashboard executivo em PDF:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao exportar o dashboard executivo em PDF.' },
      { status: Number(error?.status) || 500 }
    );
  }
}
