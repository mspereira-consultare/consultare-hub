import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { parsePayrollLineFilters } from '@/lib/payroll/filters';
import { buildPayrollExportData } from '@/lib/payroll/repository';
import { formatMonthSheetName, formatOperationalPeriodLabel } from '@/app/(admin)/folha-pagamento/components/formatters';

type ParamsContext = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const setCurrency = (worksheet: ExcelJS.Worksheet, rowIndex: number, columns: number[]) => {
  for (const colIndex of columns) {
    worksheet.getRow(rowIndex).getCell(colIndex).numFmt = 'R$ #,##0.00';
  }
};

export async function GET(request: Request, context: ParamsContext) {
  try {
    const auth = await requirePayrollPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const payload = await buildPayrollExportData(auth.db, String(id || ''), parsePayrollLineFilters(searchParams));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Hub Consultare';
    workbook.created = new Date();

    const mainSheet = workbook.addWorksheet(formatMonthSheetName(payload.period.monthRef));
    mainSheet.columns = [
      { header: 'Nome Funcionário', key: 'employeeName', width: 34 },
      { header: 'E-mail', key: 'email', width: 30 },
      { header: 'CPF', key: 'employeeCpf', width: 18 },
      { header: 'Centro de custo', key: 'centerCost', width: 20 },
      { header: 'Função', key: 'roleName', width: 32 },
      { header: 'Contrato', key: 'contractType', width: 16 },
      { header: 'Salário Base', key: 'salaryBase', width: 16 },
      { header: 'Insalubridade', key: 'insalubrityValue', width: 16 },
      { header: 'VT a.d', key: 'vtPerDay', width: 14 },
      { header: 'VT a.m', key: 'vtMonth', width: 14 },
      { header: 'D.V.T', key: 'vtDiscount', width: 14 },
      { header: 'Outros Descontos', key: 'otherDiscounts', width: 18 },
      { header: 'Desconto Totalpass', key: 'totalpassDiscount', width: 18 },
      { header: 'Observação', key: 'observation', width: 44 },
    ];

    mainSheet.addRow([formatOperationalPeriodLabel(payload.period.periodStart, payload.period.periodEnd)]);
    mainSheet.mergeCells('A1:N1');
    mainSheet.getCell('A1').font = { bold: true, color: { argb: 'FF17407E' } };
    mainSheet.getCell('A1').alignment = { horizontal: 'left' };

    mainSheet.addRow(mainSheet.columns.map((column) => column.header as string));
    mainSheet.getRow(2).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    mainSheet.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

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
        vtDiscount: row.vtDiscount ?? null,
        otherDiscounts: row.otherDiscounts ?? null,
        totalpassDiscount: row.totalpassDiscount ?? null,
        observation: row.observation || '',
      });
    }

    for (let rowIndex = 3; rowIndex <= mainSheet.rowCount; rowIndex += 1) {
      setCurrency(mainSheet, rowIndex, [7, 9, 10, 11, 12, 13]);
    }

    const memorySheet = workbook.addWorksheet('Memória de cálculo');
    memorySheet.columns = [
      { header: 'Colaborador', key: 'employeeName', width: 32 },
      { header: 'CPF', key: 'employeeCpf', width: 18 },
      { header: 'Memória', key: 'memory', width: 100 },
    ];
    memorySheet.addRow(['Colaborador', 'CPF', 'Memória']);
    memorySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    memorySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F274C' } };

    for (const line of payload.lines) {
      memorySheet.addRow({
        employeeName: line.employeeName,
        employeeCpf: line.employeeCpf || '-',
        memory: line.calculationMemoryJson || '{}',
      });
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
