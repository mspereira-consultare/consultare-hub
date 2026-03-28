'use client';

import { Check, ChevronDown, ChevronUp, Copy, Loader2, MessageCircle, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatCurrency, formatLastUpdate, normalizePhoneForWhatsApp } from './formatters';
import type { ProposalDetailRow, ProposalFollowupOptions } from './types';

type Props = {
  row: ProposalDetailRow;
  canEdit: boolean;
  followupOptions: ProposalFollowupOptions;
  onSaved: (row: ProposalDetailRow) => void;
};

const PROCEDURE_PREVIEW_LIMIT = 100;

const followupBadgeClassName = (status: string) => {
  if (status === 'CONVERTIDO') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'EM_CONTATO') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'NAO_CONVERTIDO') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
};

const truncateProcedureSummary = (summary: string) => {
  const normalized = String(summary || '').trim();
  if (!normalized) {
    return { preview: '-', truncated: false };
  }

  if (normalized.length <= PROCEDURE_PREVIEW_LIMIT) {
    return { preview: normalized, truncated: false };
  }

  return {
    preview: `${normalized.slice(0, PROCEDURE_PREVIEW_LIMIT).trimEnd()}...`,
    truncated: true,
  };
};

export function ProposalsDetailRow({ row, canEdit, followupOptions, onSaved }: Props) {
  const [copiedProposalId, setCopiedProposalId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [draft, setDraft] = useState({
    conversionStatus: row.conversionStatus,
    conversionReason: row.conversionReason || '',
    responsibleUserId: row.responsibleUserId || '',
  });

  useEffect(() => {
    setDraft({
      conversionStatus: row.conversionStatus,
      conversionReason: row.conversionReason || '',
      responsibleUserId: row.responsibleUserId || '',
    });
    setSaveError('');
  }, [row]);

  const whatsappNumber = normalizePhoneForWhatsApp(row.patientPhone);
  const hasPhone = whatsappNumber.length > 0 && row.patientPhone !== 'Não informado';
  const whatsappHref = hasPhone ? `https://wa.me/${whatsappNumber}` : '#';

  const availableReasons = useMemo(
    () => followupOptions.conversionReasonsByStatus[draft.conversionStatus] || [],
    [draft.conversionStatus, followupOptions.conversionReasonsByStatus],
  );

  const hasChanges =
    draft.conversionStatus !== row.conversionStatus ||
    draft.conversionReason !== (row.conversionReason || '') ||
    draft.responsibleUserId !== (row.responsibleUserId || '');

  const procedurePreview = useMemo(() => truncateProcedureSummary(row.procedureSummary), [row.procedureSummary]);
  const canExpandProcedures = procedurePreview.truncated && row.proceduresDetailed.length > 0;

  useEffect(() => {
    if (!canExpandProcedures && expanded) {
      setExpanded(false);
    }
  }, [canExpandProcedures, expanded]);

  const handleCopyPhone = async () => {
    try {
      await navigator.clipboard.writeText(row.patientPhone);
      setCopiedProposalId(row.proposalId);
      window.setTimeout(() => setCopiedProposalId((current) => (current === row.proposalId ? null : current)), 1800);
    } catch {
      setCopiedProposalId(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const response = await fetch(`/api/admin/propostas/followup/${row.proposalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversionStatus: draft.conversionStatus,
          conversionReason: draft.conversionReason || null,
          responsibleUserId: draft.responsibleUserId || null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload?.error || 'Falha ao salvar follow-up.'));
      if (payload?.data) onSaved(payload.data as ProposalDetailRow);
    } catch (error: any) {
      setSaveError(String(error?.message || error || 'Erro ao salvar.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <tr className="align-top hover:bg-slate-50">
        <td className="px-4 py-3 whitespace-nowrap text-slate-700">{row.proposalDate || '-'}</td>
        <td className="px-4 py-3 min-w-[220px]">
          <div className="font-medium text-slate-800">{row.patientName}</div>
          <div className="text-xs text-slate-500">ID {row.patientId || '-'}</div>
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-slate-700">{row.patientPhone}</td>
        <td className="px-4 py-3 min-w-[320px]">
          <div className="font-medium text-slate-800">{procedurePreview.preview}</div>
          <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
            <span>{row.procedureCount} item(ns)</span>
            {canExpandProcedures ? (
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:text-blue-800"
              >
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {expanded ? 'Ocultar itens' : 'Ver itens'}
              </button>
            ) : null}
          </div>
        </td>
        <td className="px-4 py-3 text-slate-700">{row.unitName}</td>
        <td className="px-4 py-3 min-w-[220px] text-slate-700">{row.professionalName}</td>
        <td className="px-4 py-3 text-right font-semibold text-slate-800 whitespace-nowrap">{formatCurrency(row.totalValue)}</td>
        <td className="px-4 py-3">
          <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 border border-amber-200">
            {row.status}
          </span>
        </td>
        <td className="px-4 py-3 min-w-[180px]">
          {canEdit ? (
            <select
              value={draft.conversionStatus}
              onChange={(event) => {
                const nextStatus = event.target.value;
                const nextReasons = followupOptions.conversionReasonsByStatus[nextStatus] || [];
                const shouldKeepReason = nextReasons.some((item) => item.value === draft.conversionReason);
                setDraft((current) => ({
                  ...current,
                  conversionStatus: nextStatus,
                  conversionReason: shouldKeepReason ? current.conversionReason : '',
                }));
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-1 focus:ring-slate-200"
            >
              {followupOptions.conversionStatuses.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          ) : (
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${followupBadgeClassName(row.conversionStatus)}`}>
              {row.conversionStatusLabel}
            </span>
          )}
        </td>
        <td className="px-4 py-3 min-w-[180px]">
          {canEdit ? (
            <select
              value={draft.conversionReason}
              onChange={(event) => setDraft((current) => ({ ...current, conversionReason: event.target.value }))}
              disabled={availableReasons.length === 0}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-1 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              <option value="">{availableReasons.length === 0 ? 'Sem motivo aplicável' : 'Selecione'}</option>
              {availableReasons.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-slate-600">{row.conversionReasonLabel || '—'}</span>
          )}
        </td>
        <td className="px-4 py-3 min-w-[190px]">
          {canEdit ? (
            <select
              value={draft.responsibleUserId}
              onChange={(event) => setDraft((current) => ({ ...current, responsibleUserId: event.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-1 focus:ring-slate-200"
            >
              <option value="">Não atribuído</option>
              {followupOptions.users.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-slate-600">{row.responsibleUserName || 'Não atribuído'}</span>
          )}
        </td>
        <td className="px-4 py-3 min-w-[180px] text-xs text-slate-500">
          {row.updatedAt ? (
            <div>
              <div className="font-semibold text-slate-700">{row.updatedByUserName || 'Usuário'}</div>
              <div>{formatLastUpdate(row.updatedAt)}</div>
            </div>
          ) : (
            'Sem edição'
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleCopyPhone}
              disabled={!hasPhone}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copiedProposalId === row.proposalId ? <Check size={13} /> : <Copy size={13} />}
              {copiedProposalId === row.proposalId ? 'Copiado' : 'Copiar'}
            </button>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => {
                if (!hasPhone) event.preventDefault();
              }}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold border ${
                hasPhone
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'border-slate-200 bg-slate-50 text-slate-400 pointer-events-none'
              }`}
            >
              <MessageCircle size={13} />
              WhatsApp
            </a>
            {canEdit ? (
              <button
                type="button"
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                Salvar
              </button>
            ) : null}
          </div>
          {saveError ? <div className="mt-2 text-right text-xs text-rose-600">{saveError}</div> : null}
        </td>
      </tr>
      {expanded ? (
        <tr className="bg-slate-50/70">
          <td colSpan={13} className="px-4 py-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Procedimentos da proposta</div>
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {row.proceduresDetailed.map((item, index) => (
                  <div key={`${row.proposalId}-${item.name}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-sm font-medium text-slate-800">{item.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {item.value > 0 ? formatCurrency(item.value) : 'Valor não informado'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
