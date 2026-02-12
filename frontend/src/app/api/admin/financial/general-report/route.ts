import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import ExcelJS from 'exceljs';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';
import { hasPermission, type PermissionAction } from '@/lib/permissions';
import { loadUserPermissionMatrix } from '@/lib/permissions_server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Marco',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const MONTH_SHORT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

const COLORS = {
  navy: '#053F74',
  blue: '#17407E',
  teal: '#229A8A',
  green: '#3FBD80',
  darkGreen: '#259D89',
  black: '#000000',
  lightBlueBg: '#EAF2FC',
  lightGreenBg: '#E6F7EF',
};

type UnitKey = 'all' | 'campinas_shopping' | 'ouro_verde' | 'centro_cambui' | 'resolve_saude';

type SectionDef = {
  key: UnitKey;
  label: string;
};

type MonthlyAggRow = {
  year: number;
  month: number;
  unitRaw: string;
  total: number;
};

type YearRow = {
  year: number;
  months: number[];
  total: number;
  accumulatedRef: number;
  highlights: boolean[];
};

type SectionReport = {
  key: UnitKey;
  label: string;
  referenceYearApplied: number | null;
  referenceAccumulated: number;
  bestHistoricalAccumulated: number;
  previousYearAccumulated: number;
  growthVsBest: number | null;
  growthVsPreviousYear: number | null;
  rows: YearRow[];
};

type ReportPayload = {
  generatedAt: string;
  referenceMonthRef: string;
  referenceYear: number;
  referenceMonth: number;
  referenceMonthLabel: string;
  unitFilter: UnitKey;
  availableUnits: SectionDef[];
  sections: SectionReport[];
};

const ALL_UNITS: SectionDef[] = [
  { key: 'all', label: 'Todas unidades' },
  { key: 'campinas_shopping', label: 'Campinas Shopping' },
  { key: 'ouro_verde', label: 'Ouro Verde' },
  { key: 'centro_cambui', label: 'Centro Cambui' },
  { key: 'resolve_saude', label: 'ResolveSaude' },
];

const MYSQL_DATE_EXPR = `
  (CASE
    WHEN data_do_pagamento IS NULL OR TRIM(data_do_pagamento) = '' THEN NULL
    WHEN INSTR(data_do_pagamento, '/') > 0 THEN STR_TO_DATE(data_do_pagamento, '%d/%m/%Y')
    ELSE STR_TO_DATE(SUBSTR(data_do_pagamento, 1, 10), '%Y-%m-%d')
  END)
`;
const SQLITE_DATE_EXPR = `
  (CASE
    WHEN data_do_pagamento IS NULL OR trim(data_do_pagamento) = '' THEN NULL
    WHEN instr(data_do_pagamento, '/') > 0 THEN substr(data_do_pagamento, 7, 4) || '-' || substr(data_do_pagamento, 4, 2) || '-' || substr(data_do_pagamento, 1, 2)
    ELSE substr(data_do_pagamento, 1, 10)
  END)
`;

const normalizeText = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');

const toMoney = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

const toPercent = (value: number | null) =>
  value === null ? '-' : `${value.toFixed(1).replace('.', ',')}%`;

const formatDateTimeBr = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

const getNowMonthRef = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const byType = new Map(parts.map((p) => [p.type, p.value]));
  return `${byType.get('year')}-${byType.get('month')}`;
};

const parseOptionalMonthRef = (raw: string | null) => {
  const value = String(raw || '').trim();
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
};

const parseUnitFilter = (raw: string | null): UnitKey => {
  const key = String(raw || 'all').trim();
  if (ALL_UNITS.some((u) => u.key === key)) return key as UnitKey;
  return 'all';
};

const detectReferencePeriod = (yearMap: Map<number, number[]>) => {
  const yearsDesc = Array.from(yearMap.keys()).sort((a, b) => b - a);
  for (const year of yearsDesc) {
    const months = yearMap.get(year) || [];
    for (let month = 12; month >= 1; month -= 1) {
      if (Number(months[month - 1] || 0) > 0) return { year, month };
    }
  }
  const fallback = getNowMonthRef();
  const [yearS, monthS] = fallback.split('-');
  return { year: Number(yearS), month: Number(monthS) };
};

