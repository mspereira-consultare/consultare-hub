export const formatCurrency = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });

export const formatCompactCurrency = (value: number) => {
  const abs = Math.abs(Number(value || 0));
  if (abs >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)} mi`;
  if (abs >= 1_000) return `${formatNumber(value / 1_000, 1)} mil`;
  return formatCurrency(value);
};

export const formatNumber = (value: number, digits = 0) =>
  Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export const formatPercent = (value: number, digits = 2) =>
  `${Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;

export const formatDateTime = (value?: string | null) => {
  if (!value) return 'Sem sincronização registrada';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

export const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const normalized = value.includes('T') ? value : `${value}T00:00:00`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

export const getSaoPauloToday = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.get('year') || '1970'),
    month: Number(map.get('month') || '01'),
    day: Number(map.get('day') || '01'),
  };
};

export const getCurrentPeriodRef = () => {
  const today = getSaoPauloToday();
  return `${today.year}-${String(today.month).padStart(2, '0')}`;
};

export const getDateRangeFromPeriod = (periodRef: string): { startDate: string; endDate: string } => {
  const [yearRaw, monthRaw] = String(periodRef || '').split('-');
  const year = Number(yearRaw || 0);
  const month = Number(monthRaw || 0);
  if (!year || !month) {
    const current = getCurrentPeriodRef();
    return getDateRangeFromPeriod(current);
  }
  const lastDay = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  return {
    startDate: `${year}-${mm}-01`,
    endDate: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
};
