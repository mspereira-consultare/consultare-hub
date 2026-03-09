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

const splitTextPreserveLineBreaks = (
  text: string,
  maxWidth: number,
  font: PDFFont,
  size: number
): string[] => {
  const rawLines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];

  for (const raw of rawLines) {
    const line = raw.replace(/\t/g, '    ').replace(/\s+$/g, '');
    if (!line.trim()) {
      out.push('');
      continue;
    }
    const wrapped = splitText(line, maxWidth, font, size);
    if (!wrapped.length) out.push('');
    else out.push(...wrapped);
  }

  return out.length ? out : [''];
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

  const pageWidth = 595.28; // A4 portrait
  const pageHeight = 841.89;
  const marginX = 24;
  const marginTop = 24;
  const marginBottom = 24;
  const tableHeaderHeight = 18;
  const generatedAt = new Date().toLocaleString('pt-BR');
  const sourceText = 'Fonte: https://franchising.feegow.com/v8.1/?P=RepassesConferidos&Pers=';

  const columns = [
    { key: 'dataExec', label: 'Data Exec.', width: 62 },
    { key: 'paciente', label: 'Paciente', width: 112 },
    { key: 'descricao', label: 'Descrição', width: 148 },
    { key: 'funcao', label: 'Função', width: 74 },
    { key: 'convenio', label: 'Convênio', width: 86 },
    { key: 'repasseValue', label: 'Repasse', width: 65 },
  ] as const;

  const tableWidth = columns.reduce((acc, c) => acc + c.width, 0);
  const tableLeft = marginX;
  const contentBottom = marginBottom + 20;
  const totalValue = payload.rows.reduce((acc, item) => acc + Number(item.repasseValue || 0), 0);
  let page!: PDFPage;
  let y = 0;

  const drawMainHeader = () => {
    const top = pageHeight - marginTop;
    const headerHeight = 46;
    const cardsGap = 8;
    const cardHeight = 34;
    const cardTop = top - headerHeight - 8;
    const cardWidth = (tableWidth - cardsGap * 2) / 3;

    page.drawRectangle({
      x: tableLeft,
      y: top - headerHeight,
      width: tableWidth,
      height: headerHeight,
      color: rgb(0.09, 0.25, 0.49),
    });

    page.drawText('Feegow - Repasses Consolidados', {
      x: tableLeft + 10,
      y: top - 18,
      size: 12,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    page.drawText(`Profissional: ${payload.professionalName}`, {
      x: tableLeft + 10,
      y: top - 33,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.94, 0.96, 1),
    });

    const drawInfoCard = (x: number, title: string, value: string) => {
      page.drawRectangle({
        x,
        y: cardTop - cardHeight,
        width: cardWidth,
        height: cardHeight,
        color: rgb(0.95, 0.97, 1),
        borderColor: rgb(0.82, 0.88, 0.96),
        borderWidth: 1,
      });
      page.drawText(title, {
        x: x + 6,
        y: cardTop - 11,
        size: 7,
        font: fontBold,
        color: rgb(0.24, 0.33, 0.49),
      });
      page.drawText(value, {
        x: x + 6,
        y: cardTop - 24,
        size: 8.5,
        font: fontRegular,
        color: rgb(0.17, 0.22, 0.31),
      });
    };

    drawInfoCard(tableLeft, 'PERÍODO', payload.periodRef);
    drawInfoCard(tableLeft + cardWidth + cardsGap, 'GERADO EM', generatedAt);
    drawInfoCard(
      tableLeft + (cardWidth + cardsGap) * 2,
      'TOTAL DE REPASSE',
      toCurrency(totalValue)
    );

    y = cardTop - cardHeight - 10;
  };

  const drawTableHeader = () => {
    page.drawRectangle({
      x: tableLeft,
      y: y - tableHeaderHeight,
      width: tableWidth,
      height: tableHeaderHeight,
      color: rgb(0.90, 0.94, 0.99),
      borderColor: rgb(0.78, 0.86, 0.97),
      borderWidth: 1,
    });

    let cursorX = tableLeft;
    for (const column of columns) {
      page.drawText(column.label, {
        x: cursorX + 3,
        y: y - 12.5,
        size: 7.5,
        font: fontBold,
        color: rgb(0.14, 0.23, 0.39),
      });
      cursorX += column.width;
      page.drawLine({
        start: { x: cursorX, y: y - tableHeaderHeight },
        end: { x: cursorX, y: y },
        thickness: 0.5,
        color: rgb(0.80, 0.87, 0.96),
      });
    }

    y -= tableHeaderHeight + 2;
  };

  const createPage = (withMainHeader: boolean) => {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    y = pageHeight - marginTop;
    if (withMainHeader) {
      drawMainHeader();
    }
    drawTableHeader();
  };

  const drawRow = (row: RepasseConsolidatedLine, rowIndex: number) => {
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
    const rowHeight = Math.max(16, maxLines * 9 + 5);

    if (y - rowHeight < contentBottom) {
      createPage(false);
    }

    if (rowIndex % 2 === 0) {
      page.drawRectangle({
        x: tableLeft,
        y: y - rowHeight,
        width: tableWidth,
        height: rowHeight,
        color: rgb(0.985, 0.988, 0.995),
      });
    }

    let cursorX = tableLeft;
    for (const column of columns) {
      const lines = lineMap[column.key];
      let lineY = y - 10.5;
      const isValueCol = column.key === 'repasseValue';
      for (const line of lines) {
        const textWidth = fontRegular.widthOfTextAtSize(line, 8);
        const textX = isValueCol ? cursorX + column.width - 4 - textWidth : cursorX + 3;
        page.drawText(line, {
          x: textX,
          y: lineY,
          size: 8,
          font: isValueCol ? fontBold : fontRegular,
          color: rgb(0.16, 0.16, 0.16),
        });
        lineY -= 9;
      }
      cursorX += column.width;
      page.drawLine({
        start: { x: cursorX, y: y - rowHeight },
        end: { x: cursorX, y },
        thickness: 0.4,
        color: rgb(0.90, 0.92, 0.95),
      });
    }

    page.drawLine({
      start: { x: tableLeft, y: y - rowHeight },
      end: { x: tableLeft + tableWidth, y: y - rowHeight },
      thickness: 0.5,
      color: rgb(0.88, 0.9, 0.94),
    });

    y -= rowHeight;
  };

  createPage(true);

  for (let idx = 0; idx < payload.rows.length; idx += 1) {
    drawRow(payload.rows[idx], idx);
  }

  const totalText = `Total de repasses: ${toCurrency(totalValue)}`;
  const noteText = String(payload.note || '').trim();
  const noteLines = noteText
    ? splitTextPreserveLineBreaks(noteText, tableWidth - 12, fontRegular, 8)
    : [];

  const noteBlockHeight = noteLines.length ? noteLines.length * 10 + 22 : 0;
  const footerHeight = 30 + (noteBlockHeight ? noteBlockHeight + 8 : 0);
  if (y - footerHeight < marginBottom) {
    createPage(false);
  }

  page.drawText(totalText, {
    x: tableLeft,
    y: y - 14,
    size: 10,
    font: fontBold,
    color: rgb(0.05, 0.38, 0.34),
  });
  page.drawText(sourceText, {
    x: tableLeft,
    y: y - 28,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.32, 0.32, 0.32),
  });

  if (noteLines.length) {
    const noteTitle = 'Observação do relatório:';
    const noteTop = y - 40;
    page.drawRectangle({
      x: tableLeft,
      y: noteTop - noteBlockHeight,
      width: tableWidth,
      height: noteBlockHeight,
      color: rgb(0.996, 0.987, 0.925),
      borderColor: rgb(0.98, 0.86, 0.54),
      borderWidth: 1,
    });
    page.drawText(noteTitle, {
      x: tableLeft + 4,
      y: noteTop - 12,
      size: 8,
      font: fontBold,
      color: rgb(0.32, 0.25, 0.08),
    });
    let noteY = noteTop - 24;
    for (const line of noteLines) {
      if (line) {
        page.drawText(line, {
          x: tableLeft + 4,
          y: noteY,
          size: 8,
          font: fontRegular,
          color: rgb(0.32, 0.25, 0.08),
        });
      }
      noteY -= 10;
    }
  }

  const pages = pdfDoc.getPages();
  const totalPages = pages.length;
  pages.forEach((p, i) => {
    const footerText = `Página ${i + 1} de ${totalPages}`;
    const w = fontRegular.widthOfTextAtSize(footerText, 7);
    p.drawText(footerText, {
      x: pageWidth - marginX - w,
      y: 8,
      size: 7,
      font: fontRegular,
      color: rgb(0.46, 0.46, 0.46),
    });
  });

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

