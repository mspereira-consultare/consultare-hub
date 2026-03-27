import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { EQUIPMENT_UNIT_LABELS } from '@/lib/equipamentos/constants';
import { requireEquipamentosPermission } from '@/lib/equipamentos/auth';
import { listEquipmentExportRows, normalizeEquipmentFilters } from '@/lib/equipamentos/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const formatDate = (value?: string | null) => value || '-';

export async function GET(request: Request) {
  try {
    const auth = await requireEquipamentosPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const filters = normalizeEquipmentFilters(searchParams);
    const rows = await listEquipmentExportRows(auth.db, filters);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Hub Consultare';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Equipamentos');
    worksheet.columns = [
      { header: 'Unidade', key: 'unitName', width: 24 },
      { header: 'Descrição', key: 'description', width: 36 },
      { header: 'Identificação', key: 'identificationNumber', width: 22 },
      { header: 'Categoria', key: 'category', width: 20 },
      { header: 'Localização', key: 'locationDetail', width: 24 },
      { header: 'Status operacional', key: 'operationalStatus', width: 20 },
      { header: 'Status de calibração', key: 'calibrationStatusLabel', width: 22 },
      { header: 'Última calibração', key: 'lastCalibrationDate', width: 18 },
      { header: 'Próxima calibração', key: 'nextCalibrationDate', width: 18 },
      { header: 'Responsável pela calibração', key: 'calibrationResponsible', width: 28 },
      { header: 'Observações', key: 'notes', width: 42 },
    ];

    worksheet.mergeCells('A1:K1');
    worksheet.getCell('A1').value = 'Equipamentos da clínica';
    worksheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

    worksheet.mergeCells('A2:K2');
    worksheet.getCell('A2').value = `Unidade: ${filters.unit === 'all' ? 'Todas as unidades' : filters.unit} | Status operacional: ${filters.operationalStatus === 'all' ? 'Todos' : filters.operationalStatus} | Status de calibração: ${filters.calibrationStatus === 'all' ? 'Todos' : filters.calibrationStatus}`;
    worksheet.getCell('A2').font = { size: 10 };

    const headerRow = worksheet.getRow(4);
    headerRow.values = worksheet.columns.map((column) => column.header as string);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

    let rowIndex = 5;
    for (const row of rows) {
      worksheet.getRow(rowIndex).values = [
        EQUIPMENT_UNIT_LABELS[row.unitName] || row.unitName,
        row.description,
        row.identificationNumber,
        row.category || '-',
        row.locationDetail || '-',
        row.operationalStatus,
        row.calibrationStatusLabel,
        formatDate(row.lastCalibrationDate),
        formatDate(row.nextCalibrationDate),
        row.calibrationResponsible || '-',
        row.notes || '-',
      ];
      rowIndex += 1;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const output = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);

    return new NextResponse(output, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="equipamentos-clinica.xlsx"',
      },
    });
  } catch (error: any) {
    console.error('Erro ao exportar equipamentos:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao exportar equipamentos.' },
      { status: Number(error?.status) || 500 },
    );
  }
}
