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

type ChecklistData = {
  generatedAt: string;
  today: string;
  access: { isManager: boolean };
  selectedLeaderUserId: string | null;
  availableLeaderFilters: Array<{ userId: string; name: string }>;
  viewMode: 'current' | 'd1';
  referenceDate: string;
  readOnly: boolean;
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
  versionSelectedId: string | null;
  versions: Array<{
    id: string;
    referenceDate: string;
    unitKey: string;
    createdAt: string | null;
    createdByName: string | null;
    viewMode: 'current' | 'd1';
  }>;
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
      businessDaysElapsed: number;
      businessDaysInMonth: number;
      businessDaysRemaining: number;
    };
    collaborators: Array<{
      employeeId: string;
      userId: string | null;
      fullName: string;
      monthlyGoal: number;
      revenueMonth: number;
      dynamicDailyTarget: number;
      progressPct: number;
    }>;
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
    };
    postConsult: {
      totalEvents: number;
      totalClosedEvents: number;
      pendingPatients: number;
      executedProposalValue: number;
      conversionRate: number;
    };
    waits: {
      receptionAverageMinutes: number;
      receptionAttendedCount: number;
      medicAverageMinutes: number;
      medicAttendedCount: number;
    };
    tasks: {
      pendingTasks: number;
      overdueTasks: number;
      dueNext7DaysTasks: number;
      awaitingApprovalTasks: number;
    };
    proposals: {
      openCount: number;
      openValue: number;
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

const toNumberInput = (value: string) => {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const Card = ({ title, value, helper, icon }: { title: string; value: string; helper?: string; icon: React.ReactNode }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</div>
        <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
      </div>
      <div className="rounded-xl bg-slate-100 p-2 text-slate-500">{icon}</div>
    </div>
    {helper ? <div className="mt-3 text-xs text-slate-500">{helper}</div> : null}
  </div>
);

const sectionClassName = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const tableShellClassName = 'mt-4 max-h-[24rem] overflow-auto rounded-2xl border border-slate-200';

const helpWorkflowCards = [
  {
    title: '1. Defina o contexto local',
    description: 'A gerência configura líder, unidades habilitadas e equipe local da checklist. Esse escopo vale apenas nesta página.',
  },
  {
    title: '2. Use Hoje para operar',
    description: 'O modo Hoje é a única área editável. Cada salvamento cria uma nova versão imutável da checklist.',
  },
  {
    title: '3. Use D-1 para auditoria',
    description: 'O modo D-1 é somente leitura e exibe o histórico congelado da data selecionada.',
  },
  {
    title: '4. Leia os velocímetros',
    description: 'Os gauges mostram realizado versus meta mensal, meta diária dinâmica, taxa de confirmação, nota Google e metas gerais de Resolve e Check-up.',
  },
  {
    title: '5. Registre exceções manuais',
    description: 'Pendências, validações, avaliações Google, recoletas e FCA ficam versionados junto com cada salvamento.',
  },
  {
    title: '6. Exporte o retrato da tela',
    description: 'O PDF respeita filtros, unidade, data, versão e os velocímetros que estiverem sendo exibidos na página.',
  },
];

const helpRules = [
  'As unidades visíveis dependem da configuração local da checklist, não da equipe local.',
  'A equipe local afeta faturamento individual, faltas/atrasos e parte dos indicadores operacionais.',
  'Resolve e Check-up permanecem manuais no v1, mas já versionados e prontos para integração futura.',
  'No modo D-1 não é possível editar campos nem sobrescrever o histórico.',
  'Recoletas agora são registradas uma a uma, com observações independentes e contagem automática.',
  'Se uma unidade não aparecer, revise as unidades habilitadas na configuração local da checklist.',
];

const GaugeCard = ({
  title,
  value,
  max,
  helper,
  valueLabel,
}: {
  title: string;
  value: number;
  max: number;
  helper: string;
  valueLabel?: string;
}) => {
  const gradientId = useId().replace(/:/g, '');
  const normalizedMax = max > 0 ? max : 1;
  const ratio = Math.max(0, Math.min(1, value / normalizedMax));
  const centerX = 100;
  const centerY = 100;
  const radius = 72;
  const displayedValue = valueLabel || formatPercent(ratio * 100);
  const angle = Math.PI - ratio * Math.PI;
  const needleLength = 60;
  const needleX = centerX + Math.cos(angle) * needleLength;
  const needleY = centerY - Math.sin(angle) * needleLength;
  const tickAngles = Array.from({ length: 11 }, (_, index) => Math.PI - (index / 10) * Math.PI);
  const valuePlateWidth = Math.max(70, Math.min(126, displayedValue.length * 10.5));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <svg viewBox="0 0 200 150" className="mx-auto h-48 w-full max-w-[18rem]">
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
          strokeWidth="14"
          strokeLinecap="round"
          opacity="0.35"
        />
        <path
          d={`M 28 100 A ${radius} ${radius} 0 0 1 172 100`}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="14"
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
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <circle cx={centerX} cy={centerY} r="5.5" fill="#0F172A" />
        <rect
          x={centerX - valuePlateWidth / 2}
          y="72"
          width={valuePlateWidth}
          height="28"
          rx="14"
          fill="#FFFFFF"
          opacity="0.96"
        />
        <text x="100" y="91" textAnchor="middle" className="fill-slate-900 text-[17px] font-bold">
          {displayedValue}
        </text>
        <text x="100" y="122" textAnchor="middle" className="fill-slate-500 text-[10px] font-semibold uppercase tracking-[0.18em]">
          {title}
        </text>
      </svg>
      <div className="mt-1 text-center text-xs text-slate-500">{helper}</div>
    </div>
  );
};

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
              Esta página consolida o acompanhamento gerencial da recepção com visão atual, histórico D-1, campos versionados e escopo local por líder.
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
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configPayload, setConfigPayload] = useState<ConfigOptionsPayload | null>(null);
  const [configForm, setConfigForm] = useState<ConfigFormState>(configFromData());
  const requestStateRef = useRef({
    selectedConfigId: '',
    selectedLeaderUserId: '',
    selectedUnitKey: '',
    viewMode: 'current' as 'current' | 'd1',
    referenceDate: '',
    selectedVersionId: '',
    refreshSeed: 0,
  });

  const availableVersions = useMemo(
    () => (data?.versions || []).filter((version) => version.referenceDate === referenceDate && version.unitKey === selectedUnitKey),
    [data?.versions, referenceDate, selectedUnitKey],
  );

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

  const fetchData = useCallback(async (opts?: { forceFresh?: boolean; nextConfigId?: string; nextLeaderUserId?: string; nextUnitKey?: string; nextViewMode?: 'current' | 'd1'; nextReferenceDate?: string; nextVersionId?: string }) => {
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
      const versionId = opts?.nextVersionId ?? currentState.selectedVersionId;

      if (configId) params.set('configId', configId);
      if (leaderUserId) params.set('leaderUserId', leaderUserId);
      if (unitKey) params.set('unitKey', unitKey);
      params.set('viewMode', mode);
      if (date) params.set('referenceDate', date);
      if (versionId) params.set('versionId', versionId);
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
      setSelectedVersionId(nextData.versionSelectedId || '');
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

  useEffect(() => {
    requestStateRef.current = {
      selectedConfigId,
      selectedLeaderUserId,
      selectedUnitKey,
      viewMode,
      referenceDate,
      selectedVersionId,
      refreshSeed,
    };
  }, [referenceDate, refreshSeed, selectedConfigId, selectedLeaderUserId, selectedUnitKey, selectedVersionId, viewMode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchData({ nextViewMode: 'current' });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchData, refreshSeed]);

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
          viewMode: 'current',
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
      await fetchData({ forceFresh: true, nextConfigId: data.config.id, nextUnitKey: data.selectedUnitKey, nextViewMode: 'current', nextReferenceDate: data.today });
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
    if (selectedVersionId) params.set('versionId', selectedVersionId);
    window.open(`/api/admin/checklist/recepcao/export.pdf?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };

  const openConfigModal = async () => {
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
        nextVersionId: '',
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
    <main className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className={`${sectionClassName} overflow-hidden`}>
          <div className="border-b border-slate-200 bg-white px-5 py-5">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.95fr)] xl:items-start">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <Gauge size={13} />
                  Checklist gerencial
                </div>
                <h1 className="mt-3 text-2xl font-bold text-slate-900">Checklist Recepção</h1>
                <p className="mt-2 max-w-4xl text-sm leading-7 text-slate-500">
                  Visão operacional versionada com modo atual, histórico D-1 congelado, escopo local de liderança e exportação em PDF.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                {isRefreshing ? (
                    <div className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 sm:col-span-2">
                    <Loader2 size={15} className="animate-spin" />
                    Atualizando indicadores...
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => setHelpOpen(true)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <CircleHelp size={15} />
                  Como funciona
                </button>
                {data?.access.isManager ? (
                  <button
                    type="button"
                    onClick={openConfigModal}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Settings2 size={15} />
                    Configurar líder/equipe
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setRefreshSeed((current) => current + 1)}
                  disabled={!canRefresh}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw size={15} />
                  Atualizar
                </button>
                <button
                  type="button"
                  onClick={handleExportPdf}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Download size={15} />
                  PDF
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canEdit || data?.readOnly || saving || !data?.config}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#17407E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#123666] disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  {saving ? 'Salvando...' : 'Salvar nova versão'}
                </button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 bg-slate-50/70 px-5 py-5 md:grid-cols-2 xl:grid-cols-12">
            {data?.access.isManager ? (
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 xl:col-span-2">
                Líder
                <select
                  value={selectedLeaderUserId}
                  onChange={(event) =>
                    void fetchData({
                      nextLeaderUserId: event.target.value,
                      nextConfigId: '',
                      nextUnitKey: '',
                      nextVersionId: '',
                    })
                  }
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-800 outline-none"
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
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 xl:col-span-2">
              Configuração
              <select
                value={selectedConfigId}
                onChange={(event) => void fetchData({ nextConfigId: event.target.value, nextVersionId: '' })}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-800 outline-none"
              >
                <option value="">Selecione</option>
                {(data?.availableConfigs || []).map((config) => (
                  <option key={config.id} value={config.id}>
                    {config.name} - {config.leaderName}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 xl:col-span-2">
              Unidade
              <select
                value={selectedUnitKey}
                onChange={(event) => void fetchData({ nextUnitKey: event.target.value, nextVersionId: '' })}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-800 outline-none"
              >
                {(data?.availableUnits || []).filter((unit) => !data?.config || data.config.units.includes(unit.key)).map((unit) => (
                  <option key={unit.key} value={unit.key}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 xl:col-span-2">
              Modo
              <select
                value={viewMode}
                onChange={(event) =>
                  void fetchData({
                    nextViewMode: event.target.value === 'd1' ? 'd1' : 'current',
                    nextReferenceDate: event.target.value === 'd1' ? data?.referenceDate || referenceDate : data?.today || referenceDate,
                    nextVersionId: '',
                  })
                }
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-800 outline-none"
              >
                <option value="current">Hoje</option>
                <option value="d1">D-1</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 xl:col-span-2">
              Data de referência
              <input
                type="date"
                value={referenceDate}
                onChange={(event) => {
                  const nextDate = event.target.value;
                  setReferenceDate(nextDate);
                  void fetchData({ nextReferenceDate: nextDate, nextVersionId: '' });
                }}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-800 outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 xl:col-span-2">
              Versão salva
              <select
                value={selectedVersionId}
                onChange={(event) => {
                  const nextVersionId = event.target.value;
                  setSelectedVersionId(nextVersionId);
                  void fetchData({ nextVersionId });
                }}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-800 outline-none"
              >
                <option value="">Última referência</option>
                {availableVersions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.createdAt ? `${formatDateBr(version.referenceDate)} - ${version.createdAt}` : version.id}
                  </option>
                ))}
              </select>
            </label>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 md:col-span-2 xl:col-span-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Escopo local</div>
              <div className="mt-2 text-base font-semibold text-slate-900">{data?.config?.leaderName || 'Sem configuração'}</div>
              <div className="mt-1 text-sm text-slate-500">{data?.config?.teamMembers.length || 0} colaborador(es) na equipe local</div>
              <div className="mt-2 text-sm text-slate-500">
                Unidades habilitadas: {data?.config?.units.map((unitKey) => data.availableUnits.find((unit) => unit.key === unitKey)?.label || unitKey).join(', ') || 'Nenhuma'}
              </div>
              <div className="mt-3 text-sm leading-6 text-slate-500">As unidades exibidas dependem da configuração local da checklist, não da equipe local.</div>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
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
            <div className="grid gap-4 xl:grid-cols-4">
              <Card
                title="Faturamento do Dia"
                value={formatCurrency(data.metrics.unit.revenueDay)}
                helper={`Ticket médio: ${formatCurrency(data.metrics.unit.ticketAverageDay)}`}
                icon={<TrendingUp size={16} />}
              />
              <Card
                title="Faturamento no Mês"
                value={formatCurrency(data.metrics.unit.revenueMonth)}
                helper={`Meta mensal: ${formatCurrency(data.metrics.unit.monthlyGoal)}`}
                icon={<Target size={16} />}
              />
              <Card
                title="Meta Diária Dinâmica"
                value={formatCurrency(data.metrics.unit.dynamicDailyTarget)}
                helper={`${data.metrics.unit.businessDaysRemaining} dia(s) úteis restantes`}
                icon={<CalendarDays size={16} />}
              />
              <Card
                title="Orçamentos em Aberto"
                value={String(data.metrics.proposals.openCount)}
                helper={formatCurrency(data.metrics.proposals.openValue)}
                icon={<FileText size={16} />}
              />
            </div>

            <section className={`${sectionClassName} p-5`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Faturamento da unidade</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Velocímetros da unidade com realizado diário, acumulado do mês, referência esperada até {formatDateBr(data.referenceDate)} e nota Google.
                  </p>
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {data.readOnly ? 'D-1 congelado' : 'Hoje editável'}
                </div>
              </div>
              <div className="mt-5 grid gap-4 xl:grid-cols-4">
                <GaugeCard
                  title="Faturamento mensal"
                  value={data.metrics.unit.revenueMonth}
                  max={data.metrics.unit.monthlyGoal}
                  helper={`${formatCurrency(data.metrics.unit.revenueMonth)} / ${formatCurrency(data.metrics.unit.monthlyGoal)}`}
                  valueLabel={formatCompactCurrency(data.metrics.unit.revenueMonth)}
                />
                <GaugeCard
                  title="Faturamento diário"
                  value={data.metrics.unit.revenueDay}
                  max={data.metrics.unit.dynamicDailyTarget}
                  helper={`${formatCurrency(data.metrics.unit.revenueDay)} / ${formatCurrency(data.metrics.unit.dynamicDailyTarget)}`}
                  valueLabel={formatCompactCurrency(data.metrics.unit.revenueDay)}
                />
                <GaugeCard
                  title="Deveria até a data"
                  value={data.metrics.unit.revenueMonth}
                  max={data.metrics.unit.shouldHaveUntilDate}
                  helper={`${formatCurrency(data.metrics.unit.shouldHaveUntilDate)} previsto`}
                  valueLabel={formatPercent(
                    data.metrics.unit.shouldHaveUntilDate > 0 ? (data.metrics.unit.revenueMonth / data.metrics.unit.shouldHaveUntilDate) * 100 : 0,
                  )}
                />
                <GaugeCard
                  title="Google"
                  value={data.metrics.google.ratingActual}
                  max={data.metrics.google.ratingTarget}
                  helper={`${data.metrics.google.ratingActual.toFixed(1).replace('.', ',')} / ${data.metrics.google.ratingTarget.toFixed(1).replace('.', ',')}`}
                  valueLabel={data.metrics.google.ratingActual.toFixed(1).replace('.', ',')}
                />
              </div>
            </section>

            <section className={`${sectionClassName} p-5`}>
              <div className="flex items-center gap-3">
                <Users className="text-slate-500" size={18} />
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Faturamento por colaborador</h2>
                  <p className="mt-1 text-sm text-slate-500">A equipe local configurada nesta página alimenta a visão individual de metas e realizado.</p>
                </div>
              </div>
              <div className={tableShellClassName}>
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      <th className="px-4 py-3">Colaborador</th>
                      <th className="px-4 py-3">Meta mensal</th>
                      <th className="px-4 py-3">Realizado no mês</th>
                      <th className="px-4 py-3">Meta diária dinâmica</th>
                      <th className="px-4 py-3">Progresso</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {data.metrics.collaborators.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                          Nenhum colaborador foi configurado na equipe local desta checklist.
                        </td>
                      </tr>
                    ) : (
                      data.metrics.collaborators.map((row) => (
                        <tr key={row.employeeId}>
                          <td className="px-4 py-3 font-medium text-slate-900">{row.fullName}</td>
                          <td className="px-4 py-3 text-slate-600">{formatCurrency(row.monthlyGoal)}</td>
                          <td className="px-4 py-3 text-slate-600">{formatCurrency(row.revenueMonth)}</td>
                          <td className="px-4 py-3 text-slate-600">{formatCurrency(row.dynamicDailyTarget)}</td>
                          <td className="px-4 py-3 text-slate-600">{formatPercent(row.progressPct)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-2">
              <section className={`${sectionClassName} p-5`}>
                <h2 className="text-lg font-bold text-slate-900">Resolve e Check-up da equipe</h2>
                <p className="mt-1 text-sm text-slate-500">Velocímetros da meta geral da equipe no v1 manual versionado, prontos para troca futura da origem sem mudar a interface.</p>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <GaugeCard
                    title="Meta geral Resolve"
                    value={data.metrics.teamProduction.resolveActual}
                    max={data.metrics.teamProduction.resolveMonthlyTarget}
                    helper={`${data.metrics.teamProduction.resolveActual} / ${data.metrics.teamProduction.resolveMonthlyTarget}`}
                    valueLabel={String(data.metrics.teamProduction.resolveActual)}
                  />
                  <GaugeCard
                    title="Meta geral Check-up"
                    value={data.metrics.teamProduction.checkupActual}
                    max={data.metrics.teamProduction.checkupMonthlyTarget}
                    helper={`${data.metrics.teamProduction.checkupActual} / ${data.metrics.teamProduction.checkupMonthlyTarget}`}
                    valueLabel={String(data.metrics.teamProduction.checkupActual)}
                  />
                </div>
                <fieldset disabled={!canEdit || data.readOnly} className={`mt-5 grid gap-4 md:grid-cols-2 ${!canEdit || data.readOnly ? 'opacity-70' : ''}`}>
                  <label className="text-sm font-medium text-slate-700">
                    Meta mensal Resolve
                    <input
                      type="number"
                      min={0}
                      value={manual.resolveMonthlyTarget}
                      onChange={(event) => setManual((current) => ({ ...current, resolveMonthlyTarget: toNumberInput(event.target.value) }))}
                      className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 outline-none"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Realizado Resolve
                    <input
                      type="number"
                      min={0}
                      value={manual.resolveActual}
                      onChange={(event) => setManual((current) => ({ ...current, resolveActual: toNumberInput(event.target.value) }))}
                      className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 outline-none"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Meta mensal Check-up
                    <input
                      type="number"
                      min={0}
                      value={manual.checkupMonthlyTarget}
                      onChange={(event) => setManual((current) => ({ ...current, checkupMonthlyTarget: toNumberInput(event.target.value) }))}
                      className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 outline-none"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Realizado Check-up
                    <input
                      type="number"
                      min={0}
                      value={manual.checkupActual}
                      onChange={(event) => setManual((current) => ({ ...current, checkupActual: toNumberInput(event.target.value) }))}
                      className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 outline-none"
                    />
                  </label>
                </fieldset>
              </section>

              <section className={`${sectionClassName} p-5`}>
                <h2 className="text-lg font-bold text-slate-900">Operação e equipe</h2>
                <div className="mt-4">
                  <GaugeCard
                    title="Confirmação de agendamentos D+1"
                    value={data.metrics.appointmentsConfirmation.ratePct}
                    max={100}
                    helper={`${formatPercent(data.metrics.appointmentsConfirmation.ratePct)} | ${data.metrics.appointmentsConfirmation.confirmed}/${data.metrics.appointmentsConfirmation.total}`}
                    valueLabel={formatPercent(data.metrics.appointmentsConfirmation.ratePct)}
                  />
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Card
                    title="Pós-consulta equipe"
                    value={formatPercent(data.metrics.postConsult.conversionRate)}
                    helper={`${data.metrics.postConsult.totalClosedEvents}/${data.metrics.postConsult.totalEvents} fechados`}
                    icon={<TrendingUp size={16} />}
                  />
                  <Card
                    title="Espera recepção"
                    value={`${data.metrics.waits.receptionAverageMinutes} min`}
                    helper={`${data.metrics.waits.receptionAttendedCount} atendidos`}
                    icon={<Users size={16} />}
                  />
                  <Card
                    title="Espera médico"
                    value={`${data.metrics.waits.medicAverageMinutes} min`}
                    helper={`${data.metrics.waits.medicAttendedCount} atendidos`}
                    icon={<Users size={16} />}
                  />
                  <Card
                    title="Tarefas da líder"
                    value={String(data.metrics.tasks.overdueTasks)}
                    helper={`${data.metrics.tasks.dueNext7DaysTasks} vencem em 7 dias`}
                    icon={<AlertTriangle size={16} />}
                  />
                </div>
              </section>
            </div>

            <section className={`${sectionClassName} p-5`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Faltas e atrasos da equipe local</h2>
                  <p className="mt-1 text-sm text-slate-500">Indicadores consolidados da equipe vinculada à líder desta configuração.</p>
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Card
                  title="Faltas no período"
                  value={String(data.metrics.absences.absenceDays)}
                  helper={`${data.metrics.absences.trackedEmployees} colaborador(es) monitorados`}
                  icon={<AlertTriangle size={16} />}
                />
                <Card
                  title="Atrasos no período"
                  value={`${data.metrics.absences.lateMinutes} min`}
                  helper={`${data.metrics.absences.rows.length} colaborador(es) com ocorrência`}
                  icon={<AlertTriangle size={16} />}
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
                          Nenhuma falta ou atraso foi encontrado para a equipe local no período.
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

            <section className={`${sectionClassName} p-5`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Pendências e validações</h2>
                  <p className="mt-1 text-sm text-slate-500">Campos manuais versionados junto com cada salvamento da checklist.</p>
                </div>
              </div>
              <fieldset disabled={!canEdit || data.readOnly} className={`mt-4 grid gap-4 md:grid-cols-2 ${!canEdit || data.readOnly ? 'opacity-70' : ''}`}>
                <label className="text-sm font-medium text-slate-700">
                  Nota fiscal em aberto
                  <select
                    value={manual.nfOpenStatus}
                    onChange={(event) => setManual((current) => ({ ...current, nfOpenStatus: event.target.value }))}
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none"
                  >
                    <option value="">Selecione</option>
                    <option value="Validado">Validado</option>
                    <option value="Nao validado">Não validado</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Contas em aberto
                  <select
                    value={manual.accountsOpenStatus}
                    onChange={(event) => setManual((current) => ({ ...current, accountsOpenStatus: event.target.value }))}
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none"
                  >
                    <option value="">Selecione</option>
                    <option value="Validado">Validado</option>
                    <option value="Nao validado">Não validado</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Avaliação Google
                  <input
                    type="number"
                    min={0}
                    max={5}
                    step="0.1"
                    value={manual.googleRating}
                    onChange={(event) => setManual((current) => ({ ...current, googleRating: toNumberInput(event.target.value) }))}
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 outline-none"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Novas avaliações no Google
                  <input
                    type="number"
                    min={0}
                    value={manual.googleNewReviewsCount}
                    onChange={(event) => setManual((current) => ({ ...current, googleNewReviewsCount: toNumberInput(event.target.value) }))}
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 outline-none"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700 md:col-span-2">
                  Pendências da unidade
                  <textarea
                    rows={4}
                    value={manual.pendingNotes}
                    onChange={(event) => setManual((current) => ({ ...current, pendingNotes: event.target.value }))}
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-3 outline-none"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700 md:col-span-2">
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
              <p className="mt-1 text-sm text-slate-500">Somente grupos com meta configurada entram nesta lista. O FCA fica salvo dentro de cada versão criada.</p>
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
                      <th className="px-4 py-3">Acao</th>
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

      {configModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-4xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Configuração local da checklist</h3>
                <p className="mt-1 text-sm text-slate-500">Importa o contexto do cadastro do colaborador, mas o ajuste vale apenas para esta página.</p>
              </div>
              <button type="button" onClick={() => setConfigModalOpen(false)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
                Fechar
              </button>
            </div>
            <div className="px-5 py-5">
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

                  <div className="grid gap-4 lg:grid-cols-2">
                    <label className="text-sm font-medium text-slate-700">
                      Nome da configuração
                      <input
                        value={configForm.name}
                        onChange={(event) => setConfigForm((current) => ({ ...current, name: event.target.value }))}
                        className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 outline-none"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Líder
                      <select
                        value={configForm.leaderUserId}
                        onChange={(event) => {
                          const nextLeader = configPayload?.options.leaders.find((item) => item.userId === event.target.value) || null;
                          setConfigForm((current) => ({
                            ...current,
                            leaderUserId: event.target.value,
                            leaderEmployeeId: nextLeader?.employeeId || '',
                            leaderName: nextLeader?.name || '',
                            units: current.units.length > 0 ? current.units : nextLeader?.units || [],
                          }));
                        }}
                        className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none"
                      >
                        <option value="">Selecione</option>
                        {(configPayload?.options.leaders || []).map((leader) => (
                          <option key={leader.userId} value={leader.userId}>
                            {leader.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 lg:col-span-2">
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
                    <div className="lg:col-span-2">
                      <div className="text-sm font-medium text-slate-700">Unidades desta checklist</div>
                      <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
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
                    <div className="text-sm font-medium text-slate-700">Equipe local da página</div>
                    <div className="mt-2 max-h-80 overflow-y-auto rounded-2xl border border-slate-200 p-3">
                      <div className="grid gap-2 md:grid-cols-2">
                        {(configPayload?.options.teamMembers || []).map((member) => (
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
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-4">
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
