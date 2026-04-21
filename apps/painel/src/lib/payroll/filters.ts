import type { PayrollLineFilters } from '@/lib/payroll/types';

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
