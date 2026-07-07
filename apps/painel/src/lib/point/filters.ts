import type { PointDateRange, PointFilters } from '@/lib/point/types';

type SearchParamsLike = {
  get(name: string): string | null;
};

export const DEFAULT_POINT_FILTERS: PointFilters = {
  search: '',
  centerCost: 'all',
  unit: 'all',
  contractTypes: [],
  lineStatus: 'all',
};

const parseMultiValueParam = (searchParams: SearchParamsLike, name: string) => {
  const getAll = (searchParams as SearchParamsLike & { getAll?: (param: string) => string[] }).getAll;
  const values = typeof getAll === 'function' ? getAll.call(searchParams, name) : [];
  const raw = values.length > 0 ? values : [String(searchParams.get(name) || '')];
  return Array.from(
    new Set(
      raw
        .flatMap((item) => String(item || '').split(','))
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
};

export const parsePointFilters = (searchParams: SearchParamsLike): PointFilters => ({
  search: String(searchParams.get('search') || '').trim(),
  centerCost: String(searchParams.get('centerCost') || 'all').trim() || 'all',
  unit: String(searchParams.get('unit') || 'all').trim() || 'all',
  contractTypes: parseMultiValueParam(searchParams, 'contractType'),
  lineStatus: String(searchParams.get('lineStatus') || 'all').trim() || 'all',
});

const normalizeIsoDate = (value: string, label: string) => {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const error = new Error(`${label} inválida. Use o formato YYYY-MM-DD.`) as Error & { status?: number };
    error.status = 400;
    throw error;
  }
  return normalized;
};

export const parsePointDateRange = (searchParams: SearchParamsLike): PointDateRange => {
  const startDate = normalizeIsoDate(String(searchParams.get('startDate') || ''), 'Data inicial');
  const endDate = normalizeIsoDate(String(searchParams.get('endDate') || ''), 'Data final');
  if (endDate < startDate) {
    const error = new Error('A data final não pode ser menor que a data inicial.') as Error & { status?: number };
    error.status = 400;
    throw error;
  }
  return { startDate, endDate };
};
