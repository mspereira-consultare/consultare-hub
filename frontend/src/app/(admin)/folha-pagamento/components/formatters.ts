export const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

export const formatDateBr = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '-';
  return `${match[3]}/${match[2]}/${match[1]}`;
};

export const formatDateTimeBr = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

export const statusLabelMap: Record<string, string> = {
  ABERTA: 'Aberta',
  EM_REVISAO: 'Em revisão',
  APROVADA: 'Aprovada',
  ENVIADA: 'Enviada',
  RASCUNHO: 'Rascunho',
  IGUAL: 'Igual',
  DIVERGENTE: 'Divergente',
  SEM_BASE: 'Sem base',
  SO_NA_BASE: 'Só na base',
};
