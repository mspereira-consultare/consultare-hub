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

export const formatOperationalPeriodLabel = (periodStart: string | null | undefined, periodEnd: string | null | undefined) => {
  const start = String(periodStart || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const end = String(periodEnd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!start || !end) return '-';
  return `${start[3]}.${start[2]} a ${end[3]}.${end[2]}`;
};

export const formatMonthSheetName = (monthRef: string | null | undefined) => {
  const [year, month] = String(monthRef || '').split('-');
  const monthIndex = Number(month || 0) - 1;
  if (!year || monthIndex < 0) return 'FOLHA';
  const date = new Date(Date.UTC(Number(year), monthIndex, 1));
  return date.toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' }).toUpperCase();
};

export const formatSheetInsalubrity = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number(value) === 0) return '-';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value));
};

export const statusLabelMap: Record<string, string> = {
  ABERTA: 'Aberta',
  EM_REVISAO: 'Em revisão',
  APROVADA: 'Aprovada',
  ENVIADA: 'Enviada',
  RASCUNHO: 'Rascunho',
  PENDING: 'Pendente',
  PROCESSING: 'Processando',
  COMPLETED: 'Concluído',
  FAILED: 'Falhou',
};
