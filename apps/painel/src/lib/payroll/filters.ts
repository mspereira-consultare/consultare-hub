import type { PayrollLineFilters, PayrollPointDateRange } from '@/lib/payroll/types';

type SearchParamsLike = {
  get(name: string): string | null;
};

export const DEFAULT_PAYROLL_LINE_FILTERS: PayrollLineFilters = {
  search: '',
  centerCost: 'all',
  unit: 'all',
  contractType: 'all',
  lineStatus: 'all',
};

export const parsePayrollLineFilters = (searchParams: SearchParamsLike): PayrollLineFilters => ({
  search: String(searchParams.get('search') || '').trim(),
  centerCost: String(searchParams.get('centerCost') || 'all').trim() || 'all',
  unit: String(searchParams.get('unit') || 'all').trim() || 'all',
  contractType: String(searchParams.get('contractType') || 'all').trim() || 'all',
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

export const parsePayrollPointDateRange = (searchParams: SearchParamsLike): PayrollPointDateRange => {
  const startDate = normalizeIsoDate(String(searchParams.get('startDate') || ''), 'Data inicial');
  const endDate = normalizeIsoDate(String(searchParams.get('endDate') || ''), 'Data final');
  if (endDate < startDate) {
    const error = new Error('A data final não pode ser menor que a data inicial.') as Error & { status?: number };
    error.status = 400;
    throw error;
  }
  return { startDate, endDate };
};
