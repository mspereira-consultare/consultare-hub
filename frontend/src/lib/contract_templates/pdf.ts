import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';

const decodeXmlEntities = (value: string) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

const xmlTextToPlain = (value: string) =>
  decodeXmlEntities(value)
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .trim();

const splitTextInLines = (
  text: string,
  maxWidth: number,
  font: PDFFont,
  fontSize: number
): string[] => {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [''];

  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines;
};

const extractDocxParagraphs = async (docxBuffer: Buffer): Promise<string[]> => {
  const zip = await JSZip.loadAsync(docxBuffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) return [];

  const paragraphs = Array.from(documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g));
  const out: string[] = [];

  for (const paragraph of paragraphs) {
    const xml = String(paragraph[0] || '');
    const textNodes = Array.from(xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)).map((match) =>
      xmlTextToPlain(String(match[1] || ''))
    );
    const text = textNodes.join('');
    out.push(text);
  }

  return out;
};

export const renderContractPdfFromDocxBuffer = async (docxBuffer: Buffer): Promise<Buffer> => {
  const paragraphs = await extractDocxParagraphs(docxBuffer);
  const hasContent = paragraphs.some((line) => String(line || '').trim().length > 0);
  const safeParagraphs = hasContent ? paragraphs : ['Contrato sem texto renderizado.'];

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pageSize: [number, number] = [595.28, 841.89]; // A4
  const marginX = 40;
  const marginTop = 48;
  const marginBottom = 44;
  const fontSize = 11;
  const lineHeight = 14;
  const maxWidth = pageSize[0] - marginX * 2;

  let page = pdfDoc.addPage(pageSize);
  let y = page.getHeight() - marginTop;

  const drawLine = (line: string) => {
    page.drawText(line, {
      x: marginX,
      y,
      size: fontSize,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= lineHeight;
  };

  for (const paragraph of safeParagraphs) {
    const lines = splitTextInLines(paragraph, maxWidth, font, fontSize);
    const minHeightNeeded = Math.max(lineHeight, lines.length * lineHeight);

    if (y - minHeightNeeded < marginBottom) {
      page = pdfDoc.addPage(pageSize);
      y = page.getHeight() - marginTop;
    }

    for (const line of lines) {
      if (y - lineHeight < marginBottom) {
        page = pdfDoc.addPage(pageSize);
        y = page.getHeight() - marginTop;
      }
      drawLine(line || ' ');
    }

    // Espaco entre paragrafos
    y -= 4;
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
};
