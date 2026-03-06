"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertCircle, FileText, Loader2, RefreshCw, Users } from "lucide-react";
import { hasPermission } from "@/lib/permissions";
import { isRepassesModuleEnabledClient } from "@/lib/repasses/feature";
import { JobHistoryTable } from "./components/JobHistoryTable";
import { ProfessionalSummaryTable } from "./components/ProfessionalSummaryTable";
import { RepasseArtifactsTable } from "./components/RepasseArtifactsTable";

type SyncJob = {
  id: string;
  periodRef: string;
  scope?: "all" | "single" | "multi";
  professionalIds?: string[];
  status: string;
  requestedBy: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
};

type PdfJob = {
  id: string;
  periodRef: string;
  scope: string;
  status: string;
  requestedBy: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
};

type PdfArtifact = {
  id: string;
  pdfJobId: string;
  periodRef: string;
  professionalId: string;
  professionalName: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
};

type ProfessionalStatusFilter = "all" | "success" | "no_data" | "error" | "not_processed";

type ProfessionalSummary = {
  professionalId: string;
  professionalName: string;
  status: "SUCCESS" | "NO_DATA" | "ERROR" | "NOT_PROCESSED";
  rowsCount: number;
  totalValue: number;
  lastProcessedAt: string | null;
  errorMessage: string | null;
  note: string | null;
};

type ProfessionalStats = {
  totalProfessionals: number;
  success: number;
  noData: number;
  error: number;
  notProcessed: number;
  totalRows: number;
  totalValue: number;
};

