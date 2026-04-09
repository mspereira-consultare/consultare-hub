import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requireVigilanciaSanitariaPermission } from '@/lib/vigilancia_sanitaria/auth';
import { SURVEILLANCE_UNIT_LABELS } from '@/lib/vigilancia_sanitaria/constants';
import { getExpirationStatusLabel } from '@/lib/vigilancia_sanitaria/status';
import { listSurveillanceExportRows, normalizeSummaryFilters } from '@/lib/vigilancia_sanitaria/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const formatDate = (value?: string | null) => value || '-';

export async function GET(request: Request) {
  try {
    const auth = await requireVigilanciaSanitariaPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { searchParams } = new URL(request.url);
    const typeRaw = String(searchParams.get('type') || 'all').trim();
    const type = typeRaw === 'licenses' || typeRaw === 'documents' ? typeRaw : 'all';
    const filters = normalizeSummaryFilters(searchParams);
    const { filteredLicenses, filteredDocuments } = await listSurveillanceExportRows(auth.db, type, filters);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Hub Consultare';
    workbook.created = new Date();

    if (type !== 'documents') {
      const sheet = workbook.addWorksheet('Licenças');
      sheet.columns = [
        { header: 'Unidade', key: 'unit', width: 24 },
        { header: 'Licença', key: 'name', width: 36 },
        { header: 'CNAE', key: 'cnae', width: 18 },
        { header: 'Número/Protocolo', key: 'number', width: 22 },
        { header: 'Órgão emissor', key: 'issuer', width: 24 },
        { header: 'Validade', key: 'validUntil', width: 14 },
        { header: 'Status de vencimento', key: 'expirationStatus', width: 22 },
        { header: 'Status de renovação', key: 'renewalStatus', width: 22 },
        { header: 'Responsável', key: 'responsible', width: 24 },
        { header: 'Anexos', key: 'fileCount', width: 10 },
        { header: 'Observações', key: 'notes', width: 42 },
      ];
      sheet.addRows(filteredLicenses.map((item) => ({
        unit: SURVEILLANCE_UNIT_LABELS[item.unitName] || item.unitName,
        name: item.licenseName,
        cnae: item.cnae,
        number: item.licenseNumber || '-',
        issuer: item.issuer || '-',
        validUntil: formatDate(item.validUntil),
        expirationStatus: item.expirationStatusLabel,
        renewalStatus: item.renewalStatus,
        responsible: item.responsibleName || '-',
        fileCount: item.fileCount,
        notes: item.notes || '-',
      })));
      sheet.getRow(1).font = { bold: true };
    }

    if (type !== 'licenses') {
      const sheet = workbook.addWorksheet('Documentos');
      sheet.columns = [
        { header: 'Unidade', key: 'unit', width: 24 },
        { header: 'Documento', key: 'name', width: 36 },
        { header: 'Tipo', key: 'type', width: 18 },
        { header: 'Licença vinculada', key: 'license', width: 34 },
        { header: 'Validade', key: 'validUntil', width: 14 },
        { header: 'Status de vencimento', key: 'expirationStatus', width: 22 },
        { header: 'Responsável', key: 'responsible', width: 24 },
        { header: 'Anexos', key: 'fileCount', width: 10 },
        { header: 'Observações', key: 'notes', width: 42 },
      ];
      sheet.addRows(filteredDocuments.map((item) => ({
        unit: SURVEILLANCE_UNIT_LABELS[item.unitName] || item.unitName,
        name: item.documentName,
        type: item.documentType || '-',
        license: item.licenseName || '-',
        validUntil: formatDate(item.validUntil),
        expirationStatus: getExpirationStatusLabel(item.expirationStatus),
        responsible: item.responsibleName || '-',
        fileCount: item.fileCount,
        notes: item.notes || '-',
      })));
      sheet.getRow(1).font = { bold: true };
    }

    for (const sheet of workbook.worksheets) {
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const output = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
    return new NextResponse(output, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="vigilancia-sanitaria-${type}.xlsx"`,
      },
    });
  } catch (error: any) {
    console.error('Erro ao exportar Vigilância Sanitária:', error);
    return NextResponse.json({ error: error?.message || 'Erro ao exportar.' }, { status: Number(error?.status) || 500 });
  }
}
