import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { buildTaskGanttPresentation } from './gantt';
import type { TaskGanttPresentationRow } from './gantt';
import type { TaskProjectDetail, TaskSummary } from './types';

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const PAGE_MARGIN = 32;
const HEADER_HEIGHT = 42;
const LEFT_COLUMN_WIDTH = 230;
const ROW_HEIGHT = 24;
const TIMELINE_TOP_GAP = 86;
const TIMELINE_BOTTOM_GAP = 42;

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
};

const truncate = (value: string, limit: number) => (value.length > limit ? `${value.slice(0, Math.max(limit - 1, 1))}…` : value);

const getStatusColor = (task: TaskSummary) => {
  if (task.status === 'CONCLUIDA') return rgb(0.04, 0.62, 0.39);
  if (task.status === 'AGUARDANDO_APROVACAO') return rgb(0.49, 0.23, 0.93);
  if (task.status === 'EM_ANDAMENTO') return rgb(0.15, 0.36, 0.91);
  if (task.status === 'A_FAZER') return rgb(0.85, 0.54, 0.12);
  return rgb(0.42, 0.49, 0.59);
};

const drawPageHeader = (
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  title: string,
  subtitle: string
) => {
  page.drawRectangle({
    x: PAGE_MARGIN,
    y: PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT,
    width: PAGE_WIDTH - PAGE_MARGIN * 2,
    height: HEADER_HEIGHT,
    color: rgb(0.09, 0.25, 0.49),
  });
  page.drawText(title, {
    x: PAGE_MARGIN + 10,
    y: PAGE_HEIGHT - PAGE_MARGIN - 15,
    size: 18,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText(subtitle, {
    x: PAGE_MARGIN + 10,
    y: PAGE_HEIGHT - PAGE_MARGIN - 30,
    size: 8,
    font,
    color: rgb(0.84, 0.89, 0.95),
  });
};

const drawSummaryPage = (
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  project: TaskProjectDetail,
  assigneeMap: Map<string, string>,
  summaryTitle: string,
  summaryNote: string
) => {
  const scheduledTasks = project.tasks.filter((task) => task.startDate && task.dueDate);
  drawPageHeader(page, font, fontBold, project.name, project.description || summaryTitle);

  page.drawText(summaryTitle, {
    x: PAGE_MARGIN + 10,
    y: PAGE_HEIGHT - PAGE_MARGIN - 70,
    size: 12,
    font: fontBold,
    color: rgb(0.09, 0.25, 0.49),
  });
  page.drawText(
    `Total de tarefas: ${project.tasks.length} | Agendadas: ${scheduledTasks.length} | Dependências: ${project.dependencies.length} | Membros: ${project.members.length}`,
    {
      x: PAGE_MARGIN + 10,
      y: PAGE_HEIGHT - PAGE_MARGIN - 86,
      size: 9,
      font,
      color: rgb(0.27, 0.35, 0.46),
    }
  );

  let cursorY = PAGE_HEIGHT - PAGE_MARGIN - 120;
  page.drawText('Protocolo', { x: PAGE_MARGIN + 10, y: cursorY, size: 9, font: fontBold });
  page.drawText('Título', { x: PAGE_MARGIN + 84, y: cursorY, size: 9, font: fontBold });
  page.drawText('Responsável', { x: PAGE_MARGIN + 330, y: cursorY, size: 9, font: fontBold });
  page.drawText('Janela', { x: PAGE_MARGIN + 505, y: cursorY, size: 9, font: fontBold });
  page.drawText('Status', { x: PAGE_MARGIN + 645, y: cursorY, size: 9, font: fontBold });
  cursorY -= 14;

  for (const task of scheduledTasks.slice(0, 14)) {
    page.drawText(task.protocolId, { x: PAGE_MARGIN + 10, y: cursorY, size: 8, font });
    page.drawText(truncate(task.title, 44), { x: PAGE_MARGIN + 84, y: cursorY, size: 8, font });
    page.drawText(
      truncate(task.primaryAssigneeUserId ? assigneeMap.get(task.primaryAssigneeUserId) || task.primaryAssigneeUserId : '-', 28),
      { x: PAGE_MARGIN + 330, y: cursorY, size: 8, font }
    );
    page.drawText(`${formatDate(task.startDate)} → ${formatDate(task.dueDate)}`, {
      x: PAGE_MARGIN + 505,
      y: cursorY,
      size: 8,
      font,
    });
    page.drawText(truncate(task.status.replace(/_/g, ' '), 18), {
      x: PAGE_MARGIN + 645,
      y: cursorY,
      size: 8,
      font,
    });
    cursorY -= 15;
  }

  page.drawText(summaryNote, {
    x: PAGE_MARGIN + 10,
    y: PAGE_MARGIN + 8,
    size: 8,
    font,
    color: rgb(0.34, 0.42, 0.56),
  });
};

const drawTimelineHeader = (
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  rangeLabel: string,
  totalDaysLabel: string,
  monthTicks: Array<{ offset: number; label: string }>,
  ticks: Array<{ offset: number; label: string }>,
  totalDays: number
) => {
  const gridX = PAGE_MARGIN + LEFT_COLUMN_WIDTH;
  const gridWidth = PAGE_WIDTH - PAGE_MARGIN * 2 - LEFT_COLUMN_WIDTH;
  const topY = PAGE_HEIGHT - PAGE_MARGIN - TIMELINE_TOP_GAP;

  page.drawText(rangeLabel, {
    x: PAGE_MARGIN + 2,
    y: PAGE_HEIGHT - PAGE_MARGIN - 58,
    size: 11,
    font: fontBold,
    color: rgb(0.09, 0.25, 0.49),
  });
  page.drawText(totalDaysLabel, {
    x: PAGE_MARGIN + 2,
    y: PAGE_HEIGHT - PAGE_MARGIN - 72,
    size: 8,
    font,
    color: rgb(0.34, 0.42, 0.56),
  });

  page.drawText('Tarefa', {
    x: PAGE_MARGIN + 2,
    y: topY + 18,
    size: 8,
    font: fontBold,
    color: rgb(0.34, 0.42, 0.56),
  });

  for (const tick of monthTicks) {
    page.drawText(tick.label, {
      x: gridX + (tick.offset / totalDays) * gridWidth,
      y: topY + 22,
      size: 7,
      font: fontBold,
      color: rgb(0.55, 0.62, 0.71),
    });
  }

  for (const tick of ticks) {
    const x = gridX + (tick.offset / totalDays) * gridWidth;
    page.drawLine({
      start: { x, y: PAGE_MARGIN + TIMELINE_BOTTOM_GAP },
      end: { x, y: topY + 14 },
      thickness: 0.4,
      color: rgb(0.89, 0.92, 0.96),
    });
    page.drawText(tick.label, {
      x: x - 10,
      y: topY + 8,
      size: 6.5,
      font,
      color: rgb(0.39, 0.46, 0.56),
    });
  }

  page.drawLine({
    start: { x: PAGE_MARGIN, y: topY + 4 },
    end: { x: PAGE_WIDTH - PAGE_MARGIN, y: topY + 4 },
    thickness: 0.8,
    color: rgb(0.87, 0.9, 0.94),
  });
};

const drawTimelineRows = (
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  rows: TaskGanttPresentationRow[],
  totalDays: number
) => {
  const gridX = PAGE_MARGIN + LEFT_COLUMN_WIDTH;
  const gridWidth = PAGE_WIDTH - PAGE_MARGIN * 2 - LEFT_COLUMN_WIDTH;
  const startY = PAGE_HEIGHT - PAGE_MARGIN - TIMELINE_TOP_GAP - 8;

  rows.forEach((row, index) => {
    const task = row.task;
    const baseY = startY - index * ROW_HEIGHT;
    const centerY = baseY - 11;
    const left = gridX + (row.startOffsetDays / totalDays) * gridWidth;
    const width = Math.max((row.spanDays / totalDays) * gridWidth, 10);
    const barColor = getStatusColor(task);
    const connectorColor = row.hasScheduleConflict ? rgb(0.88, 0.27, 0.34) : rgb(0.78, 0.82, 0.88);

    page.drawLine({
      start: { x: PAGE_MARGIN, y: baseY - ROW_HEIGHT + 2 },
      end: { x: PAGE_WIDTH - PAGE_MARGIN, y: baseY - ROW_HEIGHT + 2 },
      thickness: 0.4,
      color: rgb(0.93, 0.95, 0.97),
    });

    page.drawText(task.protocolId, {
      x: PAGE_MARGIN + 2,
      y: centerY + 3,
      size: 7.5,
      font: fontBold,
      color: rgb(0.09, 0.25, 0.49),
    });
    page.drawText(truncate(task.title, 28), {
      x: PAGE_MARGIN + 52,
      y: centerY + 3,
      size: 7.5,
      font: fontBold,
      color: rgb(0.12, 0.17, 0.24),
    });
    page.drawText(`${formatDate(task.startDate)} → ${formatDate(task.dueDate)}`, {
      x: PAGE_MARGIN + 52,
      y: centerY - 7,
      size: 6.7,
      font,
      color: rgb(0.39, 0.46, 0.56),
    });

    if (row.predecessorProtocols.length) {
      page.drawLine({
        start: { x: gridX, y: centerY },
        end: { x: left, y: centerY },
        thickness: 0.9,
        color: connectorColor,
        dashArray: [2, 2],
      });
      page.drawCircle({
        x: left,
        y: centerY,
        size: 2.2,
        borderColor: connectorColor,
        borderWidth: 0.8,
        color: rgb(1, 1, 1),
      });
    }

    page.drawRectangle({
      x: left,
      y: centerY - 6,
      width,
      height: 12,
      color: barColor,
    });

    if (task.checklistTotalItems > 0 && task.checklistProgressPercent > 0) {
      page.drawRectangle({
        x: left,
        y: centerY - 9,
        width: Math.max((width * task.checklistProgressPercent) / 100, 2),
        height: 2.2,
        color: rgb(0.16, 0.72, 0.46),
      });
    }

    if (row.hasScheduleConflict) {
      page.drawText('Conflito', {
        x: PAGE_WIDTH - PAGE_MARGIN - 48,
        y: centerY - 1,
        size: 6.8,
        font: fontBold,
        color: rgb(0.88, 0.27, 0.34),
      });
    }
  });
};

export const buildTaskProjectGanttPdf = async ({
  project,
  title,
  subtitle,
  summaryTitle,
  summaryNote,
  assigneeMap,
}: {
  project: TaskProjectDetail;
  title: string;
  subtitle: string;
  summaryTitle: string;
  summaryNote: string;
  assigneeMap: Map<string, string>;
}) => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const summaryPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  drawSummaryPage(summaryPage, font, fontBold, project, assigneeMap, summaryTitle, summaryNote);

  const presentation = buildTaskGanttPresentation(project.tasks, project.dependencies, {
    locale: 'pt-BR',
    keyPrefix: project.id,
  });

  if (!presentation) {
    return pdf.save();
  }

  const rowsPerPage = Math.max(
    Math.floor((PAGE_HEIGHT - PAGE_MARGIN - TIMELINE_TOP_GAP - TIMELINE_BOTTOM_GAP) / ROW_HEIGHT),
    1
  );

  for (let index = 0; index < presentation.rows.length; index += rowsPerPage) {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const pageRows = presentation.rows.slice(index, index + rowsPerPage);
    drawPageHeader(page, font, fontBold, title, subtitle);
    drawTimelineHeader(
      page,
      font,
      fontBold,
      `${formatDate(presentation.timelineStart.toISOString().slice(0, 10))} até ${formatDate(
        presentation.timelineEnd.toISOString().slice(0, 10)
      )}`,
      `${presentation.totalDays} dia(s) no recorte | Página ${Math.floor(index / rowsPerPage) + 1}`,
      presentation.monthTicks,
      presentation.ticks,
      presentation.totalDays
    );
    drawTimelineRows(page, font, fontBold, pageRows, presentation.totalDays);
  }

  return pdf.save();
};
