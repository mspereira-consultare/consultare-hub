import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { parsePayrollLineFilters } from '@/lib/payroll/filters';
import { buildPayrollExportData } from '@/lib/payroll/repository';
import { formatMonthSheetName } from '@/app/(admin)/folha-pagamento/components/formatters';

type ParamsContext = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const setCurrency = (worksheet: ExcelJS.Worksheet, rowIndex: number, columns: number[]) => {
  for (const colIndex of columns) {
    worksheet.getRow(rowIndex).getCell(colIndex).numFmt = 'R$ #,##0.00';
  }
};

const setNumber = (worksheet: ExcelJS.Worksheet, rowIndex: number, columns: number[], format = '0.00') => {
  for (const colIndex of columns) {
    worksheet.getRow(rowIndex).getCell(colIndex).numFmt = format;
  }
};

const formatDateBr = (value: string) => {
  const [year, month, day] = String(value || '').split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

const formatHeaderMonth = (monthRef: string) => {
  const [year, month] = String(monthRef || '').split('-');
  const monthIndex = Number(month || 0) - 1;
  if (!year || monthIndex < 0) return String(monthRef || '').toUpperCase();
  const date = new Date(Date.UTC(Number(year), monthIndex, 1));
  return `${date.toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' }).toUpperCase()} ${year}`;
};

const formatHeaderMonthSlash = (monthRef: string) => {
  const [year, month] = String(monthRef || '').split('-');
  const monthIndex = Number(month || 0) - 1;
  if (!year || monthIndex < 0) return String(monthRef || '').toUpperCase();
  const date = new Date(Date.UTC(Number(year), monthIndex, 1));
  return `${date.toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' }).toUpperCase()}/${year}`;
};

const countBusinessDaysMondayToSaturday = (startDate: string, endDate: string) => {
  let total = 0;
  let cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor <= end) {
    if (cursor.getUTCDay() !== 0) total += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return total;
};

const calculateEasterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
};

