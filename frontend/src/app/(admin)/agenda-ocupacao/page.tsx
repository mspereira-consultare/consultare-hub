"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Download, Loader2, RefreshCw } from "lucide-react";
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

const getDefaultRange = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const byType = new Map(parts.map((p) => [p.type, p.value]));
  const year = String(byType.get("year") || "1970");
  const month = String(byType.get("month") || "01");
  const day = String(byType.get("day") || "01");
  return {
    startDate: `${year}-${month}-01`,
    endDate: `${year}-${month}-${day}`,
  };
};

export default function AgendaOcupacaoPage() {
  const { data: session } = useSession();
  type SessionUser = { role?: string; permissions?: unknown };
  const sessionUser = (session?.user || {}) as SessionUser;
  const role = String(sessionUser.role || "OPERADOR");

  const canView = hasPermission(sessionUser.permissions, "agenda_ocupacao", "view", role);
  const canRefresh = hasPermission(sessionUser.permissions, "agenda_ocupacao", "refresh", role);

  const defaults = getDefaultRange();
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
        }
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
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Especialidades</p>
          <p className="text-lg font-bold text-slate-800">{formatNumber(totals.especialidades)}</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Agendamentos</p>
          <p className="text-lg font-bold text-slate-800">{formatNumber(totals.agendamentos)}</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Disponíveis</p>
          <p className="text-lg font-bold text-slate-800">{formatNumber(totals.horariosDisponiveis)}</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Bloqueados</p>
          <p className="text-lg font-bold text-slate-800">{formatNumber(totals.horariosBloqueados)}</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Base ofertável (Ag + Livres)</p>
          <p className="text-lg font-bold text-slate-800">{formatNumber(totals.capacidadeLiquida)}</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Tx. Ocupação</p>
          <p className="text-lg font-bold text-slate-800">{formatPercent(totals.taxaOcupacaoComercialPct)}</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Taxa de bloqueio</p>
          <p className="text-lg font-bold text-slate-800">{formatPercent(totals.taxaBloqueioPct)}</p>
        </div>
      </section>

      <OccupancyTable
        rows={sortedRows}
        loading={loading}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />
    </div>
  );
}
