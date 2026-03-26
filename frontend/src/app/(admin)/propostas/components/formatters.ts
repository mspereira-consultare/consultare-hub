export function toNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function formatCurrency(value: number): string {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatLastUpdate(dateString?: string | null): string {
  if (!dateString) return 'Nunca';
  const isoString = dateString.includes('T') ? dateString : dateString.replace(' ', 'T');
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return dateString;
  return parsed.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function compactProcedures(summary: string, count: number): string {
  const parts = String(summary || '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length <= 2) return parts.join(' | ') || '-';
  const preview = parts.slice(0, 2).join(' | ');
  return `${preview} +${Math.max(count - 2, 1)} itens`;
}

export function normalizePhoneForWhatsApp(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  return `55${digits}`;
}
