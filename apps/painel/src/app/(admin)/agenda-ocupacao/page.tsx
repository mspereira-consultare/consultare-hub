"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useSession } from "next-auth/react";
import { Download, Eye, Loader2, Mail, Play, RefreshCw, X } from "lucide-react";
import { getAgendaOcupacaoDefaultRange } from "@/lib/agenda_ocupacao/date_range";
import { hasPermission } from "@/lib/permissions";
import { OccupancyTable } from "./components/OccupancyTable";

type SortKey =
  | "especialidadeNome"
  | "agendamentosCount"
  | "horariosDisponiveisCount"
  | "horariosBloqueadosCount"
  | "capacidadeLiquidaCount"
  | "taxaOcupacaoComercialPct"
  | "taxaBloqueioPct";

type OccupancyRow = {
  especialidadeId: number;
  especialidadeNome: string;
  agendamentosCount: number;
  horariosDisponiveisCount: number;
  horariosBloqueadosCount: number;
  capacidadeLiquidaCount: number;
  taxaOcupacaoComercialPct: number;
  taxaBloqueioPct: number;
};

type Totals = {
  especialidades: number;
  agendamentos: number;
  horariosDisponiveis: number;
  horariosBloqueados: number;
  capacidadeLiquida: number;
  taxaOcupacaoComercialPct: number;
  taxaBloqueioPct: number;
};

type LatestJob = {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  unitScope: number[];
  requestedBy: string;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
} | null;

