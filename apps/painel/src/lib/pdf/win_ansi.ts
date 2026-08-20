/**
 * Saneamento de texto para PDFs gerados com as fontes padrão do pdf-lib.
 *
 * As StandardFonts (Helvetica e família) usam a codificação WinAnsi, que cobre
 * apenas Latin-1 e alguns símbolos. Qualquer caractere fora disso — emoji,
 * ideogramas, setas, aspas tipográficas exóticas — derruba a exportação com
 * "WinAnsi cannot encode". Como os relatórios imprimem texto digitado por
 * pessoas, todo conteúdo precisa passar por `pdfSafeText` antes de ser medido
 * ou desenhado.
 */

const PDF_TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/[\u2018\u2019\u201A\u201B\u2032]/g, "'"],
  [/[\u201C\u201D\u201E\u201F\u2033]/g, '"'],
  [/[\u2010\u2011\u2012\u2043]/g, '-'],
  [/[\u2000-\u200A\u202F\u205F\u3000]/g, ' '],
  [/[\u200B-\u200D\uFEFF]/g, ''],
  [/[\uFE00-\uFE0F]/g, ''],
  [/[\u2028\u2029]/g, '\n'],
  [/\u2026/g, '...'],
  [/[\u2212\u2012]/g, '-'],
  [/[\u2192\u27A1]/g, '->'],
  [/[\u2713\u2714]/g, 'OK'],
  [/[\u2717\u2718\u274C]/g, 'X'],
];

/** Conjunto de codepoints que a codificação WinAnsi consegue representar. */
const WIN_ANSI_EXTRA_CODEPOINTS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
]);

const isWinAnsiEncodable = (codePoint: number) => {
  if (codePoint === 0x0a || codePoint === 0x0d || codePoint === 0x09) return true;
  if (codePoint >= 0x20 && codePoint <= 0x7e) return true;
  if (codePoint >= 0xa0 && codePoint <= 0xff) return true;
  return WIN_ANSI_EXTRA_CODEPOINTS.has(codePoint);
};

export const pdfSafeText = (value: unknown) => {
  let text = String(value ?? '').normalize('NFC');
  for (const [pattern, replacement] of PDF_TEXT_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  let output = '';
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (isWinAnsiEncodable(codePoint)) {
      output += char;
      continue;
    }
    // Tenta degradar acentos exóticos antes de descartar (ex.: "ǎ" -> "a").
    const stripped = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const strippedCode = stripped.codePointAt(0) ?? 0;
    if (stripped.length === 1 && isWinAnsiEncodable(strippedCode)) {
      output += stripped;
      continue;
    }
    output += '?';
  }

  // Emoji viram uma sequência de "?" sem informação; colapsa para um só.
  return output.replace(/\?{2,}/g, '?');
};

