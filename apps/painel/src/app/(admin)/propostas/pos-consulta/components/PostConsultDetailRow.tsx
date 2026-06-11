'use client';

import { AlertCircle, Check, ChevronDown, ChevronUp, Copy, Loader2, MessageCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCurrency, formatDateOnly, formatDateTime, formatLastUpdate, normalizePhoneForWhatsApp } from './formatters';
import type { PostConsultRow } from './types';

type Props = {
  row: PostConsultRow;
  canEdit: boolean;
  nonClosureReasons: Array<{ value: string; label: string }>;
  onSaved: () => void;
};

const AUTOSAVE_DELAY_MS = 800;

const closedBadgeClassName = (value: boolean | null) => {
  if (value === true) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (value === false) return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-100 text-slate-500';
};

const statusBadgeClassName = (value: string) => {
  if (value === 'Múltiplos status') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (value.toLowerCase().includes('aguardando')) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (value.toLowerCase().includes('rejeitada')) return 'border-rose-200 bg-rose-50 text-rose-700';
  if (value.toLowerCase().includes('executada') || value.toLowerCase().includes('aprovada')) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  return 'border-slate-200 bg-slate-100 text-slate-600';
};

const boolToDraft = (value: boolean | null) => {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return '';
};

const draftToBool = (value: string): boolean | null => {
  if (value === 'yes') return true;
  if (value === 'no') return false;
  return null;
};

