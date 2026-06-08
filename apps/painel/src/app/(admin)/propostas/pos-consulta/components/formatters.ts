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

export function formatDateOnly(dateString?: string | null): string {
  if (!dateString) return '—';
  const normalized = String(dateString).trim();
  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function formatDateTime(dateString?: string | null): string {
  if (!dateString) return '—';
  const normalized = String(dateString).trim();
  const isoString = normalized.includes('T') ? normalized : normalized.replace(' ', 'T');
  const parsed = new Date(isoString.length === 16 ? `${isoString}:00` : isoString);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function normalizePhoneForWhatsApp(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  return `55${digits}`;
}

export function formatPercent(value: number): string {
  return `${Number(value || 0).toFixed(1).replace('.', ',')}%`;
}