type WeeklyReportSettingsState = {
  enabled: boolean;
  recipientEmployeeIds: string[];
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

type WeeklyReportRecipientState = {
  employeeId: string;
  employeeName: string;
  corporateEmail: string | null;
  isActive: boolean;
  status: "READY" | "SKIPPED";
  reason: "MISSING_CORPORATE_EMAIL" | "INACTIVE" | "EMPLOYEE_NOT_FOUND" | null;
  isSelected: boolean;
};

type WeeklyReportEligibilityState = {
  generatedAt: string;
  eligibleRecipients: WeeklyReportRecipientState[];
  ineligibleRecipients: WeeklyReportRecipientState[];
  selectedReadyRecipients: WeeklyReportRecipientState[];
  selectedSkippedRecipients: WeeklyReportRecipientState[];
} | null;

type WeeklyReportRunItem = {
  id: string;
  runKey: string;
  weekStartDate: string;
  weekEndDate: string;
  status: string;
  triggerSource: "cron" | "manual";
  triggeredBy: string;
  refreshJobId: string | null;
  provider: string;
  eligibleCount: number;
  skippedCount: number;
  sentCount: number;
  failedCount: number;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type WeeklyReportPreviewState = {
  subject: string;
  text: string;
  recipient: {
    employeeId: string;
    employeeName: string;
    corporateEmail: string;
  };
  period: {
    startDate: string;
    endDate: string;
    label: string;
  };
  generatedAt: string;
  attachments: string[];
  summary: {
    highCount: number;
    lowCount: number;
    totalAppointments: number;
    totalOpenSlots: number;
    totalBlockedSlots: number;
    totalSpecialties: number;
  };
  sections: Array<{
    unitId: number;
    unitName: string;
    highOccupancy: OccupancyRow[];
    lowOccupancy: OccupancyRow[];
    totals: {
      appointments: number;
      openSlots: number;
      blockedSlots: number;
      specialties: number;
      occupancyPct: number;
    };
  }>;
} | null;

const unitOptions = [
  { value: "all", label: "Todas as unidades" },
  { value: "2", label: "Ouro Verde" },
  { value: "3", label: "Centro Cambui" },
  { value: "12", label: "Shopping Campinas" },
] as const;

const formatPercent = (value: number) => `${Number(value || 0).toFixed(2).replace(".", ",")}%`;
const formatNumber = (value: number) => Number(value || 0).toLocaleString("pt-BR");
const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
};
const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

const nextWeeklyWindowLabel = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const todayIso = `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
  const weekday = new Date(`${todayIso}T12:00:00Z`).getUTCDay();
  const diffToCurrentMonday = weekday === 0 ? -6 : 1 - weekday;
  const nextWeekStart = new Date(`${todayIso}T12:00:00Z`);
  nextWeekStart.setUTCDate(nextWeekStart.getUTCDate() + diffToCurrentMonday + 7);
  const nextWeekEnd = new Date(nextWeekStart);
  nextWeekEnd.setUTCDate(nextWeekEnd.getUTCDate() + 5);
  const fmt = (date: Date) =>
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  return `${fmt(nextWeekStart)} a ${fmt(nextWeekEnd)}`;
};

export default function AgendaOcupacaoPage() {
  const { data: session } = useSession();
  type SessionUser = { role?: string; permissions?: unknown };
  const sessionUser = (session?.user || {}) as SessionUser;
  const role = String(sessionUser.role || "OPERADOR");

  const canView = hasPermission(sessionUser.permissions, "agenda_ocupacao", "view", role);
  const canEdit = hasPermission(sessionUser.permissions, "agenda_ocupacao", "edit", role);
  const canRefresh = hasPermission(sessionUser.permissions, "agenda_ocupacao", "refresh", role);

  const defaults = getAgendaOcupacaoDefaultRange();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [unit, setUnit] = useState<"all" | "2" | "3" | "12">("all");

  const [rows, setRows] = useState<OccupancyRow[]>([]);
  const [totals, setTotals] = useState<Totals>({
    especialidades: 0,
    agendamentos: 0,
    horariosDisponiveis: 0,
    horariosBloqueados: 0,
    capacidadeLiquida: 0,
    taxaOcupacaoComercialPct: 0,
    taxaBloqueioPct: 0,
  });
  const [latestJob, setLatestJob] = useState<LatestJob>(null);
  const [heartbeat, setHeartbeat] = useState<{ status: string; lastRun: string | null; details: string }>({
    status: "UNKNOWN",
    lastRun: null,
    details: "",
  });

  const [sortKey, setSortKey] = useState<SortKey>("taxaOcupacaoComercialPct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [weeklyReportModalOpen, setWeeklyReportModalOpen] = useState(false);
  const [weeklyReportLoading, setWeeklyReportLoading] = useState(false);
  const [weeklyReportSaving, setWeeklyReportSaving] = useState(false);
  const [weeklyReportRunning, setWeeklyReportRunning] = useState(false);
  const [weeklyReportPreviewLoading, setWeeklyReportPreviewLoading] = useState(false);
  const [weeklyReportSettings, setWeeklyReportSettings] = useState<WeeklyReportSettingsState>({
    enabled: false,
    recipientEmployeeIds: [],
    fromEmail: "",
    fromName: "Consultare Hub",
    replyToEmail: "",
    updatedAt: null,
    updatedBy: null,
  });
  const [weeklyReportEligibility, setWeeklyReportEligibility] = useState<WeeklyReportEligibilityState>(null);
  const [weeklyReportRuns, setWeeklyReportRuns] = useState<WeeklyReportRunItem[]>([]);
  const [weeklyReportPreview, setWeeklyReportPreview] = useState<WeeklyReportPreviewState>(null);
  const [selectedPreviewEmployeeId, setSelectedPreviewEmployeeId] = useState("");

  const loadData = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ startDate, endDate, unit }).toString();
      const res = await fetch(`/api/admin/agenda-ocupacao?${qs}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao carregar ocupacao da agenda.");

      setRows(Array.isArray(data?.data?.rows) ? data.data.rows : []);
      setTotals(
        data?.data?.totals || {
          especialidades: 0,
          agendamentos: 0,
          horariosDisponiveis: 0,
          horariosBloqueados: 0,
          capacidadeLiquida: 0,
          taxaOcupacaoComercialPct: 0,
          taxaBloqueioPct: 0,
        },
      );
      setLatestJob(data?.data?.latestJob || null);
      setHeartbeat(data?.data?.heartbeat || { status: "UNKNOWN", lastRun: null, details: "" });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, [canView, startDate, endDate, unit]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!latestJob) return;
    const running = ["PENDING", "RUNNING"].includes(String(latestJob.status || "").toUpperCase());
    if (!running) return;

    const timer = setTimeout(() => {
      loadData();
    }, 4000);

    return () => clearTimeout(timer);
  }, [latestJob, loadData]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "especialidadeNome") {
        return a.especialidadeNome.localeCompare(b.especialidadeNome, "pt-BR") * dir;
      }
      return ((Number(a[sortKey]) || 0) - (Number(b[sortKey]) || 0)) * dir;
    });
    return copy;
  }, [rows, sortDir, sortKey]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "taxaOcupacaoComercialPct" || key === "taxaBloqueioPct" ? "asc" : "desc");
  };

  const onRefresh = async () => {
    if (!canRefresh) return;
    setRefreshing(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/agenda-ocupacao/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, unit }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao solicitar atualizacao.");

      setNotice("Atualizacao enfileirada. Aguarde a conclusao para visualizar os dados novos.");
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao solicitar atualizacao.");
    } finally {
      setRefreshing(false);
    }
  };

  const onExport = async (format: "xlsx" | "pdf") => {
    setExporting(format);
    setError("");
    try {
      const qs = new URLSearchParams({ startDate, endDate, unit, format }).toString();
      const res = await fetch(`/api/admin/agenda-ocupacao/export?${qs}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Falha ao exportar ${format.toUpperCase()}.`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `agenda-ocupacao-${startDate}_${endDate}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro na exportacao.");
    } finally {
      setExporting(null);
    }
  };

  const loadWeeklyReportAdmin = useCallback(async () => {
    setWeeklyReportLoading(true);
    try {
      const [settingsRes, eligibilityRes, runsRes] = await Promise.all([
        fetch("/api/admin/agenda-ocupacao/report/settings", { cache: "no-store" }),
        fetch("/api/admin/agenda-ocupacao/report/eligibility", { cache: "no-store" }),
        fetch("/api/admin/agenda-ocupacao/report/runs?limit=8", { cache: "no-store" }),
      ]);

      const [settingsPayload, eligibilityPayload, runsPayload] = await Promise.all([
        settingsRes.json().catch(() => ({})),
        eligibilityRes.json().catch(() => ({})),
        runsRes.json().catch(() => ({})),
      ]);

      if (!settingsRes.ok) throw new Error(settingsPayload?.error || "Falha ao carregar configurações do report.");
      if (!eligibilityRes.ok) throw new Error(eligibilityPayload?.error || "Falha ao carregar elegibilidade do report.");
      if (!runsRes.ok) throw new Error(runsPayload?.error || "Falha ao carregar histórico do report.");

      const nextSettings = (settingsPayload.data || null) as WeeklyReportSettingsState | null;
      const nextEligibility = (eligibilityPayload.data || null) as WeeklyReportEligibilityState;
      const nextRuns = Array.isArray(runsPayload.data) ? (runsPayload.data as WeeklyReportRunItem[]) : [];

      if (nextSettings) {
        setWeeklyReportSettings({
          ...nextSettings,
          replyToEmail: nextSettings.replyToEmail || "",
        });
      }
      setWeeklyReportEligibility(nextEligibility);
      setWeeklyReportRuns(nextRuns);
      setSelectedPreviewEmployeeId((current) => {
        const selected = nextEligibility?.selectedReadyRecipients || [];
        const eligible = nextEligibility?.eligibleRecipients || [];
        const options = selected.length > 0 ? selected : eligible;
        if (current && options.some((item) => item.employeeId === current)) return current;
        return options[0]?.employeeId || "";
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar administração do report.");
    } finally {
      setWeeklyReportLoading(false);
    }
  }, []);

  const handleOpenWeeklyReportModal = async () => {
    setWeeklyReportModalOpen(true);
    setWeeklyReportPreview(null);
    await loadWeeklyReportAdmin();
  };

  const handleSaveWeeklyReportSettings = async () => {
    if (!canEdit || weeklyReportSaving) return;
    setWeeklyReportSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/agenda-ocupacao/report/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: weeklyReportSettings.enabled,
          recipientEmployeeIds: weeklyReportSettings.recipientEmployeeIds,
          fromEmail: weeklyReportSettings.fromEmail,
          fromName: weeklyReportSettings.fromName,
          replyToEmail: weeklyReportSettings.replyToEmail.trim() || null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Falha ao salvar configurações do report.");
      const data = (payload.data || null) as WeeklyReportSettingsState | null;
      if (data) {
        setWeeklyReportSettings({
          ...data,
          replyToEmail: data.replyToEmail || "",
        });
      }
      await loadWeeklyReportAdmin();
      setNotice("Configurações do report semanal salvas com sucesso.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar configurações do report.");
    } finally {
      setWeeklyReportSaving(false);
    }
  };

  const handleGenerateWeeklyReportPreview = async () => {
    if (!selectedPreviewEmployeeId || weeklyReportPreviewLoading) return;
    setWeeklyReportPreviewLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/agenda-ocupacao/report/preview?employeeId=${encodeURIComponent(selectedPreviewEmployeeId)}`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Falha ao gerar prévia.");
      setWeeklyReportPreview((payload.data || null) as WeeklyReportPreviewState);
    } catch (e: unknown) {
      setWeeklyReportPreview(null);
      setError(e instanceof Error ? e.message : "Erro ao gerar prévia do report.");
    } finally {
      setWeeklyReportPreviewLoading(false);
    }
  };

  const handleRunWeeklyReport = async () => {
    if (!canEdit || weeklyReportRunning) return;
    setWeeklyReportRunning(true);
    setError("");
    try {
      const response = await fetch("/api/admin/agenda-ocupacao/report/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Falha ao processar envio manual.");
      const run = (payload?.data?.run || null) as WeeklyReportRunItem | null;
      await loadWeeklyReportAdmin();
      if (run) {
        setNotice(
          `Disparo manual concluído. Enviados: ${run.sentCount} | Falhas: ${run.failedCount} | Ignorados: ${run.skippedCount}.`,
        );
      } else {
        setNotice("Disparo manual do report semanal concluído.");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao iniciar o envio manual.");
    } finally {
      setWeeklyReportRunning(false);
    }
  };

  const toggleRecipient = (employeeId: string) => {
    setWeeklyReportSettings((current) => {
      const set = new Set(current.recipientEmployeeIds);
      if (set.has(employeeId)) {
        set.delete(employeeId);
      } else {
        set.add(employeeId);
      }
      return {
        ...current,
        recipientEmployeeIds: Array.from(set),
      };
    });
  };

  if (!canView) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Sem permissao para visualizar este modulo.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Ocupação da agenda por especialidade</h1>
            <p className="text-xs text-slate-500">
              Indicadores: ocupação comercial e taxa de bloqueio por especialidade e unidade.
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              A tela abre com o mês atual e mais 2 meses futuros para apoiar o planejamento da agenda.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[170px_170px_200px_120px]">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
            />
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as "all" | "2" | "3" | "12")}
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
            >
              {unitOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={loadData}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
            >
              Atualizar tela
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={onRefresh}
            disabled={!canRefresh || refreshing}
            className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Atualizar dados
          </button>

          <button
            type="button"
            onClick={handleOpenWeeklyReportModal}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
          >
            <Mail size={14} />
            Configurar report semanal
          </button>

          <button
            type="button"
            onClick={() => onExport("xlsx")}
            disabled={exporting !== null}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            {exporting === "xlsx" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Exportar XLSX
          </button>

          <button
            type="button"
            onClick={() => onExport("pdf")}
            disabled={exporting !== null}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            {exporting === "pdf" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Exportar PDF
          </button>

          <span className="text-xs text-slate-500">
            Job: {latestJob ? `${latestJob.status} | ${formatDateTime(latestJob.updatedAt)}` : "nenhum"}
          </span>
          <span className="text-xs text-slate-500">
            Worker: {heartbeat.status} | {formatDateTime(heartbeat.lastRun)}
          </span>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      <section className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        <InfoCard label="Especialidades" value={formatNumber(totals.especialidades)} helper="Especialidades do recorte atual" />
        <InfoCard label="Agendamentos" value={formatNumber(totals.agendamentos)} helper="Total de pacientes já marcados" />
        <InfoCard label="Disponíveis" value={formatNumber(totals.horariosDisponiveis)} helper="Horários livres ofertáveis" />
        <InfoCard label="Bloqueados" value={formatNumber(totals.horariosBloqueados)} helper="Horários fora da base comercial" />
        <InfoCard label="Base ofertável" value={formatNumber(totals.capacidadeLiquida)} helper="Agendados + livres" />
        <InfoCard label="Tx. Ocupação" value={formatPercent(totals.taxaOcupacaoComercialPct)} helper="Leitura comercial agregada" />
        <InfoCard label="Taxa bloqueio" value={formatPercent(totals.taxaBloqueioPct)} helper="Participação de bloqueios no recorte" />
      </section>

      <OccupancyTable
        rows={sortedRows}
        loading={loading}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />

      <WeeklyReportAdminModal
        open={weeklyReportModalOpen}
        canEdit={canEdit}
        loading={weeklyReportLoading}
        saving={weeklyReportSaving}
        running={weeklyReportRunning}
        previewLoading={weeklyReportPreviewLoading}
        settings={weeklyReportSettings}
        eligibility={weeklyReportEligibility}
        runs={weeklyReportRuns}
        preview={weeklyReportPreview}
        selectedPreviewEmployeeId={selectedPreviewEmployeeId}
        nextWindowLabel={nextWeeklyWindowLabel()}
        onClose={() => setWeeklyReportModalOpen(false)}
        onRefresh={() => void loadWeeklyReportAdmin()}
        onSave={() => void handleSaveWeeklyReportSettings()}
        onRun={() => void handleRunWeeklyReport()}
        onGeneratePreview={() => void handleGenerateWeeklyReportPreview()}
        onSettingsChange={setWeeklyReportSettings}
        onToggleRecipient={toggleRecipient}
        onPreviewEmployeeChange={setSelectedPreviewEmployeeId}
      />
    </div>
  );
}

function WeeklyReportAdminModal({
  open,
  canEdit,
  loading,
  saving,
  running,
  previewLoading,
  settings,
  eligibility,
  runs,
  preview,
  selectedPreviewEmployeeId,
  nextWindowLabel,
  onClose,
  onRefresh,
  onSave,
  onRun,
  onGeneratePreview,
  onSettingsChange,
  onToggleRecipient,
  onPreviewEmployeeChange,
}: {
  open: boolean;
  canEdit: boolean;
  loading: boolean;
  saving: boolean;
  running: boolean;
  previewLoading: boolean;
  settings: WeeklyReportSettingsState;
  eligibility: WeeklyReportEligibilityState;
  runs: WeeklyReportRunItem[];
  preview: WeeklyReportPreviewState;
  selectedPreviewEmployeeId: string;
  nextWindowLabel: string;
  onClose: () => void;
  onRefresh: () => void;
  onSave: () => void;
  onRun: () => void;
  onGeneratePreview: () => void;
  onSettingsChange: Dispatch<SetStateAction<WeeklyReportSettingsState>>;
  onToggleRecipient: (employeeId: string) => void;
  onPreviewEmployeeChange: (value: string) => void;
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const latestRun = runs[0] || null;
  const readyRecipients = eligibility?.selectedReadyRecipients || [];
  const eligibleRecipients = eligibility?.eligibleRecipients || [];
  const ineligibleRecipients = eligibility?.ineligibleRecipients || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="agenda-occupancy-weekly-report-title"
        className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Administração de e-mail</div>
            <h3 id="agenda-occupancy-weekly-report-title" className="mt-1 text-lg font-bold text-slate-900">
              Report semanal de ocupação de agenda
            </h3>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Envio automático toda quinta às 08h, cobrindo a semana seguinte de segunda a sábado.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {loading ? (
              <span className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-[#17407E]">
                <Loader2 size={14} className="animate-spin" />
                Atualizando
              </span>
            ) : null}
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw size={16} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
              aria-label="Fechar modal"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="max-h-[76vh] overflow-y-auto px-5 py-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <InfoCard label="Status" value={settings.enabled ? "Ativo" : "Desativado"} helper="Fluxo semanal do report de ocupação" />
            <InfoCard label="Próximo disparo" value="Qui 08h" helper={nextWindowLabel} />
            <InfoCard label="Aptos" value={eligibleRecipients.length} helper="Ativos com e-mail corporativo" />
            <InfoCard label="Selecionados" value={readyRecipients.length} helper="Destinatários atuais do report" />
            <InfoCard
              label="Último envio"
              value={latestRun ? latestRun.status : "—"}
              helper={latestRun ? formatDateTime(latestRun.createdAt) : "Nenhum envio registrado"}
            />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">Configurações do envio</div>
                <p className="text-xs text-slate-500">O cron automático atualiza a ocupação antes de enviar o e-mail.</p>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Remetente</span>
                  <input
                    value={settings.fromEmail}
                    onChange={(event) => onSettingsChange((current) => ({ ...current, fromEmail: event.target.value }))}
                    className="w-full border-0 bg-transparent p-0 text-sm text-slate-800 outline-none"
                    placeholder="ex.: relatorios@consultare.com.br"
                  />
                </label>
                <label className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Nome do remetente</span>
                  <input
                    value={settings.fromName}
                    onChange={(event) => onSettingsChange((current) => ({ ...current, fromName: event.target.value }))}
                    className="w-full border-0 bg-transparent p-0 text-sm text-slate-800 outline-none"
                    placeholder="Consultare Hub"
                  />
                </label>
                <label className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm md:col-span-2">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Reply-to</span>
                  <input
                    value={settings.replyToEmail}
                    onChange={(event) => onSettingsChange((current) => ({ ...current, replyToEmail: event.target.value }))}
                    className="w-full border-0 bg-transparent p-0 text-sm text-slate-800 outline-none"
                    placeholder="opcional"
                  />
                </label>
              </div>

              <label className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(event) => onSettingsChange((current) => ({ ...current, enabled: event.target.checked }))}
                />
                Ativar envio automático semanal da ocupação de agenda
              </label>

              <div className="mt-4 rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3">
                  <div className="text-sm font-semibold text-slate-900">Destinatários aptos</div>
                  <p className="text-xs text-slate-500">Somente colaboradores com e-mail corporativo entram no fluxo.</p>
                </div>
                <div className="max-h-72 overflow-y-auto px-4 py-3">
                  {eligibleRecipients.length <= 0 ? (
                    <div className="text-sm text-slate-500">Nenhum colaborador apto encontrado.</div>
                  ) : (
                    <div className="space-y-2">
                      {eligibleRecipients.map((recipient) => {
                        const checked = settings.recipientEmployeeIds.includes(recipient.employeeId);
                        return (
                          <label
                            key={recipient.employeeId}
                            className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => onToggleRecipient(recipient.employeeId)}
                            />
                            <span>
                              <span className="block font-medium text-slate-900">{recipient.employeeName}</span>
                              <span className="block text-xs text-slate-500">{recipient.corporateEmail}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canEdit || saving}
                  onClick={onSave}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                  Salvar configurações
                </button>
                <button
                  type="button"
                  disabled={!canEdit || running}
                  onClick={onRun}
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-[#17407E] disabled:opacity-60"
                >
                  {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                  Disparo manual
                </button>
              </div>
            </section>

            <section className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Prévia do e-mail</div>
                    <p className="text-xs text-slate-500">Use a homologação para revisar o conteúdo da próxima semana.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={selectedPreviewEmployeeId}
                      onChange={(event) => onPreviewEmployeeChange(event.target.value)}
                      className="h-10 min-w-[240px] rounded-lg border border-slate-200 px-3 text-sm"
                    >
                      <option value="">Selecione um destinatário</option>
                      {(readyRecipients.length > 0 ? readyRecipients : eligibleRecipients).map((recipient) => (
                        <option key={recipient.employeeId} value={recipient.employeeId}>
                          {recipient.employeeName} · {recipient.corporateEmail}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!selectedPreviewEmployeeId || previewLoading}
                      onClick={onGeneratePreview}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
                    >
                      {previewLoading ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                      Gerar prévia
                    </button>
                  </div>
                </div>

                {preview ? (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assunto</div>
                      <div className="mt-1 text-sm font-medium text-slate-900">{preview.subject}</div>
                      <div className="mt-2 text-xs text-slate-500">
                        Destinatário: {preview.recipient.employeeName} · {preview.recipient.corporateEmail}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <InfoCard label="Alta ocupação" value={preview.summary.highCount} helper="Especialidades para avaliar mais médicos" />
                      <InfoCard label="Baixa ocupação" value={preview.summary.lowCount} helper="Especialidades para buscar pacientes" />
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Corpo do e-mail</div>
                      <pre className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{preview.text}</pre>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    Gere uma prévia para revisar o resumo inline e os anexos da semana seguinte.
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">Base não apta</div>
                <p className="text-xs text-slate-500">Colaboradores sem e-mail corporativo ou inativos ficam fora da seleção.</p>
                <div className="mt-3 max-h-40 overflow-y-auto space-y-2">
                  {ineligibleRecipients.length <= 0 ? (
                    <div className="text-sm text-slate-500">Nenhum impedimento cadastral encontrado.</div>
                  ) : (
                    ineligibleRecipients.slice(0, 12).map((recipient) => (
                      <div key={recipient.employeeId} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                        <div className="font-medium text-slate-900">{recipient.employeeName}</div>
                        <div className="text-xs text-slate-500">
                          {recipient.reason === "MISSING_CORPORATE_EMAIL"
                            ? "Sem e-mail corporativo"
                            : recipient.reason === "INACTIVE"
                              ? "Colaborador inativo"
                              : "Colaborador não encontrado"}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">Histórico recente</div>
                <div className="mt-3 max-h-56 overflow-y-auto space-y-2">
                  {runs.length <= 0 ? (
                    <div className="text-sm text-slate-500">Nenhum envio registrado até agora.</div>
                  ) : (
                    runs.map((run) => (
                      <div key={run.id} className="rounded-xl border border-slate-200 px-3 py-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-semibold text-slate-900">
                            {run.status} · {run.triggerSource === "cron" ? "Automático" : "Manual"}
                          </div>
                          <div className="text-xs text-slate-500">{formatDateTime(run.createdAt)}</div>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Janela {formatDate(run.weekStartDate)} a {formatDate(run.weekEndDate)} · enviados {run.sentCount} · falhas {run.failedCount}
                        </div>
                        {run.errorMessage ? <div className="mt-2 text-xs text-rose-600">{run.errorMessage}</div> : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-bold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{helper}</div>
    </div>
  );
}
