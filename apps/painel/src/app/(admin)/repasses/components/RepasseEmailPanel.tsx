"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, MailCheck, Paperclip, RefreshCw, RotateCcw, Send, Upload } from "lucide-react";
import type {
  RepasseEmailBatch,
  RepasseEmailJob,
  RepasseEmailRecipient,
} from "@/lib/repasses/types";

type RepasseEmailPanelProps = {
  periodRef: string;
  canView: boolean;
  canRefresh: boolean;
  canEdit: boolean;
};

const formatCurrency = (value: number) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const todayInputValue = () => new Date().toISOString().slice(0, 10);

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const statusClass = (status: string) => {
  const normalized = String(status || "").toUpperCase();
  if (["READY", "DELIVERED", "MANUAL_CONFIRMED", "COMPLETED", "VALID"].includes(normalized)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (["WARNING", "ACCEPTED_PROVIDER", "QUEUED", "SENDING", "RUNNING", "DEFERRED"].includes(normalized)) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (["ERROR", "FAILED", "HARD_BOUNCE", "SPAM_COMPLAINT", "SOFT_BOUNCE", "SKIPPED"].includes(normalized)) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
};

const StatusPill = ({ value }: { value: string }) => (
  <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass(value)}`}>
    {value || "-"}
  </span>
);

export function RepasseEmailPanel({
  periodRef,
  canView,
  canRefresh,
  canEdit,
}: RepasseEmailPanelProps) {
  const [dueDateNf, setDueDateNf] = useState(todayInputValue());
  const [batches, setBatches] = useState<RepasseEmailBatch[]>([]);
  const [activeBatchId, setActiveBatchId] = useState("");
  const [recipients, setRecipients] = useState<RepasseEmailRecipient[]>([]);
  const [jobs, setJobs] = useState<RepasseEmailJob[]>([]);
  const [sheetFile, setSheetFile] = useState<File | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [enqueueing, setEnqueueing] = useState(false);
  const [actionByRecipient, setActionByRecipient] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const activeBatch = useMemo(
    () => batches.find((batch) => batch.id === activeBatchId) || batches[0] || null,
    [activeBatchId, batches]
  );

  const readyCount = useMemo(
    () => recipients.filter((recipient) => recipient.sendStatus === "READY").length,
    [recipients]
  );

  const loadRecipients = useCallback(async (batchId: string) => {
    if (!canView || !batchId) {
      setRecipients([]);
      return;
    }
    const res = await fetch(`/api/admin/repasses/email-batches/${encodeURIComponent(batchId)}/recipients`, {
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Falha ao carregar destinatarios.");
    setRecipients(Array.isArray(data?.data?.items) ? data.data.items : []);
  }, [canView]);

  const loadEmailPanel = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ periodRef, limit: "10" }).toString();
      const [batchRes, jobRes] = await Promise.all([
        fetch(`/api/admin/repasses/email-batches?${qs}`, { cache: "no-store" }),
        fetch(`/api/admin/repasses/email-jobs?${qs}`, { cache: "no-store" }),
      ]);
      const batchData = await batchRes.json().catch(() => ({}));
      const jobData = await jobRes.json().catch(() => ({}));
      if (!batchRes.ok) throw new Error(batchData?.error || "Falha ao carregar lotes de e-mail.");
      if (!jobRes.ok) throw new Error(jobData?.error || "Falha ao carregar jobs de e-mail.");

      const loadedBatches: RepasseEmailBatch[] = Array.isArray(batchData?.data?.items)
        ? batchData.data.items
        : [];
      setBatches(loadedBatches);
      setJobs(Array.isArray(jobData?.data?.items) ? jobData.data.items : []);
      const nextBatchId = activeBatchId && loadedBatches.some((batch) => batch.id === activeBatchId)
        ? activeBatchId
        : loadedBatches[0]?.id || "";
      setActiveBatchId(nextBatchId);
      if (nextBatchId) await loadRecipients(nextBatchId);
      else setRecipients([]);
    } catch (e: unknown) {
      setError(errorMessage(e, "Erro ao carregar envios de fechamento."));
    } finally {
      setLoading(false);
    }
  }, [activeBatchId, canView, loadRecipients, periodRef]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadEmailPanel();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadEmailPanel]);

  const prepareBatch = async () => {
    if (!canRefresh) return;
    if (!dueDateNf) {
      setError("Informe a data limite para envio da NF.");
      return;
    }
    if (!sheetFile) {
      setError("Selecione a planilha .xlsx de fechamento.");
      return;
    }
    setPreparing(true);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.append("file", sheetFile);
      formData.append("periodRef", periodRef);
      formData.append("dueDateNf", dueDateNf);
      const res = await fetch("/api/admin/repasses/email-batches/prepare", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao preparar lote de e-mail.");
      const batch: RepasseEmailBatch | null = data?.data?.batch || null;
      setNotice(`Planilha importada. Lote: ${batch?.id || "-"}.`);
      if (batch?.id) setActiveBatchId(batch.id);
      await loadEmailPanel();
      if (batch?.id) await loadRecipients(batch.id);
    } catch (e: unknown) {
      setError(errorMessage(e, "Erro ao preparar lote de e-mail."));
    } finally {
      setPreparing(false);
    }
  };

  const uploadAttachments = async (files: FileList | File[] | null, recipientId?: string) => {
    if (!canRefresh || !activeBatch || !files || files.length === 0) return;
    setUploadingAttachments(true);
    setActionByRecipient((prev) => recipientId ? ({ ...prev, [recipientId]: true }) : prev);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("files", file));
      if (recipientId) formData.append("recipientId", recipientId);
      const res = await fetch(`/api/admin/repasses/email-batches/${encodeURIComponent(activeBatch.id)}/attachments`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao enviar anexos.");
      const summary = data?.data || {};
      setNotice(`Anexos processados: ${summary.matched || 0} vinculados, ${summary.unmatched || 0} sem match, ${summary.ambiguous || 0} ambiguos.`);
      setAttachmentFiles(null);
      await loadRecipients(activeBatch.id);
      await loadEmailPanel();
    } catch (e: unknown) {
      setError(errorMessage(e, "Erro ao enviar anexos."));
    } finally {
      setUploadingAttachments(false);
      if (recipientId) setActionByRecipient((prev) => ({ ...prev, [recipientId]: false }));
    }
  };

  const enqueueReady = async () => {
    if (!canRefresh || !activeBatch) return;
    setEnqueueing(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/repasses/email-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: activeBatch.id,
          scope: "all_ready",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao enfileirar envio.");
      setNotice(`Envio enfileirado. Job: ${data?.data?.id || "-"}.`);
      await loadEmailPanel();
    } catch (e: unknown) {
      setError(errorMessage(e, "Erro ao enfileirar envio."));
    } finally {
      setEnqueueing(false);
    }
  };

  const recipientAction = async (recipientId: string, action: "retry" | "manual-confirm") => {
    if (!canEdit) return;
    setActionByRecipient((prev) => ({ ...prev, [recipientId]: true }));
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/repasses/email-recipients/${encodeURIComponent(recipientId)}/${action}`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao atualizar destinatario.");
      setNotice(action === "retry" ? "Reenvio enfileirado." : "Confirmacao manual registrada.");
      if (activeBatch) await loadRecipients(activeBatch.id);
      await loadEmailPanel();
    } catch (e: unknown) {
      setError(errorMessage(e, "Erro ao atualizar destinatario."));
    } finally {
      setActionByRecipient((prev) => ({ ...prev, [recipientId]: false }));
    }
  };

  if (!canView) return null;

  return (
    <section className="rounded-xl border bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <MailCheck size={18} className="text-[#17407E]" />
            <h2 className="text-sm font-semibold text-slate-800">Envios de fechamento</h2>
          </div>
          <p className="mt-1 max-w-3xl text-xs text-slate-500">
            Importe a planilha .xlsx de fechamento, envie os PDFs para o S3 e confira os vinculos antes de enfileirar.
            Aceito pelo provedor nao significa entregue; o status final vem dos webhooks de entrega, bounce ou falha.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[220px] flex-col gap-1 text-xs font-medium text-slate-600">
            Planilha
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => setSheetFile(event.target.files?.[0] || null)}
              className="h-9 rounded-lg border bg-white px-2 py-1 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Data limite NF
            <input
              type="date"
              value={dueDateNf}
              onChange={(event) => setDueDateNf(event.target.value)}
              className="h-9 rounded-lg border px-2 text-xs"
            />
          </label>
          <button
            type="button"
            onClick={prepareBatch}
            disabled={!canRefresh || preparing}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#17407E] px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            {preparing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Importar planilha
          </button>
          <button
            type="button"
            onClick={enqueueReady}
            disabled={!canRefresh || enqueueing || !activeBatch || readyCount === 0}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#229A8A] px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            {enqueueing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Enfileirar prontos ({readyCount})
          </button>
          <button
            type="button"
            onClick={loadEmailPanel}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-lg border bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <AlertCircle size={14} />
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          <CheckCircle2 size={14} />
          {notice}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
        {[
          ["Lotes", batches.length],
          ["Destinatarios", activeBatch?.totalRecipients || 0],
          ["Prontos", activeBatch?.readyCount || 0],
          ["Warnings", activeBatch?.warningCount || 0],
          ["Erros", activeBatch?.errorCount || 0],
          ["Entregues", activeBatch?.deliveredCount || 0],
          ["Falhas", activeBatch?.failedCount || 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border bg-slate-50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
            <p className="text-base font-bold text-slate-800">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={activeBatch?.id || ""}
          onChange={(event) => {
            setActiveBatchId(event.target.value);
            void loadRecipients(event.target.value);
          }}
          className="h-9 max-w-full rounded-lg border px-2 text-xs"
        >
          <option value="">Nenhum lote preparado</option>
          {batches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.periodRef} | NF {batch.dueDateNf} | {batch.status} | {batch.totalRecipients} destinatarios
            </option>
          ))}
        </select>
        {activeBatch && <StatusPill value={activeBatch.status} />}
        {jobs[0] && (
          <span className="text-xs text-slate-500">
            Ultimo job: {jobs[0].status} em {jobs[0].createdAt}
          </span>
        )}
      </div>

      {activeBatch && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border bg-slate-50 p-3">
          <label className="flex min-w-[260px] flex-col gap-1 text-xs font-medium text-slate-600">
            PDFs ou ZIP
            <input
              type="file"
              multiple
              accept=".pdf,.zip,application/pdf,application/zip"
              onChange={(event) => setAttachmentFiles(event.target.files)}
              className="h-9 rounded-lg border bg-white px-2 py-1 text-xs"
            />
          </label>
          <button
            type="button"
            onClick={() => uploadAttachments(attachmentFiles)}
            disabled={!canRefresh || uploadingAttachments || !attachmentFiles || attachmentFiles.length === 0}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            {uploadingAttachments ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
            Enviar anexos
          </button>
        </div>
      )}

      <div className="mt-3 overflow-x-auto rounded-lg border">
        <table className="min-w-[1120px] w-full border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2">Profissional</th>
              <th className="px-2 py-2">E-mail</th>
              <th className="px-2 py-2">Valor</th>
              <th className="px-2 py-2">Prazo NF</th>
              <th className="px-2 py-2">Prof. match</th>
              <th className="px-2 py-2">Anexo</th>
              <th className="px-2 py-2">Validacao</th>
              <th className="px-2 py-2">Envio</th>
              <th className="px-2 py-2">Ultimo evento</th>
              <th className="px-2 py-2 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-slate-500">
                  Carregando envios...
                </td>
              </tr>
            )}
            {!loading && recipients.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-slate-500">
                  Nenhum lote de envio preparado para o periodo.
                </td>
              </tr>
            )}
            {!loading &&
              recipients.map((recipient) => {
                const busy = !!actionByRecipient[recipient.id];
                const canRetry = ["FAILED", "SOFT_BOUNCE", "DEFERRED"].includes(recipient.sendStatus);
                return (
                  <tr key={recipient.id} className="border-t align-top">
                    <td className="px-2 py-2 font-medium text-slate-800">{recipient.professionalName}</td>
                    <td className="px-2 py-2 text-slate-600">{recipient.recipientEmail || "-"}</td>
                    <td className="px-2 py-2 font-semibold text-slate-700">{formatCurrency(recipient.amountValue)}</td>
                    <td className="px-2 py-2 text-slate-600">{recipient.dueDateNf || "-"}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-col gap-1">
                        <StatusPill value={recipient.professionalMatchStatus || "-"} />
                        {recipient.professionalMatchScore !== null ? (
                          <span className="text-[11px] text-slate-400">score {recipient.professionalMatchScore.toFixed(2)}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-slate-600">
                      <div className="flex max-w-[210px] flex-col gap-1">
                        <StatusPill value={recipient.attachmentMatchStatus || "SEM_ANEXO"} />
                        <span className="truncate" title={recipient.fileName || recipient.attachmentCode || ""}>
                          {recipient.fileName || recipient.attachmentCode || "Arquivo ausente"}
                        </span>
                        <label className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-[#17407E]">
                          <Paperclip size={12} />
                          Upload individual
                          <input
                            type="file"
                            accept=".pdf,application/pdf"
                            className="hidden"
                            disabled={!canRefresh || busy}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void uploadAttachments([file], recipient.id);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-col gap-1">
                        <StatusPill value={recipient.validationStatus} />
                        {recipient.validationErrors.length > 0 && (
                          <span className="max-w-[220px] text-[11px] leading-snug text-slate-500">
                            {recipient.validationErrors.join(" ")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <StatusPill value={recipient.sendStatus} />
                    </td>
                    <td className="px-2 py-2 text-slate-600">
                      {recipient.lastEventType || "-"}
                      {recipient.lastEventAt ? <span className="block text-[11px] text-slate-400">{recipient.lastEventAt}</span> : null}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => recipientAction(recipient.id, "retry")}
                          disabled={!canEdit || busy || !canRetry}
                          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-40"
                        >
                          {busy ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                          Retry
                        </button>
                        <button
                          type="button"
                          onClick={() => recipientAction(recipient.id, "manual-confirm")}
                          disabled={!canEdit || busy}
                          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-40"
                        >
                          <CheckCircle2 size={12} />
                          Confirmar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
