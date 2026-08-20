'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  AlertTriangle,
  CalendarDays,
  CircleHelp,
  Download,
  FileText,
  Gauge,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Target,
  Trash2,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { hasPermission } from '@/lib/permissions';

type HistoryEntry = {
  id: string;
  referenceDate: string;
  unitKey: string;
  savedAt: string | null;
  savedByName: string | null;
  changes: string[];
  isLatestForDate: boolean;
};

type ConfigSummary = {
  id: string;
  name: string;
  leaderName: string;
  units: string[];
  isActive: boolean;
};

type TeamMember = {
  employeeId: string;
  userId: string | null;
  fullName: string;
  department: string | null;
  units: string[];
};

type RecollectionEntry = {
  id: string;
  notes: string;
};

type TaskDetail = {
  taskId: string;
  protocolId: string;
  title: string;
  description: string;
  dueDate: string | null;
};

type MetricFreshness = {
  updatedAt: string | null;
  sourceLabel: string;
  stale: boolean;
};

type ChecklistData = {
  generatedAt: string;
  today: string;
  access: { isManager: boolean };
  selectedLeaderUserId: string | null;
  availableLeaderFilters: Array<{ userId: string; name: string }>;
  viewMode: 'current' | 'd1';
  referenceDate: string;
  readOnly: boolean;
  isHistorical: boolean;
  selectedUnitKey: string;
  selectedUnitLabel: string;
  config: {
    id: string;
    name: string;
    leaderUserId: string;
    leaderEmployeeId: string | null;
    leaderName: string;
    units: string[];
    teamMembers: TeamMember[];
  } | null;
  availableConfigs: ConfigSummary[];
  availableUnits: Array<{ key: string; label: string }>;
  suggestedConfig: {
    leaderUserId: string;
    leaderEmployeeId: string | null;
    leaderName: string;
    units: string[];
  } | null;
  suggestedConfigDraft: {
    name?: string | null;
    leaderUserId: string;
    leaderEmployeeId?: string | null;
    leaderName?: string | null;
    units: string[];
    teamEmployeeIds: string[];
    isActive?: boolean;
  } | null;
  lastSave: { savedAt: string | null; savedByName: string | null } | null;
  manual: {
    resolveMonthlyTarget: number;
    resolveActual: number;
    checkupMonthlyTarget: number;
    checkupActual: number;
    nfOpenStatus: string;
    accountsOpenStatus: string;
    googleRating: number;
    googleNewReviewsCount: number;
    recollectionCount: number;
    recollectionNotes: string;
    recollections: RecollectionEntry[];
    pendingNotes: string;
    generalNotes: string;
    riskGroups: Array<{
      groupName: string;
      planAction: string;
      fact: string;
      cause: string;
      action: string;
    }>;
  };
  freezeMetadata: {
    isFrozen: boolean;
    source: 'version' | 'live-fallback' | 'legacy-fallback';
  };
  metrics: {
    unit: {
      revenueDay: number;
      revenueMonth: number;
      ticketAverageDay: number;
      monthlyGoal: number;
      shouldHaveUntilDate: number;
      dynamicDailyTarget: number;
      progressPct: number;
      expectedPct: number;
      projectionMonth: number;
      projectionPct: number;
      projectionStatus: 'SUCCESS' | 'WARNING' | 'DANGER';
      projectionSuppressed: boolean;
      projectionHint: string;
      projectionDay: number | null;
      pacePct: number;
      businessDaysElapsed: number;
      businessDaysInMonth: number;
      businessDaysRemaining: number;
      freshness: {
        revenueDay: MetricFreshness;
        revenueMonth: MetricFreshness;
        ticketAverageDay: MetricFreshness;
        monthlyGoal: MetricFreshness;
        shouldHaveUntilDate: MetricFreshness;
        dynamicDailyTarget: MetricFreshness;
      };
    };
    collaborators: Array<{
      employeeId: string;
      userId: string | null;
      fullName: string;
      monthlyGoal: number;
      revenueDay: number;
      revenueMonth: number;
      dynamicDailyTarget: number;
      dailyProgressPct: number | null;
      progressPct: number;
    }>;
    collaboratorsFreshness: MetricFreshness;
    teamProduction: {
      resolveMonthlyTarget: number;
      resolveActual: number;
      resolveDynamicDailyTarget: number;
      resolveProgressPct: number;
      checkupMonthlyTarget: number;
      checkupActual: number;
      checkupDynamicDailyTarget: number;
      checkupProgressPct: number;
    };
    appointmentsConfirmation: {
      targetDate: string;
      total: number;
      confirmed: number;
      ratePct: number;
      source: 'live' | 'snapshot' | 'snapshot-fallback';
      freshness: MetricFreshness;
    };
    postConsult: {
      totalEvents: number;
      totalClosedEvents: number;
      pendingPatients: number;
      executedProposalValue: number;
      conversionRate: number;
      freshness: MetricFreshness;
    };
    waits: {
      receptionAverageMinutes: number;
      receptionAttendedCount: number;
      medicAverageMinutes: number;
      medicAttendedCount: number;
      freshness: {
        reception: MetricFreshness;
        medic: MetricFreshness;
      };
    };
    tasks: {
      pendingTasks: number;
      overdueTasks: number;
      dueNext7DaysTasks: number;
      awaitingApprovalTasks: number;
      overdueItems: TaskDetail[];
      dueSoonItems: TaskDetail[];
      freshness: MetricFreshness;
    };
    proposals: {
      openCount: number;
      openValue: number;
      periodStart: string;
      periodEnd: string;
      freshness: MetricFreshness;
    };
    absences: {
      trackedEmployees: number;
      absenceDays: number;
      lateMinutes: number;
      rows: Array<{
        employeeId: string | null;
        employeeName: string;
        absenceDays: number;
        lateMinutes: number;
      }>;
      freshness: MetricFreshness;
    };
    google: {
      ratingTarget: number;
      ratingActual: number;
      ratingProgressPct: number;
      newReviewsCount: number;
    };
  };
  riskGroups: Array<{
    groupName: string;
    monthlyGoal: number;
    actualMonth: number;
    shouldHaveUntilDate: number;
    progressPct: number;
    atRisk: boolean;
    planAction: string;
    fact: string;
    cause: string;
    action: string;
  }>;
  riskGroupsFreshness: MetricFreshness;
};

type RefreshServiceStatus = {
  serviceName: string;
  status: string;
  lastRun: string | null;
  details: string;
  isActive: boolean;
};

type ConfigOptionsPayload = {
  configs: Array<{
    id: string;
    name: string;
    leaderUserId: string;
    leaderEmployeeId: string | null;
    leaderName: string;
    units: string[];
    teamMembers: TeamMember[];
    isActive: boolean;
    updatedAt?: string | null;
    updatedBy?: string | null;
  }>;
  options: {
    leaders: Array<{
      userId: string;
      employeeId: string | null;
      name: string;
      units: string[];
      department: string | null;
    }>;
    teamMembers: TeamMember[];
    units: Array<{ key: string; label: string }>;
  };
  suggestedConfig: {
    leaderUserId: string;
    leaderEmployeeId: string | null;
    leaderName: string;
    units: string[];
  } | null;
  suggestedConfigDraft: {
    name?: string | null;
    leaderUserId: string;
    leaderEmployeeId?: string | null;
    leaderName?: string | null;
    units: string[];
    teamEmployeeIds: string[];
    isActive?: boolean;
  } | null;
};

type ConfigFormState = {
  id: string;
  name: string;
  leaderUserId: string;
  leaderEmployeeId: string;
  leaderName: string;
  units: string[];
  teamEmployeeIds: string[];
  isActive: boolean;
};

type ManualState = ChecklistData['manual'];
type RiskState = ChecklistData['riskGroups'];

const formatCurrency = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatCompactCurrency = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  });

const formatPercent = (value: number) => `${Number(value || 0).toFixed(1).replace('.', ',')}%`;

const formatDateBr = (value: string) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};

/** Dias operacionais podem ser fracionários porque sábado vale meio dia. */
const formatOperationalDays = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

const formatDateTimeBr = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  if (!raw) return 'Sem atualização registrada';
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const withTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized) ? normalized : `${normalized}-03:00`;
  const parsed = new Date(withTimezone);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

const renderFreshnessLabel = (freshness?: MetricFreshness | null) => {
  if (!freshness) return null;
  const base = `Atualizado em ${formatDateTimeBr(freshness.updatedAt)}`;
  return freshness.stale ? `${base} • desatualizado` : base;
};

