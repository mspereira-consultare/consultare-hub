import JSZip from 'jszip';

const XML_FILES_REGEX = /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i;
const TEXT_NODE_REGEX = /(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g;
const PLACEHOLDER_REGEX = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;

const decodeXmlEntities = (value: string) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

const encodeXmlEntities = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const renderTextNodeWithLineBreaks = (open: string, rawValue: string, close: string) => {
  const normalized = rawValue.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalized.includes('\n')) {
    return `${open}${encodeXmlEntities(normalized)}${close}`;
  }

  const parts = normalized.split('\n');
  return parts
    .map((part, idx) => {
      const prefix = idx === 0 ? '' : `<w:br/>`;
      return `${prefix}${open}${encodeXmlEntities(part)}${close}`;
    })
    .join('');
};

type NodeBoundary = { node: number; offset: number };

const locateBoundary = (parts: string[], position: number): NodeBoundary => {
  let acc = 0;
  for (let idx = 0; idx < parts.length; idx += 1) {
    const len = parts[idx].length;
    const nextAcc = acc + len;
    // Regra importante:
    // quando position cai exatamente na fronteira entre dois nós de texto,
    // devemos escolher o próximo nó (início), não o anterior (fim),
    // para evitar "puxar" o placeholder para o parágrafo/run anterior.
    if (position < nextAcc || (position === nextAcc && idx === parts.length - 1)) {
      return { node: idx, offset: position - acc };
    }
    acc = nextAcc;
  }
  const last = Math.max(0, parts.length - 1);
  return { node: last, offset: parts[last]?.length || 0 };
};

const replacePlaceholdersInXml = (
  xml: string,
  values: Record<string, string>
): string => {
  const textNodes = Array.from(xml.matchAll(TEXT_NODE_REGEX));
  if (textNodes.length === 0) return xml;

  const decodedParts = textNodes.map((match) => decodeXmlEntities(String(match[2] || '')));
  const joined = decodedParts.join('');
  const matches = Array.from(joined.matchAll(PLACEHOLDER_REGEX));
  if (matches.length === 0) return xml;

  for (let idx = matches.length - 1; idx >= 0; idx -= 1) {
    const match = matches[idx];
    const full = String(match[0] || '');
    const key = String(match[1] || '').trim();
    const replacement = String(values[key] ?? '');
    const start = Number(match.index || 0);
    const endExclusive = start + full.length;

    const startPos = locateBoundary(decodedParts, start);
    const endPos = locateBoundary(decodedParts, endExclusive);

    if (startPos.node === endPos.node) {
      const current = decodedParts[startPos.node];
      decodedParts[startPos.node] =
        current.slice(0, startPos.offset) +
        replacement +
        current.slice(endPos.offset);
      continue;
    }

    const startCurrent = decodedParts[startPos.node];
    decodedParts[startPos.node] =
      startCurrent.slice(0, startPos.offset) + replacement;

    for (let mid = startPos.node + 1; mid < endPos.node; mid += 1) {
      decodedParts[mid] = '';
    }

    const endCurrent = decodedParts[endPos.node];
    decodedParts[endPos.node] = endCurrent.slice(endPos.offset);
  }

  let textNodeIndex = 0;
  return xml.replace(TEXT_NODE_REGEX, (fullMatch, open, _content, close) => {
    const next = decodedParts[textNodeIndex] ?? '';
    textNodeIndex += 1;
    return renderTextNodeWithLineBreaks(String(open), String(next), String(close));
  });
};

export const renderDocxTemplate = async (
  templateBuffer: Buffer,
  values: Record<string, string>
): Promise<Buffer> => {
  const zip = await JSZip.loadAsync(templateBuffer);
  const xmlNames = Object.keys(zip.files).filter((name) => XML_FILES_REGEX.test(name));

  for (const name of xmlNames) {
    const raw = await zip.file(name)?.async('string');
    if (!raw) continue;
    const rendered = replacePlaceholdersInXml(raw, values);
    zip.file(name, rendered);
  }

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
};
