import 'server-only';

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { ParsedPointEmployee } from '@/lib/payroll/types';

const execFileAsync = promisify(execFile);

const clean = (value: unknown) => String(value ?? '').trim();

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
