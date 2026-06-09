import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requireRepassesPermission } from '@/lib/repasses/auth';
import { isRepassesModuleEnabledServer } from '@/lib/repasses/feature';
import {
  prepareRepasseEmailBatch,
  RepasseValidationError,
} from '@/lib/repasses/repository';
import type { RepasseEmailBatchPrepareRow } from '@/lib/repasses/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const clean = (value: unknown) => String(value ?? '').trim();

const normalizeHeader = (value: unknown) =>
  clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const excelSerialToDate = (value: number) => {
  const millis = Math.round((value - 25569) * 86400 * 1000);
  return new Date(millis).toISOString().slice(0, 10);
};

type ExcelCellObject = {
  richText?: Array<{ text?: string }>;
  text?: string;
  result?: unknown;
};

const cellText = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    if (value > 20000 && value < 90000) return excelSerialToDate(value);
    return String(value);
  }
  if (value && typeof value === 'object') {
    const cellObject = value as ExcelCellObject;
    const richText = cellObject.richText;
    if (Array.isArray(richText)) return richText.map((part) => clean(part?.text)).join('');
    if (cellObject.text) return clean(cellObject.text);
    if (cellObject.result !== undefined) return cellText(cellObject.result);
  }
  return clean(value);
};

const readRowValue = (row: Record<string, string>, keys: string[]) => {
  for (const key of keys) {
    const value = clean(row[key]);
    if (value) return value;
  }
  return '';
};

const parseWorkbookRows = async (file: File): Promise<RepasseEmailBatchPrepareRow[]> => {
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = await file.arrayBuffer();
  await workbook.xlsx.load(arrayBuffer as Parameters<typeof workbook.xlsx.load>[0]);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new RepasseValidationError('A planilha enviada nao possui abas.');

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = normalizeHeader(cell.value);
  });

  const rows: RepasseEmailBatchPrepareRow[] = [];
  worksheet.eachRow({ includeEmpty: false }, (sheetRow, rowNumber) => {
    if (rowNumber === 1) return;
    const raw: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      raw[header] = cellText(sheetRow.getCell(index + 1).value);
    });
    const professionalName = readRowValue(raw, ['nome_profissional', 'professional_name', 'profissional', 'nome']);
    const recipientEmail = readRowValue(raw, ['email', 'recipient_email', 'e_mail', 'email_profissional']);
    const amountValue = readRowValue(raw, ['valor', 'amount_value', 'valor_final', 'repasse', 'valor_repasse']);
    const arquivo = readRowValue(raw, ['arquivo', 'file_name', 'filename', 'nome_arquivo', 'pdf']);
    const row: RepasseEmailBatchPrepareRow = {
      professionalId: readRowValue(raw, ['professional_id', 'id_profissional', 'profissional_id']),
      professionalName,
      recipientEmail,
      amountValue,
      dueDateNf: readRowValue(raw, ['data_limite_nf', 'due_date_nf', 'prazo_nf']),
      fileName: arquivo,
      arquivo,
      attachmentCode: readRowValue(raw, ['codigo_anexo', 'attachment_code', 'cod_anexo']),
      observations: readRowValue(raw, ['observacoes', 'observacao', 'notes']),
      statusEnvio: readRowValue(raw, ['status_envio', 'status']),
      dataEnvio: readRowValue(raw, ['data_envio', 'sent_at']),
      anoReferencia: readRowValue(raw, ['ano_referencia', 'ano']),
      mesReferencia: readRowValue(raw, ['mes_referencia', 'mes', 'competencia']),
    };
    if (professionalName || recipientEmail || amountValue || arquivo) rows.push(row);
  });

  if (!rows.length) throw new RepasseValidationError('Nenhuma linha de destinatario encontrada na planilha.');
  return rows;
};

export async function POST(request: Request) {
  try {
    if (!isRepassesModuleEnabledServer()) {
      return NextResponse.json({ error: 'Modulo de repasses desabilitado.' }, { status: 404 });
    }
    const auth = await requireRepassesPermission('refresh');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Envie uma planilha .xlsx para preparar o lote.' }, { status: 400 });
    }
    if (!String(file.name || '').toLowerCase().endsWith('.xlsx')) {
      return NextResponse.json({ error: 'Formato invalido. Envie um arquivo .xlsx.' }, { status: 400 });
    }

    const rows = await parseWorkbookRows(file);
    const dueDateNf = clean(formData.get('dueDateNf')) || clean(rows.find((row) => row.dueDateNf)?.dueDateNf);
    const data = await prepareRepasseEmailBatch(
      auth.db,
      {
        periodRef: clean(formData.get('periodRef')),
        dueDateNf,
        rows,
      },
      auth.userId
    );

    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao preparar lote de e-mail de repasse:', error);
    const status =
      error instanceof RepasseValidationError
        ? error.status
        : Number((error as { status?: number }).status) || 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao preparar lote de e-mail de repasse.',
      },
      { status }
    );
  }
}
