import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { DbInterface } from '@/lib/db';
import {
  deleteRepassePdfArtifactsByIds,
  createRepassePdfArtifact,
  ensureRepasseTables,
  getRepasseProfessionalNote,
  getNextPendingRepassePdfJob,
  listRepasseConsolidatedLinesByProfessional,
  listRepassePdfArtifactsByPeriodProfessional,
  listRepassePdfTargetProfessionals,
  markRepassePdfJobFinished,
  markRepassePdfJobRunning,
  type RepasseConsolidatedLine,
  type RepassePdfJobRow,
} from '@/lib/repasses/repository';
import { getStorageProvider } from '@/lib/storage';

const nowIso = () => new Date().toISOString();

const toBrDate = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  return `${match[3]}/${match[2]}/${match[1]}`;
};

const toCurrency = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const slugify = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'profissional';

const splitText = (text: string, maxWidth: number, font: PDFFont, size: number): string[] => {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return ['-'];

  const words = normalized.split(' ');
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word;
  }

  if (line) lines.push(line);
  return lines;
};

type RenderPayload = {
  periodRef: string;
  professionalName: string;
  rows: RepasseConsolidatedLine[];
  note?: string | null;
};

const renderRepassePdf = async (payload: RenderPayload): Promise<Buffer> => {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const marginX = 24;
  const marginTop = 24;
  const marginBottom = 24;
  const tableHeaderHeight = 18;

  const columns = [
    { key: 'dataExec', label: 'Data Exec.', width: 70 },
    { key: 'paciente', label: 'Paciente', width: 170 },
    { key: 'descricao', label: 'Descrição', width: 200 },
    { key: 'funcao', label: 'Função', width: 90 },
    { key: 'convenio', label: 'Convênio', width: 120 },
    { key: 'repasseValue', label: 'Repasse', width: 90 },
  ] as const;

  let page!: PDFPage;
  let y = 0;
  let pageIndex = 0;

  const drawHeader = () => {
    page.drawRectangle({
      x: marginX,
      y: pageHeight - marginTop - 36,
      width: pageWidth - marginX * 2,
      height: 36,
      color: rgb(0.09, 0.25, 0.49),
    });

    page.drawText('Feegow - Repasses Consolidados', {
      x: marginX + 10,
      y: pageHeight - marginTop - 22,
      size: 12,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    page.drawText(`Profissional: ${payload.professionalName}`, {
      x: marginX + 10,
      y: pageHeight - marginTop - 44,
      size: 9,
      font: fontRegular,
      color: rgb(0.2, 0.2, 0.2),
    });

    page.drawText(`Periodo: ${payload.periodRef} | Gerado em: ${new Date().toLocaleString('pt-BR')}`, {
      x: marginX + 10,
      y: pageHeight - marginTop - 56,
      size: 8,
      font: fontRegular,
      color: rgb(0.35, 0.35, 0.35),
    });

    y = pageHeight - marginTop - 78;

    page.drawRectangle({
      x: marginX,
      y: y - tableHeaderHeight,
      width: pageWidth - marginX * 2,
      height: tableHeaderHeight,
      color: rgb(0.93, 0.95, 0.98),
    });

    let cursorX = marginX;
    for (const column of columns) {
      page.drawText(column.label, {
        x: cursorX + 4,
        y: y - 13,
        size: 8,
        font: fontBold,
        color: rgb(0.16, 0.26, 0.43),
      });
      cursorX += column.width;
    }

    y -= tableHeaderHeight + 2;
  };

  const createPage = () => {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    pageIndex += 1;
    drawHeader();
  };

  const drawRow = (row: RepasseConsolidatedLine) => {
    const cells = {
      dataExec: toBrDate(row.dataExec),
      paciente: row.paciente || '-',
      descricao: row.descricao || '-',
      funcao: row.funcao || '-',
      convenio: row.convenio || '-',
      repasseValue: toCurrency(row.repasseValue),
    };

    const lineMap: Record<string, string[]> = {};
    for (const column of columns) {
      const text = String((cells as any)[column.key] || '-');
      const maxWidth = column.width - 8;
      lineMap[column.key] = splitText(text, maxWidth, fontRegular, 8);
    }

    const maxLines = Math.max(...Object.values(lineMap).map((lines) => lines.length));
    const rowHeight = Math.max(16, maxLines * 10 + 4);

    if (y - rowHeight < marginBottom + 24) {
      createPage();
    }

    let cursorX = marginX;
    for (const column of columns) {
      const lines = lineMap[column.key];
      let lineY = y - 11;
      for (const line of lines) {
        page.drawText(line, {
          x: cursorX + 4,
          y: lineY,
          size: 8,
          font: column.key === 'repasseValue' ? fontBold : fontRegular,
          color: rgb(0.16, 0.16, 0.16),
        });
        lineY -= 10;
      }
      cursorX += column.width;
    }

    page.drawLine({
      start: { x: marginX, y: y - rowHeight },
      end: { x: pageWidth - marginX, y: y - rowHeight },
      thickness: 0.5,
      color: rgb(0.88, 0.9, 0.94),
    });

    y -= rowHeight;
  };

  createPage();

  for (const row of payload.rows) {
    drawRow(row);
  }

  const total = payload.rows.reduce((acc, item) => acc + Number(item.repasseValue || 0), 0);
  const totalText = `Total de repasses: ${toCurrency(total)}`;
  const sourceText = 'Fonte: https://franchising.feegow.com/v8.1/?P=RepassesConferidos&Pers=';
  const noteText = String(payload.note || '').trim();
  const noteLines = noteText
    ? splitText(`Observação: ${noteText}`, pageWidth - marginX * 2, fontRegular, 8)
    : [];

  const footerHeight = 26 + (noteLines.length ? noteLines.length * 10 + 6 : 0);
  if (y - footerHeight < marginBottom) {
    createPage();
  }

  page.drawText(totalText, {
    x: marginX,
    y: y - 14,
    size: 10,
    font: fontBold,
    color: rgb(0.05, 0.38, 0.34),
  });
  page.drawText(sourceText, {
    x: marginX,
    y: y - 28,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.32, 0.32, 0.32),
  });

  if (noteLines.length) {
    let noteY = y - 42;
    for (const line of noteLines) {
      page.drawText(line, {
        x: marginX,
        y: noteY,
        size: 8,
        font: fontRegular,
        color: rgb(0.22, 0.22, 0.22),
      });
      noteY -= 10;
    }
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
};

const updateRepassePdfServiceStatus = async (
  db: DbInterface,
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PARTIAL',
  details: string
) => {
  await db.execute(
    `
    INSERT INTO system_status (service_name, status, last_run, details)
    VALUES ('repasse_pdf', ?, datetime('now'), ?)
    ON CONFLICT(service_name) DO UPDATE SET
      status = excluded.status,
      last_run = excluded.last_run,
      details = excluded.details
    `,
    [status, details]
  );
};

export type RepassePdfProcessSummary = {
  processedJobs: number;
  generatedFiles: number;
  failedJobs: number;
  details: string[];
};

const defaultSummary = (): RepassePdfProcessSummary => ({
  processedJobs: 0,
  generatedFiles: 0,
  failedJobs: 0,
  details: [],
});

const jobFailure = async (db: DbInterface, job: RepassePdfJobRow, message: string) => {
  await markRepassePdfJobFinished(db, job.id, 'FAILED', message);
  await updateRepassePdfServiceStatus(db, 'FAILED', `job=${job.id} periodo=${job.periodRef} erro=${message}`);
};

export const processPendingRepassePdfJobs = async (
  db: DbInterface,
  options?: { maxJobs?: number }
): Promise<RepassePdfProcessSummary> => {
  await ensureRepasseTables(db);

  const maxJobs = Math.max(1, Math.min(20, Math.floor(Number(options?.maxJobs) || 1)));
  const summary = defaultSummary();

  for (let i = 0; i < maxJobs; i += 1) {
    const job = await getNextPendingRepassePdfJob(db);
    if (!job) break;

    summary.processedJobs += 1;
    await markRepassePdfJobRunning(db, job.id);
    await updateRepassePdfServiceStatus(db, 'RUNNING', `job=${job.id} periodo=${job.periodRef}`);

    try {
      const targets = await listRepassePdfTargetProfessionals(db, job);
      if (!targets.length) {
        await jobFailure(db, job, 'Nenhum profissional elegivel para geracao no periodo.');
        summary.failedJobs += 1;
        summary.details.push(`job ${job.id}: sem profissionais elegiveis`);
        continue;
      }

      const storage = getStorageProvider();
      const prefix = String(process.env.REPASSE_PDF_S3_PREFIX || 'repasses/pdfs/')
        .trim()
        .replace(/^\/+|\/+$/g, '');

      let generated = 0;
      let errors = 0;

      for (const target of targets) {
        try {
          const lines = await listRepasseConsolidatedLinesByProfessional(
            db,
            job.periodRef,
            target.professionalId
          );
          if (!lines.length) continue;

          const existingArtifacts = await listRepassePdfArtifactsByPeriodProfessional(db, {
            periodRef: job.periodRef,
            professionalId: target.professionalId,
          });
          if (existingArtifacts.length) {
            for (const artifact of existingArtifacts) {
              try {
                const provider = artifact.storageProvider
                  ? getStorageProvider()
                  : storage;
                await provider.deleteFile({
                  bucket: artifact.storageBucket,
                  key: artifact.storageKey,
                });
              } catch {
                // Mantemos o fluxo: o registro sera substituido mesmo se o delete fisico falhar.
              }
            }
            await deleteRepassePdfArtifactsByIds(
              db,
              existingArtifacts.map((artifact) => artifact.id)
            );
          }

          const note = await getRepasseProfessionalNote(db, {
            periodRef: job.periodRef,
            professionalId: target.professionalId,
          });

          const pdf = await renderRepassePdf({
            periodRef: job.periodRef,
            professionalName: target.professionalName,
            rows: lines,
            note,
          });

          const stamp = nowIso().replace(/[^0-9]/g, '').slice(0, 14);
          const fileBase = `repasse-${job.periodRef}-${slugify(target.professionalName)}-${stamp}`;
          const key = `${prefix}/${job.periodRef}/${fileBase}.pdf`;

          const uploaded = await storage.uploadFile({
            key,
            body: pdf,
            contentType: 'application/pdf',
            metadata: {
              period_ref: job.periodRef,
              professional_id: target.professionalId,
              job_id: job.id,
            },
          });

          await createRepassePdfArtifact(db, {
            pdfJobId: job.id,
            periodRef: job.periodRef,
            professionalId: target.professionalId,
            professionalName: target.professionalName,
            storageProvider: uploaded.provider,
            storageBucket: uploaded.bucket,
            storageKey: uploaded.key,
            fileName: `${fileBase}.pdf`,
            sizeBytes: pdf.byteLength,
          });

          generated += 1;
          summary.generatedFiles += 1;
        } catch (error: any) {
          errors += 1;
          summary.details.push(
            `job ${job.id}: falha em ${target.professionalName} - ${String(error?.message || error)}`
          );
        }
      }

      if (generated > 0 && errors === 0) {
        await markRepassePdfJobFinished(db, job.id, 'COMPLETED', null);
        await updateRepassePdfServiceStatus(
          db,
          'COMPLETED',
          `job=${job.id} periodo=${job.periodRef} arquivos=${generated}`
        );
        continue;
      }

      if (generated > 0 && errors > 0) {
        await markRepassePdfJobFinished(
          db,
          job.id,
          'PARTIAL',
          `Gerados ${generated} PDFs com ${errors} falhas.`
        );
        await updateRepassePdfServiceStatus(
          db,
          'PARTIAL',
          `job=${job.id} periodo=${job.periodRef} arquivos=${generated} erros=${errors}`
        );
        continue;
      }

      await jobFailure(db, job, 'Nenhum PDF gerado para o job (sem dados no periodo).');
      summary.failedJobs += 1;
    } catch (error: any) {
      const message = String(error?.message || error || 'Erro interno no processamento de PDF');
      await markRepassePdfJobFinished(db, job.id, 'FAILED', message);
      await updateRepassePdfServiceStatus(
        db,
        'FAILED',
        `job=${job.id} periodo=${job.periodRef} erro=${message}`
      );
      summary.failedJobs += 1;
      summary.details.push(`job ${job.id}: ${message}`);
    }
  }

  return summary;
};