const compactError = (value: string, max = 420) => {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 3)}...`;
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

          const notes = await getRepasseProfessionalNote(db, {
            periodRef: job.periodRef,
            professionalId: target.professionalId,
          });

          const pdf = await renderRepassePdf({
            periodRef: job.periodRef,
            professionalName: target.professionalName,
            rows: lines,
            note: notes.note,
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
          const message = compactError(String(error?.message || error || 'Erro desconhecido ao gerar PDF'));
          summary.details.push(`job ${job.id}: falha em ${target.professionalName} - ${message}`);
          console.error(`repasse_pdf job=${job.id} profissional=${target.professionalId} erro=${message}`);
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
        const partialMessage = `Gerados ${generated} PDFs com ${errors} falhas.`;
        await markRepassePdfJobFinished(
          db,
          job.id,
          'PARTIAL',
          partialMessage
        );
        await updateRepassePdfServiceStatus(
          db,
          'PARTIAL',
          `job=${job.id} periodo=${job.periodRef} arquivos=${generated} erros=${errors}`
        );
        summary.details.push(`job ${job.id}: ${partialMessage}`);
        continue;
      }

      if (errors > 0) {
        const firstError =
          summary.details.find((line) => line.includes(`job ${job.id}:`)) ||
          `job ${job.id}: falha sem detalhe`;
        await jobFailure(db, job, compactError(firstError));
        summary.failedJobs += 1;
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
