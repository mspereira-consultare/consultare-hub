import 'server-only';

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { ParsedPointEmployee } from '@/lib/payroll/types';

const execFileAsync = promisify(execFile);

const clean = (value: unknown) => String(value ?? '').trim();
type PythonCommand = { command: string; prefixArgs: string[] };

const buildPythonCandidates = async (): Promise<PythonCommand[]> => {
  const candidates: PythonCommand[] = [];
  const seen = new Set<string>();

  const pushCandidate = async (command: string | null | undefined, prefixArgs: string[] = []) => {
    const cleaned = clean(command);
    if (!cleaned) return;

    const key = `${cleaned}::${prefixArgs.join(' ')}`;
    if (seen.has(key)) return;

    if (cleaned.includes(path.sep) || /^[a-zA-Z]:\\/.test(cleaned)) {
      try {
        await fs.access(cleaned);
      } catch {
        return;
      }
    }

    seen.add(key);
    candidates.push({ command: cleaned, prefixArgs });
  };

  await pushCandidate(process.env.PAYROLL_PYTHON_BIN);
  await pushCandidate(process.env.PYTHON_BIN);
  await pushCandidate(process.env.PYTHON);
  await pushCandidate('python');
  await pushCandidate('python3');

  if (process.platform === 'win32') {
    await pushCandidate('py', ['-3']);

    const localAppData = clean(process.env.LOCALAPPDATA);
    const windowsCandidates = [
      'C:\\Python314\\python.exe',
      'C:\\Python313\\python.exe',
      'C:\\Python312\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python310\\python.exe',
      localAppData ? `${localAppData}\\Programs\\Python\\Python314\\python.exe` : '',
      localAppData ? `${localAppData}\\Programs\\Python\\Python313\\python.exe` : '',
      localAppData ? `${localAppData}\\Programs\\Python\\Python312\\python.exe` : '',
      localAppData ? `${localAppData}\\Programs\\Python\\Python311\\python.exe` : '',
      localAppData ? `${localAppData}\\Programs\\Python\\Python310\\python.exe` : '',
    ];

    for (const candidate of windowsCandidates) {
      await pushCandidate(candidate);
    }
  }

  return candidates;
};

const runPythonParser = async (scriptPath: string, pdfPath: string) => {
  const candidates = await buildPythonCandidates();
  const attempts: string[] = [];

  for (const candidate of candidates) {
    try {
      return await execFileAsync(candidate.command, [...candidate.prefixArgs, scriptPath, pdfPath], {
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        attempts.push(candidate.command);
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    `Python não encontrado para processar o PDF da folha. Tentativas: ${attempts.join(', ') || 'nenhuma'}. Configure PAYROLL_PYTHON_BIN se necessário.`,
  );
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
    const { stdout, stderr } = await runPythonParser(scriptPath, pdfPath);

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
