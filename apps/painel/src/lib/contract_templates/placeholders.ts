import JSZip from 'jszip';

const PLACEHOLDER_REGEX = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;

const XML_FILES_REGEX = /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i;

const decodeXmlEntities = (value: string) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

const normalizeXmlToText = (xml: string) => {
  const text = xml.replace(/<[^>]+>/g, '');
  return decodeXmlEntities(text);
};

export const extractDocxPlaceholders = async (fileBuffer: Buffer): Promise<string[]> => {
  const zip = await JSZip.loadAsync(fileBuffer);
  const collected = new Set<string>();

  const xmlNames = Object.keys(zip.files).filter((name) => XML_FILES_REGEX.test(name));
  for (const name of xmlNames) {
    const raw = await zip.file(name)?.async('string');
    if (!raw) continue;
    const text = normalizeXmlToText(raw);

    let match: RegExpExecArray | null = null;
    while ((match = PLACEHOLDER_REGEX.exec(text)) !== null) {
      const token = String(match[1] || '').trim();
      if (token) collected.add(token);
    }
  }

  return Array.from(collected).sort((a, b) => a.localeCompare(b, 'pt-BR'));
};

