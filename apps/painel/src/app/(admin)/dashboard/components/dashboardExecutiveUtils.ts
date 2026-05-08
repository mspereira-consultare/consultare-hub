import {
  Activity,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  type LucideIcon,
  Users,
} from 'lucide-react';
import type {
  ExecutiveAreaKey,
  ExecutiveIndicator,
  ExecutiveIndicatorStatus,
  ExecutivePriority,
  ExecutiveSnapshot,
} from '@/lib/dashboard_executive/types';

export const statusStyles: Record<ExecutiveIndicatorStatus, string> = {
  SUCCESS: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  WARNING: 'border-amber-200 bg-amber-50 text-amber-700',
  DANGER: 'border-rose-200 bg-rose-50 text-rose-700',
  NO_DATA: 'border-slate-200 bg-slate-100 text-slate-600',
};

export const areaAccentStyles: Record<ExecutiveAreaKey, string> = {
  financeiro: 'bg-emerald-100 text-emerald-700',
  comercial: 'bg-sky-100 text-sky-700',
  operacao: 'bg-amber-100 text-amber-700',
  pessoas: 'bg-indigo-100 text-indigo-700',
  qualidade: 'bg-rose-100 text-rose-700',
};

export const areaIcons: Record<ExecutiveAreaKey, LucideIcon> = {
  financeiro: Building2,
  comercial: ArrowUpRight,
  operacao: Activity,
  pessoas: Users,
  qualidade: CheckCircle2,
};

export const priorityStyles: Record<ExecutivePriority['severity'], string> = {
  high: 'border-rose-200 bg-rose-50 text-rose-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
};

export function formatSnapshotTimestamp(value: string | null | undefined) {
  if (!value) return 'Nunca';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

export function formatScopeLabel(snapshot: ExecutiveSnapshot | null) {
  if (!snapshot) return 'Escopo não carregado';
  const { units, departments, areas } = snapshot.metrics.scope;
  const fragments: string[] = [];
  if (areas.length) fragments.push(`${areas.length} área(s)`);
  if (units.length) fragments.push(`${units.length} unidade(s)`);
  if (departments.length) fragments.push(`${departments.length} departamento(s)`);
  return fragments.length ? fragments.join(' • ') : 'Escopo amplo';
}

export function formatIndicatorValue(indicator: ExecutiveIndicator, value: number | null) {
  if (value == null) return '—';
  if (indicator.format === 'currency') {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: value >= 1000 ? 0 : 2,
    }).format(value);
  }
  if (indicator.format === 'percent') return `${value.toFixed(1)}%`;
  if (indicator.format === 'minutes') return `${Math.round(value)} min`;
  return new Intl.NumberFormat('pt-BR').format(value);
}
