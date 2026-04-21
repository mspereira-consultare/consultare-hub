'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileDown,
  FileText,
  KeyRound,
  Loader2,
  RefreshCw,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import type {
  EmployeePortalOverview,
  EmployeePortalPersonalData,
  EmployeePortalSubmissionDocument,
} from '@consultare/core/employee-portal/types';

type Props = {
  employeeId: string | null;
  canEdit: boolean;
  onOfficialDocumentsChanged?: () => void | Promise<void>;
};

const statusClassName: Record<string, string> = {
  ACTIVE: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  DRAFT: 'border-slate-200 bg-slate-50 text-slate-700',
  SUBMITTED: 'border-blue-200 bg-blue-50 text-[#17407E]',
  CHANGES_REQUESTED: 'border-amber-200 bg-amber-50 text-amber-700',
  PARTIALLY_APPROVED: 'border-blue-200 bg-blue-50 text-[#17407E]',
  APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  REJECTED: 'border-rose-200 bg-rose-50 text-rose-700',
  REVOKED: 'border-rose-200 bg-rose-50 text-rose-700',
  EXPIRED: 'border-slate-200 bg-slate-50 text-slate-500',
  PENDING: 'border-blue-200 bg-blue-50 text-[#17407E]',
};

const statusLabel: Record<string, string> = {
  ACTIVE: 'Ativo',
  USED: 'Usado',
  EXPIRED: 'Expirado',
  REVOKED: 'Revogado',
  LOCKED: 'Bloqueado',
  DRAFT: 'Rascunho',
  SUBMITTED: 'Enviado para revisao',
  CHANGES_REQUESTED: 'Correcao solicitada',
  PARTIALLY_APPROVED: 'Parcialmente aprovado',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  CANCELED: 'Cancelado',
  PENDING: 'Pendente',
  PENDING_REVIEW: 'Em revisao',
};

const personalFieldLabels: Array<[keyof EmployeePortalPersonalData, string]> = [
  ['fullName', 'Nome completo'],
  ['rg', 'RG'],
  ['email', 'E-mail'],
  ['phone', 'Telefone'],
  ['street', 'Logradouro'],
  ['streetNumber', 'Numero'],
  ['addressComplement', 'Complemento'],
  ['district', 'Bairro'],
  ['city', 'Cidade'],
  ['stateUf', 'UF'],
  ['zipCode', 'CEP'],
  ['maritalStatus', 'Estado civil'],
  ['hasChildren', 'Possui filhos'],
  ['childrenCount', 'Quantidade de filhos'],
  ['educationInstitution', 'Instituicao de ensino'],
  ['educationLevel', 'Nivel'],
  ['courseName', 'Curso'],
  ['currentSemester', 'Semestre'],
  ['bankName', 'Banco'],
  ['bankAgency', 'Agencia'],
  ['bankAccount', 'Conta'],
  ['pixKey', 'Chave PIX'],
];

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((payload as { error?: unknown }).error || 'Falha ao carregar dados.'));
  return payload as T;
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const formatDateTime = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 19).replace('T', ' ');
  return raw;
};

const badge = (status: string) => (
  <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusClassName[status] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
    {statusLabel[status] || status}
  </span>
);

const valueLabel = (value: unknown) => {
  if (typeof value === 'boolean') return value ? 'Sim' : 'Nao';
  const raw = String(value ?? '').trim();
  return raw || '-';
};

