import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import {
  listProposalExportRows,
  normalizeProposalDetailFilters,
  normalizeProposalFilters,
} from '@/lib/proposals/repository';
import { requirePropostasPermission } from '@/lib/proposals/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

export async function GET(request: Request) {
  try {
    const auth = await requirePropostasPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const baseFilters = normalizeProposalFilters(searchParams);
    const filters = normalizeProposalDetailFilters(searchParams, baseFilters);
    const result = await listProposalExportRows(filters, auth.db);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Hub Consultare';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Base de trabalho');
    worksheet.columns = [
      { header: 'Data', key: 'proposalDate', width: 14 },
      { header: 'Paciente', key: 'patientName', width: 34 },
      { header: 'Telefone', key: 'patientPhone', width: 18 },
      { header: 'E-mail', key: 'patientEmail', width: 28 },
      { header: 'Procedimento(s)', key: 'procedureSummary', width: 64 },
      { header: 'Unidade', key: 'unitName', width: 24 },
      { header: 'Profissional', key: 'professionalName', width: 30 },
      { header: 'Status da proposta', key: 'status', width: 28 },
      { header: 'Convers\u00e3o', key: 'conversionStatus', width: 18 },
      { header: 'Motivo', key: 'conversionReason', width: 24 },
      { header: 'Respons\u00e1vel', key: 'responsibleUserName', width: 24 },
      { header: 'Valor', key: 'totalValue', width: 16 },
      { header: '\u00daltima edi\u00e7\u00e3o por', key: 'updatedByUserName', width: 22 },
      { header: '\u00daltima edi\u00e7\u00e3o em', key: 'updatedAt', width: 22 },
      { header: '\u00daltima atualiza\u00e7\u00e3o da proposta', key: 'proposalLastUpdate', width: 26 },
      { header: 'ID da proposta', key: 'proposalId', width: 16 },
    ];

    worksheet.mergeCells('A1:P1');
    worksheet.getCell('A1').value = 'Propostas - base de trabalho';
    worksheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

    worksheet.mergeCells('A2:P2');
    worksheet.getCell('A2').value = `Per\u00edodo: ${filters.startDate} at\u00e9 ${filters.endDate} | Unidade: ${filters.unit === 'all' ? 'Todas as unidades' : filters.unit} | Status detalhado: ${result.detailStatusApplied}`;
    worksheet.getCell('A2').font = { size: 10 };

    worksheet.mergeCells('A3:P3');
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
        row.proceduresDetailedText || row.procedureSummary || '-',
        row.unitName,
        row.professionalName,
        row.status,
        row.conversionStatusLabel,
        row.conversionReasonLabel || '-',
        row.responsibleUserName || 'N\u00e3o atribu\u00eddo',
        row.totalValue,
        row.updatedByUserName || '-',
        row.updatedAt ? formatDateTime(row.updatedAt) : '-',
        row.proposalLastUpdate ? formatDateTime(row.proposalLastUpdate) : '-',
        row.proposalId,
      ];
      excelRow.getCell(12).numFmt = 'R$ #,##0.00';
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
