import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import {
  listProposalExportRows,
  normalizeProposalDetailFilters,
  normalizeProposalFilters,
} from '@/lib/proposals/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const formatCurrency = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const baseFilters = normalizeProposalFilters(searchParams);
    const filters = normalizeProposalDetailFilters(searchParams, baseFilters);
    const result = await listProposalExportRows(filters);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Hub Consultare';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Base detalhada');
    worksheet.columns = [
      { header: 'Data', key: 'proposalDate', width: 14 },
      { header: 'Paciente', key: 'patientName', width: 34 },
      { header: 'Telefone', key: 'patientPhone', width: 18 },
      { header: 'E-mail', key: 'patientEmail', width: 28 },
      { header: 'Procedimento(s)', key: 'procedureSummary', width: 60 },
      { header: 'Unidade', key: 'unitName', width: 24 },
      { header: 'Profissional', key: 'professionalName', width: 30 },
      { header: 'Status', key: 'status', width: 28 },
      { header: 'Valor', key: 'totalValue', width: 16 },
      { header: 'Última atualização', key: 'proposalLastUpdate', width: 22 },
      { header: 'ID da proposta', key: 'proposalId', width: 16 },
    ];

    worksheet.mergeCells('A1:K1');
    worksheet.getCell('A1').value = 'Propostas — base detalhada';
    worksheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

    worksheet.mergeCells('A2:K2');
    worksheet.getCell('A2').value = `Período: ${filters.startDate} até ${filters.endDate} | Unidade: ${filters.unit === 'all' ? 'Todas as unidades' : filters.unit} | Status detalhado: ${result.detailStatusApplied}`;
    worksheet.getCell('A2').font = { size: 10 };

    worksheet.mergeCells('A3:K3');
    worksheet.getCell('A3').value = `Gerado em: ${formatDateTime(new Date().toISOString())}`;
    worksheet.getCell('A3').font = { size: 10 };

    const headerRow = worksheet.getRow(5);
    headerRow.values = worksheet.columns.map((column) => column.header as string);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

    let rowIndex = 6;
    for (const row of result.rows) {
      const excelRow = worksheet.getRow(rowIndex);
      excelRow.values = [
        row.proposalDate,
        row.patientName,
        row.patientPhone,
        row.patientEmail || '-',
        row.procedureSummary || '-',
        row.unitName,
        row.professionalName,
        row.status,
        row.totalValue,
        row.proposalLastUpdate || '-',
        row.proposalId,
      ];
      excelRow.getCell(9).numFmt = 'R$ #,##0.00';
      rowIndex += 1;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const output = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);

    return new NextResponse(output, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="propostas-detalhadas-${filters.startDate}_${filters.endDate}.xlsx"`,
      },
    });
  } catch (error: any) {
    console.error('Erro ao exportar base detalhada de propostas:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao exportar a base detalhada.' },
      { status: Number(error?.status) || 500 },
    );
  }
}