export function EmployeePortalPanel({ employeeId, canEdit, onOfficialDocumentsChanged }: Props) {
  const [overview, setOverview] = useState<EmployeePortalOverview | null>(null);
  const [inviteUrl, setInviteUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const displayInviteUrl = inviteUrl || overview?.activeInvite?.url || '';

  const loadOverview = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    setError('');
    try {
      const payload = await fetchJson<{ status: string; data: EmployeePortalOverview }>(
        `/api/admin/colaboradores/${encodeURIComponent(employeeId)}/portal`
      );
      setOverview(payload.data);
    } catch (loadError: unknown) {
      setError(getErrorMessage(loadError, 'Falha ao carregar portal do colaborador.'));
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setInviteUrl('');
      setOverview(null);
      if (employeeId) void loadOverview();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [employeeId, loadOverview]);

  const personalRows = useMemo(() => {
    if (!overview?.submission) return [];
    const employee = overview.employee as Record<string, unknown>;
    const data = overview.submission.personalData || {};
    return personalFieldLabels
      .filter(([key]) => Object.prototype.hasOwnProperty.call(data, key))
      .map(([key, label]) => ({
        key,
        label,
        sent: data[key],
        current: employee[key],
      }));
  }, [overview]);

  const runAction = async (
    actionKey: string,
    fn: () => Promise<EmployeePortalOverview | null>,
    successMessage: string,
    refreshOfficialDocs = false
  ) => {
    setActionLoading(actionKey);
    setError('');
    setNotice('');
    try {
      const next = await fn();
      if (next) setOverview(next);
      setNotice(successMessage);
      if (refreshOfficialDocs && onOfficialDocumentsChanged) await onOfficialDocumentsChanged();
    } catch (actionError: unknown) {
      setError(getErrorMessage(actionError, 'Falha ao executar acao.'));
    } finally {
      setActionLoading('');
    }
  };

  const generateInvite = () =>
    runAction(
      'invite',
      async () => {
        if (!employeeId) return null;
        const payload = await fetchJson<{ status: string; data: { url: string; invite: unknown } }>(
          `/api/admin/colaboradores/${encodeURIComponent(employeeId)}/portal-invites`,
          { method: 'POST' }
        );
        setInviteUrl(payload.data.url);
        await loadOverview();
        return null;
      },
      'Convite gerado. Copie o link e envie ao colaborador.'
    );

  const revokeInvite = (inviteId: string) =>
    runAction(
      `revoke-${inviteId}`,
      async () => {
        if (!employeeId) return null;
        const payload = await fetchJson<{ status: string; data: EmployeePortalOverview }>(
          `/api/admin/colaboradores/${encodeURIComponent(employeeId)}/portal-invites/${encodeURIComponent(inviteId)}`,
          { method: 'DELETE' }
        );
        setInviteUrl('');
        return payload.data;
      },
      'Convite revogado.'
    );

  const approvePersonal = () =>
    overview?.submission
      ? runAction(
          'approve-personal',
          async () => {
            const payload = await fetchJson<{ status: string; data: EmployeePortalOverview }>(
              `/api/admin/colaboradores/portal-submissions/${encodeURIComponent(overview.submission!.id)}/approve-personal`,
              { method: 'POST' }
            );
            return payload.data;
          },
          'Dados pessoais aprovados.',
          true
        )
      : null;

  const rejectPersonal = () => {
    if (!overview?.submission) return;
    const reason = window.prompt('Informe o motivo para devolver os dados pessoais:');
    if (!reason) return;
    runAction(
      'reject-personal',
      async () => {
        const payload = await fetchJson<{ status: string; data: EmployeePortalOverview }>(
          `/api/admin/colaboradores/portal-submissions/${encodeURIComponent(overview.submission!.id)}/reject-personal`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason }),
          }
        );
        return payload.data;
      },
      'Dados pessoais devolvidos para correcao.'
    );
  };

  const approveDocument = (document: EmployeePortalSubmissionDocument) =>
    runAction(
      `approve-doc-${document.id}`,
      async () => {
        const payload = await fetchJson<{ status: string; data: EmployeePortalOverview }>(
          `/api/admin/colaboradores/portal-submissions/documents/${encodeURIComponent(document.id)}/approve`,
          { method: 'POST' }
        );
        return payload.data;
      },
      'Documento aprovado e oficializado.',
      true
    );

  const rejectDocument = (document: EmployeePortalSubmissionDocument) => {
    const reason = window.prompt('Informe o motivo para devolver este documento:');
    if (!reason) return;
    runAction(
      `reject-doc-${document.id}`,
      async () => {
        const payload = await fetchJson<{ status: string; data: EmployeePortalOverview }>(
          `/api/admin/colaboradores/portal-submissions/documents/${encodeURIComponent(document.id)}/reject`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason }),
          }
        );
        return payload.data;
      },
      'Documento devolvido para correcao.'
    );
  };

  const requestChanges = () => {
    if (!overview?.submission) return;
    const notes = window.prompt('Observacao geral para a correcao:') || '';
    runAction(
      'request-changes',
      async () => {
        const payload = await fetchJson<{ status: string; data: EmployeePortalOverview }>(
          `/api/admin/colaboradores/portal-submissions/${encodeURIComponent(overview.submission!.id)}/request-changes`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes }),
          }
        );
        return payload.data;
      },
      'Submissao liberada para correcao.'
    );
  };

  const copyInvite = async () => {
    if (!displayInviteUrl) return;
    await navigator.clipboard?.writeText(displayInviteUrl);
    setNotice('Link copiado para a area de transferencia.');
  };

  if (!employeeId) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
        Salve o colaborador antes de gerar convite para o portal.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertCircle size={14} />
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 size={14} />
          {notice}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-start md:justify-between">
          <div className="flex gap-3">
            <div className="rounded-lg bg-white p-2 text-slate-600 shadow-sm ring-1 ring-slate-200">
              <KeyRound size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Convite do portal</h3>
              <p className="mt-1 text-xs text-slate-500">Gere um link externo para o colaborador confirmar CPF e nascimento.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={loadOverview} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Atualizar
            </button>
            {canEdit ? (
              <button type="button" onClick={generateInvite} disabled={Boolean(actionLoading)} className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
                {actionLoading === 'invite' ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                Gerar convite
              </button>
            ) : null}
          </div>
        </div>

        {displayInviteUrl ? (
          <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]">
            <input readOnly value={displayInviteUrl} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-700" />
            <button type="button" onClick={copyInvite} className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-[#17407E]">
              <Copy size={14} />
              Copiar link
            </button>
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold uppercase text-slate-500">Convite ativo</div>
            <div className="mt-2">{overview?.activeInvite ? badge(overview.activeInvite.status) : <span className="text-sm text-slate-500">Nenhum</span>}</div>
            <div className="mt-2 text-xs text-slate-500">Expira em {formatDateTime(overview?.activeInvite?.expiresAt)}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold uppercase text-slate-500">Submissao</div>
            <div className="mt-2">{overview?.submission ? badge(overview.submission.status) : <span className="text-sm text-slate-500">Sem submissao</span>}</div>
            <div className="mt-2 text-xs text-slate-500">Enviado em {formatDateTime(overview?.submission?.submittedAt)}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold uppercase text-slate-500">Documentos</div>
            <div className="mt-2 text-lg font-bold text-slate-900">{overview?.approvedCount || 0}/{overview?.checklist.length || 0}</div>
            <div className="text-xs text-slate-500">{overview?.pendingCount || 0} pendente(s), {overview?.rejectedCount || 0} devolvido(s)</div>
          </div>
        </div>

        {overview?.activeInvite && canEdit ? (
          <button type="button" onClick={() => revokeInvite(overview.activeInvite!.id)} disabled={Boolean(actionLoading)} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700">
            {actionLoading === `revoke-${overview.activeInvite.id}` ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
            Revogar convite ativo
          </button>
        ) : null}
      </div>

      {overview?.submission ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Dados enviados</h3>
              <p className="mt-1 text-xs text-slate-500">Compare o valor atual com o valor informado pelo colaborador.</p>
            </div>
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={approvePersonal} disabled={Boolean(actionLoading)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
                  {actionLoading === 'approve-personal' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Aprovar dados
                </button>
                <button type="button" onClick={rejectPersonal} disabled={Boolean(actionLoading)} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-60">
                  <XCircle size={14} />
                  Devolver dados
                </button>
              </div>
            ) : null}
          </div>

          {personalRows.length === 0 ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
              Nenhum dado pessoal foi salvo pelo portal.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="min-w-[760px] w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Campo</th>
                    <th className="px-3 py-2">Atual</th>
                    <th className="px-3 py-2">Enviado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {personalRows.map((row) => (
                    <tr key={String(row.key)}>
                      <td className="px-3 py-2 font-medium text-slate-700">{row.label}</td>
                      <td className="px-3 py-2 text-slate-500">{valueLabel(row.current)}</td>
                      <td className="px-3 py-2 text-slate-900">{valueLabel(row.sent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Documentos enviados pelo portal</h3>
            <p className="mt-1 text-xs text-slate-500">Aprovados viram documentos oficiais do cadastro.</p>
          </div>
          {overview?.submission && canEdit ? (
            <button type="button" onClick={requestChanges} disabled={Boolean(actionLoading)} className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-700">
              <RotateCcw size={14} />
              Pedir correcao geral
            </button>
          ) : null}
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Documento</th>
                <th className="px-3 py-2">Arquivo</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Rejeicao</th>
                <th className="px-3 py-2">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!overview || overview.documents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-500">Nenhum documento enviado pelo portal.</td>
                </tr>
              ) : overview.documents.map((document) => (
                <tr key={document.id} className="align-top">
                  <td className="px-3 py-2 font-medium text-slate-700">{document.docType}</td>
                  <td className="px-3 py-2">
                    <div className="max-w-[260px] truncate text-slate-900" title={document.originalName}>{document.originalName}</div>
                    <div className="text-xs text-slate-500">{formatDateTime(document.createdAt)}</div>
                  </td>
                  <td className="px-3 py-2">{badge(document.status)}</td>
                  <td className="px-3 py-2 text-xs text-rose-700">{document.rejectionReason || '-'}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => window.open(`/api/admin/colaboradores/portal-submissions/documents/${encodeURIComponent(document.id)}/download?inline=1`, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
                        <FileText size={12} />
                        Ver
                      </button>
                      <button type="button" onClick={() => window.open(`/api/admin/colaboradores/portal-submissions/documents/${encodeURIComponent(document.id)}/download`, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
                        <FileDown size={12} />
                        Baixar
                      </button>
                      {canEdit && document.status === 'PENDING' ? (
                        <>
                          <button type="button" onClick={() => approveDocument(document)} disabled={Boolean(actionLoading)} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60">
                            {actionLoading === `approve-doc-${document.id}` ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                            Aprovar
                          </button>
                          <button type="button" onClick={() => rejectDocument(document)} disabled={Boolean(actionLoading)} className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-60">
                            <XCircle size={12} />
                            Devolver
                          </button>
                        </>
                      ) : null}
                      {document.promotedDocumentId ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-xs text-emerald-700">
                          <ExternalLink size={12} />
                          Oficializado
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
