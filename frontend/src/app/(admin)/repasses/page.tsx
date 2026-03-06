"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertCircle, FileText, Loader2, RefreshCw } from "lucide-react";
import { hasPermission } from "@/lib/permissions";

type SyncJob = {
  id: string;
  periodRef: string;
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

const previousMonthRef = () => {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const y = prev.getFullYear();
  const m = String(prev.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

const toBrDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString("pt-BR");
};

const statusChip = (status: string) => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "COMPLETED") return "bg-emerald-100 text-emerald-700";
  if (normalized === "RUNNING") return "bg-sky-100 text-sky-700";
  if (normalized === "FAILED") return "bg-rose-100 text-rose-700";
  if (normalized === "PARTIAL") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
};

export default function RepassesPage() {
  const { data: session } = useSession();
  const role = String((session?.user as any)?.role || "OPERADOR");

  const canView = hasPermission((session?.user as any)?.permissions, "repasses", "view", role);
  const canRefresh = hasPermission((session?.user as any)?.permissions, "repasses", "refresh", role);
  const canEdit = hasPermission((session?.user as any)?.permissions, "repasses", "edit", role);

  const [periodRef, setPeriodRef] = useState(previousMonthRef());
  const [syncJobs, setSyncJobs] = useState<SyncJob[]>([]);
  const [pdfJobs, setPdfJobs] = useState<PdfJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingSync, setCreatingSync] = useState(false);
  const [creatingPdf, setCreatingPdf] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const periodLabel = useMemo(() => {
    const [y, m] = periodRef.split("-");
    if (!y || !m) return periodRef;
    return `${m}/${y}`;
  }, [periodRef]);

  const fetchJobs = async () => {
    if (!canView) return;
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ periodRef, limit: "30" }).toString();
      const [syncRes, pdfRes] = await Promise.all([
        fetch(`/api/admin/repasses/jobs?${qs}`, { cache: "no-store" }),
        fetch(`/api/admin/repasses/pdf-jobs?${qs}`, { cache: "no-store" }),
      ]);

      const syncData = await syncRes.json().catch(() => ({}));
      const pdfData = await pdfRes.json().catch(() => ({}));

      if (!syncRes.ok) throw new Error(syncData?.error || "Falha ao carregar jobs de scraping.");
      if (!pdfRes.ok) throw new Error(pdfData?.error || "Falha ao carregar jobs de PDF.");

      setSyncJobs(Array.isArray(syncData?.data?.items) ? syncData.data.items : []);
      setPdfJobs(Array.isArray(pdfData?.data?.items) ? pdfData.data.items : []);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar jobs de repasse.");
    } finally {
      setLoading(false);
    }
  };

  const createSyncJob = async () => {
    if (!canRefresh) return;
    setCreatingSync(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/repasses/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodRef }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao criar job de scraping.");
      setNotice("Job de scraping criado com sucesso.");
      await fetchJobs();
    } catch (e: any) {
      setError(e?.message || "Erro ao criar job de scraping.");
    } finally {
      setCreatingSync(false);
    }
  };

  const createPdfJob = async () => {
    if (!canEdit) return;
    setCreatingPdf(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/repasses/pdf-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodRef, scope: "all_with_data" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao criar job de PDF.");
      setNotice("Job de PDF criado com sucesso.");
      await fetchJobs();
    } catch (e: any) {
      setError(e?.message || "Erro ao criar job de PDF.");
    } finally {
      setCreatingPdf(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodRef, canView]);

  if (!canView) {
    return (
      <div className="p-8 max-w-[1400px] mx-auto">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-sm">
          Sem permissão para visualizar este módulo.
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Fechamento de Repasses</h1>
          <p className="text-slate-500 text-sm">
            Sprint 1: base de jobs manuais, schema e monitoramento inicial do processamento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Período</label>
          <input
            type="month"
            value={periodRef}
            onChange={(e) => setPeriodRef(e.target.value)}
            className="px-3 py-2 border rounded-lg bg-white text-sm"
          />
          <button
            type="button"
            onClick={fetchJobs}
            className="px-3 py-2 border rounded-lg bg-white text-sm inline-flex items-center gap-2"
          >
            <RefreshCw size={14} />
            Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 border border-rose-200 bg-rose-50 rounded-lg text-rose-700 text-sm inline-flex items-center gap-2">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {notice && (
        <div className="px-3 py-2 border border-emerald-200 bg-emerald-50 rounded-lg text-emerald-700 text-sm">
          {notice}
        </div>
      )}

      <div className="bg-white border rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="text-sm text-slate-600">
          Executar operações manuais para o período <span className="font-semibold">{periodLabel}</span>.
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={createSyncJob}
            disabled={!canRefresh || creatingSync}
            className="px-3 py-2 rounded-lg bg-[#17407E] text-white text-sm disabled:opacity-50 inline-flex items-center gap-2"
          >
            {creatingSync ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Solicitar scraping
          </button>
          <button
            type="button"
            onClick={createPdfJob}
            disabled={!canEdit || creatingPdf}
            className="px-3 py-2 rounded-lg bg-[#229A8A] text-white text-sm disabled:opacity-50 inline-flex items-center gap-2"
          >
            {creatingPdf ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            Solicitar PDFs em lote
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="bg-white border rounded-xl overflow-hidden">
          <header className="px-4 py-3 border-b bg-slate-50">
            <h2 className="text-sm font-semibold text-slate-700">Jobs de Scraping</h2>
          </header>
          <div className="overflow-auto max-h-[420px]">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500 bg-white">
                <tr>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Período</th>
                  <th className="px-3 py-2 text-left">Solicitado por</th>
                  <th className="px-3 py-2 text-left">Criado em</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-3 py-4 text-center text-slate-500" colSpan={4}>
                      <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Carregando...</span>
                    </td>
                  </tr>
                ) : syncJobs.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-center text-slate-500" colSpan={4}>Nenhum job encontrado.</td>
                  </tr>
                ) : syncJobs.map((job) => (
                  <tr key={job.id} className="border-t">
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusChip(job.status)}`}>{job.status}</span>
                    </td>
                    <td className="px-3 py-2">{job.periodRef}</td>
                    <td className="px-3 py-2">{job.requestedBy}</td>
                    <td className="px-3 py-2">{toBrDate(job.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border rounded-xl overflow-hidden">
          <header className="px-4 py-3 border-b bg-slate-50">
            <h2 className="text-sm font-semibold text-slate-700">Jobs de PDF</h2>
          </header>
          <div className="overflow-auto max-h-[420px]">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500 bg-white">
                <tr>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Escopo</th>
                  <th className="px-3 py-2 text-left">Período</th>
                  <th className="px-3 py-2 text-left">Criado em</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-3 py-4 text-center text-slate-500" colSpan={4}>
                      <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Carregando...</span>
                    </td>
                  </tr>
                ) : pdfJobs.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-center text-slate-500" colSpan={4}>Nenhum job encontrado.</td>
                  </tr>
                ) : pdfJobs.map((job) => (
                  <tr key={job.id} className="border-t">
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusChip(job.status)}`}>{job.status}</span>
                    </td>
                    <td className="px-3 py-2">{job.scope}</td>
                    <td className="px-3 py-2">{job.periodRef}</td>
                    <td className="px-3 py-2">{toBrDate(job.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
