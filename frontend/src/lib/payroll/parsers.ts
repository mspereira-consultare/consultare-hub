import 'server-only';

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ExcelJS from 'exceljs';
import type { ParsedPointEmployee, ParsedReferenceRow } from '@/lib/payroll/types';

const execFileAsync = promisify(execFile);

const clean = (value: unknown) => String(value ?? '').trim();

const normalizeSearch = (value: unknown) =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

const normalizeCpf = (value: unknown) => {
  const digits = clean(value).replace(/\D/g, '');
  return digits ? digits.padStart(11, '0') : null;
};

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = clean(value);
  if (!raw) return null;
  const normalized = raw
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeHeader = (value: unknown) =>
  normalizeSearch(value)
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

const buildComparisonKey = (name: string, cpf: string | null) => cpf || normalizeSearch(name);

const readCell = (row: ExcelJS.Row, index: number) => {
  const cell = row.getCell(index).value;
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'object' && 'text' in cell) return String((cell as any).text || '').trim();
  if (typeof cell === 'object' && 'result' in cell) return clean((cell as any).result);
  return clean(cell as any);
};

export const sanitizeStoragePart = (value: string) =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

export async function parsePointPdfBuffer(buffer: Buffer | Uint8Array): Promise<ParsedPointEmployee[]> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-payroll-point-'));
  const pdfPath = path.join(tempDir, 'point.pdf');
  try {
    await fs.writeFile(pdfPath, buffer);
    const scriptPath = path.resolve(process.cwd(), 'scripts/payroll_parse_point_pdf.py');
    const { stdout, stderr } = await execFileAsync('python', [scriptPath, pdfPath], {
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
    });

    const payload = JSON.parse(String(stdout || '{}'));
    const employees = Array.isArray(payload?.employees) ? payload.employees : [];
    if (stderr && String(stderr).trim()) {
      console.warn('Avisos do parser PDF da folha:', String(stderr));
    }
    return employees as ParsedPointEmployee[];
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function parseReferenceWorkbookBuffer(buffer: Buffer | Uint8Array): Promise<ParsedReferenceRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(buffer) as any);
  const rows: ParsedReferenceRow[] = [];

  for (const worksheet of workbook.worksheets) {
    let headerRowNumber = -1;
    let headers: string[] = [];

    worksheet.eachRow((row, rowNumber) => {
      if (headerRowNumber > 0) return;
      const values = Array.from({ length: row.cellCount }, (_, index) => readCell(row, index + 1));
      const normalized = values.map(normalizeHeader);
      if (normalized.includes('nome_funcionario')) {
        headerRowNumber = rowNumber;
        headers = normalized;
      }
    });

    if (headerRowNumber <= 0 || headers.length === 0) continue;

    for (let rowNumber = headerRowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const values = Array.from({ length: headers.length }, (_, index) => readCell(row, index + 1));
      if (!values.some((value) => value)) continue;

      const data = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
      const employeeName = clean(data.nome_funcionario || data.nome || '');
      if (!employeeName) continue;

      const employeeCpf = normalizeCpf(data.cpf);
      rows.push({
        employeeName,
        employeeCpf,
        centerCost: clean(data.centro_de_custo || data.centro_custo) || null,
        roleName: clean(data.funcao || data.funcao_cargo) || null,
        contractType: clean(data.contrato) || null,
        salaryBase: toNumber(data.salario_base),
        insalubrityPercent: toNumber(data.insalubridade),
        vtDay: toNumber(data.vt_a_d || data.vt_ad),
        vtMonth: toNumber(data.vt_a_m || data.vt_am),
        vtDiscount: toNumber(data.d_v_t || data.desconto_vt || data.dvt),
        otherDiscounts: toNumber(data.outros_descontos),
        totalpassDiscount: toNumber(data.desconto_totalpass),
        notes: clean(data.observacao || data.observacoes) || null,
        rawJson: JSON.stringify(data),
        comparisonKey: buildComparisonKey(employeeName, employeeCpf),
      });
    }
  }

  return rows;
}