const buildDraftFromRow = (row: PostConsultRow) => ({
  firstContactClosed: boolToDraft(row.firstContactClosed),
  firstContactAt: row.firstContactAt || '',
  secondContactClosed: boolToDraft(row.secondContactClosed),
  secondContactAt: row.secondContactAt || '',
  nonClosureReason: row.nonClosureReason || '',
  observation: row.observation || '',
});

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function PostConsultDetailRow({ row, canEdit, nonClosureReasons, onSaved }: Props) {
  const [copiedEventKey, setCopiedEventKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState('');
  const [draft, setDraft] = useState(() => buildDraftFromRow(row));
  const saveTimeoutRef = useRef<number | null>(null);
  const savedIndicatorTimeoutRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const lastSavedSnapshotRef = useRef(JSON.stringify(buildDraftFromRow(row)));

  useEffect(() => {
    const nextDraft = buildDraftFromRow(row);
    setDraft(nextDraft);
    setSaveError('');
    setSaveStatus('idle');
    lastSavedSnapshotRef.current = JSON.stringify(nextDraft);
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    if (savedIndicatorTimeoutRef.current) window.clearTimeout(savedIndicatorTimeoutRef.current);
  }, [row]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
      if (savedIndicatorTimeoutRef.current) window.clearTimeout(savedIndicatorTimeoutRef.current);
    };
  }, []);

  const whatsappNumber = normalizePhoneForWhatsApp(row.patientPhone);
  const hasPhone = whatsappNumber.length > 0 && row.patientPhone !== 'Não informado';
  const whatsappHref = hasPhone ? `https://wa.me/${whatsappNumber}` : '#';
  const iconButtonBaseClassName =
    'inline-flex h-8 w-8 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-50';

  const draftFirstContactClosed = draftToBool(draft.firstContactClosed);
  const draftSecondContactClosed = draftToBool(draft.secondContactClosed);
  const draftEffectiveClosed = row.autoClosedByExecution || draftFirstContactClosed === true || draftSecondContactClosed === true;
  const hasManualNo = draftFirstContactClosed === false || draftSecondContactClosed === false;
  const requiresNonClosureReason = hasManualNo && !draftEffectiveClosed;
  const validationError = requiresNonClosureReason && !draft.nonClosureReason ? 'Informe o motivo do não fechamento.' : '';
  const currentSnapshot = JSON.stringify(draft);
  const hasChanges = currentSnapshot !== lastSavedSnapshotRef.current;

  useEffect(() => {
    if (saveStatus !== 'saving') {
      setSaveError('');
      if (saveStatus === 'error') setSaveStatus('idle');
    }
  }, [currentSnapshot]);

  const firstContactBadge = useMemo(
    () => closedBadgeClassName(canEdit ? draftFirstContactClosed : row.firstContactClosed),
    [canEdit, draftFirstContactClosed, row.firstContactClosed],
  );
  const secondContactBadge = useMemo(
    () => closedBadgeClassName(canEdit ? draftSecondContactClosed : row.secondContactClosed),
    [canEdit, draftSecondContactClosed, row.secondContactClosed],
  );
  const rowClassName = row.closed
    ? 'group align-top bg-emerald-50/50 hover:bg-emerald-50'
    : !row.firstContactAt && !row.secondContactAt && row.firstContactClosed !== true && row.secondContactClosed !== true
      ? 'group align-top bg-amber-50/50 hover:bg-amber-50'
      : row.secondContactAt || row.secondContactClosed === false
        ? 'group align-top bg-rose-50/40 hover:bg-rose-50'
        : 'group align-top hover:bg-slate-50';
  const stickyCellClassName = row.closed
    ? 'bg-emerald-50 group-hover:bg-emerald-50'
    : !row.firstContactAt && !row.secondContactAt && row.firstContactClosed !== true && row.secondContactClosed !== true
      ? 'bg-amber-50 group-hover:bg-amber-50'
      : row.secondContactAt || row.secondContactClosed === false
        ? 'bg-rose-50 group-hover:bg-rose-50'
        : 'bg-white group-hover:bg-slate-50';

  const triggerSavedIndicator = () => {
    setSaveStatus('saved');
    if (savedIndicatorTimeoutRef.current) window.clearTimeout(savedIndicatorTimeoutRef.current);
    savedIndicatorTimeoutRef.current = window.setTimeout(() => setSaveStatus('idle'), 1800);
  };

  const handleCopyPhone = async () => {
    try {
      await navigator.clipboard.writeText(row.patientPhone);
      setCopiedEventKey(row.eventKey);
      window.setTimeout(() => setCopiedEventKey((current) => (current === row.eventKey ? null : current)), 1800);
    } catch {
      setCopiedEventKey(null);
    }
  };

  const persistDraft = async () => {
    if (!canEdit || !hasChanges) return;
    if (validationError) {
      setSaveError(validationError);
      setSaveStatus('error');
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setSaveStatus('saving');
    setSaveError('');

    try {
      const response = await fetch(`/api/admin/propostas/pos-consulta/followup/${encodeURIComponent(row.eventKey)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstContactClosed: draftFirstContactClosed,
          firstContactAt: draft.firstContactAt || null,
          secondContactClosed: draftSecondContactClosed,
          secondContactAt: draft.secondContactAt || null,
          nonClosureReason: draft.nonClosureReason || null,
          observation: draft.observation || null,
          sourceSnapshot: {
            patientId: row.patientId,
            patientName: row.patientName,
            consultDate: row.consultDate,
            consultUnit: row.consultUnit,
            consultProcedure: row.consultProcedure,
            attendantResponsible: row.attendantResponsible,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || 'Falha ao salvar pós-consulta.'));
      }
      if (requestId !== requestIdRef.current) return;
      lastSavedSnapshotRef.current = currentSnapshot;
      triggerSavedIndicator();
      onSaved();
    } catch (error: unknown) {
      if (requestId !== requestIdRef.current) return;
      setSaveError(error instanceof Error ? error.message : 'Erro ao salvar.');
      setSaveStatus('error');
    }
  };

  useEffect(() => {
    if (!canEdit || !hasChanges) return;
    if (validationError) {
      setSaveError(validationError);
      setSaveStatus('error');
      return;
    }

    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(() => {
      void persistDraft();
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    };
  }, [canEdit, currentSnapshot, hasChanges, validationError]);

  const flushSaveOnBlur = () => {
    if (!canEdit || !hasChanges || validationError) return;
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    void persistDraft();
  };

  const saveStatusLabel =
    saveStatus === 'saving'
      ? 'Salvando...'
      : saveStatus === 'saved'
        ? 'Salvo'
        : saveStatus === 'error'
          ? 'Erro ao salvar'
          : hasChanges
            ? 'Alterações pendentes'
            : 'Sem alterações';

  return (
    <>
      <tr className={rowClassName}>
        <td className={`sticky left-0 z-20 whitespace-nowrap px-4 py-3 text-slate-700 shadow-[1px_0_0_0_rgba(226,232,240,1)] ${stickyCellClassName}`}>
          {formatDateOnly(row.consultDate)}
        </td>
        <td className={`sticky left-[120px] z-20 min-w-[240px] px-4 py-3 shadow-[1px_0_0_0_rgba(226,232,240,1)] ${stickyCellClassName}`}>
          <div className="font-medium text-slate-800">{row.patientName}</div>
          <div className="mt-1 text-xs text-slate-500">Prontuário {row.patientId || '—'}</div>
          <div className="mt-1 text-xs text-slate-500">{row.patientPhone}</div>
        </td>
        <td className="min-w-[180px] px-4 py-3 text-slate-700">{row.consultUnit}</td>
        <td className="min-w-[210px] px-4 py-3 text-slate-700">{row.attendantResponsible}</td>
        <td className="min-w-[220px] px-4 py-3 text-slate-700">{row.consultProcedure}</td>
        <td className="min-w-[280px] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium text-slate-800">{row.proposalCount} proposta(s)</div>
              <div className="mt-1 text-xs text-slate-500">
                {row.proposals
                  .slice(0, 2)
                  .map((proposal) => `#${proposal.proposalId}`)
                  .join(' · ')}
                {row.proposals.length > 2 ? ` +${row.proposals.length - 2}` : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800"
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {expanded ? 'Ocultar' : 'Ver'}
            </button>
          </div>
        </td>
        <td className="min-w-[210px] px-4 py-3">
          <div className="space-y-2">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClassName(row.proposalStatusSummary)}`}>
              {row.proposalStatusSummary}
            </span>
            {row.autoClosedByExecution ? (
              <div className="text-xs font-medium text-emerald-700">Fechamento automático: todas as propostas executadas</div>
            ) : null}
          </div>
        </td>
        <td className="min-w-[170px] px-4 py-3">
          {row.autoClosedByExecution ? (
            <div className="space-y-2">
              <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                Sim automático
              </span>
              <div className="text-xs text-slate-500">Bloqueado por execução total</div>
            </div>
          ) : canEdit ? (
            <select
              value={draft.firstContactClosed}
              onChange={(event) => setDraft((current) => ({ ...current, firstContactClosed: event.target.value }))}
              onBlur={flushSaveOnBlur}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-1 focus:ring-slate-200"
            >
              <option value="">Não definido</option>
              <option value="yes">Sim</option>
              <option value="no">Não</option>
            </select>
          ) : (
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${firstContactBadge}`}>
              {row.firstContactClosed === null ? 'Não definido' : row.firstContactClosed ? 'Sim' : 'Não'}
            </span>
          )}
        </td>
        <td className="min-w-[200px] px-4 py-3">
          {canEdit ? (
            <input
              type="datetime-local"
              value={draft.firstContactAt}
              onChange={(event) => setDraft((current) => ({ ...current, firstContactAt: event.target.value }))}
              onBlur={flushSaveOnBlur}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-1 focus:ring-slate-200"
            />
          ) : (
            <span className="text-sm text-slate-600">{formatDateTime(row.firstContactAt)}</span>
          )}
        </td>
        <td className="min-w-[170px] px-4 py-3">
          {row.autoClosedByExecution ? (
            <div className="space-y-2">
              <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                Bloqueado
              </span>
              <div className="text-xs text-slate-500">Fechamento já reconhecido automaticamente</div>
            </div>
          ) : canEdit ? (
            <select
              value={draft.secondContactClosed}
              onChange={(event) => setDraft((current) => ({ ...current, secondContactClosed: event.target.value }))}
              onBlur={flushSaveOnBlur}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-1 focus:ring-slate-200"
            >
              <option value="">Não definido</option>
              <option value="yes">Sim</option>
              <option value="no">Não</option>
            </select>
          ) : (
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${secondContactBadge}`}>
              {row.secondContactClosed === null ? 'Não definido' : row.secondContactClosed ? 'Sim' : 'Não'}
            </span>
          )}
        </td>
        <td className="min-w-[200px] px-4 py-3">
          {canEdit ? (
            <input
              type="datetime-local"
              value={draft.secondContactAt}
              onChange={(event) => setDraft((current) => ({ ...current, secondContactAt: event.target.value }))}
              onBlur={flushSaveOnBlur}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-1 focus:ring-slate-200"
            />
          ) : (
            <span className="text-sm text-slate-600">{formatDateTime(row.secondContactAt)}</span>
          )}
        </td>
        <td className="min-w-[220px] px-4 py-3">
          {canEdit ? (
            <select
              value={draft.nonClosureReason}
              onChange={(event) => setDraft((current) => ({ ...current, nonClosureReason: event.target.value }))}
              onBlur={flushSaveOnBlur}
              disabled={row.autoClosedByExecution || !hasManualNo}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-1 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              <option value="">
                {row.autoClosedByExecution ? 'Não aplicável' : hasManualNo ? 'Selecione' : 'Marque Não para informar'}
              </option>
              {nonClosureReasons.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-slate-600">{row.nonClosureReasonLabel || '—'}</span>
          )}
          {validationError ? <div className="mt-1 text-xs font-medium text-rose-600">{validationError}</div> : null}
        </td>
        <td className="min-w-[280px] px-4 py-3">
          {canEdit ? (
            <textarea
              value={draft.observation}
              onChange={(event) => setDraft((current) => ({ ...current, observation: event.target.value }))}
              onBlur={flushSaveOnBlur}
              rows={2}
              maxLength={2000}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-1 focus:ring-slate-200"
              placeholder="Registrar observações do contato"
            />
          ) : (
            <span className="text-sm text-slate-600">{row.observation || '—'}</span>
          )}
        </td>
        <td className="min-w-[180px] px-4 py-3 text-xs text-slate-500">
          {row.updatedAt ? (
            <div>
              <div className="font-semibold text-slate-700">{row.updatedByUserName || 'Usuário'}</div>
              <div>{formatLastUpdate(row.updatedAt)}</div>
            </div>
          ) : (
            'Sem edição'
          )}
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center justify-center gap-1.5">
            <button
              type="button"
              onClick={handleCopyPhone}
              disabled={!hasPhone}
              title={copiedEventKey === row.eventKey ? 'Telefone copiado' : 'Copiar telefone'}
              aria-label={copiedEventKey === row.eventKey ? 'Telefone copiado' : 'Copiar telefone'}
              className={`${iconButtonBaseClassName} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}
            >
              {copiedEventKey === row.eventKey ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => {
                if (!hasPhone) event.preventDefault();
              }}
              title={hasPhone ? 'Abrir conversa no WhatsApp' : 'Telefone indisponível'}
              aria-label={hasPhone ? 'Abrir conversa no WhatsApp' : 'Telefone indisponível'}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${
                hasPhone
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'pointer-events-none border-slate-200 bg-slate-50 text-slate-400'
              }`}
            >
              <MessageCircle size={13} />
            </a>
          </div>
          <div className="mt-2 flex items-center justify-center gap-1 text-[11px] text-slate-500">
            {saveStatus === 'saving' ? <Loader2 size={12} className="animate-spin text-blue-600" /> : null}
            {saveStatus === 'error' ? <AlertCircle size={12} className="text-rose-600" /> : null}
            {saveStatus === 'saved' ? <Check size={12} className="text-emerald-600" /> : null}
            <span className={saveStatus === 'error' ? 'text-rose-600' : saveStatus === 'saved' ? 'text-emerald-600' : ''}>{saveStatusLabel}</span>
          </div>
          {saveError ? (
            <div title={saveError} aria-label={saveError} className="mt-1 text-center text-[11px] text-rose-600">
              {saveError}
            </div>
          ) : null}
        </td>
      </tr>
      {expanded ? (
        <tr className="bg-slate-50/80">
          <td colSpan={15} className="px-4 pb-4 pt-0">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Propostas vinculadas</h3>
                  <p className="text-xs text-slate-500">Detalhe das propostas geradas no mesmo dia da consulta.</p>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {row.proposalCount} proposta(s)
                </span>
              </div>

              <div className="mb-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {row.autoClosedByExecution ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    Fechamento automático aplicado porque todas as propostas estão executadas.
                  </div>
                ) : null}
                {row.billingSourceRowCount > 1 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {row.billingSourceRowCount} lançamentos do faturamento foram agrupados neste atendimento.
                  </div>
                ) : null}
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  Total das propostas: <span className="font-semibold">{formatCurrency(row.totalProposalValue)}</span>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  Executado: <span className="font-semibold">{row.executedProposalCount} proposta(s) · {formatCurrency(row.executedProposalValue)}</span>
                </div>
              </div>

              {row.nonClosureReasonLabel ? (
                <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  Motivo registrado para não fechamento: <span className="font-semibold">{row.nonClosureReasonLabel}</span>
                </div>
              ) : null}

              <div className="grid gap-3 xl:grid-cols-2">
                {row.proposals.map((proposal) => (
                  <div key={proposal.proposalId} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">Proposta #{proposal.proposalId}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {formatDateOnly(proposal.proposalDate)} · {proposal.unitName}
                        </div>
                      </div>
                      <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${statusBadgeClassName(proposal.status)}`}>
                        {proposal.status}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-1 text-sm text-slate-600">
                      <div>Profissional: {proposal.professionalName}</div>
                      <div>Valor: {formatCurrency(proposal.totalValue)}</div>
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
