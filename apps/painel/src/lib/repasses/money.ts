const roundMoney = (value: number) => Math.round(value * 100) / 100;

export const parseLocalizedMoneyInput = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? roundMoney(value) : null;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const sanitized = raw.replace(/\s+/g, '').replace(/[Rr]\$/g, '');
  if (!sanitized) return null;

  const lastComma = sanitized.lastIndexOf(',');
  const lastDot = sanitized.lastIndexOf('.');

  let normalized = sanitized;
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      normalized = sanitized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = sanitized.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    normalized = sanitized.replace(/\./g, '').replace(',', '.');
  } else if (lastDot >= 0) {
    const parts = sanitized.split('.');
    if (parts.length > 2) {
      const decimal = parts.pop() || '0';
      normalized = `${parts.join('')}.${decimal}`;
    }
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return roundMoney(parsed);
};
