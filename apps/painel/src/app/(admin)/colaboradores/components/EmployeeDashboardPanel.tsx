'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Baby, FileWarning, Loader2, RefreshCw, TrendingDown, UsersRound } from 'lucide-react';
import type {
  EmployeeDashboardCountItem,
  EmployeeDashboardData,
  EmployeeDashboardFilters,
  EmployeeDashboardPerson,
} from '@/lib/colaboradores/types';

type SelectOption = { value: string; label: string };

type DashboardOptions = {
  units: SelectOption[];
  regimes: SelectOption[];
  statuses: SelectOption[];
  departments: string[];
};

const filterInputClassName =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200';

const emptyFilters = (): EmployeeDashboardFilters => ({
  status: 'all',
  regime: 'all',
  unit: 'all',
  department: 'all',
});

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((payload as { error?: unknown })?.error || 'Falha ao carregar dados.'));
  }
  return payload as T;
};

const formatDateBr = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '-';
  return `${match[3]}/${match[2]}/${match[1]}`;
};

const formatCpf = (value: string | null | undefined) => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (!digits) return 'CPF não informado';
  return digits.length === 11 ? `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}` : digits;
};

const buildDashboardQuery = (filters: EmployeeDashboardFilters) => {
  const params = new URLSearchParams();
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.regime !== 'all') params.set('regime', filters.regime);
  if (filters.unit !== 'all') params.set('unit', filters.unit);
  if (filters.department !== 'all') params.set('department', filters.department);
  return params.toString();
};

