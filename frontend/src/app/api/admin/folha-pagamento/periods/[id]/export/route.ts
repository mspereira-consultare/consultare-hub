import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { parsePayrollLineFilters } from '@/lib/payroll/filters';
import { buildPayrollExportData } from '@/lib/payroll/repository';

type ParamsContext = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const formatMoney = (value: number) => Number(value || 0);

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

    const folha = workbook.addWorksheet('Folha');
    folha.columns = [
      { header: 'Colaborador', key: 'employeeName', width: 32 },
      { header: 'CPF', key: 'employeeCpf', width: 16 },
      { header: 'Centro de custo', key: 'centerCost', width: 22 },
      { header: 'Contrato', key: 'contractType', width: 16 },
      { header: 'Salário base', key: 'salaryBase', width: 16 },
      { header: 'Insalubridade', key: 'insalubrityAmount', width: 16 },
      { header: 'Dias trabalhados', key: 'daysWorked', width: 16 },
      { header: 'Faltas', key: 'absencesCount', width: 10 },
      { header: 'Atrasos (min)', key: 'lateMinutes', width: 14 },
      { header: 'VT', key: 'vtProvisioned', width: 14 },
      { header: 'D.V.T.', key: 'vtDiscount', width: 14 },
      { header: 'Totalpass', key: 'totalpassDiscount', width: 14 },
      { header: 'Outros descontos', key: 'otherFixedDiscount', width: 18 },
      { header: 'Ajustes', key: 'adjustmentsAmount', width: 14 },
      { header: 'Proventos', key: 'totalProvents', width: 16 },
      { header: 'Descontos', key: 'totalDiscounts', width: 16 },
      { header: 'Líquido operacional', key: 'netOperational', width: 18 },
      { header: 'Status', key: 'lineStatus', width: 14 },
      { header: 'Comparação', key: 'comparisonStatus', width: 14 },
      { header: 'Observações da folha', key: 'payrollNotes', width: 28 },
    ];

    folha.addRow([`Folha operacional | Competência ${payload.period.monthRef} | Período ${payload.period.periodStart} a ${payload.period.periodEnd}`]);
    folha.mergeCells(`A1:T1`);
    folha.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
    folha.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };
    folha.addRow([]);
    folha.addRow(folha.columns.map((column) => column.header as string));
    folha.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    folha.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F274C' } };

    for (const line of payload.lines) {
      folha.addRow({
        employeeName: line.employeeName,
        employeeCpf: line.employeeCpf || '-',
        centerCost: line.centerCost || '-',
        contractType: line.contractType || '-',
        salaryBase: formatMoney(line.salaryBase),
        insalubrityAmount: formatMoney(line.insalubrityAmount),
        daysWorked: line.daysWorked,
        absencesCount: line.absencesCount,
        lateMinutes: line.lateMinutes,
        vtProvisioned: formatMoney(line.vtProvisioned),
        vtDiscount: formatMoney(line.vtDiscount),
        totalpassDiscount: formatMoney(line.totalpassDiscount),
        otherFixedDiscount: formatMoney(line.otherFixedDiscount),
        adjustmentsAmount: formatMoney(line.adjustmentsAmount),
        totalProvents: formatMoney(line.totalProvents),
        totalDiscounts: formatMoney(line.totalDiscounts),
        netOperational: formatMoney(line.netOperational),
        lineStatus: line.lineStatus,
        comparisonStatus: line.comparisonStatus,
        payrollNotes: line.payrollNotes || '-',
      });
    }

    for (let index = 4; index <= folha.rowCount; index += 1) {
      [5, 6, 10, 11, 12, 13, 14, 15, 16, 17].forEach((col) => {
        folha.getRow(index).getCell(col).numFmt = 'R$ #,##0.00';
      });
    }

    const memoria = workbook.addWorksheet('Memória de cálculo');
    memoria.columns = [
      { header: 'Colaborador', key: 'employeeName', width: 30 },
      { header: 'CPF', key: 'employeeCpf', width: 16 },
      { header: 'Memória', key: 'memory', width: 100 },
    ];
    memoria.addRow(['Colaborador', 'CPF', 'Memória']);
    memoria.getRow(1).font = { bold: true };
    for (const line of payload.lines) {
      memoria.addRow({ employeeName: line.employeeName, employeeCpf: line.employeeCpf || '-', memory: line.calculationMemoryJson || '{}' });
    }

    const divergencias = workbook.addWorksheet('Divergências');
    divergencias.columns = [
      { header: 'Colaborador', key: 'employeeName', width: 32 },
      { header: 'CPF', key: 'employeeCpf', width: 16 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Diferenças', key: 'differences', width: 80 },
    ];
    divergencias.addRow(['Colaborador', 'CPF', 'Status', 'Diferenças']);
    divergencias.getRow(1).font = { bold: true };
    for (const row of payload.comparisonRows) {
      divergencias.addRow({
        employeeName: row.employeeName,
        employeeCpf: row.employeeCpf || '-',
        status: row.status,
        differences: row.differences.map((item) => `${item.field}: sistema ${item.systemValue} | base ${item.referenceValue}`).join(' ; '),
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
