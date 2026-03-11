"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertCircle, FileText, Loader2, RefreshCw, Users } from "lucide-react";
import { hasPermission } from "@/lib/permissions";
import { isRepassesModuleEnabledClient } from "@/lib/repasses/feature";
import type {
  RepasseConsolidacaoLineMarkColor,
  RepasseConsolidacaoMarkLegend,
} from "@/lib/repasses/types";
import { JobHistoryTable } from "./components/JobHistoryTable";
import { ProfessionalDetailsModal } from "./components/ProfessionalDetailsModal";
import { ProfessionalSummaryTable } from "./components/ProfessionalSummaryTable";
import { RepassesFiltersPanel } from "./components/RepassesFiltersPanel";

type JobRow = {
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

type ProfessionalStatusFilter = "all" | "success" | "no_data" | "skipped" | "error" | "not_processed";
type BooleanFilter = "all" | "yes" | "no";
type ConsolidacaoStatusFilter = "all" | "consolidado" | "nao_consolidado" | "nao_recebido";

type ProfessionalSummary = {
  professionalId: string;
  professionalName: string;
  status: "SUCCESS" | "NO_DATA" | "SKIPPED" | "ERROR" | "NOT_PROCESSED";
  rowsCount: number;
  totalValue: number;
  consolidadoQty: number;
  consolidadoValue: number;
  naoConsolidadoQty: number;
  naoConsolidadoValue: number;
  naoRecebidoQty: number;
  naoRecebidoValue: number;
  repasseTotalConsolidadoTabela: number;
  repasseTotalConsolidadoAConferir: number;
  hasDivergencia: boolean;
  divergenciaValue: number;
  lastProcessedAt: string | null;
  errorMessage: string | null;
  note: string | null;
  internalNote: string | null;
  paymentMinimumText: string | null;
};

type RepasseLine = {
  sourceRowHash: string;
  invoiceId: string;
  executionDate: string;
  patientName: string;
  unitName: string;
  accountDate: string;
  requesterName: string;
  specialtyName: string;
  procedureName: string;
  attendanceValue: number;
  detailStatus: string;
  detailStatusText: string;
  roleCode: string;
  roleName: string;
  detailProfessionalName: string;
  detailRepasseValue: number;
  isInConsolidado: boolean;
};

type ProfessionalStats = {
  totalProfessionals: number;
  success: number;
  noData: number;
  skipped: number;
  error: number;
  notProcessed: number;
  totalRows: number;
  totalValue: number;
  consolidadoQty: number;
  consolidadoValue: number;
  naoConsolidadoQty: number;
  naoConsolidadoValue: number;
  naoRecebidoQty: number;
  naoRecebidoValue: number;
  divergenceCount: number;
};

const defaultLegend: RepasseConsolidacaoMarkLegend = {
  green: "OK",
  yellow: "Revisar",
  red: "Problema",
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

export default function RepassesPage() {
  const moduleEnabled = isRepassesModuleEnabledClient();
  const { data: session } = useSession();
  const role = String((session?.user as any)?.role || "OPERADOR");

  const canView = hasPermission((session?.user as any)?.permissions, "repasses", "view", role);
  const canRefresh = hasPermission((session?.user as any)?.permissions, "repasses", "refresh", role);
  const canEdit = hasPermission((session?.user as any)?.permissions, "repasses", "edit", role);

  const [periodRef, setPeriodRef] = useState(previousMonthRef());
  const [statusFilter, setStatusFilter] = useState<ProfessionalStatusFilter>("all");
  const [hasPaymentMinimum, setHasPaymentMinimum] = useState<BooleanFilter>("all");
  const [consolidacaoStatus, setConsolidacaoStatus] = useState<ConsolidacaoStatusFilter>("all");
  const [hasDivergence, setHasDivergence] = useState<BooleanFilter>("all");
  const [attendanceDateStart, setAttendanceDateStart] = useState("");
  const [attendanceDateEnd, setAttendanceDateEnd] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [patientNameDraft, setPatientNameDraft] = useState("");
  const [patientName, setPatientName] = useState("");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(300);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectingAll, setSelectingAll] = useState(false);
  const [showRefreshHistoryModal, setShowRefreshHistoryModal] = useState(false);
  const [showPdfHistoryModal, setShowPdfHistoryModal] = useState(false);

  const [syncJobs, setSyncJobs] = useState<JobRow[]>([]);
  const [consolidacaoJobs, setConsolidacaoJobs] = useState<JobRow[]>([]);
  const [pdfJobs, setPdfJobs] = useState<JobRow[]>([]);

  const [items, setItems] = useState<ProfessionalSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<ProfessionalStats>({
    totalProfessionals: 0,
    success: 0,
    noData: 0,
    skipped: 0,
    error: 0,
    notProcessed: 0,
    totalRows: 0,
    totalValue: 0,
    consolidadoQty: 0,
    consolidadoValue: 0,
    naoConsolidadoQty: 0,
    naoConsolidadoValue: 0,
    naoRecebidoQty: 0,
    naoRecebidoValue: 0,
    divergenceCount: 0,
  });

  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [internalNoteDrafts, setInternalNoteDrafts] = useState<Record<string, string>>({});
  const [savingNoteById, setSavingNoteById] = useState<Record<string, boolean>>({});

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsItem, setDetailsItem] = useState<ProfessionalSummary | null>(null);
  const [detailRows, setDetailRows] = useState<RepasseLine[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [legend, setLegend] = useState<RepasseConsolidacaoMarkLegend>({ ...defaultLegend });
  const [legendDirty, setLegendDirty] = useState(false);
  const [savingLegend, setSavingLegend] = useState(false);
  const [marksByRowHash, setMarksByRowHash] = useState<
    Record<string, RepasseConsolidacaoLineMarkColor | null>
  >({});
  const [markChanges, setMarkChanges] = useState<
    Record<string, { sourceRowHash: string; colorKey: RepasseConsolidacaoLineMarkColor | null }>
  >({});
  const [savingMarks, setSavingMarks] = useState(false);

  const [loadingJobs, setLoadingJobs] = useState(false);
  const [loadingProfessionals, setLoadingProfessionals] = useState(false);
  const [creatingRefresh, setCreatingRefresh] = useState(false);
  const [creatingPdf, setCreatingPdf] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const periodLabel = useMemo(() => {
    const [y, m] = periodRef.split("-");
    if (!y || !m) return periodRef;
    return `${m}/${y}`;
  }, [periodRef]);

  const selectedIdsArray = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const selectedCount = selectedIdsArray.length;

  const buildCommonFilters = useCallback(() => {
    return {
      periodRef,
      search,
      status: statusFilter,
      hasPaymentMinimum,
      consolidacaoStatus,
      hasDivergence,
      attendanceDateStart,
      attendanceDateEnd,
      patientName,
    };
  }, [
    periodRef,
    search,
    statusFilter,
    hasPaymentMinimum,
    consolidacaoStatus,
    hasDivergence,
    attendanceDateStart,
    attendanceDateEnd,
    patientName,
  ]);

  const fetchJobs = useCallback(async () => {
    if (!canView) return;
    setLoadingJobs(true);
    try {
      const qs = new URLSearchParams({ periodRef, limit: "30" }).toString();
      const [syncRes, consolidacaoRes, pdfRes] = await Promise.all([
        fetch(`/api/admin/repasses/jobs?${qs}`, { cache: "no-store" }),
        fetch(`/api/admin/repasses/consolidacao/jobs?${qs}`, { cache: "no-store" }),
        fetch(`/api/admin/repasses/pdf-jobs?${qs}`, { cache: "no-store" }),
      ]);

      const syncData = await syncRes.json().catch(() => ({}));
      const consolidacaoData = await consolidacaoRes.json().catch(() => ({}));
      const pdfData = await pdfRes.json().catch(() => ({}));

      if (!syncRes.ok) throw new Error(syncData?.error || "Falha ao carregar histórico de atualização.");
      if (!consolidacaoRes.ok) {
        throw new Error(consolidacaoData?.error || "Falha ao carregar histórico de consolidação.");
      }
      if (!pdfRes.ok) throw new Error(pdfData?.error || "Falha ao carregar histórico de relatórios.");

      setSyncJobs(Array.isArray(syncData?.data?.items) ? syncData.data.items : []);
      setConsolidacaoJobs(
        Array.isArray(consolidacaoData?.data?.items) ? consolidacaoData.data.items : []
      );
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
        ...buildCommonFilters(),
        page: String(page),
        pageSize: String(pageSize),
      }).toString();

      const res = await fetch(`/api/admin/repasses/consolidacao/professionals?${qs}`, {
        cache: "no-store",
      });
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
          skipped: 0,
          error: 0,
          notProcessed: 0,
          totalRows: 0,
          totalValue: 0,
          consolidadoQty: 0,
          consolidadoValue: 0,
          naoConsolidadoQty: 0,
          naoConsolidadoValue: 0,
          naoRecebidoQty: 0,
          naoRecebidoValue: 0,
          divergenceCount: 0,
        }
      );

      setNoteDrafts((prev) => {
        const next = { ...prev };
        for (const item of loadedItems) {
          if (next[item.professionalId] === undefined) next[item.professionalId] = item.note || "";
        }
        return next;
      });
      setInternalNoteDrafts((prev) => {
        const next = { ...prev };
        for (const item of loadedItems) {
          if (next[item.professionalId] === undefined) {
            next[item.professionalId] = item.internalNote || "";
          }
        }
        return next;
      });
    } finally {
      setLoadingProfessionals(false);
    }
  }, [buildCommonFilters, canView, page, pageSize]);

  const refreshAll = useCallback(async () => {
    setError("");
    setNotice("");
    try {
      await Promise.all([fetchJobs(), fetchProfessionals()]);
    } catch (e: any) {
      setError(e?.message || "Erro ao atualizar dados de repasse.");
    }
  }, [fetchJobs, fetchProfessionals]);

  const applySearch = () => {
    setPage(1);
    setSearch(searchDraft.trim());
    setPatientName(patientNameDraft.trim());
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
        ...buildCommonFilters(),
      }).toString();
      const res = await fetch(`/api/admin/repasses/consolidacao/professionals?${qs}`, {
        cache: "no-store",
      });
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

  const createRefreshJobs = async () => {
    if (!canRefresh) return;
    if (selectedCount < 1) {
      setError("Selecione ao menos 1 profissional para atualizar.");
      return;
    }
    setCreatingRefresh(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/repasses/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodRef,
          professionalIds: selectedIdsArray,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao solicitar atualização de repasses.");
      const syncId = String(data?.data?.syncJob?.id || "-");
      const consolidacaoId = String(data?.data?.consolidacaoJob?.id || "-");
      setNotice(
        `Atualização solicitada para ${selectedCount} profissional(is). Jobs: sincronização ${syncId} | consolidação ${consolidacaoId}.`
      );
      await fetchJobs();
    } catch (e: any) {
      setError(e?.message || "Erro ao criar jobs de atualização.");
    } finally {
      setCreatingRefresh(false);
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

      const processRes = await fetch("/api/admin/repasses/pdf-jobs/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxJobs: 1 }),
      });
      const processData = await processRes.json().catch(() => ({}));
      if (!processRes.ok) throw new Error(processData?.error || "Falha ao gerar relatório.");

      const generated = Number(processData?.data?.generatedFiles || 0);
      const processed = Number(processData?.data?.processedJobs || 0);
      const failed = Number(processData?.data?.failedJobs || 0);
      setNotice(`Geração concluída. Jobs: ${processed} | Arquivos: ${generated} | Falhas: ${failed}.`);
      await fetchJobs();
    } catch (e: any) {
      setError(e?.message || "Erro ao gerar relatório.");
    } finally {
      setCreatingPdf(false);
    }
  };

  const saveProfessionalNotes = async (professionalId: string) => {
    if (!canEdit || !professionalId) return;
    const note = noteDrafts[professionalId] ?? "";
    const internalNote = internalNoteDrafts[professionalId] ?? "";
    setSavingNoteById((prev) => ({ ...prev, [professionalId]: true }));
    setError("");
    try {
      const res = await fetch("/api/admin/repasses/consolidacao/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodRef,
          professionalId,
          note,
          internalNote,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao salvar observações.");

      setItems((prev) =>
        prev.map((item) =>
          item.professionalId === professionalId
            ? {
                ...item,
                note: note.trim() || null,
                internalNote: internalNote.trim() || null,
              }
            : item
        )
      );
      setNotice("Observações salvas.");
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar observações.");
    } finally {
      setSavingNoteById((prev) => ({ ...prev, [professionalId]: false }));
    }
  };

  const loadDetails = async (item: ProfessionalSummary) => {
    const qs = new URLSearchParams({ periodRef }).toString();
    const [detailsRes, marksRes, legendRes] = await Promise.all([
      fetch(`/api/admin/repasses/consolidacao/professionals/${encodeURIComponent(item.professionalId)}/details?${qs}`, {
        cache: "no-store",
      }),
      fetch(
        `/api/admin/repasses/consolidacao/marks?${new URLSearchParams({
          periodRef,
          professionalId: item.professionalId,
        }).toString()}`,
        { cache: "no-store" }
      ),
      fetch("/api/admin/repasses/consolidacao/legend", { cache: "no-store" }),
    ]);

    const detailsData = await detailsRes.json().catch(() => ({}));
    const marksData = await marksRes.json().catch(() => ({}));
    const legendData = await legendRes.json().catch(() => ({}));

    if (!detailsRes.ok) {
      throw new Error(detailsData?.error || "Falha ao carregar detalhes do profissional.");
    }
    if (!marksRes.ok) throw new Error(marksData?.error || "Falha ao carregar marcações.");
    if (!legendRes.ok) throw new Error(legendData?.error || "Falha ao carregar legenda.");

    const rows: RepasseLine[] = Array.isArray(detailsData?.data?.rows) ? detailsData.data.rows : [];
    const note = String(detailsData?.data?.note || "");
    const internalNote = String(detailsData?.data?.internalNote || "");
    const paymentMinimumTextRaw = detailsData?.data?.paymentMinimumText;
    const paymentMinimumText =
      paymentMinimumTextRaw === null || paymentMinimumTextRaw === undefined
        ? null
        : String(paymentMinimumTextRaw).trim() || null;

    const marksArray = Array.isArray(marksData?.data?.items) ? marksData.data.items : [];
    const marksMap: Record<string, RepasseConsolidacaoLineMarkColor | null> = {};
    for (const mark of marksArray) {
      const hash = String(mark?.sourceRowHash || "").trim();
      const color = String(mark?.colorKey || "").trim() as RepasseConsolidacaoLineMarkColor;
      if (!hash) continue;
      if (color === "green" || color === "yellow" || color === "red") {
        marksMap[hash] = color;
      }
    }

    const loadedLegend: RepasseConsolidacaoMarkLegend = {
      green: String(legendData?.data?.green || defaultLegend.green),
      yellow: String(legendData?.data?.yellow || defaultLegend.yellow),
      red: String(legendData?.data?.red || defaultLegend.red),
    };

    setDetailRows(rows);
    setNoteDrafts((prev) => ({ ...prev, [item.professionalId]: note }));
    setInternalNoteDrafts((prev) => ({ ...prev, [item.professionalId]: internalNote }));
    setItems((prev) =>
      prev.map((current) =>
        current.professionalId === item.professionalId
          ? {
              ...current,
              note: note || null,
              internalNote: internalNote || null,
              paymentMinimumText,
            }
          : current
      )
    );
    setDetailsItem((current) =>
      current && current.professionalId === item.professionalId
        ? {
            ...current,
            note: note || null,
            internalNote: internalNote || null,
            paymentMinimumText,
          }
        : current
    );
    setMarksByRowHash(marksMap);
    setMarkChanges({});
    setLegend(loadedLegend);
    setLegendDirty(false);
  };

  const openProfessionalDetails = async (item: ProfessionalSummary) => {
    setDetailsItem(item);
    setDetailsOpen(true);
    setDetailLoading(true);
    setDetailError("");
    try {
      await loadDetails(item);
    } catch (e: any) {
      setDetailRows([]);
      setDetailError(e?.message || "Erro ao carregar detalhes do profissional.");
    } finally {
      setDetailLoading(false);
    }
  };

  const saveMarks = useCallback(
    async (withNotice: boolean) => {
      if (!canEdit || !detailsItem) return true;
      const entries = Object.values(markChanges);
      if (entries.length === 0) return true;

      setSavingMarks(true);
      try {
        const res = await fetch("/api/admin/repasses/consolidacao/marks", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            periodRef,
            professionalId: detailsItem.professionalId,
            marks: entries,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Falha ao salvar marcações.");

        const savedItems = Array.isArray(data?.data?.items) ? data.data.items : [];
        const nextMap: Record<string, RepasseConsolidacaoLineMarkColor | null> = {};
        for (const item of savedItems) {
          const hash = String(item?.sourceRowHash || "").trim();
          const color = String(item?.colorKey || "").trim() as RepasseConsolidacaoLineMarkColor;
          if (!hash) continue;
          if (color === "green" || color === "yellow" || color === "red") nextMap[hash] = color;
        }
        setMarksByRowHash(nextMap);
        setMarkChanges({});
        if (withNotice) setNotice("Marcações salvas.");
        return true;
      } catch (e: any) {
        setError(e?.message || "Erro ao salvar marcações.");
        return false;
      } finally {
        setSavingMarks(false);
      }
    },
    [canEdit, detailsItem, markChanges, periodRef]
  );

  const saveLegend = useCallback(
    async (withNotice: boolean) => {
      if (!canEdit || !legendDirty) return true;
      setSavingLegend(true);
      try {
        const res = await fetch("/api/admin/repasses/consolidacao/legend", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(legend),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Falha ao salvar legenda.");
        setLegend({
          green: String(data?.data?.green || legend.green || defaultLegend.green),
          yellow: String(data?.data?.yellow || legend.yellow || defaultLegend.yellow),
          red: String(data?.data?.red || legend.red || defaultLegend.red),
        });
        setLegendDirty(false);
        if (withNotice) setNotice("Legenda salva.");
        return true;
      } catch (e: any) {
        setError(e?.message || "Erro ao salvar legenda.");
        return false;
      } finally {
        setSavingLegend(false);
      }
    },
    [canEdit, legend, legendDirty]
  );

  useEffect(() => {
    if (!detailsOpen || !canEdit) return;
    if (Object.keys(markChanges).length === 0) return;
    const timer = setTimeout(() => {
      void saveMarks(false);
    }, 900);
    return () => clearTimeout(timer);
  }, [canEdit, detailsOpen, markChanges, saveMarks]);

  useEffect(() => {
    if (!detailsOpen || !canEdit) return;
    if (!legendDirty) return;
    const timer = setTimeout(() => {
      void saveLegend(false);
    }, 900);
    return () => clearTimeout(timer);
  }, [canEdit, detailsOpen, legendDirty, saveLegend]);

  useEffect(() => {
    if (!moduleEnabled || !canView) return;
    fetchJobs().catch((e: any) => {
      setError(e?.message || "Erro ao carregar histórico de repasses.");
    });
  }, [moduleEnabled, canView, fetchJobs]);

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
          Módulo de repasses desabilitado.
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
    <div className="mx-auto max-w-[1900px] space-y-4 p-6">
      <header className="rounded-xl border bg-white p-4">
        <div className="flex flex-col gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-800">Fechamento de repasses</h1>
            <p className="text-xs text-slate-500">
              Visão comparativa entre repasses fechados e itens de consolidação para conferência operacional.
            </p>
          </div>

          <RepassesFiltersPanel
            periodRef={periodRef}
            statusFilter={statusFilter}
            pageSize={pageSize}
            searchDraft={searchDraft}
            hasPaymentMinimum={hasPaymentMinimum}
            consolidacaoStatus={consolidacaoStatus}
            hasDivergence={hasDivergence}
            attendanceDateStart={attendanceDateStart}
            attendanceDateEnd={attendanceDateEnd}
            patientName={patientNameDraft}
            advancedOpen={advancedFiltersOpen}
            onPeriodRefChange={(value) => {
              setPeriodRef(value);
              setPage(1);
              setSelectedIds(new Set());
            }}
            onStatusFilterChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
            onPageSizeChange={(value) => {
              setPageSize(value);
              setPage(1);
            }}
            onSearchDraftChange={setSearchDraft}
            onApplySearch={applySearch}
            onHasPaymentMinimumChange={(value) => {
              setHasPaymentMinimum(value);
              setPage(1);
            }}
            onConsolidacaoStatusChange={(value) => {
              setConsolidacaoStatus(value);
              setPage(1);
            }}
            onHasDivergenceChange={(value) => {
              setHasDivergence(value);
              setPage(1);
            }}
            onAttendanceDateStartChange={(value) => {
              setAttendanceDateStart(value);
              setPage(1);
            }}
            onAttendanceDateEndChange={(value) => {
              setAttendanceDateEnd(value);
              setPage(1);
            }}
            onPatientNameChange={setPatientNameDraft}
            onToggleAdvanced={() => setAdvancedFiltersOpen((prev) => !prev)}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          <button
            type="button"
            onClick={createRefreshJobs}
            disabled={!canRefresh || creatingRefresh || selectedCount === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {creatingRefresh ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
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
            onClick={refreshAll}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-slate-700"
          >
            <RefreshCw size={14} />
            Recarregar painel
          </button>

          <button
            type="button"
            onClick={() => setShowRefreshHistoryModal(true)}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-slate-700"
          >
            Histórico de atualizações
          </button>

          <button
            type="button"
            onClick={() => setShowPdfHistoryModal(true)}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-slate-700"
          >
            Histórico de relatórios
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

      <section className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Profissionais</p>
          <p className="text-lg font-bold text-slate-800">{stats.totalProfessionals}</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Com dados</p>
          <p className="text-lg font-bold text-emerald-700">{stats.success}</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Com divergência</p>
          <p className="text-lg font-bold text-rose-700">{stats.divergenceCount}</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Atendimentos</p>
          <p className="text-lg font-bold text-slate-800">{stats.totalRows}</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Total repasse</p>
          <p className="text-base font-bold text-slate-800">{formatCurrency(stats.totalValue)}</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Consolidado</p>
          <p className="text-base font-bold text-emerald-700">{formatCurrency(stats.consolidadoValue)}</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Não consolidado</p>
          <p className="text-base font-bold text-amber-700">{formatCurrency(stats.naoConsolidadoValue)}</p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Não recebido</p>
          <p className="text-base font-bold text-rose-700">{formatCurrency(stats.naoRecebidoValue)}</p>
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
        onOpenDetails={openProfessionalDetails}
      />

      <ProfessionalDetailsModal
        open={detailsOpen}
        item={detailsItem}
        periodRef={periodRef}
        rows={detailRows}
        loadingRows={detailLoading}
        rowsError={detailError}
        noteValue={detailsItem ? noteDrafts[detailsItem.professionalId] ?? detailsItem.note ?? "" : ""}
        internalNoteValue={
          detailsItem ? internalNoteDrafts[detailsItem.professionalId] ?? detailsItem.internalNote ?? "" : ""
        }
        canEdit={canEdit}
        savingNote={detailsItem ? !!savingNoteById[detailsItem.professionalId] : false}
        marksByRowHash={marksByRowHash}
        savingMarks={savingMarks}
        legend={legend}
        savingLegend={savingLegend}
        onClose={() => {
          setDetailsOpen(false);
          setDetailsItem(null);
          setDetailRows([]);
          setDetailError("");
          setMarksByRowHash({});
          setMarkChanges({});
          setLegend({ ...defaultLegend });
          setLegendDirty(false);
        }}
        onNoteChange={(value) => {
          if (!detailsItem) return;
          setNoteDrafts((prev) => ({ ...prev, [detailsItem.professionalId]: value }));
        }}
        onInternalNoteChange={(value) => {
          if (!detailsItem) return;
          setInternalNoteDrafts((prev) => ({ ...prev, [detailsItem.professionalId]: value }));
        }}
        onSaveNote={() => {
          if (!detailsItem) return;
          void saveProfessionalNotes(detailsItem.professionalId);
        }}
        onMarkChange={(sourceRowHash, color) => {
          setMarksByRowHash((prev) => ({ ...prev, [sourceRowHash]: color }));
          setMarkChanges((prev) => ({
            ...prev,
            [sourceRowHash]: { sourceRowHash, colorKey: color },
          }));
        }}
        onSaveMarks={() => {
          void saveMarks(true);
        }}
        onLegendChange={(next) => {
          setLegend(next);
          setLegendDirty(true);
        }}
        onSaveLegend={() => {
          void saveLegend(true);
        }}
      />

      {showRefreshHistoryModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-6xl rounded-xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Histórico de atualizações</h3>
              <button
                type="button"
                onClick={() => setShowRefreshHistoryModal(false)}
                className="rounded border px-3 py-1 text-xs"
              >
                Fechar
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <JobHistoryTable
                title="Sincronização de repasses"
                jobs={syncJobs}
                loading={loadingJobs}
                mode="sync"
              />
              <JobHistoryTable
                title="Consolidação (a conferir)"
                jobs={consolidacaoJobs}
                loading={loadingJobs}
                mode="sync"
              />
            </div>
          </div>
        </div>
      )}

      {showPdfHistoryModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-5xl rounded-xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Histórico de relatórios</h3>
              <button
                type="button"
                onClick={() => setShowPdfHistoryModal(false)}
                className="rounded border px-3 py-1 text-xs"
              >
                Fechar
              </button>
            </div>
            <JobHistoryTable
              title="Histórico de jobs de relatório"
              jobs={pdfJobs}
              loading={loadingJobs}
              mode="pdf"
            />
          </div>
        </div>
      )}
    </div>
  );
}