const previousMonthRef = () => {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const y = prev.getFullYear();
  const m = String(prev.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

const formatCurrency = (value: number) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const statusOptions: Array<{ value: ProfessionalStatusFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "success", label: "Com dados" },
  { value: "no_data", label: "Sem produção" },
  { value: "error", label: "Com erro" },
  { value: "not_processed", label: "Não processados" },
];

const pageSizeOptions = [25, 50, 100, 200];

export default function RepassesPage() {
  const moduleEnabled = isRepassesModuleEnabledClient();
  const { data: session } = useSession();
  const role = String((session?.user as any)?.role || "OPERADOR");

  const canView = hasPermission((session?.user as any)?.permissions, "repasses", "view", role);
  const canRefresh = hasPermission((session?.user as any)?.permissions, "repasses", "refresh", role);
  const canEdit = hasPermission((session?.user as any)?.permissions, "repasses", "edit", role);

  const [periodRef, setPeriodRef] = useState(previousMonthRef());
  const [statusFilter, setStatusFilter] = useState<ProfessionalStatusFilter>("all");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectingAll, setSelectingAll] = useState(false);

  const [syncJobs, setSyncJobs] = useState<SyncJob[]>([]);
  const [pdfJobs, setPdfJobs] = useState<PdfJob[]>([]);
  const [artifacts, setArtifacts] = useState<PdfArtifact[]>([]);

  const [items, setItems] = useState<ProfessionalSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<ProfessionalStats>({
    totalProfessionals: 0,
    success: 0,
    noData: 0,
    error: 0,
    notProcessed: 0,
    totalRows: 0,
    totalValue: 0,
  });
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNoteById, setSavingNoteById] = useState<Record<string, boolean>>({});

  const [loadingJobs, setLoadingJobs] = useState(false);
  const [loadingProfessionals, setLoadingProfessionals] = useState(false);
  const [loadingArtifacts, setLoadingArtifacts] = useState(false);
  const [creatingSync, setCreatingSync] = useState(false);
  const [creatingPdf, setCreatingPdf] = useState(false);
  const [processingPdf, setProcessingPdf] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const periodLabel = useMemo(() => {
    const [y, m] = periodRef.split("-");
    if (!y || !m) return periodRef;
    return `${m}/${y}`;
  }, [periodRef]);

  const selectedIdsArray = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const selectedCount = selectedIdsArray.length;

  const fetchJobs = useCallback(async () => {
    if (!canView) return;
    setLoadingJobs(true);
    try {
      const qs = new URLSearchParams({ periodRef, limit: "30" }).toString();
      const [syncRes, pdfRes] = await Promise.all([
        fetch(`/api/admin/repasses/jobs?${qs}`, { cache: "no-store" }),
        fetch(`/api/admin/repasses/pdf-jobs?${qs}`, { cache: "no-store" }),
      ]);

      const syncData = await syncRes.json().catch(() => ({}));
      const pdfData = await pdfRes.json().catch(() => ({}));

      if (!syncRes.ok) throw new Error(syncData?.error || "Falha ao carregar histórico de atualização.");
      if (!pdfRes.ok) throw new Error(pdfData?.error || "Falha ao carregar histórico de relatórios.");

      setSyncJobs(Array.isArray(syncData?.data?.items) ? syncData.data.items : []);
      setPdfJobs(Array.isArray(pdfData?.data?.items) ? pdfData.data.items : []);
    } finally {
      setLoadingJobs(false);
    }
  }, [canView, periodRef]);

  const fetchProfessionals = useCallback(async () => {
    if (!canView) return;
    setLoadingProfessionals(true);
    try {
      const qs = new URLSearchParams({
        periodRef,
        search,
        status: statusFilter,
        page: String(page),
        pageSize: String(pageSize),
      }).toString();

      const res = await fetch(`/api/admin/repasses/professionals?${qs}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao carregar resumo por profissional.");

      const loadedItems: ProfessionalSummary[] = Array.isArray(data?.data?.items) ? data.data.items : [];
      setItems(loadedItems);
      setTotal(Number(data?.data?.total) || 0);
      setStats(
        data?.data?.stats || {
          totalProfessionals: 0,
          success: 0,
          noData: 0,
          error: 0,
          notProcessed: 0,
          totalRows: 0,
          totalValue: 0,
        }
      );

      setNoteDrafts((prev) => {
        const next = { ...prev };
        for (const item of loadedItems) {
          if (next[item.professionalId] === undefined) {
            next[item.professionalId] = item.note || "";
          }
        }
        return next;
      });
    } finally {
      setLoadingProfessionals(false);
    }
  }, [canView, page, pageSize, periodRef, search, statusFilter]);

  const fetchArtifacts = useCallback(async () => {
    if (!canView) return;
    setLoadingArtifacts(true);
    try {
      const qs = new URLSearchParams({ periodRef, limit: "120" }).toString();
      const res = await fetch(`/api/admin/repasses/artifacts?${qs}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao carregar relatórios gerados.");
      setArtifacts(Array.isArray(data?.data?.items) ? data.data.items : []);
    } finally {
      setLoadingArtifacts(false);
    }
  }, [canView, periodRef]);

  const refreshAll = useCallback(async () => {
    setError("");
    setNotice("");
    try {
      await Promise.all([fetchJobs(), fetchProfessionals(), fetchArtifacts()]);
    } catch (e: any) {
      setError(e?.message || "Erro ao atualizar dados de repasse.");
    }
  }, [fetchArtifacts, fetchJobs, fetchProfessionals]);

  const applySearch = () => {
    setPage(1);
    setSearch(searchDraft.trim());
  };

  const toggleRowSelection = (professionalId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(professionalId);
      else next.delete(professionalId);
      return next;
    });
  };

  const toggleVisibleSelection = (professionalIds: string[], checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of professionalIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const selectAllFiltered = async () => {
    if (!canView || total === 0) return;
    setSelectingAll(true);
    setError("");
    try {
      const qs = new URLSearchParams({
        mode: "ids",
        periodRef,
        search,
        status: statusFilter,
      }).toString();
      const res = await fetch(`/api/admin/repasses/professionals?${qs}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao selecionar profissionais.");
      const ids = Array.isArray(data?.data?.items)
        ? data.data.items.map((v: unknown) => String(v || "").trim()).filter(Boolean)
        : [];
      setSelectedIds(new Set(ids));
      setNotice(`${ids.length} profissionais selecionados.`);
    } catch (e: any) {
      setError(e?.message || "Erro ao selecionar profissionais.");
    } finally {
      setSelectingAll(false);
    }
  };

  const createSyncJob = async () => {
    if (!canRefresh) return;
    if (selectedCount < 1) {
      setError("Selecione ao menos 1 profissional para atualizar.");
      return;
    }
    setCreatingSync(true);
    setError("");
    setNotice("");
    try {
      const scope = selectedCount === 1 ? "single" : "multi";
      const res = await fetch("/api/admin/repasses/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodRef,
          scope,
          professionalIds: selectedIdsArray,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao iniciar atualização de repasses.");
      setNotice(`Atualização de repasses solicitada para ${selectedCount} profissional(is).`);
      await fetchJobs();
    } catch (e: any) {
      setError(e?.message || "Erro ao criar job de atualização.");
    } finally {
      setCreatingSync(false);
    }
  };

  const createPdfJob = async () => {
    if (!canEdit) return;
    if (selectedCount < 1) {
      setError("Selecione ao menos 1 profissional para gerar relatório.");
      return;
    }
    setCreatingPdf(true);
    setError("");
    setNotice("");
    try {
      const scope = selectedCount === 1 ? "single" : "multi";
      const res = await fetch("/api/admin/repasses/pdf-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodRef,
          scope,
          professionalIds: selectedIdsArray,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao criar job de relatório.");
      setNotice(`Geração de relatórios solicitada para ${selectedCount} profissional(is).`);
      await fetchJobs();
    } catch (e: any) {
      setError(e?.message || "Erro ao criar job de relatório.");
    } finally {
      setCreatingPdf(false);
    }
  };

  const processPdfQueue = async () => {
    if (!canEdit) return;
    setProcessingPdf(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/repasses/pdf-jobs/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxJobs: 3 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao processar fila de relatório.");
      const generated = Number(data?.data?.generatedFiles || 0);
      const processed = Number(data?.data?.processedJobs || 0);
      setNotice(`Fila de relatório processada. Jobs: ${processed} | Arquivos: ${generated}.`);
      await refreshAll();
    } catch (e: any) {
      setError(e?.message || "Erro ao processar fila de relatório.");
    } finally {
      setProcessingPdf(false);
    }
  };

  const saveProfessionalNote = async (professionalId: string) => {
    if (!canEdit || !professionalId) return;
    const note = noteDrafts[professionalId] ?? "";
    setSavingNoteById((prev) => ({ ...prev, [professionalId]: true }));
    setError("");
    try {
      const res = await fetch("/api/admin/repasses/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodRef,
          professionalId,
          note,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao salvar observação.");

      setItems((prev) =>
        prev.map((item) =>
          item.professionalId === professionalId
            ? {
                ...item,
                note: note.trim() || null,
              }
            : item
        )
      );
      setNotice("Observação salva.");
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar observação.");
    } finally {
      setSavingNoteById((prev) => ({ ...prev, [professionalId]: false }));
    }
  };

  useEffect(() => {
    if (!moduleEnabled || !canView) return;
    Promise.all([fetchJobs(), fetchArtifacts()]).catch((e: any) => {
      setError(e?.message || "Erro ao carregar histórico de repasses.");
    });
  }, [moduleEnabled, canView, fetchArtifacts, fetchJobs]);

  useEffect(() => {
    if (!moduleEnabled || !canView) return;
    fetchProfessionals().catch((e: any) => {
      setError(e?.message || "Erro ao carregar tabela de profissionais.");
    });
  }, [moduleEnabled, canView, fetchProfessionals]);

  if (!moduleEnabled) {
    return (
      <div className="mx-auto max-w-[1600px] p-8">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Módulo de repasses em desenvolvimento. Acesso temporariamente desabilitado.
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="mx-auto max-w-[1600px] p-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Sem permissão para visualizar este módulo.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1800px] space-y-4 p-6">
      <header className="rounded-xl border bg-white p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0 xl:pr-3">
              <h1 className="text-xl font-bold text-slate-800">Fechamento de repasses</h1>
              <p className="text-xs text-slate-500">
                Selecione profissionais na tabela para atualizar dados e gerar relatórios.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[170px_170px_130px_116px] xl:items-end">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Período
                </label>
                <input
                  type="month"
                  value={periodRef}
                  onChange={(e) => {
                    setPeriodRef(e.target.value);
                    setPage(1);
                    setSelectedIds(new Set());
                    setNoteDrafts({});
                  }}
                  className="h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as ProfessionalStatusFilter);
                    setPage(1);
                  }}
                  className="h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm"
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Linhas
                </label>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value) || 100);
                    setPage(1);
                  }}
                  className="h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm"
                >
                  {pageSizeOptions.map((n) => (
                    <option key={n} value={n}>
                      {n}/página
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={refreshAll}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm"
              >
                <RefreshCw size={14} />
                Atualizar
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          <button
            type="button"
            onClick={createSyncJob}
            disabled={!canRefresh || creatingSync || selectedCount === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {creatingSync ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Atualizar dados de repasse
          </button>

          <button
            type="button"
            onClick={createPdfJob}
            disabled={!canEdit || creatingPdf || selectedCount === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-[#229A8A] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {creatingPdf ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            Gerar relatórios
          </button>

          <button
            type="button"
            onClick={processPdfQueue}
            disabled={!canEdit || processingPdf}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0F766E] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {processingPdf ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            Gerar relatórios pendentes
          </button>

          <button
            type="button"
            onClick={selectAllFiltered}
            disabled={selectingAll || total === 0}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            {selectingAll ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
            Selecionar todos do filtro ({total})
          </button>

          <button
            type="button"
            onClick={clearSelection}
            disabled={selectedCount === 0}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            Limpar seleção
          </button>

          <span className="text-xs text-slate-500">
            Período: {periodLabel} | Selecionados: {selectedCount}
          </span>
        </div>
      </header>

      {error && (
        <div className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      <section className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Profissionais</p>
          <p className="text-lg font-bold text-slate-800">{stats.totalProfessionals}</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Com dados</p>
          <p className="text-lg font-bold text-emerald-700">{stats.success}</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Sem produção</p>
          <p className="text-lg font-bold text-violet-700">{stats.noData}</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Com erro</p>
          <p className="text-lg font-bold text-rose-700">{stats.error}</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Não processados</p>
          <p className="text-lg font-bold text-slate-700">{stats.notProcessed}</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Atendimentos</p>
          <p className="text-lg font-bold text-slate-800">{stats.totalRows}</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Total repasse</p>
          <p className="text-base font-bold text-slate-800">{formatCurrency(stats.totalValue)}</p>
        </div>
      </section>

      <ProfessionalSummaryTable
        items={items}
        loading={loadingProfessionals}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        selectedIds={selectedIds}
        selectedCount={selectedCount}
        onToggleRow={toggleRowSelection}
        onToggleVisible={toggleVisibleSelection}
        searchDraft={searchDraft}
        onSearchDraftChange={setSearchDraft}
        onApplySearch={applySearch}
        canEdit={canEdit}
        noteValues={noteDrafts}
        savingNoteById={savingNoteById}
        onNoteChange={(professionalId, value) =>
          setNoteDrafts((prev) => ({ ...prev, [professionalId]: value }))
        }
        onSaveNote={saveProfessionalNote}
      />

      <RepasseArtifactsTable items={artifacts} loading={loadingArtifacts} />

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <JobHistoryTable title="Histórico de atualizações" jobs={syncJobs} loading={loadingJobs} mode="sync" />
        <JobHistoryTable title="Histórico de jobs de relatório" jobs={pdfJobs} loading={loadingJobs} mode="pdf" />
      </section>
    </div>
  );
}

