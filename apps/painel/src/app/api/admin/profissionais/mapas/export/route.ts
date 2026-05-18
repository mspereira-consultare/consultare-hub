import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requireProfissionaisMapasPermission } from '@/lib/profissionais/auth';
import { getProfessionalAttendanceMap } from '@/lib/profissionais/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WEEKDAY_LABELS: Record<string, string> = {
  SEGUNDA: 'Segunda',
  TERCA: 'Terça',
  QUARTA: 'Quarta',
  QUINTA: 'Quinta',
  SEXTA: 'Sexta',
  SABADO: 'Sábado',
};

const RECURRENCE_BADGES: Record<string, string> = {
  SEMANAL: 'Sem.',
  QUINZENAL: 'Quinz.',
};

const SERVICE_UNIT_LABELS: Record<string, string> = {
  'OURO VERDE': 'Ouro Verde',
  'CENTRO CAMBUI': 'Centro Cambuí',
  'SHOPPING CAMPINAS': 'Shopping Campinas',
};

const toTitleCaseWord = (value: string) => {
  const raw = String(value || '').trim().toLocaleLowerCase('pt-BR');
  if (!raw) return '';
  return raw.charAt(0).toLocaleUpperCase('pt-BR') + raw.slice(1);
};

const formatProfessionalDisplayName = (value: string) => {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return '-';
  if (parts.length === 1) return toTitleCaseWord(parts[0]);
  return `${toTitleCaseWord(parts[0])} ${toTitleCaseWord(parts[parts.length - 1])}`;
};

const formatCellLines = (
  entries: Array<{ professionalName: string; recurrence: string }>
) => {
  if (entries.length === 0) return '-';
  return entries
    .map((entry) => `${formatProfessionalDisplayName(entry.professionalName)} - ${RECURRENCE_BADGES[entry.recurrence] || entry.recurrence}`)
    .join('\n');
};

const filterMapItems = (
  items: Awaited<ReturnType<typeof getProfessionalAttendanceMap>>,
  specialtyFilter: string,
  unitFilter: string
) =>
  items
    .filter((specialty) => specialtyFilter === 'all' || specialty.specialty === specialtyFilter)
    .map((specialty) => ({
      ...specialty,
      units: specialty.units.filter((unit) => unitFilter === 'all' || unit.serviceUnit === unitFilter),
    }))
    .filter((specialty) => specialty.units.length > 0);

const buildWorkbook = async (args: {
  items: Awaited<ReturnType<typeof getProfessionalAttendanceMap>>;
  specialtyFilter: string;
  unitFilter: string;
}) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hub Consultare';
  wb.created = new Date();

  const ws = wb.addWorksheet('Mapa Lista');
  ws.properties.defaultRowHeight = 28;
  ws.columns = [
    { width: 20 },
    { width: 34 },
    { width: 34 },
    { width: 3 },
    { width: 20 },
    { width: 34 },
    { width: 34 },
    { width: 3 },
    { width: 20 },
    { width: 34 },
    { width: 34 },
  ];

  const filtered = filterMapItems(args.items, args.specialtyFilter, args.unitFilter);
  let currentRow = 1;

  ws.mergeCells(currentRow, 1, currentRow, 11);
  ws.getCell(currentRow, 1).value = 'MAPA LISTA DE PROFISSIONAIS';
  ws.getCell(currentRow, 1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  ws.getCell(currentRow, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell(currentRow, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A1022' } };
  currentRow += 1;

  ws.mergeCells(currentRow, 1, currentRow, 11);
  ws.getCell(currentRow, 1).value = `Especialidade: ${args.specialtyFilter === 'all' ? 'Todas' : args.specialtyFilter} | Unidade: ${args.unitFilter === 'all' ? 'Todas' : SERVICE_UNIT_LABELS[args.unitFilter] || args.unitFilter}`;
  ws.getCell(currentRow, 1).font = { size: 10, color: { argb: 'FF64748B' } };
  currentRow += 2;

  for (const specialty of filtered) {
    ws.mergeCells(currentRow, 1, currentRow, 11);
    const titleCell = ws.getCell(currentRow, 1);
    titleCell.value = specialty.specialty;
    titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };
    currentRow += 2;

    const units = specialty.units;
    for (let groupIndex = 0; groupIndex < units.length; groupIndex += 3) {
      const group = units.slice(groupIndex, groupIndex + 3);
      const startColumns = [1, 5, 9];

      group.forEach((unit, index) => {
        const startColumn = startColumns[index];
        ws.mergeCells(currentRow, startColumn, currentRow, startColumn + 2);
        const unitTitleCell = ws.getCell(currentRow, startColumn);
        unitTitleCell.value = SERVICE_UNIT_LABELS[unit.serviceUnit] || unit.serviceUnit;
        unitTitleCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
        unitTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        unitTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

        const headerRow = currentRow + 1;
        const labels = ['Dia', 'Manhã', 'Tarde'];
        labels.forEach((label, labelIndex) => {
          const cell = ws.getCell(headerRow, startColumn + labelIndex);
          cell.value = label;
          cell.font = { bold: true, size: 11, color: { argb: 'FF475569' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          cell.alignment = { vertical: 'middle' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          };
        });

        unit.rows.forEach((row, rowIndex) => {
          const excelRow = headerRow + 1 + rowIndex;
          const rowRef = ws.getRow(excelRow);
          rowRef.height = 34;

          const dayCell = ws.getCell(excelRow, startColumn);
          dayCell.value = WEEKDAY_LABELS[row.weekday] || row.weekday;
          dayCell.font = { bold: true, size: 11, color: { argb: 'FF475569' } };
          dayCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
          dayCell.alignment = { vertical: 'middle' };

          const morningCell = ws.getCell(excelRow, startColumn + 1);
          morningCell.value = formatCellLines(row.morning);
          morningCell.alignment = { vertical: 'top', wrapText: true };
          morningCell.font = { size: 11, color: { argb: 'FF334155' } };

          const afternoonCell = ws.getCell(excelRow, startColumn + 2);
          afternoonCell.value = formatCellLines(row.afternoon);
          afternoonCell.alignment = { vertical: 'top', wrapText: true };
          afternoonCell.font = { size: 11, color: { argb: 'FF334155' } };

          [dayCell, morningCell, afternoonCell].forEach((cell) => {
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            };
          });
        });
      });

      currentRow += 10;
    }

    currentRow += 1;
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
};

export async function GET(request: Request) {
  try {
    const auth = await requireProfissionaisMapasPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const specialtyFilter = String(searchParams.get('specialty') || 'all').trim();
    const unitFilter = String(searchParams.get('unit') || 'all').trim().toUpperCase();

    const items = await getProfessionalAttendanceMap(auth.db);
    const xlsx = await buildWorkbook({
      items,
      specialtyFilter,
      unitFilter,
    });

    return new NextResponse(xlsx, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="profissionais-mapa-lista.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('Erro ao exportar mapa lista de profissionais:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao exportar mapa lista.' },
      { status: Number(error?.status) || 500 }
    );
  }
}
