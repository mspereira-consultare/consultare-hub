"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Download, Eye, Loader2, MailCheck, Paperclip, RefreshCw, RotateCcw, Send, Upload, X } from "lucide-react";
import type {
  RepasseEmailBatch,
  RepasseEmailJob,
  RepasseEmailRecipient,
  RepasseEmailRecipientSendStatus,
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

const formatDateBr = (value: string | null | undefined) => {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return raw || "-";
};

const formatPeriodBr = (value: string | null | undefined) => {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  if (match) return `${match[2]}/${match[1]}`;
  return raw || "-";
};

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

const dispatchableStatuses: RepasseEmailRecipientSendStatus[] = [
  "READY",
  "FAILED",
  "SOFT_BOUNCE",
  "DEFERRED",
  "ACCEPTED_PROVIDER",
  "DELIVERED",
];

const resendStatuses: RepasseEmailRecipientSendStatus[] = [
  "FAILED",
  "SOFT_BOUNCE",
  "DEFERRED",
  "ACCEPTED_PROVIDER",
  "DELIVERED",
];

type EmailPreview = {
  subject: string;
  html: string;
  text: string;
  hasAttachment: boolean;
  recipient?: RepasseEmailRecipient;
};

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
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState("");
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

  const dispatchableRecipientIds = useMemo(
    () => recipients.filter((recipient) => dispatchableStatuses.includes(recipient.sendStatus)).map((recipient) => recipient.id),
    [recipients]
  );

  const selectedDispatchableIds = useMemo(
    () => selectedRecipientIds.filter((id) => dispatchableRecipientIds.includes(id)),
    [dispatchableRecipientIds, selectedRecipientIds]
  );

  const allDispatchableSelected = dispatchableRecipientIds.length > 0 && dispatchableRecipientIds.every((id) => selectedRecipientIds.includes(id));

  const loadRecipients = useCallback(async (batchId: string) => {
    if (!canView || !batchId) {
      setRecipients([]);
      return;
    }
    const res = await fetch(`/api/admin/repasses/email-batches/${encodeURIComponent(batchId)}/recipients`, {
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Falha ao carregar destinatários.");
    const items = Array.isArray(data?.data?.items) ? data.data.items : [];
    setRecipients(items);
    setSelectedRecipientIds((prev) => prev.filter((id) => items.some((item: RepasseEmailRecipient) => item.id === id)));
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
      setSelectedRecipientIds([]);
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
      setNotice(`Anexos processados: ${summary.matched || 0} vinculados, ${summary.unmatched || 0} sem match, ${summary.ambiguous || 0} ambíguos.`);
      setAttachmentFiles(null);
      setSelectedRecipientIds([]);
      await loadRecipients(activeBatch.id);
      await loadEmailPanel();
    } catch (e: unknown) {
      setError(errorMessage(e, "Erro ao enviar anexos."));
    } finally {
      setUploadingAttachments(false);
      if (recipientId) setActionByRecipient((prev) => ({ ...prev, [recipientId]: false }));
    }
  };

  const enqueueSelected = async () => {
    if (!canRefresh || !activeBatch) return;
    if (selectedDispatchableIds.length === 0) {
      setError("Selecione ao menos um destinatário elegível para envio ou reenvio.");
      return;
    }
    setEnqueueing(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/repasses/email-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: activeBatch.id,
          scope: "selected",
          recipientIds: selectedDispatchableIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao enfileirar envio.");
      setNotice(`Envio enfileirado. Job: ${data?.data?.id || "-"}.`);
      setSelectedRecipientIds([]);
      await loadEmailPanel();
    } catch (e: unknown) {
      setError(errorMessage(e, "Erro ao enfileirar envio."));
    } finally {
      setEnqueueing(false);
    }
  };

  const toggleRecipientSelection = (recipientId: string) => {
    setSelectedRecipientIds((prev) =>
      prev.includes(recipientId)
        ? prev.filter((id) => id !== recipientId)
        : [...prev, recipientId]
    );
  };

  const toggleAllReady = () => {
    setSelectedRecipientIds((prev) => {
      if (allDispatchableSelected) return prev.filter((id) => !dispatchableRecipientIds.includes(id));
      return Array.from(new Set([...prev, ...dispatchableRecipientIds]));
    });
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
      if (!res.ok) throw new Error(data?.error || "Falha ao atualizar destinatário.");
      setNotice(action === "retry" ? "Reenvio enfileirado." : "Confirmação manual registrada.");
      if (activeBatch) await loadRecipients(activeBatch.id);
      await loadEmailPanel();
    } catch (e: unknown) {
      setError(errorMessage(e, "Erro ao atualizar destinatário."));
    } finally {
      setActionByRecipient((prev) => ({ ...prev, [recipientId]: false }));
    }
  };

  const openPreview = async (recipientId: string) => {
    setPreviewLoadingId(recipientId);
    setError("");
    try {
      const res = await fetch(`/api/admin/repasses/email-recipients/${encodeURIComponent(recipientId)}/preview`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Falha ao gerar prévia do e-mail.");
      setPreview(data?.data || null);
    } catch (e: unknown) {
      setError(errorMessage(e, "Erro ao gerar prévia do e-mail."));
    } finally {
      setPreviewLoadingId("");
    }
  };

  if (!canView) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MailCheck size={18} className="text-[#17407E]" />
            <h2 className="text-base font-bold text-slate-800">Preparação do lote</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Importe a planilha .xlsx de fechamento, envie os PDFs para o S3 e confira os vínculos antes de enfileirar.
            O upload não envia e-mails; o disparo acontece apenas pelo botão de enfileirar destinatários selecionados.
          </p>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Aceito pelo provedor não significa entregue; o status final vem dos webhooks de entrega, bounce ou falha.
          </p>
        </div>

        <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_180px_auto_auto_auto] xl:max-w-6xl">
          <label className="flex min-w-0 flex-col gap-1 text-xs font-bold uppercase tracking-wider text-slate-500">
            Planilha
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => setSheetFile(event.target.files?.[0] || null)}
              className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-700"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wider text-slate-500">
            Data limite NF
            <input
              type="date"
              value={dueDateNf}
              onChange={(event) => setDueDateNf(event.target.value)}
              className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <button
            type="button"
            onClick={prepareBatch}
            disabled={!canRefresh || preparing}
            className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-lg bg-[#17407E] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#123263] disabled:opacity-50"
          >
            {preparing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Importar planilha
          </button>
          <a
            href="/api/admin/repasses/email-batches/template"
            className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Download size={14} />
            Baixar template
          </a>
          <button
            type="button"
            onClick={loadEmailPanel}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-4 inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertCircle size={14} />
          {error}
        </div>
      )}
      {notice && (
        <div className="mx-5 mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 size={14} />
          {notice}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4 xl:grid-cols-7">
        {[
          ["Lotes", batches.length],
          ["Destinatários", activeBatch?.totalRecipients || 0],
          ["Prontos", activeBatch?.readyCount || 0],
          ["Warnings", activeBatch?.warningCount || 0],
          ["Erros", activeBatch?.errorCount || 0],
          ["Entregues", activeBatch?.deliveredCount || 0],
          ["Falhas", activeBatch?.failedCount || 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-bold text-slate-800">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-4">
        <select
          value={activeBatch?.id || ""}
          onChange={(event) => {
            setActiveBatchId(event.target.value);
            setSelectedRecipientIds([]);
            void loadRecipients(event.target.value);
          }}
          className="h-10 max-w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
        >
          <option value="">Nenhum lote preparado</option>
          {batches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {formatPeriodBr(batch.periodRef)} | NF {formatDateBr(batch.dueDateNf)} | {batch.status} | {batch.totalRecipients} destinatários
            </option>
          ))}
        </select>
        {activeBatch && <StatusPill value={activeBatch.status} />}
        {jobs[0] && (
          <span className="text-xs text-slate-500">
            Último job: {jobs[0].status} em {jobs[0].createdAt}
          </span>
        )}
      </div>

      {activeBatch && (
        <div className="mx-5 mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label className="flex min-w-[260px] flex-1 flex-col gap-1 text-xs font-bold uppercase tracking-wider text-slate-500">
            PDFs ou ZIP
            <input
              type="file"
              multiple
              accept=".pdf,.zip,application/pdf,application/zip"
              onChange={(event) => setAttachmentFiles(event.target.files)}
              className="h-10 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700"
            />
          </label>
          <button
            type="button"
            onClick={() => uploadAttachments(attachmentFiles)}
            disabled={!canRefresh || uploadingAttachments || !attachmentFiles || attachmentFiles.length === 0}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
          >
            {uploadingAttachments ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
            Enviar anexos
          </button>
        </div>
      )}

      <div className="border-t border-slate-100 px-5 pb-5">
        <div className="mb-3 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleAllReady}
              disabled={dispatchableRecipientIds.length === 0}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {allDispatchableSelected ? "Limpar seleção" : "Selecionar elegíveis"}
            </button>
            <span className="text-xs text-slate-500">
              {selectedDispatchableIds.length} selecionado(s) de {dispatchableRecipientIds.length} elegível(is), {readyCount} pronto(s)
            </span>
          </div>
          <button
            type="button"
            onClick={enqueueSelected}
            disabled={!canRefresh || enqueueing || !activeBatch || selectedDispatchableIds.length === 0}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#229A8A] px-4 text-xs font-semibold text-white transition hover:bg-[#1b7d70] disabled:opacity-50"
          >
            {enqueueing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Enfileirar selecionados ({selectedDispatchableIds.length})
          </button>
        </div>

        <div className="max-h-[560px] overflow-auto rounded-xl border border-slate-200">
        <table className="min-w-[1180px] w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 shadow-sm">
            <tr>
              <th className="w-10 px-2 py-2">
                <input
                  type="checkbox"
                  checked={allDispatchableSelected}
                  disabled={dispatchableRecipientIds.length === 0}
                  onChange={toggleAllReady}
                  className="h-4 w-4 rounded border-slate-300 text-[#17407E]"
                  aria-label="Selecionar todos os elegíveis"
                />
              </th>
              <th className="px-2 py-2">Profissional</th>
              <th className="px-2 py-2">E-mail</th>
              <th className="px-2 py-2">Valor</th>
              <th className="px-2 py-2">Prazo NF</th>
              <th className="px-2 py-2">Vínculo prof.</th>
              <th className="px-2 py-2">Anexo</th>
              <th className="px-2 py-2">Validação</th>
              <th className="px-2 py-2">Envio</th>
              <th className="px-2 py-2">Último evento</th>
              <th className="px-2 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-slate-500">
                  Carregando envios...
                </td>
              </tr>
            )}
            {!loading && recipients.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-slate-500">
                  Nenhum lote de envio preparado para o período.
                </td>
              </tr>
            )}
            {!loading &&
              recipients.map((recipient) => {
                const busy = !!actionByRecipient[recipient.id];
                const canRetry = resendStatuses.includes(recipient.sendStatus);
                const canSelect = dispatchableStatuses.includes(recipient.sendStatus);
                const isSelected = selectedRecipientIds.includes(recipient.id);
                const previewLoading = previewLoadingId === recipient.id;
                return (
                  <tr key={recipient.id} className="border-t align-top hover:bg-slate-50/70">
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!canSelect}
                        onChange={() => toggleRecipientSelection(recipient.id)}
                        className="h-4 w-4 rounded border-slate-300 text-[#17407E] disabled:opacity-40"
                        aria-label={`Selecionar ${recipient.professionalName}`}
                      />
                    </td>
                    <td className="px-2 py-2 font-medium text-slate-800">{recipient.professionalName}</td>
                    <td className="px-2 py-2 text-slate-600">{recipient.recipientEmail || "-"}</td>
                    <td className="px-2 py-2 font-semibold text-slate-700">{formatCurrency(recipient.amountValue)}</td>
                    <td className="px-2 py-2 text-slate-600">{formatDateBr(recipient.dueDateNf)}</td>
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
                          onClick={() => openPreview(recipient.id)}
                          disabled={previewLoading}
                          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-40"
                        >
                          {previewLoading ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
                          Prévia
                        </button>
                        <button
                          type="button"
                          onClick={() => recipientAction(recipient.id, "retry")}
                          disabled={!canEdit || busy || !canRetry}
                          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-40"
                        >
                          {busy ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                          Reenviar
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
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Prévia do e-mail</p>
                <h3 className="mt-1 truncate text-base font-bold text-slate-800">{preview.subject}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {preview.hasAttachment ? "Anexo PDF vinculado." : "Nenhum anexo vinculado."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                aria-label="Fechar prévia"
              >
                <X size={16} />
              </button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[1fr_280px]">
              <iframe
                title="Prévia HTML do e-mail"
                srcDoc={preview.html}
                className="h-[62vh] w-full bg-white"
              />
              <aside className="overflow-auto border-t border-slate-200 bg-slate-50 p-4 lg:border-l lg:border-t-0">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Texto simples</p>
                <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-700">
                  {preview.text}
                </pre>
              </aside>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
