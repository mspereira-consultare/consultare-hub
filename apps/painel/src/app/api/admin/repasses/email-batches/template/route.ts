import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requireRepassesPermission } from '@/lib/repasses/auth';
import { isRepassesModuleEnabledServer } from '@/lib/repasses/feature';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const columns = [
  { header: 'NOME_PROFISSIONAL', key: 'professionalName', width: 34 },
  { header: 'EMAIL', key: 'email', width: 32 },
  { header: 'VALOR', key: 'amount', width: 16 },
  { header: 'ANO_REFERENCIA', key: 'year', width: 18 },
  { header: 'MES_REFERENCIA', key: 'month', width: 18 },
  { header: 'ARQUIVO', key: 'fileName', width: 34 },
  { header: 'OBSERVACOES', key: 'observations', width: 34 },
  { header: 'DATA_LIMITE_NF', key: 'dueDateNf', width: 18 },
  { header: 'PROFESSIONAL_ID', key: 'professionalId', width: 26 },
  { header: 'CODIGO_ANEXO', key: 'attachmentCode', width: 22 },
] as const;

export async function GET() {
  try {
    if (!isRepassesModuleEnabledServer()) {
      return NextResponse.json({ error: 'Módulo de repasses desabilitado.' }, { status: 404 });
    }
    const auth = await requireRepassesPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Consultare Hub';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Envios fechamento');
    worksheet.columns = columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width,
    }));

    worksheet.addRow({
      professionalName: 'Nome do profissional',
      email: 'profissional@exemplo.com',
      amount: 1234.56,
      year: 2026,
      month: 5,
      fileName: 'nome-do-profissional.pdf',
      observations: 'Opcional',
      dueDateNf: '2026-06-10',
      professionalId: '',
      attachmentCode: 'nome-do-profissional',
    });

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF17407E' },
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    worksheet.getColumn('amount').numFmt = 'R$ #,##0.00';
    worksheet.getColumn('dueDateNf').numFmt = 'yyyy-mm-dd';

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="template-envios-fechamento.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    console.error('Erro ao gerar template de envios de repasse:', error);
    const status = Number((error as { status?: number }).status) || 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao gerar template de envios de repasse.',
      },
      { status }
    );
  }
}
