const SAO_PAULO_OFFSET = '-03:00';

export function parseSystemStatusTimestamp(value?: string | null): Date | null {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const isoLike = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(isoLike);
  const normalized = hasTimezone ? isoLike : `${isoLike}${SAO_PAULO_OFFSET}`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function formatSystemStatusTimestamp(value?: string | null, emptyLabel = 'Sem sincronização registrada') {
  const raw = String(value || '').trim();
  if (!raw) return emptyLabel;
  const date = parseSystemStatusTimestamp(raw);
  if (!date) return raw;
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