const mapUnitKey = (unitRaw: string): Exclude<UnitKey, 'all'> | null => {
  const norm = normalizeText(unitRaw);
  if (!norm) return null;
  if (norm.includes('SHOPPING CAMPINAS') || norm.includes('CAMPINAS SHOPPING')) return 'campinas_shopping';
  if (norm.includes('OURO VERDE')) return 'ouro_verde';
  if (norm.includes('CENTRO CAMBUI') || norm === 'CENTRO') return 'centro_cambui';
  if (norm.includes('RESOLVE') || norm.includes('RESOLVECARD')) return 'resolve_saude';
  return null;
};

const growthPct = (current: number, base: number) => {
  if (!Number.isFinite(base) || base <= 0) return null;
  return ((current - base) / base) * 100;
};

const ensureApiPermission = async (action: PermissionAction = 'view') => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { allowed: false, status: 401, error: 'Nao autenticado.' };
  const role = String((session.user as any).role || 'OPERADOR');
  const userId = String((session.user as any).id || '');
  if (!userId) return { allowed: false, status: 401, error: 'Sessao invalida.' };

  const db = getDbConnection();
  const livePermissions = await loadUserPermissionMatrix(db, userId, role);
  const allowed = hasPermission(livePermissions, 'financeiro', action, role);
  if (!allowed) {
    return { allowed: false, status: 403, error: `Sem permissao para ${action} na pagina Financeiro.` };
  }
  return { allowed: true as const };
};

const loadMonthlyAgg = async () => {
  const db = getDbConnection();
  const isMySql =
    String(process.env.DB_PROVIDER || '').toLowerCase() === 'mysql' ||
    Boolean(process.env.MYSQL_URL) ||
    Boolean(process.env.MYSQL_PUBLIC_URL);
  const dateExpr = isMySql ? MYSQL_DATE_EXPR : SQLITE_DATE_EXPR;
  const yearExpr = isMySql ? `YEAR(${dateExpr})` : `CAST(substr(${dateExpr}, 1, 4) AS INTEGER)`;
  const monthExpr = isMySql ? `MONTH(${dateExpr})` : `CAST(substr(${dateExpr}, 6, 2) AS INTEGER)`;

  const rows = await db.query(
    `
      SELECT
        ${yearExpr} as y,
        ${monthExpr} as m,
        UPPER(TRIM(COALESCE(unidade, ''))) as unidade,
        SUM(COALESCE(total_pago, 0)) as total
      FROM faturamento_analitico
      WHERE COALESCE(TRIM(data_do_pagamento), '') <> ''
        AND ${dateExpr} IS NOT NULL
      GROUP BY y, m, unidade
      HAVING y >= 2000 AND m >= 1 AND m <= 12
      ORDER BY y ASC, m ASC
    `
  );

  return (rows || []).map((row: any) => ({
    year: Number(row.y),
    month: Number(row.m),
    unitRaw: String(row.unidade || ''),
    total: Number(row.total || 0),
  })) as MonthlyAggRow[];
};

const pushToYearMap = (yearMap: Map<number, number[]>, year: number, month: number, value: number) => {
  if (!yearMap.has(year)) yearMap.set(year, Array.from({ length: 12 }, () => 0));
  const bucket = yearMap.get(year)!;
  bucket[month - 1] += value;
};