const shiftUtcDate = (date: Date, days: number) => {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const listHolidaysInRange = (startDate: string, endDate: string) => {
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  const holidays: Array<{ date: string; label: string }> = [];

  for (let year = startYear; year <= endYear; year += 1) {
    const easter = calculateEasterSunday(year);
    const corpusChristi = shiftUtcDate(easter, 60);
    const fixed = [
      { date: `${year}-01-01`, label: 'Confraternização Universal' },
      { date: `${year}-04-21`, label: 'Tiradentes' },
      { date: `${year}-05-01`, label: 'Dia do Trabalho' },
      { date: `${year}-07-09`, label: 'Revolução Constitucionalista' },
      { date: `${year}-09-07`, label: 'Independência do Brasil' },
      { date: `${year}-10-12`, label: 'Nossa Senhora Aparecida' },
      { date: `${year}-11-02`, label: 'Finados' },
      { date: `${year}-11-15`, label: 'Proclamação da República' },
      { date: `${year}-11-20`, label: 'Consciência Negra' },
      { date: `${year}-12-25`, label: 'Natal' },
      { date: toIsoDate(corpusChristi), label: 'Corpus Christi' },
    ];

    for (const holiday of fixed) {
      if (holiday.date >= startDate && holiday.date <= endDate) holidays.push(holiday);
    }
  }

  return holidays.sort((left, right) => left.date.localeCompare(right.date));
};

const formatCurrencyHeader = (value: number) => {
  const normalized = Number(value || 0);
  return `R$${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: Number.isInteger(normalized) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(normalized)}`;
};

const resolveTransportVoucherBaseLabel = (rows: Array<{ vtPerDay: number | null }>) => {
  const uniqueValues = Array.from(new Set(rows.map((row) => row.vtPerDay).filter((value): value is number => value !== null && value > 0)));
  if (uniqueValues.length === 1) return `${formatCurrencyHeader(uniqueValues[0])}/dia`;
  return 'conforme cadastro do colaborador';
};

const buildHolidaySummaryLabel = (holidays: Array<{ date: string; label: string }>) => {
  if (!holidays.length) return '';
  const prefix = holidays.length === 1 ? ' | Feriado: ' : ' | Feriados: ';
  return `${prefix}${holidays.map((holiday) => `${formatDateBr(holiday.date)} (${holiday.label})`).join(', ')}`;
};

export async function GET(request: Request, context: ParamsContext) {
  try {
    const auth = await requirePayrollPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const payload = await buildPayrollExportData(auth.db, String(id || ''), parsePayrollLineFilters(searchParams));
    const companyName = String(process.env.PAYROLL_EXPORT_COMPANY_NAME || '').trim() || 'HUMANIZA SERVIÇOS ESPECIAIS LTDA';
    const headerMonth = formatHeaderMonth(payload.period.monthRef);
    const headerMonthSlash = formatHeaderMonthSlash(payload.period.monthRef);
    const periodLabel = `${formatDateBr(payload.period.periodStart)} a ${formatDateBr(payload.period.periodEnd)}`;
    const businessDays = countBusinessDaysMondayToSaturday(payload.period.periodStart, payload.period.periodEnd);
    const holidays = listHolidaysInRange(payload.period.periodStart, payload.period.periodEnd);
    const holidaysLabel = buildHolidaySummaryLabel(holidays);
    const vtBaseLabel = resolveTransportVoucherBaseLabel(payload.previewRows);
    const columnDefinitions = [
      { header: 'Nome Funcionário', key: 'employeeName', width: 27.5 },
      { header: 'E-mail', key: 'email', width: 29.5 },
      { header: 'CPF', key: 'employeeCpf', width: 17.5 },
      { header: 'Centro de Custo', key: 'centerCost', width: 15.5 },
      { header: 'Função', key: 'roleName', width: 22 },
      { header: 'Contrato', key: 'contractType', width: 11.2 },
      { header: 'Salário Base', key: 'salaryBase', width: 13 },
      { header: 'Insalubridade (%)', key: 'insalubrityValue', width: 10.9 },
      { header: 'VT a.d (R$)', key: 'vtPerDay', width: 10.8 },
      { header: `VT a.m (R$)\n${businessDays} dias`, key: 'vtMonth', width: 10.8 },
      { header: 'Faltas\n(dias)', key: 'absenceDays', width: 9.5 },
      { header: 'Outros Descontos\n(R$)', key: 'otherDiscountsExport', width: 10.5 },
      { header: 'Desc. Totalpass\n(R$)', key: 'totalpassDiscountExport', width: 27.5 },
      { header: 'Observação', key: 'observation', width: 30.5 },
    ] as const;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Hub Consultare';
    workbook.created = new Date();

    const mainSheet = workbook.addWorksheet(formatMonthSheetName(payload.period.monthRef));
    mainSheet.columns = columnDefinitions.map((column) => ({
      key: column.key,
      width: column.width,
    }));

    mainSheet.addRow([`FOLHA DE PAGAMENTO – ${headerMonth} | Período: ${periodLabel} | Empresa: ${companyName}`]);
    mainSheet.addRow([`Dias úteis (2ª-Sáb) em ${headerMonthSlash}: ${businessDays} dias${holidaysLabel} | VT base: ${vtBaseLabel}`]);
    mainSheet.mergeCells('A1:M1');
    mainSheet.mergeCells('A2:M2');
    mainSheet.getCell('A1').font = { bold: true, color: { argb: 'FF17407E' } };
    mainSheet.getCell('A1').alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    mainSheet.getCell('A2').font = { color: { argb: 'FF475569' } };
    mainSheet.getCell('A2').alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    mainSheet.getRow(1).height = 24;
    mainSheet.getRow(2).height = 22;

    mainSheet.addRow(columnDefinitions.map((column) => column.header));
    mainSheet.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    mainSheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };
    mainSheet.getRow(3).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    mainSheet.getColumn(14).alignment = { vertical: 'top', wrapText: true };

    for (const row of payload.previewRows) {
      mainSheet.addRow({
        employeeName: row.employeeName,
        email: row.email || '',
        employeeCpf: row.employeeCpf || '',
        centerCost: row.centerCost || '',
        roleName: row.roleName || '',
        contractType: row.contractType || '',
        salaryBase: row.salaryBase,
        insalubrityValue: row.insalubrityValue ?? null,
        vtPerDay: row.vtPerDay ?? null,
        vtMonth: row.vtMonth ?? null,
        absenceDays: row.absenceDays ?? null,
        otherDiscountsExport: row.otherDiscountsExport ?? null,
        totalpassDiscountExport: row.totalpassDiscountExport ?? null,
        observation: row.exportObservation || '',
      });
    }

    for (let rowIndex = 4; rowIndex <= mainSheet.rowCount; rowIndex += 1) {
      setCurrency(mainSheet, rowIndex, [7, 9, 10, 12, 13]);
      setNumber(mainSheet, rowIndex, [8]);
      setNumber(mainSheet, rowIndex, [11], '0');
      mainSheet.getRow(rowIndex).alignment = { vertical: 'top' };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const output = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);

    return new NextResponse(output, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="folha-pagamento-${payload.period.monthRef}.xlsx"`,
      },
    });
  } catch (error: any) {
    console.error('Erro ao exportar folha:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao exportar folha.' }, { status: Number(error?.status) || 500 });
  }
}