const normalizeSearchText = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const toNumberInput = (value: string) => {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const Card = ({
  title,
  value,
  helper,
  icon,
  freshness,
}: {
  title: string;
  value: string;
  helper?: string;
  icon: React.ReactNode;
  freshness?: MetricFreshness | null;
}) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
    <div className="flex items-center justify-between gap-2.5">
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</div>
        <div className="mt-1 text-[1.15rem] font-bold leading-tight text-slate-900">{value}</div>
      </div>
      <div className="rounded-lg bg-slate-100 p-1.5 text-slate-500">{icon}</div>
    </div>
    {helper ? <div className="mt-1.5 text-[10px] text-slate-500">{helper}</div> : null}
    {freshness ? <div className="mt-1 text-[10px] text-slate-400">{renderFreshnessLabel(freshness)}</div> : null}
  </div>
);

const sectionClassName = 'rounded-[1.6rem] border border-slate-200 bg-white shadow-sm';
const tableShellClassName = 'mt-3 max-h-[22rem] overflow-auto rounded-xl border border-slate-200';

const helpWorkflowCards = [
  {
    title: '1. Defina o contexto local',
    description: 'A gerência configura líder, unidades habilitadas e equipe local da checklist. Esse escopo vale apenas nesta página.',
  },
  {
    title: '2. Use Hoje para operar',
    description: 'O modo Hoje é a única área editável. Salvar sobrescreve o preenchimento do dia; o histórico de quem salvou o quê fica no botão Preenchimento.',
  },
  {
    title: '3. Use D-1 para auditoria',
    description: 'O modo D-1 exibe a data anterior com indicadores do histórico congelado, e permite corrigir o preenchimento manual daquele dia.',
  },
  {
    title: '4. Leia os velocímetros',
    description: 'Os gauges mostram realizado versus meta mensal, meta diária dinâmica, projeção de fechamento do mês, taxa de confirmação, nota Google e metas gerais de Resolve e Check-up.',
  },
  {
    title: '5. Registre exceções manuais',
    description: 'Pendências, validações, avaliações Google, recoletas e FCA ficam gravados a cada salvamento, sempre por unidade e data.',
  },
  {
    title: '6. Exporte o retrato da tela',
    description: 'O PDF respeita filtros, unidade, data e os velocímetros que estiverem sendo exibidos na página.',
  },
];

const helpRules = [
  'As unidades visíveis dependem da configuração local da checklist, não da equipe local.',
  'A equipe local afeta faturamento individual, faltas/atrasos e parte dos indicadores operacionais.',
  'Resolve e Check-up permanecem manuais no v1, mas já gravados a cada salvamento e prontos para integração futura.',
  'Dias passados podem ser corrigidos: o preenchimento é gravado na data em que a página está, e cada correção aparece no log de preenchimentos.',
  'Datas futuras são somente leitura, porque não existe checklist de um dia que ainda não aconteceu.',
  'Corrigir um dia passado muda apenas os campos manuais. Faturamento, confirmação D+1, esperas, tarefas e faltas continuam vindo do histórico daquela data.',
  'Recoletas agora são registradas uma a uma, com observações independentes e contagem automática.',
  'Se uma unidade não aparecer, revise as unidades habilitadas na configuração local da checklist.',
  'A projeção do mês usa dias operacionais: segunda a sexta valem 1 dia, sábado vale meio dia, domingos e feriados não contam.',
  'O faturamento parcial de hoje é extrapolado para o dia cheio antes de entrar na projeção, para não achatar o resultado de quem está performando bem agora.',
  'Projeções diárias só aparecem a partir de 60% do expediente; antes disso o painel exibe "—" porque o número seria ruído.',
  'Faltas, atrasos e pós-consulta consideram apenas o dia de referência da checklist, não o mês inteiro.',
];