const buildSectionReport = (
  def: SectionDef,
  yearMap: Map<number, number[]>,
  referenceYear: number,
  referenceMonth: number
): SectionReport => {
  const years = Array.from(yearMap.keys()).sort((a, b) => a - b);
  const rows: YearRow[] = years.map((year) => {
    const months = yearMap.get(year) || Array.from({ length: 12 }, () => 0);
    const total = months.reduce((acc, v) => acc + v, 0);
    const accumulatedRef = months.slice(0, referenceMonth).reduce((acc, v) => acc + v, 0);
    return {
      year,
      months: [...months],
      total,
      accumulatedRef,
      highlights: Array.from({ length: 12 }, () => false),
    };
  });

  const bestByMonth = Array.from({ length: 12 }, (_, idx) =>
    rows.reduce((max, row) => (row.months[idx] > max ? row.months[idx] : max), 0)
  );

  const EPS = 0.001;
  for (const row of rows) {
    row.highlights = row.months.map((value, idx) => bestByMonth[idx] > 0 && Math.abs(value - bestByMonth[idx]) <= EPS);
  }

  let referenceYearApplied: number | null = referenceYear;
  let referenceRow = rows.find((row) => row.year === referenceYear) || null;
  if (!referenceRow) {
    referenceRow = rows.length > 0 ? rows[rows.length - 1] : null;
    referenceYearApplied = referenceRow ? referenceRow.year : null;
  }

  const referenceAccumulated = referenceRow?.accumulatedRef || 0;
  const previousRows = rows.filter((row) => row.year < (referenceYearApplied || 0));
  const bestHistoricalAccumulated =
    previousRows.length > 0 ? Math.max(...previousRows.map((row) => row.accumulatedRef)) : 0;
  const previousYearAccumulated =
    rows.find((row) => row.year === (referenceYearApplied || 0) - 1)?.accumulatedRef || 0;

  return {
    key: def.key,
    label: def.label,
    referenceYearApplied,
    referenceAccumulated,
    bestHistoricalAccumulated,
    previousYearAccumulated,
    growthVsBest: growthPct(referenceAccumulated, bestHistoricalAccumulated),
    growthVsPreviousYear: growthPct(referenceAccumulated, previousYearAccumulated),
    rows,
  };
};

const buildReportPayload = (
  rows: MonthlyAggRow[],
  unitFilter: UnitKey,
  monthOverride: { year: number; month: number } | null
): ReportPayload => {
  const sectionMaps = new Map<UnitKey, Map<number, number[]>>();
  for (const def of ALL_UNITS) sectionMaps.set(def.key, new Map<number, number[]>());

  for (const row of rows) {
    if (!Number.isFinite(row.year) || !Number.isFinite(row.month) || row.month < 1 || row.month > 12) continue;
    pushToYearMap(sectionMaps.get('all')!, row.year, row.month, row.total);
    const mapped = mapUnitKey(row.unitRaw);
    if (mapped) {
      pushToYearMap(sectionMaps.get(mapped)!, row.year, row.month, row.total);
    }
  }

  const referenceSourceKey: UnitKey = unitFilter === 'all' ? 'all' : unitFilter;
  const referenceSourceMap = sectionMaps.get(referenceSourceKey) || new Map<number, number[]>();
  const detectedReference = detectReferencePeriod(referenceSourceMap);
  const referenceYear = monthOverride?.year || detectedReference.year;
  const referenceMonth = monthOverride?.month || detectedReference.month;

  const defs = unitFilter === 'all' ? ALL_UNITS : ALL_UNITS.filter((d) => d.key === unitFilter);
  const sections = defs.map((def) =>
    buildSectionReport(def, sectionMaps.get(def.key) || new Map<number, number[]>(), referenceYear, referenceMonth)
  );

  return {
    generatedAt: new Date().toISOString(),
    referenceMonthRef: `${referenceYear}-${String(referenceMonth).padStart(2, '0')}`,
    referenceYear,
    referenceMonth,
    referenceMonthLabel: MONTH_NAMES[referenceMonth - 1] || '-',
    unitFilter,
    availableUnits: ALL_UNITS,
    sections,
  };
};

