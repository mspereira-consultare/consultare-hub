'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Award, ClipboardCheck, FileWarning, Loader2, RefreshCw, ShieldCheck, Target } from 'lucide-react';
import type {
  EmployeeDashboardFilters,
  EmployeeQualityGoalItem,
  EmployeeQualityGoalPerson,
  EmployeeQualityGoalsData,
  EmployeeQualityTrainingItem,
} from '@/lib/colaboradores/types';

type SelectOption = { value: string; label: string };

type QualityGoalsOptions = {
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
  if (!response.ok) throw new Error(String((payload as { error?: unknown })?.error || 'Falha ao carregar dados.'));
  return payload as T;
};

const buildQuery = (filters: EmployeeDashboardFilters) => {
  const params = new URLSearchParams();
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.regime !== 'all') params.set('regime', filters.regime);
  if (filters.unit !== 'all') params.set('unit', filters.unit);
  if (filters.department !== 'all') params.set('department', filters.department);
  return params.toString();
};

const formatDateBr = (value: string | null | undefined) => {
  const raw = String(value || '').slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '-';
};

const goalTone = (status: EmployeeQualityGoalItem['status']) => {
  if (status === 'SUCCESS') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'WARNING') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'UNLINKED') return 'border-slate-200 bg-slate-50 text-slate-600';
  return 'border-rose-200 bg-rose-50 text-rose-700';
};

const trainingTone = (status: EmployeeQualityTrainingItem['status']) => {
  if (status === 'concluido') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'dispensado') return 'border-slate-200 bg-slate-50 text-slate-600';
  if (status === 'vencido') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
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
  icon: typeof ShieldCheck;
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