const GaugeCard = ({
  title,
  value,
  max,
  helper,
  valueLabel,
  footnote,
  tooltip,
  freshness,
}: {
  title: string;
  value: number;
  max: number;
  helper: string;
  valueLabel?: string;
  /** Linha extra abaixo do helper, para contexto secundário (ex.: ritmo do mês). */
  footnote?: string;
  tooltip?: string;
  freshness?: MetricFreshness | null;
}) => {
  const gradientId = useId().replace(/:/g, '');
  const normalizedMax = max > 0 ? max : 1;
  const ratio = Math.max(0, Math.min(1, value / normalizedMax));
  const centerX = 100;
  const centerY = 100;
  const radius = 66;
  const displayedValue = valueLabel || formatPercent(ratio * 100);
  const angle = Math.PI - ratio * Math.PI;
  const needleLength = 54;
  const needleX = centerX + Math.cos(angle) * needleLength;
  const needleY = centerY - Math.sin(angle) * needleLength;
  const tickAngles = Array.from({ length: 11 }, (_, index) => Math.PI - (index / 10) * Math.PI);
  const valuePlateWidth = Math.max(66, Math.min(116, displayedValue.length * 9.4));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5" title={tooltip}>
      <svg viewBox="0 0 200 150" className="mx-auto h-36 w-full max-w-[14.5rem]">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#E24545" />
            <stop offset="38%" stopColor="#F08C00" />
            <stop offset="70%" stopColor="#66A63A" />
            <stop offset="100%" stopColor="#2F9E6F" />
          </linearGradient>
        </defs>
        {tickAngles.map((tickAngle, index) => {
          const outerX = centerX + Math.cos(tickAngle) * (radius + 12);
          const outerY = centerY - Math.sin(tickAngle) * (radius + 12);
          const innerX = centerX + Math.cos(tickAngle) * (radius + (index % 5 === 0 ? 3 : 7));
          const innerY = centerY - Math.sin(tickAngle) * (radius + (index % 5 === 0 ? 3 : 7));

          return (
            <line
              key={`${title}-${index}`}
              x1={innerX}
              y1={innerY}
              x2={outerX}
              y2={outerY}
              stroke="#94A3B8"
              strokeWidth={index % 5 === 0 ? 1.8 : 1}
              strokeLinecap="round"
              opacity={index % 5 === 0 ? 0.9 : 0.55}
            />
          );
        })}
        <path
          d={`M 28 100 A ${radius} ${radius} 0 0 1 172 100`}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="12"
          strokeLinecap="round"
          opacity="0.35"
        />
        <path
          d={`M 28 100 A ${radius} ${radius} 0 0 1 172 100`}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="12"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${ratio * 100} 100`}
        />
        <line
          x1={centerX}
          y1={centerY}
          x2={needleX}
          y2={needleY}
          stroke="#0F172A"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx={centerX} cy={centerY} r="5" fill="#0F172A" />
        <rect
          x={centerX - valuePlateWidth / 2}
          y="75"
          width={valuePlateWidth}
          height="24"
          rx="12"
          fill="#FFFFFF"
          opacity="0.96"
        />
        <text x="100" y="91" textAnchor="middle" className="fill-slate-900 text-[15px] font-bold">
          {displayedValue}
        </text>
        <text x="100" y="119" textAnchor="middle" className="fill-slate-500 text-[9px] font-semibold uppercase tracking-[0.15em]">
          {title}
        </text>
      </svg>
      <div className="mt-0.5 text-center text-[10px] text-slate-500">{helper}</div>
      {footnote ? <div className="mt-0.5 text-center text-[10px] text-slate-400">{footnote}</div> : null}
      {freshness ? <div className="mt-1 text-center text-[10px] text-slate-400">{renderFreshnessLabel(freshness)}</div> : null}
    </div>
  );
};

const TaskListPanel = ({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: TaskDetail[];
  emptyMessage: string;
}) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</div>
    <div className="mt-2 max-h-64 space-y-2 overflow-auto pr-1">
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-5 text-sm text-slate-500">{emptyMessage}</div>
      ) : (
        items.map((item) => (
          <div key={item.taskId} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
            <div className="text-sm font-semibold text-slate-900">{item.title}</div>
            <p className="mt-1 text-sm leading-5 text-slate-600">{item.description || 'Sem descrição'}</p>
          </div>
        ))
      )}
    </div>
  </div>
);

const HelpModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checklist-recepcao-help-title"
        className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Ajuda guiada</div>
            <h3 id="checklist-recepcao-help-title" className="mt-1 text-lg font-bold text-slate-900">
              Como funciona a checklist da recepção
            </h3>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Esta página consolida o acompanhamento gerencial da recepção com visão atual, histórico D-1, campos manuais salvos por dia e escopo local por líder.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="Fechar ajuda">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto px-5 py-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {helpWorkflowCards.map((item) => (
              <div key={item.title} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#17407E]">Fontes e regras</div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {helpRules.map((rule) => (
                <div key={rule} className="rounded-lg border border-blue-100 bg-white/80 px-3 py-2 text-xs leading-5 text-slate-600">
                  {rule}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const emptyManual = (data?: ChecklistData | null): ManualState => ({
  resolveMonthlyTarget: data?.manual.resolveMonthlyTarget || 0,
  resolveActual: data?.manual.resolveActual || 0,
  checkupMonthlyTarget: data?.manual.checkupMonthlyTarget || 0,
  checkupActual: data?.manual.checkupActual || 0,
  nfOpenStatus: data?.manual.nfOpenStatus || '',
  accountsOpenStatus: data?.manual.accountsOpenStatus || '',
  googleRating: data?.manual.googleRating || 0,
  googleNewReviewsCount: data?.manual.googleNewReviewsCount || 0,
  recollectionCount: data?.manual.recollectionCount || 0,
  recollectionNotes: data?.manual.recollectionNotes || '',
  recollections: data?.manual.recollections || [],
  pendingNotes: data?.manual.pendingNotes || '',
  generalNotes: data?.manual.generalNotes || '',
  riskGroups: data?.manual.riskGroups || [],
});

const configFromData = (payload?: ConfigOptionsPayload | null, source?: ChecklistData['config'] | ChecklistData['suggestedConfig'] | null): ConfigFormState => ({
  id: 'id' in (source || {}) ? String((source as { id?: string }).id || '') : '',
  name: 'name' in (source || {}) ? String((source as { name?: string }).name || '') : String(payload?.suggestedConfigDraft?.name || ''),
  leaderUserId: source?.leaderUserId || payload?.suggestedConfigDraft?.leaderUserId || payload?.suggestedConfig?.leaderUserId || '',
  leaderEmployeeId: source?.leaderEmployeeId || payload?.suggestedConfigDraft?.leaderEmployeeId || payload?.suggestedConfig?.leaderEmployeeId || '',
  leaderName: source?.leaderName || payload?.suggestedConfigDraft?.leaderName || payload?.suggestedConfig?.leaderName || '',
  units:
    'units' in (source || {}) && Array.isArray(source?.units)
      ? source.units
      : payload?.suggestedConfigDraft?.units || payload?.suggestedConfig?.units || [],
  teamEmployeeIds:
    'teamMembers' in (source || {}) && Array.isArray((source as ChecklistData['config'])?.teamMembers)
      ? ((source as ChecklistData['config'])?.teamMembers || []).map((member) => member.employeeId)
      : payload?.suggestedConfigDraft?.teamEmployeeIds || [],
  isActive: true,
});

export default function ChecklistRecepcaoPage() {
  const { data: session } = useSession();
  const role = String((session?.user as { role?: string } | undefined)?.role || 'OPERADOR').toUpperCase();
  const permissions = (session?.user as { permissions?: unknown } | undefined)?.permissions;
  const canEdit = hasPermission(permissions, 'checklist_recepcao', 'edit', role);
  const canRefresh = hasPermission(permissions, 'checklist_recepcao', 'refresh', role);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ChecklistData | null>(null);
  const [manual, setManual] = useState<ManualState>(emptyManual());
  const [riskGroups, setRiskGroups] = useState<RiskState>([]);
  const [selectedConfigId, setSelectedConfigId] = useState('');
  const [selectedLeaderUserId, setSelectedLeaderUserId] = useState('');
  const [selectedUnitKey, setSelectedUnitKey] = useState('');
  const [viewMode, setViewMode] = useState<'current' | 'd1'>('current');
  const [referenceDate, setReferenceDate] = useState('');
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [refreshRequesting, setRefreshRequesting] = useState(false);
  const [refreshStatusMessage, setRefreshStatusMessage] = useState<string | null>(null);
  const [refreshServices, setRefreshServices] = useState<RefreshServiceStatus[]>([]);
  const [batchStatus, setBatchStatus] = useState<RefreshServiceStatus | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configPayload, setConfigPayload] = useState<ConfigOptionsPayload | null>(null);
  const [configForm, setConfigForm] = useState<ConfigFormState>(configFromData());
  const [leaderSearch, setLeaderSearch] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const requestStateRef = useRef({
    selectedConfigId: '',
    selectedLeaderUserId: '',
    selectedUnitKey: '',
    viewMode: 'current' as 'current' | 'd1',
    referenceDate: '',
    refreshSeed: 0,
  });

  const updateRecollections = useCallback((nextRows: RecollectionEntry[]) => {
    setManual((current) => ({
      ...current,
      recollections: nextRows,
      recollectionCount: nextRows.length,
      recollectionNotes: nextRows.map((entry) => entry.notes).filter(Boolean).join('\n\n'),
    }));
  }, []);

  const addRecollection = useCallback(() => {
    updateRecollections([...(manual.recollections || []), { id: crypto.randomUUID(), notes: '' }]);
  }, [manual.recollections, updateRecollections]);

  const removeRecollection = useCallback((id: string) => {
    updateRecollections((manual.recollections || []).filter((entry) => entry.id !== id));
  }, [manual.recollections, updateRecollections]);

  const updateRecollectionNotes = useCallback((id: string, notes: string) => {
    updateRecollections((manual.recollections || []).map((entry) => (entry.id === id ? { ...entry, notes } : entry)));
  }, [manual.recollections, updateRecollections]);

  const fetchData = useCallback(async (opts?: { forceFresh?: boolean; nextConfigId?: string; nextLeaderUserId?: string; nextUnitKey?: string; nextViewMode?: 'current' | 'd1'; nextReferenceDate?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      const currentState = requestStateRef.current;
      const configId = opts?.nextConfigId ?? currentState.selectedConfigId;
      const leaderUserId = opts?.nextLeaderUserId ?? currentState.selectedLeaderUserId;
      const unitKey = opts?.nextUnitKey ?? currentState.selectedUnitKey;
      const mode = opts?.nextViewMode ?? currentState.viewMode;
      const date = opts?.nextReferenceDate ?? currentState.referenceDate;

      if (configId) params.set('configId', configId);
      if (leaderUserId) params.set('leaderUserId', leaderUserId);
      if (unitKey) params.set('unitKey', unitKey);
      params.set('viewMode', mode);
      if (date) params.set('referenceDate', date);
      if (opts?.forceFresh || currentState.refreshSeed > 0) params.set('refresh', String(Date.now()));

      const response = await fetch(`/api/admin/checklist/recepcao?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || payload?.status !== 'success') {
        throw new Error(payload?.error || 'Falha ao carregar checklist.');
      }

      const nextData = payload.data as ChecklistData;
      setData(nextData);
      setSelectedConfigId(nextData.config?.id || configId || '');
      setSelectedLeaderUserId(nextData.selectedLeaderUserId || leaderUserId || '');
      setSelectedUnitKey(nextData.selectedUnitKey);
      setViewMode(nextData.viewMode);
      setReferenceDate(nextData.referenceDate);
      setManual(emptyManual(nextData));
      setRiskGroups(nextData.riskGroups || []);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Erro ao carregar checklist.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConfigPayload = async () => {
    setConfigLoading(true);
    try {
      const response = await fetch('/api/admin/checklist/recepcao/configs', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || payload?.status !== 'success') {
        throw new Error(payload?.error || 'Falha ao carregar configuracoes.');
      }
      const nextPayload = payload.data as ConfigOptionsPayload;
      setConfigPayload(nextPayload);
      setConfigForm(configFromData(nextPayload, data?.config || data?.suggestedConfig || null));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar configuracoes.');
    } finally {
      setConfigLoading(false);
    }
  };

  const readRefreshStatus = useCallback(async () => {
    const response = await fetch('/api/admin/checklist/recepcao/refresh', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok || payload?.status !== 'success') {
      throw new Error(payload?.error || 'Falha ao consultar status da atualização.');
    }
    setBatchStatus((payload.data?.batchStatus || null) as RefreshServiceStatus | null);
    setRefreshServices(Array.isArray(payload.data?.services) ? (payload.data.services as RefreshServiceStatus[]) : []);
    return payload.data as { batchStatus: RefreshServiceStatus | null; services: RefreshServiceStatus[] };
  }, []);

  const pollRefreshUntilSettled = useCallback(async () => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 3 * 60 * 1000) {
      const status = await readRefreshStatus();
      if (!status.batchStatus?.isActive) {
        await fetchData({ forceFresh: true });
        return status;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 4000));
    }
    return null;
  }, [fetchData, readRefreshStatus]);

  const handleRefresh = useCallback(async () => {
    if (!canRefresh) return;
    setRefreshRequesting(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/checklist/recepcao/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const payload = await response.json();
      if (!response.ok || payload?.status !== 'success') {
        throw new Error(payload?.error || 'Falha ao solicitar atualização da checklist.');
      }
      setRefreshStatusMessage(String(payload.message || 'Atualização solicitada.'));
      setBatchStatus((payload.batchStatus || null) as RefreshServiceStatus | null);
      setRefreshServices(Array.isArray(payload.services) ? (payload.services as RefreshServiceStatus[]) : []);
      await pollRefreshUntilSettled();
      setRefreshSeed((current) => current + 1);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Erro ao atualizar checklist.');
    } finally {
      setRefreshRequesting(false);
    }
  }, [canRefresh, pollRefreshUntilSettled]);

  useEffect(() => {
    requestStateRef.current = {
      selectedConfigId,
      selectedLeaderUserId,
      selectedUnitKey,
      viewMode,
      referenceDate,
      refreshSeed,
    };
  }, [referenceDate, refreshSeed, selectedConfigId, selectedLeaderUserId, selectedUnitKey, viewMode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchData({ nextViewMode: 'current' });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchData, refreshSeed]);

  useEffect(() => {
    void readRefreshStatus().catch(() => undefined);
  }, [readRefreshStatus]);

  const handleSave = async () => {
    if (!data?.config || !canEdit || data.readOnly) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/checklist/recepcao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configId: data.config.id,
          unitKey: data.selectedUnitKey,
          // Salva na data em que a página está: permite corrigir um dia fechado.
          referenceDate: data.referenceDate,
          manual: {
            ...manual,
            recollectionCount: (manual.recollections || []).length,
            recollectionNotes: (manual.recollections || []).map((entry) => entry.notes).filter(Boolean).join('\n\n'),
            googleRating: Number(manual.googleRating),
            riskGroups: riskGroups.map((group) => ({
              groupName: group.groupName,
              planAction: group.planAction,
              fact: group.fact,
              cause: group.cause,
              action: group.action,
            })),
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload?.status !== 'success') {
        throw new Error(payload?.error || 'Falha ao salvar checklist.');
      }
      await fetchData({
        forceFresh: true,
        nextConfigId: data.config.id,
        nextUnitKey: data.selectedUnitKey,
        nextViewMode: data.viewMode,
        nextReferenceDate: data.referenceDate,
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Erro ao salvar checklist.');
    } finally {
      setSaving(false);
    }
  };

  const handleExportPdf = () => {
    const params = new URLSearchParams();
    if (selectedConfigId) params.set('configId', selectedConfigId);
    if (selectedLeaderUserId) params.set('leaderUserId', selectedLeaderUserId);
    if (selectedUnitKey) params.set('unitKey', selectedUnitKey);
    if (referenceDate) params.set('referenceDate', referenceDate);
    params.set('viewMode', viewMode);
    window.open(`/api/admin/checklist/recepcao/export.pdf?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedConfigId) params.set('configId', selectedConfigId);
      if (selectedUnitKey) params.set('unitKey', selectedUnitKey);
      const response = await fetch(`/api/admin/checklist/recepcao/history?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || payload?.status !== 'success') {
        throw new Error(payload?.error || 'Falha ao carregar o histórico de preenchimentos.');
      }
      setHistoryEntries((payload.data || []) as HistoryEntry[]);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : 'Erro ao carregar o histórico.');
      setHistoryEntries([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openConfigModal = async () => {
    setLeaderSearch('');
    setTeamSearch('');
    setConfigModalOpen(true);
    await loadConfigPayload();
  };

  const submitConfig = async () => {
    setConfigSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/checklist/recepcao/configs', {
        method: configForm.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configForm),
      });
      const payload = await response.json();
      if (!response.ok || payload?.status !== 'success') {
        throw new Error(payload?.error || 'Falha ao salvar configuracao.');
      }
      setConfigModalOpen(false);
      await fetchData({ forceFresh: true, nextConfigId: payload?.data?.id || configForm.id || selectedConfigId });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Erro ao salvar configuracao.');
    } finally {
      setConfigSaving(false);
    }
  };

  const createSuggestedConfig = async () => {
    setConfigSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/checklist/recepcao/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useSuggestedDraft: true }),
      });
      const payload = await response.json();
      if (!response.ok || payload?.status !== 'success') {
        throw new Error(payload?.error || 'Falha ao criar configuracao sugerida.');
      }
      setConfigModalOpen(false);
      await fetchData({
        forceFresh: true,
        nextLeaderUserId: '',
        nextConfigId: payload?.data?.id || '',
        nextUnitKey: '',
      });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Erro ao criar configuracao sugerida.');
    } finally {
      setConfigSaving(false);
    }
  };

  const currentLeader = useMemo(
    () => configPayload?.options.leaders.find((item) => item.userId === configForm.leaderUserId) || null,
    [configForm.leaderUserId, configPayload?.options.leaders],
  );

  const filteredLeaderOptions = useMemo(() => {
    const search = normalizeSearchText(leaderSearch);
    const items = configPayload?.options.leaders || [];
    if (!search) return items;
    return items.filter((leader) =>
      normalizeSearchText(`${leader.name} ${leader.department || ''} ${(leader.units || []).join(' ')}`).includes(search),
    );
  }, [configPayload?.options.leaders, leaderSearch]);

  /** Configuração que o modal está editando no momento (vazio = nova). */
  const editingConfig = useMemo(
    () => (configPayload?.configs || []).find((item) => item.id === configForm.id) || null,
    [configForm.id, configPayload?.configs],
  );

  /**
   * Lista de colaboradores do modal: as opções atuais mais quem já estava salvo
   * na configuração e saiu do cadastro ativo. Sem isso, um colaborador inativado
   * some da tela e é descartado no próximo salvamento.
   */
  const teamOptionsForForm = useMemo(() => {
    const options = configPayload?.options.teamMembers || [];
    const knownIds = new Set(options.map((member) => member.employeeId));
    const preserved = (editingConfig?.teamMembers || []).filter((member) => !knownIds.has(member.employeeId));
    return [...options, ...preserved].sort((left, right) =>
      left.fullName.localeCompare(right.fullName, 'pt-BR', { sensitivity: 'base' }),
    );
  }, [configPayload?.options.teamMembers, editingConfig?.teamMembers]);

  const inactiveTeamMemberIds = useMemo(() => {
    const knownIds = new Set((configPayload?.options.teamMembers || []).map((member) => member.employeeId));
    return new Set(teamOptionsForForm.filter((member) => !knownIds.has(member.employeeId)).map((member) => member.employeeId));
  }, [configPayload?.options.teamMembers, teamOptionsForForm]);

  const filteredTeamOptions = useMemo(() => {
    const search = normalizeSearchText(teamSearch);
    const items = teamOptionsForForm;
    if (!search) return items;
    return items.filter((member) =>
      normalizeSearchText(`${member.fullName} ${member.department || ''} ${(member.units || []).join(' ')}`).includes(search),
    );
  }, [teamOptionsForForm, teamSearch]);

  const selectedTeamMembersPreview = useMemo(() => {
    const selectedIds = new Set(configForm.teamEmployeeIds);
    return teamOptionsForForm.filter((member) => selectedIds.has(member.employeeId));
  }, [configForm.teamEmployeeIds, teamOptionsForForm]);

  const startNewConfig = () => {
    setConfigForm({
      id: '',
      name: '',
      leaderUserId: '',
      leaderEmployeeId: '',
      leaderName: '',
      units: [],
      teamEmployeeIds: [],
      isActive: true,
    });
    setLeaderSearch('');
    setTeamSearch('');
  };

  const selectConfigToEdit = (configId: string) => {
    if (!configId) {
      startNewConfig();
      return;
    }
    const target = (configPayload?.configs || []).find((item) => item.id === configId);
    if (!target) return;
    setConfigForm({
      id: target.id,
      name: target.name,
      leaderUserId: target.leaderUserId,
      leaderEmployeeId: target.leaderEmployeeId || '',
      leaderName: target.leaderName,
      units: target.units,
      teamEmployeeIds: (target.teamMembers || []).map((member) => member.employeeId),
      isActive: target.isActive,
    });
  };

  const googleGaugeActual = manual.googleRating;
  const googleGaugeTarget = data?.metrics.google.ratingTarget || 4.7;
  const resolveGaugeActual = manual.resolveActual;
  const resolveGaugeTarget = manual.resolveMonthlyTarget;
  const checkupGaugeActual = manual.checkupActual;
  const checkupGaugeTarget = manual.checkupMonthlyTarget;

  const applyCurrentLeaderUnits = () => {
    if (!currentLeader) return;
    setConfigForm((current) => ({
      ...current,
      units: currentLeader.units || [],
    }));
  };

  const isInitialLoading = loading && !data;
  const isRefreshing = loading && !!data;

  if (isInitialLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2 text-slate-700">
          <Loader2 size={16} className="animate-spin" />
          Carregando checklist da recepção...
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-3 md:p-4">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
        <section className={`${sectionClassName} overflow-hidden`}>
          <div className="border-b border-slate-200 bg-white px-4 py-3.5">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.82fr)] xl:items-start">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  <Gauge size={11} />
                  Checklist gerencial
                </div>
                <h1 className="mt-2 text-[1.7rem] font-bold leading-tight text-slate-900">Checklist Recepção</h1>
                <p className="mt-1.5 max-w-4xl text-[13px] leading-6 text-slate-500">
                  Visão operacional com modo atual, histórico D-1 editável para correção, escopo local de liderança e exportação em PDF.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-1.5">
                <div className="grid gap-2 sm:grid-cols-2">
                {isRefreshing || refreshRequesting || batchStatus?.isActive ? (
                    <div className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-600 sm:col-span-2">
                    <Loader2 size={15} className="animate-spin" />
                    {refreshRequesting ? 'Solicitando atualização...' : batchStatus?.isActive ? 'Lote em processamento...' : 'Atualizando indicadores...'}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => setHelpOpen(true)}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  <CircleHelp size={13} />
                  Como funciona
                </button>
                {data?.access.isManager ? (
                  <button
                    type="button"
                    onClick={openConfigModal}
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Settings2 size={13} />
                    Configurar líder/equipe
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={!canRefresh || refreshRequesting}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw size={13} />
                  Atualizar
                </button>
                <button
                  type="button"
                  onClick={handleExportPdf}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Download size={13} />
                  PDF
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canEdit || data?.readOnly || saving || !data?.config}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#17407E] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#123666] disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-2.5 bg-slate-50/70 px-4 py-3 md:grid-cols-2 xl:grid-cols-12">
            {data?.access.isManager ? (
              <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500 xl:col-span-2">
                Líder
                <select
                  value={selectedLeaderUserId}
                  onChange={(event) =>
                    void fetchData({
                      nextLeaderUserId: event.target.value,
                      nextConfigId: '',
                      nextUnitKey: '',
                                  })
                  }
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium normal-case tracking-normal text-slate-800 outline-none"
                >
                  <option value="">Todos os líderes</option>
                  {(data?.availableLeaderFilters || []).map((leader) => (
                    <option key={leader.userId} value={leader.userId}>
                      {leader.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500 xl:col-span-2">
              Configuração
              <select
                value={selectedConfigId}
                onChange={(event) => void fetchData({ nextConfigId: event.target.value })}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium normal-case tracking-normal text-slate-800 outline-none"
              >
                <option value="">Selecione</option>
                {(data?.availableConfigs || []).map((config) => (
                  <option key={config.id} value={config.id}>
                    {config.name} - {config.leaderName}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500 xl:col-span-2">
              Unidade
              <select
                value={selectedUnitKey}
                onChange={(event) => void fetchData({ nextUnitKey: event.target.value })}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium normal-case tracking-normal text-slate-800 outline-none"
              >
                {(data?.availableUnits || []).map((unit) => (
                  <option key={unit.key} value={unit.key}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500 xl:col-span-2">
              Modo
              <select
                value={viewMode}
                onChange={(event) =>
                  void fetchData({
                    nextViewMode: event.target.value === 'd1' ? 'd1' : 'current',
                    nextReferenceDate: event.target.value === 'd1' ? data?.referenceDate || referenceDate : data?.today || referenceDate,
                              })
                }
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium normal-case tracking-normal text-slate-800 outline-none"
              >
                <option value="current">Hoje</option>
                <option value="d1">D-1</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500 xl:col-span-2">
              Data de referência
              <input
                type="date"
                value={referenceDate}
                max={data?.today || undefined}
                onChange={(event) => {
                  const nextDate = event.target.value;
                  setReferenceDate(nextDate);
                  void fetchData({ nextReferenceDate: nextDate });
                }}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium normal-case tracking-normal text-slate-800 outline-none"
              />
            </label>
            <div className="flex flex-col justify-end gap-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500 xl:col-span-2">
              Preenchimento
              <button
                type="button"
                onClick={openHistory}
                className="inline-flex h-9 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium normal-case tracking-normal text-slate-800 hover:bg-slate-50"
              >
                <span className="truncate">
                  {data?.lastSave?.savedAt
                    ? `${formatDateTimeBr(data.lastSave.savedAt)}${data.lastSave.savedByName ? ` · ${data.lastSave.savedByName}` : ''}`
                    : 'Ainda não preenchido'}
                </span>
                <History size={14} className="shrink-0 text-slate-400" />
              </button>
            </div>
            <div className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 md:col-span-2 xl:col-span-12">
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">Escopo local</div>
              <div className="mt-1.5 text-[14px] font-semibold text-slate-900">{data?.config?.leaderName || 'Sem configuração'}</div>
              <div className="mt-1 text-[12px] text-slate-500">{data?.config?.teamMembers.length || 0} colaborador(es) na equipe local</div>
              <div className="mt-1.5 text-[12px] text-slate-500">
                Unidades habilitadas: {data?.config?.units.map((unitKey) => data.availableUnits.find((unit) => unit.key === unitKey)?.label || unitKey).join(', ') || 'Nenhuma'}
              </div>
              <div className="mt-1.5 text-[12px] leading-5 text-slate-500">As unidades exibidas dependem da configuração local da checklist, não da equipe local.</div>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        {refreshStatusMessage || batchStatus ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            {refreshStatusMessage ? <div>{refreshStatusMessage}</div> : null}
            {batchStatus ? (
              <div className="mt-1 text-[12px] text-slate-500">
                Lote: {batchStatus.status} • {formatDateTimeBr(batchStatus.lastRun)}
              </div>
            ) : null}
            {refreshServices.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                {refreshServices.map((service) => (
                  <span key={service.serviceName} className="rounded-full bg-slate-100 px-2 py-1">
                    {service.serviceName}: {service.status}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {!data?.config ? (
          <section className={`${sectionClassName} p-6`}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 text-amber-600" size={18} />
              <div>
                <h2 className="text-base font-semibold text-slate-900">Nenhuma configuração local encontrada</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Esta página depende de uma configuração local de líder, unidades e equipe. A gerência pode criar a primeira configuração pelo modal
                  de ajuste próprio da checklist.
                </p>
                {data?.access.isManager && data?.suggestedConfigDraft ? (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={createSuggestedConfig}
                      disabled={configSaving}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#17407E] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {configSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                      {configSaving ? 'Criando...' : 'Criar configuração sugerida'}
                    </button>
                    <button
                      type="button"
                      onClick={openConfigModal}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                    >
                      <Settings2 size={15} />
                      Ajustar manualmente
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : (
          <>
            <div className="grid gap-2.5 xl:grid-cols-4">
              <Card
                title="Faturamento do Dia"
                value={formatCurrency(data.metrics.unit.revenueDay)}
                helper={`Ticket médio: ${formatCurrency(data.metrics.unit.ticketAverageDay)}`}
                icon={<TrendingUp size={16} />}
                freshness={data.metrics.unit.freshness.revenueDay}
              />
              <Card
                title="Faturamento no Mês"
                value={formatCurrency(data.metrics.unit.revenueMonth)}
                helper={`Meta mensal: ${formatCurrency(data.metrics.unit.monthlyGoal)}`}
                icon={<Target size={16} />}
                freshness={data.metrics.unit.freshness.revenueMonth}
              />
              <Card
                title="Meta Diária Dinâmica"
                value={formatCurrency(data.metrics.unit.dynamicDailyTarget)}
                helper={`${formatOperationalDays(data.metrics.unit.businessDaysRemaining)} dia(s) operacionais restantes`}
                icon={<CalendarDays size={16} />}
                freshness={data.metrics.unit.freshness.dynamicDailyTarget}
              />
              <Card
                title="Orçamentos em Aberto"
                value={String(data.metrics.proposals.openCount)}
                helper={`${formatCurrency(data.metrics.proposals.openValue)} • ${formatDateBr(data.metrics.proposals.periodStart)} a ${formatDateBr(data.metrics.proposals.periodEnd)}`}
                icon={<FileText size={16} />}
                freshness={data.metrics.proposals.freshness}
              />
            </div>

            <section className={`${sectionClassName} p-3.5`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[0.98rem] font-bold text-slate-900">Faturamento da unidade</h2>
                  <p className="mt-1 text-[12px] text-slate-500">
                    Velocímetros da unidade com realizado diário, acumulado do mês, projeção de fechamento até {formatDateBr(data.referenceDate)} e nota Google.
                  </p>
                </div>
                <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                  {data.readOnly ? 'Data futura' : data.isHistorical ? 'D-1 editável' : 'Hoje editável'}
                </div>
              </div>
              <div className="mt-3 grid gap-2.5 xl:grid-cols-4">
                <GaugeCard
                  title="Faturamento mensal"
                  value={data.metrics.unit.revenueMonth}
                  max={data.metrics.unit.monthlyGoal}
                  helper={`${formatCurrency(data.metrics.unit.revenueMonth)} / ${formatCurrency(data.metrics.unit.monthlyGoal)}`}
                  valueLabel={formatCompactCurrency(data.metrics.unit.revenueMonth)}
                  freshness={data.metrics.unit.freshness.revenueMonth}
                />
                <GaugeCard
                  title="Faturamento diário"
                  value={data.metrics.unit.revenueDay}
                  max={data.metrics.unit.dynamicDailyTarget}
                  helper={`${formatCurrency(data.metrics.unit.revenueDay)} / ${formatCurrency(data.metrics.unit.dynamicDailyTarget)}`}
                  valueLabel={formatCompactCurrency(data.metrics.unit.revenueDay)}
                  freshness={data.metrics.unit.freshness.revenueDay}
                />
                <GaugeCard
                  title="Projeção do mês"
                  value={data.metrics.unit.projectionSuppressed ? data.metrics.unit.revenueMonth : data.metrics.unit.projectionMonth}
                  max={data.metrics.unit.monthlyGoal}
                  helper={`Proj. ${formatCurrency(data.metrics.unit.projectionMonth)} / Meta ${formatCurrency(data.metrics.unit.monthlyGoal)}`}
                  valueLabel={data.metrics.unit.projectionSuppressed ? '—' : formatPercent(data.metrics.unit.projectionPct)}
                  footnote={`Ritmo até hoje: ${formatPercent(data.metrics.unit.pacePct)} do esperado (${formatCurrency(data.metrics.unit.shouldHaveUntilDate)})`}
                  tooltip={data.metrics.unit.projectionHint}
                  freshness={data.metrics.unit.freshness.shouldHaveUntilDate}
                />
                <GaugeCard
                  title="Google"
                  value={googleGaugeActual}
                  max={googleGaugeTarget}
                  helper={`${googleGaugeActual.toFixed(1).replace('.', ',')} / ${googleGaugeTarget.toFixed(1).replace('.', ',')}`}
                  valueLabel={googleGaugeActual.toFixed(1).replace('.', ',')}
                />
              </div>
            </section>

            <section className={`${sectionClassName} p-3.5`}>
              <div className="flex items-center gap-3">
                <Users className="text-slate-500" size={18} />
                <div>
                  <h2 className="text-[0.98rem] font-bold text-slate-900">Faturamento por colaborador</h2>
                  <p className="mt-1 text-[12px] text-slate-500">
                    A equipe local configurada nesta página alimenta a visão individual de metas e realizado. O realizado no dia refere-se a {formatDateBr(data.referenceDate)}.
                    O progresso diário compara o realizado do dia com a meta diária dinâmica; o mensal compara o acumulado do mês com a meta mensal.
                  </p>
                  <p className="mt-1 text-[10px] text-slate-400">{renderFreshnessLabel(data.metrics.collaboratorsFreshness)}</p>
                </div>
              </div>
              <div className={tableShellClassName}>
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      <th className="px-4 py-3">Colaborador</th>
                      <th className="px-4 py-3">Meta mensal</th>
                      <th className="px-4 py-3">Realizado no dia</th>
                      <th className="px-4 py-3">Realizado no mês</th>
                      <th className="px-4 py-3">Meta diária dinâmica</th>
                      <th className="px-4 py-3">Progresso diário</th>
                      <th className="px-4 py-3">Progresso mensal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {data.metrics.collaborators.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                          Nenhum colaborador foi configurado na equipe local desta checklist.
                        </td>
                      </tr>
                    ) : (
                      data.metrics.collaborators.map((row) => (
                        <tr key={row.employeeId}>
                          <td className="px-4 py-3 font-medium text-slate-900">{row.fullName}</td>
                          <td className="px-4 py-3 text-slate-600">{formatCurrency(row.monthlyGoal)}</td>
                          <td className={`px-4 py-3 ${row.revenueDay > 0 ? 'font-semibold text-slate-900' : 'text-slate-400'}`}>
                            {formatCurrency(row.revenueDay)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{formatCurrency(row.revenueMonth)}</td>
                          <td className="px-4 py-3 text-slate-600">{formatCurrency(row.dynamicDailyTarget)}</td>
                          <td
                            className={`px-4 py-3 font-semibold ${
                              row.dailyProgressPct === null
                                ? 'text-slate-400'
                                : row.dailyProgressPct >= 100
                                  ? 'text-emerald-700'
                                  : row.dailyProgressPct >= 85
                                    ? 'text-amber-700'
                                    : 'text-rose-700'
                            }`}
                            title={
                              row.dailyProgressPct === null
                                ? 'Sem meta diária a perseguir nesta data.'
                                : `${formatCurrency(row.revenueDay)} de ${formatCurrency(row.dynamicDailyTarget)}`
                            }
                          >
                            {row.dailyProgressPct === null ? '—' : formatPercent(row.dailyProgressPct)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{formatPercent(row.progressPct)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-2">
              <section className={`${sectionClassName} p-3.5`}>
                <h2 className="text-[0.98rem] font-bold text-slate-900">Resolve e Check-up da equipe</h2>
                <p className="mt-1 text-[12px] text-slate-500">Velocímetros da meta geral da equipe no v1 manual, prontos para troca futura da origem sem mudar a interface.</p>
                <div className="mt-3 grid gap-2.5 md:grid-cols-2">
                  <GaugeCard
                    title="Meta geral Resolve"
                    value={resolveGaugeActual}
                    max={resolveGaugeTarget}
                    helper={`${resolveGaugeActual} / ${resolveGaugeTarget}`}
                    valueLabel={String(resolveGaugeActual)}
                  />
                  <GaugeCard
                    title="Meta geral Check-up"
                    value={checkupGaugeActual}
                    max={checkupGaugeTarget}
                    helper={`${checkupGaugeActual} / ${checkupGaugeTarget}`}
                    valueLabel={String(checkupGaugeActual)}
                  />
                </div>
                <fieldset disabled={!canEdit || data.readOnly} className={`mt-3 grid gap-2.5 md:grid-cols-2 ${!canEdit || data.readOnly ? 'opacity-70' : ''}`}>
                  <label className="text-[13px] font-medium text-slate-700">
                    Meta mensal Resolve
                    <input
                      type="number"
                      min={0}
                      value={manual.resolveMonthlyTarget}
                      onChange={(event) => setManual((current) => ({ ...current, resolveMonthlyTarget: toNumberInput(event.target.value) }))}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 outline-none"
                    />
                  </label>
                  <label className="text-[13px] font-medium text-slate-700">
                    Realizado Resolve
                    <input
                      type="number"
                      min={0}
                      value={manual.resolveActual}
                      onChange={(event) => setManual((current) => ({ ...current, resolveActual: toNumberInput(event.target.value) }))}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 outline-none"
                    />
                  </label>
                  <label className="text-[13px] font-medium text-slate-700">
                    Meta mensal Check-up
                    <input
                      type="number"
                      min={0}
                      value={manual.checkupMonthlyTarget}
                      onChange={(event) => setManual((current) => ({ ...current, checkupMonthlyTarget: toNumberInput(event.target.value) }))}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 outline-none"
                    />
                  </label>
                  <label className="text-[13px] font-medium text-slate-700">
                    Realizado Check-up
                    <input
                      type="number"
                      min={0}
                      value={manual.checkupActual}
                      onChange={(event) => setManual((current) => ({ ...current, checkupActual: toNumberInput(event.target.value) }))}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 outline-none"
                    />
                  </label>
                </fieldset>
              </section>

              <section className={`${sectionClassName} p-3.5`}>
                <h2 className="text-[0.98rem] font-bold text-slate-900">Operação e equipe</h2>
                <div className="mt-3">
                  <GaugeCard
                    title="Confirmação de agendamentos D+1"
                    value={data.metrics.appointmentsConfirmation.ratePct}
                    max={100}
                    helper={`${formatPercent(data.metrics.appointmentsConfirmation.ratePct)} | ${data.metrics.appointmentsConfirmation.confirmed}/${data.metrics.appointmentsConfirmation.total}`}
                    valueLabel={formatPercent(data.metrics.appointmentsConfirmation.ratePct)}
                    freshness={data.metrics.appointmentsConfirmation.freshness}
                  />
                </div>
                <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  <Card
                    title="Pós-consulta equipe"
                    value={formatPercent(data.metrics.postConsult.conversionRate)}
                    helper={`${data.metrics.postConsult.totalClosedEvents}/${data.metrics.postConsult.totalEvents} fechados em ${formatDateBr(data.referenceDate)}`}
                    icon={<TrendingUp size={16} />}
                    freshness={data.metrics.postConsult.freshness}
                  />
                  <Card
                    title="Espera recepção"
                    value={`${data.metrics.waits.receptionAverageMinutes} min`}
                    helper={`${data.metrics.waits.receptionAttendedCount} atendidos`}
                    icon={<Users size={16} />}
                    freshness={data.metrics.waits.freshness.reception}
                  />
                  <Card
                    title="Espera médico"
                    value={`${data.metrics.waits.medicAverageMinutes} min`}
                    helper={`${data.metrics.waits.medicAttendedCount} atendidos`}
                    icon={<Users size={16} />}
                    freshness={data.metrics.waits.freshness.medic}
                  />
                  <Card
                    title="Tarefas da líder"
                    value={String(data.metrics.tasks.overdueTasks)}
                    helper={`${data.metrics.tasks.dueNext7DaysTasks} vencem em 7 dias`}
                    icon={<AlertTriangle size={16} />}
                    freshness={data.metrics.tasks.freshness}
                  />
                </div>
                <div className="mt-3 grid gap-2.5 lg:grid-cols-2">
                  <TaskListPanel
                    title="Tarefas vencidas"
                    items={data.metrics.tasks.overdueItems}
                    emptyMessage="Nenhuma tarefa vencida foi encontrada para a líder neste recorte."
                  />
                  <TaskListPanel
                    title="Tarefas a vencer em 7 dias"
                    items={data.metrics.tasks.dueSoonItems}
                    emptyMessage="Nenhuma tarefa a vencer nos próximos 7 dias foi encontrada para a líder neste recorte."
                  />
                </div>
              </section>
            </div>

            <section className={`${sectionClassName} p-3.5`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[0.98rem] font-bold text-slate-900">Faltas e atrasos da equipe local</h2>
                  <p className="mt-1 text-[12px] text-slate-500">
                    Somente o dia de referência ({formatDateBr(data.referenceDate)}), para a equipe vinculada à líder desta configuração.
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-2.5 md:grid-cols-2">
                <Card
                  title="Faltas no dia"
                  value={String(data.metrics.absences.absenceDays)}
                  helper={`${data.metrics.absences.trackedEmployees} colaborador(es) monitorados`}
                  icon={<AlertTriangle size={16} />}
                  freshness={data.metrics.absences.freshness}
                />
                <Card
                  title="Atrasos no dia"
                  value={`${data.metrics.absences.lateMinutes} min`}
                  helper={`${data.metrics.absences.rows.length} colaborador(es) com ocorrência`}
                  icon={<AlertTriangle size={16} />}
                  freshness={data.metrics.absences.freshness}
                />
              </div>
              <div className={tableShellClassName}>
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      <th className="px-4 py-3">Colaborador</th>
                      <th className="px-4 py-3">Faltas</th>
                      <th className="px-4 py-3">Atrasos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {data.metrics.absences.rows.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                          Nenhuma falta ou atraso foi encontrado para a equipe local nesse dia.
                        </td>
                      </tr>
                    ) : (
                      data.metrics.absences.rows.map((row) => (
                        <tr key={`${row.employeeId || row.employeeName}`}>
                          <td className="px-4 py-3 font-medium text-slate-900">{row.employeeName}</td>
                          <td className="px-4 py-3 text-slate-600">{row.absenceDays}</td>
                          <td className="px-4 py-3 text-slate-600">{row.lateMinutes} min</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={`${sectionClassName} p-3.5`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[0.98rem] font-bold text-slate-900">Pendências e validações</h2>
                  <p className="mt-1 text-[12px] text-slate-500">Campos manuais gravados a cada salvamento da checklist.</p>
                </div>
              </div>
              <fieldset disabled={!canEdit || data.readOnly} className={`mt-3 grid gap-2.5 md:grid-cols-2 ${!canEdit || data.readOnly ? 'opacity-70' : ''}`}>
                <label className="text-[13px] font-medium text-slate-700">
                  Nota fiscal em aberto
                  <select
                    value={manual.nfOpenStatus}
                    onChange={(event) => setManual((current) => ({ ...current, nfOpenStatus: event.target.value }))}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 outline-none"
                  >
                    <option value="">Selecione</option>
                    <option value="Validado">Validado</option>
                    <option value="Nao validado">Não validado</option>
                  </select>
                </label>
                <label className="text-[13px] font-medium text-slate-700">
                  Contas em aberto
                  <select
                    value={manual.accountsOpenStatus}
                    onChange={(event) => setManual((current) => ({ ...current, accountsOpenStatus: event.target.value }))}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 outline-none"
                  >
                    <option value="">Selecione</option>
                    <option value="Validado">Validado</option>
                    <option value="Nao validado">Não validado</option>
                  </select>
                </label>
                <label className="text-[13px] font-medium text-slate-700">
                  Avaliação Google
                  <input
                    type="number"
                    min={0}
                    max={5}
                    step="0.1"
                    value={manual.googleRating}
                    onChange={(event) => setManual((current) => ({ ...current, googleRating: toNumberInput(event.target.value) }))}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 outline-none"
                  />
                </label>
                <label className="text-[13px] font-medium text-slate-700">
                  Novas avaliações no Google
                  <input
                    type="number"
                    min={0}
                    value={manual.googleNewReviewsCount}
                    onChange={(event) => setManual((current) => ({ ...current, googleNewReviewsCount: toNumberInput(event.target.value) }))}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 outline-none"
                  />
                </label>
                <label className="text-[13px] font-medium text-slate-700 md:col-span-2">
                  Pendências da unidade
                  <textarea
                    rows={4}
                    value={manual.pendingNotes}
                    onChange={(event) => setManual((current) => ({ ...current, pendingNotes: event.target.value }))}
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-3 outline-none"
                  />
                </label>
                <label className="text-[13px] font-medium text-slate-700 md:col-span-2">
                  Observações gerais
                  <textarea
                    rows={4}
                    value={manual.generalNotes}
                    onChange={(event) => setManual((current) => ({ ...current, generalNotes: event.target.value }))}
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-3 outline-none"
                  />
                </label>
              </fieldset>
            </section>

            <section className={`${sectionClassName} p-5`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Recoletas</h2>
                  <p className="mt-1 text-sm text-slate-500">Registre cada recoleta separadamente com observações individuais. A contagem é automática.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {manual.recollections.length} recoleta(s)
                  </div>
                  <button
                    type="button"
                    onClick={addRecollection}
                    disabled={!canEdit || data.readOnly}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Plus size={15} />
                    Adicionar recoleta
                  </button>
                </div>
              </div>
              <div className="mt-4 max-h-[24rem] overflow-auto rounded-2xl border border-slate-200 bg-slate-50/40 p-4">
                {manual.recollections.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                    Nenhuma recoleta registrada até o momento.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {manual.recollections.map((entry, index) => (
                      <div key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-slate-900">Recoleta {index + 1}</div>
                          <button
                            type="button"
                            onClick={() => removeRecollection(entry.id)}
                            disabled={!canEdit || data.readOnly}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Trash2 size={14} />
                            Remover
                          </button>
                        </div>
                        <textarea
                          rows={4}
                          disabled={!canEdit || data.readOnly}
                          value={entry.notes}
                          onChange={(event) => updateRecollectionNotes(entry.id, event.target.value)}
                          placeholder="Descreva o motivo, contexto e observações da recoleta."
                          className="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none disabled:bg-slate-50"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className={`${sectionClassName} p-5`}>
              <h2 className="text-lg font-bold text-slate-900">Grupos de faturamento em risco</h2>
              <p className="mt-1 text-sm text-slate-500">Somente grupos com meta configurada entram nesta lista. O FCA é salvo junto com o preenchimento do dia.</p>
              <p className="mt-1 text-xs text-amber-700/90">
                Os grupos em amarelo estão em risco: o realizado acumulado no mês está abaixo do valor que o grupo deveria ter alcançado até a data de referência.
              </p>
              <p className="mt-1 text-[10px] text-slate-400">{renderFreshnessLabel(data.riskGroupsFreshness)}</p>
              <div className={tableShellClassName}>
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      <th className="px-4 py-3">Grupo</th>
                      <th className="px-4 py-3">Meta</th>
                      <th className="px-4 py-3">Realizado</th>
                      <th className="px-4 py-3">Deveria até a data</th>
                      <th className="px-4 py-3">Plano</th>
                      <th className="px-4 py-3">Fato</th>
                      <th className="px-4 py-3">Causa</th>
                      <th className="px-4 py-3">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {riskGroups.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                          Nenhum grupo com meta mensal configurada foi encontrado para esta unidade.
                        </td>
                      </tr>
                    ) : (
                      riskGroups.map((group, index) => (
                        <tr key={group.groupName} className={group.atRisk ? 'bg-amber-50/40' : ''}>
                          <td className="px-4 py-3 font-medium text-slate-900">{group.groupName}</td>
                          <td className="px-4 py-3 text-slate-600">{formatCurrency(group.monthlyGoal)}</td>
                          <td className="px-4 py-3 text-slate-600">{formatCurrency(group.actualMonth)}</td>
                          <td className="px-4 py-3 text-slate-600">{formatCurrency(group.shouldHaveUntilDate)}</td>
                          {(['planAction', 'fact', 'cause', 'action'] as const).map((fieldKey) => (
                            <td key={fieldKey} className="px-4 py-3">
                              <textarea
                                rows={2}
                                disabled={!canEdit || data.readOnly}
                                value={group[fieldKey]}
                                onChange={(event) =>
                                  setRiskGroups((current) =>
                                    current.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, [fieldKey]: event.target.value } : entry,
                                    ),
                                  )
                                }
                                className="w-44 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none disabled:bg-slate-50"
                              />
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

          </>
        )}
      </div>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />

      {historyOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 p-2 sm:items-center sm:p-4">
          <div className="flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-3xl">
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
              <div className="min-w-0">
                <h3 className="text-[1.05rem] font-bold text-slate-900">Histórico de preenchimentos</h3>
                <p className="mt-1 text-[13px] text-slate-500">
                  A página sempre mostra o preenchimento mais recente de cada data. Aqui ficam todos os salvamentos de {data?.selectedUnitLabel || 'unidade'}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
              >
                Fechar
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
              {historyLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Loader2 size={15} className="animate-spin" />
                  Carregando histórico...
                </div>
              ) : historyEntries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  Nenhum preenchimento salvo para esta unidade ainda.
                </div>
              ) : (
                <ol className="space-y-2.5">
                  {historyEntries.map((entry) => (
                    <li
                      key={entry.id}
                      className={`rounded-2xl border px-4 py-3 ${entry.isLatestForDate ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[13px] font-semibold text-slate-900">
                          {formatDateBr(entry.referenceDate)}
                          <span className="ml-2 font-normal text-slate-500">{formatDateTimeBr(entry.savedAt)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {entry.isLatestForDate ? (
                            <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              Em exibição
                            </span>
                          ) : (
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500">
                              Substituído
                            </span>
                          )}
                          <span className="text-[12px] text-slate-600">{entry.savedByName || 'Autor não identificado'}</span>
                        </div>
                      </div>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {entry.changes.map((change, index) => (
                          <li
                            key={`${entry.id}-${index}`}
                            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[12px] text-slate-600"
                          >
                            {change}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {configModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 p-2 sm:items-center sm:p-4">
          <div className="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-3xl">
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
              <div className="min-w-0">
                <h3 className="text-[1.05rem] font-bold text-slate-900">Configuração local da checklist</h3>
                <p className="mt-1 text-[13px] text-slate-500">Importa o contexto do cadastro do colaborador, mas o ajuste vale apenas para esta página.</p>
                <p className="mt-1 text-[12px] font-medium text-slate-600">
                  {configForm.id
                    ? `Editando: ${editingConfig?.name || configForm.name || 'configuração existente'}${editingConfig?.updatedAt ? ` • atualizada em ${formatDateTimeBr(editingConfig.updatedAt)}` : ''}`
                    : 'Criando uma nova configuração.'}
                </p>
              </div>
              <button type="button" onClick={() => setConfigModalOpen(false)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
                Fechar
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
              {configLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Loader2 size={15} className="animate-spin" />
                  Carregando configurações...
                </div>
              ) : (
                <div className="space-y-4">
                  {configPayload?.suggestedConfigDraft ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                      <div>
                        <div className="font-semibold">Sugestão pronta para bootstrap</div>
                        <div className="mt-1 text-emerald-800/90">
                          Líder: {configPayload.suggestedConfigDraft.leaderName || 'Não identificado'} | {configPayload.suggestedConfigDraft.units.length} unidade(s) |
                          {' '}{configPayload.suggestedConfigDraft.teamEmployeeIds.length} colaborador(es)
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={createSuggestedConfig}
                        disabled={configSaving}
                        className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-3 py-2 font-semibold text-emerald-900 disabled:opacity-60"
                      >
                        {configSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                        Aplicar sugestão
                      </button>
                    </div>
                  ) : null}

                  {(configPayload?.configs || []).length > 0 ? (
                    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <label className="min-w-[16rem] flex-1 text-[13px] font-medium text-slate-700">
                        Configuração em edição
                        <select
                          value={configForm.id}
                          onChange={(event) => selectConfigToEdit(event.target.value)}
                          className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none"
                        >
                          <option value="">Nova configuração</option>
                          {(configPayload?.configs || []).map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} ({item.leaderName})
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={startNewConfig}
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                      >
                        <Settings2 size={14} />
                        Nova configuração
                      </button>
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="text-[13px] font-medium text-slate-700">
                      Nome da configuração
                      <input
                        value={configForm.name}
                        onChange={(event) => setConfigForm((current) => ({ ...current, name: event.target.value }))}
                        className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 outline-none"
                      />
                    </label>
                    <div className="text-[13px] font-medium text-slate-700">
                      Líder da checklist
                      <input
                        value={leaderSearch}
                        onChange={(event) => setLeaderSearch(event.target.value)}
                        placeholder="Buscar líder por nome, setor ou unidade"
                        className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none"
                      />
                      <select
                        value={configForm.leaderUserId}
                        onChange={(event) => {
                          const nextLeader = configPayload?.options.leaders.find((item) => item.userId === event.target.value) || null;
                          setConfigForm((current) => {
                            // Trocar a líder de uma configuração salva sobrescreveria a
                            // configuração de outra pessoa: nesse caso vira uma nova.
                            const becomesNewConfig = Boolean(current.id) && event.target.value !== current.leaderUserId;
                            return {
                              ...current,
                              id: becomesNewConfig ? '' : current.id,
                              leaderUserId: event.target.value,
                              leaderEmployeeId: nextLeader?.employeeId || '',
                              leaderName: nextLeader?.name || '',
                              units: current.units.length > 0 ? current.units : nextLeader?.units || [],
                            };
                          });
                        }}
                        className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none"
                      >
                        <option value="">Selecione</option>
                        {filteredLeaderOptions.map((leader) => (
                          <option key={leader.userId} value={leader.userId}>
                            {leader.name}
                          </option>
                        ))}
                      </select>
                      {configForm.leaderUserId ? (
                        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
                          Prévia: {configForm.leaderName || 'Líder selecionado'}
                        </div>
                      ) : null}
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 md:col-span-2">
                      <div className="font-semibold text-slate-800">Dados importados do cadastro</div>
                      <div className="mt-2">Unidades do líder: {currentLeader?.units.join(', ') || 'Sem unidades mapeadas no cadastro oficial.'}</div>
                      <div className="mt-2">A equipe local não controla a lista de unidades exibidas na página. Esse controle vem da configuração local da checklist.</div>
                      <button
                        type="button"
                        onClick={applyCurrentLeaderUnits}
                        disabled={!currentLeader}
                        className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Settings2 size={14} />
                        Usar unidades do cadastro do líder
                      </button>
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-[13px] font-medium text-slate-700">Unidades desta checklist</div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        {(configPayload?.options.units || []).map((unit) => (
                          <label key={unit.key} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={configForm.units.includes(unit.key)}
                              onChange={(event) =>
                                setConfigForm((current) => ({
                                  ...current,
                                  units: event.target.checked
                                    ? Array.from(new Set([...current.units, unit.key]))
                                    : current.units.filter((item) => item !== unit.key),
                                }))
                              }
                            />
                            {unit.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[13px] font-medium text-slate-700">Equipe local da página</div>
                      <div className="text-[12px] text-slate-500">{selectedTeamMembersPreview.length} selecionado(s)</div>
                    </div>
                    <input
                      value={teamSearch}
                      onChange={(event) => setTeamSearch(event.target.value)}
                      placeholder="Buscar colaborador por nome, setor ou unidade"
                      className="mt-2 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none"
                    />
                    <div className="mt-2 max-h-[40vh] min-h-[9rem] overflow-y-auto rounded-2xl border border-slate-200 p-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        {filteredTeamOptions.map((member) => (
                          <label key={member.employeeId} className="inline-flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={configForm.teamEmployeeIds.includes(member.employeeId)}
                              onChange={(event) =>
                                setConfigForm((current) => ({
                                  ...current,
                                  teamEmployeeIds: event.target.checked
                                    ? Array.from(new Set([...current.teamEmployeeIds, member.employeeId]))
                                    : current.teamEmployeeIds.filter((item) => item !== member.employeeId),
                                }))
                              }
                            />
                            <span>
                              <span className="block font-medium text-slate-900">{member.fullName}</span>
                              <span className="mt-1 block text-xs text-slate-500">{member.department || 'Sem departamento'} | {member.units.join(', ') || 'Sem unidades'}</span>
                              {inactiveTeamMemberIds.has(member.employeeId) ? (
                                <span className="mt-1 block text-[11px] font-medium text-amber-600">
                                  Fora do cadastro ativo — mantido na equipe salva
                                </span>
                              ) : null}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Prévia da equipe selecionada</div>
                      {selectedTeamMembersPreview.length === 0 ? (
                        <div className="mt-2 text-[12px] text-slate-500">Nenhum colaborador selecionado.</div>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selectedTeamMembersPreview.slice(0, 12).map((member) => (
                            <span key={member.employeeId} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] text-slate-600">
                              {member.fullName}
                            </span>
                          ))}
                          {selectedTeamMembersPreview.length > 12 ? (
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] text-slate-500">
                              +{selectedTeamMembersPreview.length - 12} colaborador(es)
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:gap-3 sm:px-5 sm:py-4">
              <button type="button" onClick={() => setConfigModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
                Cancelar
              </button>
              <button
                type="button"
                onClick={submitConfig}
                disabled={configSaving || configLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-[#17407E] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {configSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {configSaving ? 'Salvando...' : 'Salvar configuração'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