const buildExcel = async (payload: ReportPayload) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Hub Consultare';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Faturamento Geral');
  const refLabel = `${MONTH_NAMES[payload.referenceMonth - 1]}/${payload.referenceYear}`;
  const accumLabel = `acumulado de Janeiro ate ${refLabel}`;

  const monthColumns = MONTH_SHORT.map((m) => ({ header: m, key: m, width: 16 }));
  sheet.columns = [{ header: 'Ano', key: 'ano', width: 10 }, ...monthColumns, { header: 'Total', key: 'total', width: 18 }];
  sheet.views = [{ state: 'frozen', ySplit: 4 }];

  sheet.mergeCells(1, 1, 1, 14);
  const title = sheet.getCell(1, 1);
  title.value = 'Faturamento Geral - Consultare';
  title.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLORS.navy.replace('#', '')}` } };
  title.alignment = { vertical: 'middle', horizontal: 'left' };

  sheet.mergeCells(2, 1, 2, 14);
  const meta = sheet.getCell(2, 1);
  meta.value = `Gerado em: ${formatDateTimeBr(payload.generatedAt)} | Referencia: ${refLabel}`;
  meta.font = { size: 11, color: { argb: `FF${COLORS.black.replace('#', '')}` } };
  meta.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F7FD' } };
  meta.alignment = { vertical: 'middle', horizontal: 'left' };

  sheet.mergeCells(3, 1, 3, 14);
  const note = sheet.getCell(3, 1);
  note.value = `Destaque verde: maior faturamento historico do mes (comparacao entre anos). Crescimento calculado no ${accumLabel}.`;
  note.font = { size: 10, color: { argb: `FF${COLORS.darkGreen.replace('#', '')}` } };
  note.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLORS.lightGreenBg.replace('#', '')}` } };
  note.alignment = { vertical: 'middle', horizontal: 'left' };

  let cursor = 5;
  for (const section of payload.sections) {
    if (cursor > 1) cursor += 1;

    sheet.mergeCells(cursor, 1, cursor, 14);
    const titleCell = sheet.getCell(cursor, 1);
    titleCell.value = `${section.label} | Referencia: ${refLabel}`;
    titleCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLORS.navy.replace('#', '')}` } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    cursor += 1;

    const headerRow = sheet.getRow(cursor);
    headerRow.values = ['Ano', ...MONTH_NAMES, 'Total'];
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLORS.blue.replace('#', '')}` } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    cursor += 1;

    for (const yearRow of section.rows) {
      const row = sheet.getRow(cursor);
      row.values = [yearRow.year, ...yearRow.months, yearRow.total];
      const zebra = cursor % 2 === 0;
      row.getCell(1).font = { bold: true, color: { argb: `FF${COLORS.navy.replace('#', '')}` } };
      row.getCell(1).alignment = { horizontal: 'center' };
      for (let idx = 0; idx < 12; idx += 1) {
        const cell = row.getCell(2 + idx);
        cell.numFmt = '"R$" #,##0.00';
        cell.alignment = { horizontal: 'right' };
        if (yearRow.highlights[idx]) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLORS.lightGreenBg.replace('#', '')}` } };
          cell.font = { bold: true, color: { argb: `FF${COLORS.darkGreen.replace('#', '')}` } };
        } else if (zebra) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FBFF' } };
        }
      }
      const totalCell = row.getCell(14);
      totalCell.numFmt = '"R$" #,##0.00';
      totalCell.font = { bold: true, color: { argb: `FF${COLORS.navy.replace('#', '')}` } };
      totalCell.alignment = { horizontal: 'right' };
      if (zebra) {
        row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FBFF' } };
        totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F5FF' } };
      }
      cursor += 1;
    }

    cursor += 1;
    sheet.getCell(cursor, 1).value = `Crescimento vs melhor ano (${accumLabel})`;
    sheet.getCell(cursor, 2).value = toPercent(section.growthVsBest);
    sheet.getCell(cursor, 1).font = { bold: true, color: { argb: `FF${COLORS.navy.replace('#', '')}` } };
    sheet.getCell(cursor, 2).font = { bold: true, color: { argb: `FF${COLORS.darkGreen.replace('#', '')}` } };
    cursor += 1;
    sheet.getCell(cursor, 1).value = `Crescimento vs ano anterior (${accumLabel})`;
    sheet.getCell(cursor, 2).value = toPercent(section.growthVsPreviousYear);
    sheet.getCell(cursor, 1).font = { bold: true, color: { argb: `FF${COLORS.navy.replace('#', '')}` } };
    sheet.getCell(cursor, 2).font = { bold: true, color: { argb: `FF${COLORS.teal.replace('#', '')}` } };
    cursor += 1;
  }

  sheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD7DFEA' } },
        left: { style: 'thin', color: { argb: 'FFD7DFEA' } },
        bottom: { style: 'thin', color: { argb: 'FFD7DFEA' } },
        right: { style: 'thin', color: { argb: 'FFD7DFEA' } },
      };
    });
  });

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
};

const hexToPdfRgb = (hex: string) => {
  const raw = hex.replace('#', '');
  const value = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const int = Number.parseInt(value, 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  return rgb(r, g, b);
};

const fitText = (text: string, font: PDFFont, size: number, maxWidth: number) => {
  const safe = String(text || '');
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
  let out = safe;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
};

const drawPdfCell = (
  page: PDFPage,
  pageHeight: number,
  x: number,
  yTop: number,
  width: number,
  height: number,
  text: string,
  regularFont: PDFFont,
  boldFont: PDFFont,
  opts: { bg?: string; color?: string; bold?: boolean; align?: 'left' | 'right' | 'center' } = {}
) => {
  const y = pageHeight - yTop - height;
  if (opts.bg) {
    page.drawRectangle({
      x,
      y,
      width,
      height,
      color: hexToPdfRgb(opts.bg),
      borderColor: hexToPdfRgb('#D7DFEA'),
      borderWidth: 0.4,
    });
  } else {
    page.drawRectangle({
      x,
      y,
      width,
      height,
      borderColor: hexToPdfRgb('#D7DFEA'),
      borderWidth: 0.4,
    });
  }

  const font = opts.bold ? boldFont : regularFont;
  const size = 8;
  const textSafe = fitText(String(text || ''), font, size, Math.max(width - 8, 2));
  const textWidth = font.widthOfTextAtSize(textSafe, size);
  const textColor = hexToPdfRgb(opts.color || COLORS.black);
  let textX = x + 4;
  if (opts.align === 'center') textX = x + (width - textWidth) / 2;
  if (opts.align === 'right') textX = x + width - textWidth - 4;
  const textY = y + (height - size) / 2 + 1;
  page.drawText(textSafe, {
    x: textX,
    y: textY,
    font,
    size,
    color: textColor,
  });
};

const buildPdf = async (payload: ReportPayload) => {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 1190.55;
  const pageHeight = 841.89;
  const margin = 24;
  const usableWidth = pageWidth - margin * 2;
  const yearCol = 54;
  const totalCol = 92;
  const monthCol = (usableWidth - yearCol - totalCol) / 12;
  const rowHeight = 18;
  const sectionTitleHeight = 18;
  const sectionSpacing = 10;
  const growthCompactHeight = 24;
  const tableHeaderHeight = rowHeight;
  const contentBottomLimit = pageHeight - margin;
  const refLabel = `${MONTH_NAMES[payload.referenceMonth - 1]}/${payload.referenceYear}`;
  const accumLabel = `acumulado de Janeiro ate ${refLabel}`;
  const generatedLabel = formatDateTimeBr(payload.generatedAt);
  const drawPageHeader = (page: PDFPage) => {
    page.drawRectangle({
      x: margin,
      y: pageHeight - margin - 42,
      width: usableWidth,
      height: 42,
      color: hexToPdfRgb(COLORS.navy),
    });

    page.drawText('Faturamento Geral', {
      x: margin + 10,
      y: pageHeight - 35 - 14,
      font: fontBold,
      size: 14,
      color: hexToPdfRgb('#FFFFFF'),
    });

    page.drawText(`Gerado em: ${generatedLabel} | Referencia: ${refLabel}`, {
      x: margin + 10,
      y: pageHeight - 49 - 8,
      font: fontRegular,
      size: 8,
      color: hexToPdfRgb('#FFFFFF'),
    });

    page.drawText(`Criterio de crescimento: ${accumLabel}.`, {
      x: margin + 10,
      y: pageHeight - 60 - 8,
      font: fontRegular,
      size: 8,
      color: hexToPdfRgb('#FFFFFF'),
    });

    page.drawText('Legenda: celulas verdes = maior faturamento historico daquele mes.', {
      x: margin,
      y: pageHeight - 76 - 8,
      font: fontBold,
      size: 8,
      color: hexToPdfRgb(COLORS.darkGreen),
    });
  };

  const estimateSectionHeight = (section: SectionReport) =>
    sectionTitleHeight + tableHeaderHeight + section.rows.length * rowHeight + growthCompactHeight + sectionSpacing;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  drawPageHeader(page);
  let cursorY = 90;

  for (const section of payload.sections) {
    const blockHeight = estimateSectionHeight(section);
    if (cursorY + blockHeight > contentBottomLimit) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      drawPageHeader(page);
      cursorY = 90;
    }

    page.drawRectangle({
      x: margin,
      y: pageHeight - cursorY - sectionTitleHeight,
      width: usableWidth,
      height: sectionTitleHeight,
      color: hexToPdfRgb(COLORS.navy),
    });
    page.drawText(section.label, {
      x: margin + 6,
      y: pageHeight - cursorY - 12,
      font: fontBold,
      size: 9,
      color: hexToPdfRgb('#FFFFFF'),
    });
    cursorY += sectionTitleHeight;

    let x = margin;
    drawPdfCell(page, pageHeight, x, cursorY, yearCol, tableHeaderHeight, 'Ano', fontRegular, fontBold, {
      bg: COLORS.blue,
      color: '#FFFFFF',
      bold: true,
    });
    x += yearCol;
    for (let m = 0; m < 12; m += 1) {
      drawPdfCell(page, pageHeight, x, cursorY, monthCol, tableHeaderHeight, MONTH_NAMES[m], fontRegular, fontBold, {
        bg: COLORS.blue,
        color: '#FFFFFF',
        bold: true,
      });
      x += monthCol;
    }
    drawPdfCell(page, pageHeight, x, cursorY, totalCol, tableHeaderHeight, 'Total', fontRegular, fontBold, {
      bg: COLORS.blue,
      color: '#FFFFFF',
      bold: true,
    });
    cursorY += tableHeaderHeight;

    for (let idxRow = 0; idxRow < section.rows.length; idxRow += 1) {
      const row = section.rows[idxRow];
      const zebra = idxRow % 2 === 1;
      x = margin;
      drawPdfCell(page, pageHeight, x, cursorY, yearCol, rowHeight, String(row.year), fontRegular, fontBold, {
        bold: true,
        color: COLORS.navy,
        bg: zebra ? '#F8FAFD' : undefined,
      });
      x += yearCol;
      for (let m = 0; m < 12; m += 1) {
        drawPdfCell(page, pageHeight, x, cursorY, monthCol, rowHeight, toMoney(row.months[m]), fontRegular, fontBold, {
          align: 'right',
          bold: row.highlights[m],
          color: row.highlights[m] ? COLORS.darkGreen : COLORS.black,
          bg: row.highlights[m] ? COLORS.lightGreenBg : zebra ? '#F8FAFD' : undefined,
        });
        x += monthCol;
      }
      drawPdfCell(page, pageHeight, x, cursorY, totalCol, rowHeight, toMoney(row.total), fontRegular, fontBold, {
        align: 'right',
        bold: true,
        color: COLORS.navy,
        bg: zebra ? '#EDF3FC' : COLORS.lightBlueBg,
      });
      cursorY += rowHeight;
    }

    const growthY = cursorY + 6;
    page.drawText(
      fitText(`Crescimento vs melhor ano (${accumLabel}): ${toPercent(section.growthVsBest)}`, fontBold, 8, usableWidth),
      {
        x: margin + 2,
        y: pageHeight - growthY - 8,
        font: fontBold,
        size: 8,
        color: hexToPdfRgb(COLORS.darkGreen),
      }
    );
    page.drawText(
      fitText(`Crescimento vs ano anterior (${accumLabel}): ${toPercent(section.growthVsPreviousYear)}`, fontBold, 8, usableWidth),
      {
        x: margin + 2,
        y: pageHeight - (growthY + 11) - 8,
        font: fontBold,
        size: 8,
        color: hexToPdfRgb(COLORS.teal),
      }
    );
    cursorY += growthCompactHeight + sectionSpacing;
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
};

export async function GET(request: Request) {
  try {
    const access = await ensureApiPermission('view');
    if (!access.allowed) {
      return NextResponse.json({ status: 'error', error: access.error }, { status: access.status });
    }

    const { searchParams } = new URL(request.url);
    const format = String(searchParams.get('format') || 'json').toLowerCase();
    const unitFilter = parseUnitFilter(searchParams.get('unit'));
    const monthOverride = parseOptionalMonthRef(searchParams.get('monthRef'));
    const rawRows = await loadMonthlyAgg();
    const payload = buildReportPayload(rawRows, unitFilter, monthOverride);

    if (format === 'xlsx') {
      const bytes = await buildExcel(payload);
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename=\"faturamento-geral-${payload.referenceMonthRef}-${unitFilter}.xlsx\"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (format === 'pdf') {
      const bytes = await buildPdf(payload);
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename=\"faturamento-geral-${payload.referenceMonthRef}-${unitFilter}.pdf\"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return NextResponse.json({
      status: 'success',
      data: payload,
    });
  } catch (error: any) {
    console.error('Erro API Financeiro Geral:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error?.message || 'Erro interno',
      },
      { status: 500 }
    );
  }
}