function MetricCard({
  title,
  value,
  helper,
  icon: Icon,
  tone = 'slate',
}: {
  title: string;
  value: string;
  helper: string;
  icon: typeof UsersRound;
  tone?: 'slate' | 'blue' | 'emerald' | 'amber' | 'rose';
}) {
  const toneClass = {
    slate: 'border-slate-200 bg-slate-50 text-slate-600',
    blue: 'border-blue-100 bg-blue-50 text-[#17407E]',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    rose: 'border-rose-100 bg-rose-50 text-rose-700',
  }[tone];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
          <div className="mt-1 text-xs text-slate-500">{helper}</div>
        </div>
        <div className={`rounded-xl border p-2 ${toneClass}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

function PersonList({
  title,
  items,
  empty,
  mode = 'date',
}: {
  title: string;
  items: EmployeeDashboardPerson[];
  empty: string;
  mode?: 'date' | 'days' | 'description';
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600">{items.length}</span>
        </div>
      </div>
      <div className="max-h-80 space-y-2 overflow-y-auto p-3">
        {items.length ? (
          items.map((item) => (
            <div key={`${item.employeeId}-${item.date || item.description || title}`} className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-800">{item.fullName}</div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">{formatCpf(item.employeeCpf)} · {item.department || 'Setor não informado'}</div>
                </div>
                <div className="shrink-0 text-right text-xs font-semibold text-slate-600">
                  {mode === 'days'
                    ? `${item.daysUntil ?? 0} dia(s)`
                    : mode === 'description'
                      ? item.description || '-'
                      : formatDateBr(item.date)}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">{empty}</div>
        )}
      </div>
    </section>
  );
}

function CountList({ title, items }: { title: string; items: EmployeeDashboardCountItem[] }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <div className="mt-3 space-y-3">
        {items.map((item) => {
          const pct = total ? Math.round((item.count / total) * 100) : 0;
          return (
            <div key={item.key}>
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                <span>{item.label}</span>
                <span className="font-semibold text-slate-700">{item.count}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-[#17407E]" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function EmployeeDashboardPanel({ options }: { options: DashboardOptions }) {
  const [filters, setFilters] = useState<EmployeeDashboardFilters>(emptyFilters());
  const [data, setData] = useState<EmployeeDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = buildDashboardQuery(filters);
      const payload = await fetchJson<{ status: string; data: EmployeeDashboardData }>(
        `/api/admin/colaboradores/dashboard${query ? `?${query}` : ''}`,
      );
      setData(payload.data);
    } catch (dashboardError: unknown) {
      setError(dashboardError instanceof Error ? dashboardError.message : 'Falha ao carregar dashboard.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void Promise.resolve().then(loadDashboard);
  }, [loadDashboard]);

  const activeFilters = useMemo(
    () => filters.status !== 'all' || filters.regime !== 'all' || filters.unit !== 'all' || filters.department !== 'all',
    [filters],
  );

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Visão gerencial</div>
            <h2 className="mt-1 text-lg font-bold text-slate-900">Dashboard de funcionários</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Indicadores calculados a partir do cadastro oficial de colaboradores, documentos e status operacionais.
            </p>
          </div>
          <button
            type="button"
            onClick={loadDashboard}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Atualizar
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Unidade</label>
            <select value={filters.unit} onChange={(event) => setFilters((current) => ({ ...current, unit: event.target.value }))} className={filterInputClassName}>
              <option value="all">Todas</option>
              {options.units.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Setor</label>
            <select value={filters.department} onChange={(event) => setFilters((current) => ({ ...current, department: event.target.value }))} className={filterInputClassName}>
              <option value="all">Todos</option>
              {options.departments.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Regime</label>
            <select value={filters.regime} onChange={(event) => setFilters((current) => ({ ...current, regime: event.target.value as EmployeeDashboardFilters['regime'] }))} className={filterInputClassName}>
              <option value="all">Todos</option>
              {options.regimes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</label>
            <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as EmployeeDashboardFilters['status'] }))} className={filterInputClassName}>
              <option value="all">Todos</option>
              {options.statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              disabled={!activeFilters}
              onClick={() => setFilters(emptyFilters())}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Limpar filtros
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertCircle size={14} />
          {error}
        </div>
      ) : null}

      {!data && loading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500">
          <span className="inline-flex items-center gap-2">
            <Loader2 size={15} className="animate-spin" />
            Carregando dashboard...
          </span>
        </div>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              title="Headcount"
              value={String(data.summary.totalCount)}
              helper={`${data.summary.activeCount} ativo(s), ${data.summary.preAdmissionCount} pré-admissão, ${data.summary.inactiveCount} desligado(s)`}
              icon={UsersRound}
              tone="blue"
            />
            <MetricCard
              title="Admissões no mês"
              value={String(data.summary.admissionsThisMonth)}
              helper="Entradas com data de admissão no mês atual"
              icon={Baby}
              tone="emerald"
            />
            <MetricCard
              title="Desligamentos"
              value={String(data.summary.terminationsThisMonth)}
              helper={`${data.summary.terminationsYtd} saída(s) no ano`}
              icon={TrendingDown}
              tone="rose"
            />
            <MetricCard
              title="Turnover"
              value={`${data.summary.turnoverMonthlyPct}%`}
              helper={`${data.summary.turnoverYtdPct}% acumulado no ano`}
              icon={UsersRound}
              tone="amber"
            />
            <MetricCard
              title="Pendências"
              value={String(data.summary.documentPendingCount + data.summary.asoPendingCount + data.summary.asoExpiringCount + data.summary.asoExpiredCount)}
              helper={`${data.summary.documentPendingCount} doc., ${data.summary.asoExpiredCount} ASO vencido(s)`}
              icon={FileWarning}
              tone="slate"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <PersonList title="Aniversariantes do mês" items={data.birthdaysThisMonth} empty="Nenhum aniversariante no mês para os filtros selecionados." />
            <PersonList title="Aniversariantes dos próximos 30 dias" items={data.birthdaysNext30} empty="Nenhum aniversário nos próximos 30 dias." mode="days" />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <CountList title="Tempo de empresa" items={data.tenureBands} />
            <CountList title="Status do ASO" items={data.asoBreakdown} />
            <PersonList title="Pendências documentais" items={data.documentPendencies} empty="Nenhuma pendência documental encontrada." mode="description" />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <PersonList title="Admissões do mês" items={data.admissionsThisMonth} empty="Nenhuma admissão registrada no mês." />
            <PersonList title="Desligamentos do mês" items={data.terminationsThisMonth} empty="Nenhum desligamento registrado no mês." />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
            Última atualização: {data.generatedAt.slice(0, 19).replace('T', ' ')}. Turnover calculado sobre quadro ativo + saídas do período.
          </div>
        </>
      ) : null}
    </div>
  );
}