function Badge({ children, className }: { children: ReactNode; className: string }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${className}`}>{children}</span>;
}

function GoalList({ goals }: { goals: EmployeeQualityGoalItem[] }) {
  if (!goals.length) return <p className="text-xs text-slate-400">Sem metas vinculadas oficialmente.</p>;
  return (
    <div className="space-y-2">
      {goals.slice(0, 3).map((goal) => (
        <div key={goal.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-800">{goal.name}</div>
              <div className="mt-0.5 text-xs text-slate-500">{goal.current.toLocaleString('pt-BR')} / {goal.target.toLocaleString('pt-BR')} · {goal.percentage}%</div>
              <a href={goal.sourcePath} className="mt-1 inline-flex text-xs font-semibold text-[#17407E] hover:underline">
                Abrir em Metas
              </a>
            </div>
            <Badge className={goalTone(goal.status)}>{goal.status === 'SUCCESS' ? 'OK' : goal.status === 'WARNING' ? 'Atenção' : 'Baixa'}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

function TrainingList({ trainings }: { trainings: EmployeeQualityTrainingItem[] }) {
  if (!trainings.length) return <p className="text-xs text-slate-400">Sem treinamentos vinculados oficialmente.</p>;
  return (
    <div className="space-y-2">
      {trainings.slice(0, 3).map((training) => (
        <div key={training.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-800">{training.name}</div>
              <div className="mt-0.5 text-xs text-slate-500">Prazo: {formatDateBr(training.dueDate)}</div>
              <a href={training.sourcePath} className="mt-1 inline-flex text-xs font-semibold text-[#17407E] hover:underline">
                Abrir em Qualidade
              </a>
            </div>
            <Badge className={trainingTone(training.status)}>
              {training.status === 'concluido' ? 'Concluído' : training.status === 'vencido' ? 'Vencido' : training.status === 'dispensado' ? 'Dispensado' : 'Pendente'}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

function PersonCard({ person }: { person: EmployeeQualityGoalPerson }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-slate-900">{person.fullName}</h3>
          <p className="mt-1 text-xs text-slate-500">{person.department || 'Setor não informado'} · {person.jobTitle || 'Cargo não informado'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge className={person.documentStatus.pending ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}>
              Docs {person.documentStatus.requiredDone}/{person.documentStatus.requiredTotal}
            </Badge>
            <Badge className={['PENDENTE', 'VENCIDO'].includes(person.asoStatus) ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}>
              ASO {person.asoStatus}
            </Badge>
            {person.criticalAlerts.length ? <Badge className="border-rose-200 bg-rose-50 text-rose-700">{person.criticalAlerts.length} alerta(s)</Badge> : null}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <section>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Metas</div>
          <GoalList goals={person.goals} />
        </section>
        <section>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Treinamentos</div>
          <TrainingList trainings={person.trainings} />
        </section>
      </div>
    </article>
  );
}

export function EmployeeQualityGoalsPanel({ options }: { options: QualityGoalsOptions }) {
  const [filters, setFilters] = useState<EmployeeDashboardFilters>(emptyFilters());
  const [data, setData] = useState<EmployeeQualityGoalsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = buildQuery(filters);
      const payload = await fetchJson<{ status: string; data: EmployeeQualityGoalsData }>(
        `/api/admin/colaboradores/quality-goals${query ? `?${query}` : ''}`,
      );
      setData(payload.data);
    } catch (fetchError: unknown) {
      setError(fetchError instanceof Error ? fetchError.message : 'Falha ao carregar qualidade e metas.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const visiblePeople = useMemo(
    () => (data?.people || []).filter((person) => person.criticalAlerts.length || person.goals.length || person.trainings.length).slice(0, 18),
    [data?.people],
  );
  const activeFilters = filters.status !== 'all' || filters.regime !== 'all' || filters.unit !== 'all' || filters.department !== 'all';

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Leitura transversal</div>
            <h2 className="mt-1 text-lg font-bold text-slate-900">Qualidade & Metas</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Consulta gerencial por colaborador. Metas continuam sendo editadas em Metas; treinamentos e evidências continuam em Qualidade.
            </p>
          </div>
          <button
            type="button"
            onClick={loadData}
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
            <button type="button" disabled={!activeFilters} onClick={() => setFilters(emptyFilters())} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 disabled:cursor-not-allowed disabled:opacity-50">
              Limpar filtros
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard title="Colaboradores críticos" value={String(data?.summary.criticalEmployees ?? 0)} helper="Com alertas de RH" icon={AlertCircle} tone="rose" />
        <MetricCard title="Metas vinculadas" value={String(data?.summary.goalsLinked ?? 0)} helper={`${data?.summary.goalsBelow70 ?? 0} abaixo de 70%`} icon={Target} tone="blue" />
        <MetricCard title="Treinamentos vencidos" value={String(data?.summary.trainingsExpired ?? 0)} helper={`${data?.summary.trainingsPending ?? 0} pendente(s)`} icon={ClipboardCheck} tone="amber" />
        <MetricCard title="Docs/ASO" value={String((data?.summary.documentsPending ?? 0) + (data?.summary.asoCritical ?? 0))} helper="Pendências cadastrais" icon={FileWarning} tone="amber" />
        <MetricCard title="Metas sem vínculo" value={String(data?.summary.unlinkedGoals ?? 0)} helper="Revisar em Metas" icon={Award} tone="slate" />
      </section>

      {data?.unlinkedGoals.length ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <div className="font-semibold">Metas sem vínculo oficial</div>
          <p className="mt-1">
            Existem {data.unlinkedGoals.length} meta(s) com colaborador preenchido, mas sem vínculo oficial. Elas devem ser revisadas no módulo Metas antes de aparecerem como metas oficiais do colaborador.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.unlinkedGoals.slice(0, 5).map((goal) => (
              <a key={goal.id} href={goal.sourcePath} className="rounded-full border border-amber-200 bg-white/70 px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-white">
                {goal.name}
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Leitura por colaborador</h3>
          <p className="mt-1 text-xs text-slate-500">Mostra apenas colaboradores com metas, treinamentos ou pendências críticas para manter a tela objetiva.</p>
        </div>
        <div className="grid gap-3 p-4 xl:grid-cols-2">
          {visiblePeople.length ? (
            visiblePeople.map((person) => <PersonCard key={person.employeeId} person={person} />)
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500 xl:col-span-2">
              Nenhum colaborador com metas, treinamentos ou pendências críticas neste recorte.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Leitura por equipe/setor</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(data?.teams || []).map((team) => (
            <div key={team.key} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="truncate text-sm font-semibold text-slate-800">{team.label}</div>
              <div className="mt-2 text-xs text-slate-500">
                {team.goalsCount} meta(s) · média {team.averagePercentage === null ? '-' : `${team.averagePercentage}%`}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {team.trainingsExpired} vencido(s), {team.trainingsPending} pendente(s)
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
