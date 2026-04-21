import type { MarketingControleValueFormat } from './types';

export const formatCurrency = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

export const formatRatio = (value: number, digits = 2) => `${formatNumber(value, digits)}x`;

export const formatDuration = (value: number) => {
  const totalSeconds = Math.max(0, Math.round(Number(value || 0)));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
      2,
      '0'
    )}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const formatValueByKind = (format: MarketingControleValueFormat, value: number | null) => {
  if (value == null) return '—';
  if (format === 'currency') return formatCurrency(value);
  if (format === 'percentage') return formatPercent(value, 2);
  if (format === 'duration') return formatDuration(value);
  if (format === 'multiplier') return formatRatio(value, 2);
  return formatNumber(value, format === 'integer' ? 0 : 2);
};

export const formatDateTime = (value?: string | null) => {
  if (!value) return 'Sem sincronização registrada';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

export const getCurrentMonthRef = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return `${Number(map.get('year') || '1970')}-${String(Number(map.get('month') || '1')).padStart(2, '0')}`;
};

export const formatMonthLabel = (monthRef: string) => {
  const [yearRaw, monthRaw] = String(monthRef || '').split('-');
  const year = Number(yearRaw || 0);
  const month = Number(monthRaw || 0);
  if (!year || !month) return monthRef;
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};
