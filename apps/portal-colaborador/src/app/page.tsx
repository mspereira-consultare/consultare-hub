'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  FileText,
  Loader2,
  LogOut,
  Send,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import {
  EDUCATION_LEVELS,
  MARITAL_STATUSES,
} from '@consultare/core/colaboradores/constants';
import type {
  EmployeePortalChecklistItem,
  EmployeePortalOverview,
  EmployeePortalPersonalData,
} from '@consultare/core/employee-portal/types';

type LoginState = {
  token: string;
  cpf: string;
  birthDate: string;
};

const inputClassName =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500';
const labelClassName = 'mb-1 block text-[11px] font-semibold uppercase text-slate-500';

const documentStatusLabel: Record<EmployeePortalChecklistItem['status'], string> = {
  PENDING: 'Pendente',
  DRAFT: 'Enviado no rascunho',
  PENDING_REVIEW: 'Em revisão',
  APPROVED: 'Aprovado',
  REJECTED: 'Correção solicitada',
  OFFICIAL: 'Já consta no cadastro',
  NOT_APPLICABLE: 'Não se aplica',
};

const documentStatusClassName: Record<EmployeePortalChecklistItem['status'], string> = {
  PENDING: 'border-amber-200 bg-amber-50 text-amber-800',
  DRAFT: 'border-blue-200 bg-blue-50 text-[#17407E]',
  PENDING_REVIEW: 'border-blue-200 bg-blue-50 text-[#17407E]',
  APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  REJECTED: 'border-rose-200 bg-rose-50 text-rose-700',
  OFFICIAL: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  NOT_APPLICABLE: 'border-slate-200 bg-slate-50 text-slate-500',
};

const submissionStatusLabel: Record<string, string> = {
  DRAFT: 'Rascunho',
  SUBMITTED: 'Enviado para revisão',
  CHANGES_REQUESTED: 'Correção solicitada',
  PARTIALLY_APPROVED: 'Parcialmente aprovado',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  CANCELED: 'Cancelado',
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((payload as { error?: unknown }).error || 'Falha ao carregar dados.'));
  }
  return payload as T;
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const digitsOnly = (value: string) => value.replace(/\D/g, '');

const formatCpf = (value: string | null | undefined) => {
  const digits = digitsOnly(String(value || '')).slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
};

const formatDateBr = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '-';
  return `${match[3]}/${match[2]}/${match[1]}`;
};

const personalFromOverview = (overview: EmployeePortalOverview): EmployeePortalPersonalData => {
  const employee = overview.employee;
  const data: EmployeePortalPersonalData = {
    fullName: String(overview.submission?.personalData.fullName ?? employee.fullName ?? ''),
    rg: String(overview.submission?.personalData.rg ?? employee.rg ?? ''),
    email: String(overview.submission?.personalData.email ?? employee.email ?? ''),
    phone: String(overview.submission?.personalData.phone ?? employee.phone ?? ''),
    street: String(overview.submission?.personalData.street ?? employee.street ?? ''),
    streetNumber: String(overview.submission?.personalData.streetNumber ?? employee.streetNumber ?? ''),
    addressComplement: String(overview.submission?.personalData.addressComplement ?? employee.addressComplement ?? ''),
    district: String(overview.submission?.personalData.district ?? employee.district ?? ''),
    city: String(overview.submission?.personalData.city ?? employee.city ?? ''),
    stateUf: String(overview.submission?.personalData.stateUf ?? employee.stateUf ?? 'SP'),
    zipCode: String(overview.submission?.personalData.zipCode ?? employee.zipCode ?? ''),
    educationInstitution: String(overview.submission?.personalData.educationInstitution ?? employee.educationInstitution ?? ''),
    educationLevel: String(overview.submission?.personalData.educationLevel ?? employee.educationLevel ?? ''),
    courseName: String(overview.submission?.personalData.courseName ?? employee.courseName ?? ''),
    currentSemester: String(overview.submission?.personalData.currentSemester ?? employee.currentSemester ?? ''),
    maritalStatus: String(overview.submission?.personalData.maritalStatus ?? employee.maritalStatus ?? ''),
    hasChildren: Boolean(overview.submission?.personalData.hasChildren ?? employee.hasChildren ?? false),
    childrenCount: String(overview.submission?.personalData.childrenCount ?? employee.childrenCount ?? 0),
  };

  if (employee.employmentRegime === 'PJ') {
    data.bankName = String(overview.submission?.personalData.bankName ?? employee.bankName ?? '');
    data.bankAgency = String(overview.submission?.personalData.bankAgency ?? employee.bankAgency ?? '');
    data.bankAccount = String(overview.submission?.personalData.bankAccount ?? employee.bankAccount ?? '');
    data.pixKey = String(overview.submission?.personalData.pixKey ?? employee.pixKey ?? '');
  }

  return data;
};

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Precisa de ajuda?</h2>
            <p className="mt-1 text-sm text-slate-500">Veja orientações rápidas para concluir seu envio.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          {[
            ['Acesso', 'Use o CPF e a data de nascimento informados ao RH. Se continuar aparecendo erro, peça ao RH para validar seu cadastro ou gerar um novo link.'],
            ['Dados pessoais', 'Preencha os dados com atenção. O DP vai conferir as informações antes de atualizar seu cadastro oficial.'],
            ['Documentos', 'Envie PDF ou foto legível em JPG, JPEG, PNG ou WEBP. O limite por arquivo é 15 MB. Evite fotos cortadas, tremidas ou escuras.'],
            ['Frente e verso', 'Quando o documento tiver frente e verso, coloque as duas partes no mesmo PDF ou na mesma imagem sempre que possível.'],
            ['Correção', 'Se um documento for devolvido, veja o motivo informado, envie uma nova versão e mande novamente para revisão.'],
            ['Privacidade', 'Seus dados serão usados apenas para cadastro, admissão, folha, benefícios e obrigações legais da empresa.'],
          ].map(([title, body]) => (
            <div key={title} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
              <p className="mt-1 text-sm text-slate-600">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: EmployeePortalChecklistItem['status'] }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${documentStatusClassName[status]}`}>
      {documentStatusLabel[status]}
    </span>
  );
}

export default function PortalColaboradorPage() {
  const [login, setLogin] = useState<LoginState>(() => {
    if (typeof window === 'undefined') return { token: '', cpf: '', birthDate: '' };
    const params = new URLSearchParams(window.location.search);
    return {
      token: params.get('convite') || params.get('token') || '',
      cpf: '',
      birthDate: '',
    };
  });
  const [overview, setOverview] = useState<EmployeePortalOverview | null>(null);
  const [personal, setPersonal] = useState<EmployeePortalPersonalData>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [consentLgpd, setConsentLgpd] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const canEdit = !overview?.submission || ['DRAFT', 'CHANGES_REQUESTED'].includes(overview.submission.status);
  const showBankFields = overview?.employee.employmentRegime === 'PJ';

  const loadMe = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await fetchJson<{ status: string; data: EmployeePortalOverview }>('/api/me');
      setOverview(payload.data);
      setPersonal(personalFromOverview(payload.data));
      setConsentLgpd(Boolean(payload.data.submission?.consentLgpd));
    } catch {
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMe();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMe]);

  const progress = useMemo(() => {
    if (!overview || overview.checklist.length === 0) return 0;
    const done = overview.checklist.filter((item) => ['APPROVED', 'OFFICIAL', 'DRAFT', 'PENDING_REVIEW'].includes(item.status)).length;
    return Math.round((done / overview.checklist.length) * 100);
  }, [overview]);

  const loginPortal = async () => {
    setAuthenticating(true);
    setError('');
    setNotice('');
    try {
      await fetchJson('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: login.token,
          cpf: digitsOnly(login.cpf),
          birthDate: login.birthDate,
        }),
      });
      setNotice('Acesso validado com sucesso.');
      await loadMe();
    } catch (loginError: unknown) {
      setError(getErrorMessage(loginError, 'Não foi possível validar seu acesso.'));
    } finally {
      setAuthenticating(false);
    }
  };

  const logout = async () => {
    await fetchJson('/api/logout', { method: 'POST' }).catch(() => null);
    setOverview(null);
    setNotice('');
    setError('');
  };

  const savePersonal = async () => {
    setSavingPersonal(true);
    setError('');
    setNotice('');
    try {
      const payload = await fetchJson<{ status: string; data: EmployeePortalOverview }>('/api/submission/personal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(personal),
      });
      setOverview(payload.data);
      setPersonal(personalFromOverview(payload.data));
      setNotice('Dados pessoais salvos como rascunho.');
    } catch (saveError: unknown) {
      setError(getErrorMessage(saveError, 'Falha ao salvar os dados.'));
    } finally {
      setSavingPersonal(false);
    }
  };

  const uploadDocument = async (item: EmployeePortalChecklistItem, file: File | null) => {
    if (!file) return;
    setUploadingDoc(item.docType);
    setError('');
    setNotice('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('docType', item.docType);
      const payload = await fetchJson<{ status: string; data: EmployeePortalOverview }>('/api/submission/documents', {
        method: 'POST',
        body: formData,
      });
      setOverview(payload.data);
      setPersonal(personalFromOverview(payload.data));
      setNotice(`${item.label} enviado para o rascunho.`);
    } catch (uploadError: unknown) {
      setError(getErrorMessage(uploadError, 'Falha ao enviar documento.'));
    } finally {
      setUploadingDoc(null);
    }
  };

  const submitForReview = async () => {
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const payload = await fetchJson<{ status: string; data: EmployeePortalOverview }>('/api/submission/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consentLgpd }),
      });
      setOverview(payload.data);
      setPersonal(personalFromOverview(payload.data));
      setNotice('Informações enviadas para revisão do DP.');
    } catch (submitError: unknown) {
      setError(getErrorMessage(submitError, 'Falha ao enviar para revisão.'));
    } finally {
      setSubmitting(false);
    }
  };

  const acknowledgeIntranetAccess = async () => {
    if (!overview?.intranetAccess?.credentialId) return;
    setError('');
    setNotice('');
    try {
      const payload = await fetchJson<{ status: string; data: EmployeePortalOverview }>('/api/intranet-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialId: overview.intranetAccess.credentialId }),
      });
      setOverview(payload.data);
      setPersonal(personalFromOverview(payload.data));
      setNotice('Credenciais confirmadas. A senha não ficará mais visível neste portal.');
    } catch (ackError: unknown) {
      setError(getErrorMessage(ackError, 'Falha ao confirmar a leitura das credenciais.'));
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          <Loader2 size={16} className="animate-spin" />
          Carregando portal...
        </div>
      </main>
    );
  }

  if (!overview) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center p-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
          <Image src="/logo-color.png" alt="Consultare" width={180} height={55} priority className="h-12 w-auto" />
          <h1 className="mt-6 text-2xl font-bold text-slate-950">Portal do colaborador</h1>
          <p className="mt-2 text-sm text-slate-600">
            Informe CPF e data de nascimento para acessar o envio de dados e documentos.
          </p>

          {error ? (
            <div className="mt-4 flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              {error}
            </div>
          ) : null}

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className={labelClassName}>CPF</span>
              <input
                value={login.cpf}
                onChange={(event) => setLogin((current) => ({ ...current, cpf: formatCpf(event.target.value) }))}
                className={inputClassName}
                placeholder="000.000.000-00"
              />
            </label>
            <label className="block">
              <span className={labelClassName}>Data de nascimento</span>
              <input
                type="date"
                value={login.birthDate}
                onChange={(event) => setLogin((current) => ({ ...current, birthDate: event.target.value }))}
                className={inputClassName}
              />
            </label>
            {!login.token ? (
              <label className="block">
                <span className={labelClassName}>Código do convite</span>
                <input
                  value={login.token}
                  onChange={(event) => setLogin((current) => ({ ...current, token: event.target.value }))}
                  className={inputClassName}
                  placeholder="Cole o código recebido pelo RH"
                />
              </label>
            ) : null}
            <button
              type="button"
              onClick={loginPortal}
              disabled={authenticating || !login.token || !login.cpf || !login.birthDate}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#17407E] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {authenticating ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={16} />}
              Continuar
            </button>
          </div>

          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#17407E]"
          >
            <CircleHelp size={15} />
            Precisa de ajuda?
          </button>
        </div>
        {helpOpen ? <HelpModal onClose={() => setHelpOpen(false)} /> : null}
      </main>
    );
  }

  const personalStatus = overview.submission?.personalStatus || 'DRAFT';
  const submissionStatus = overview.submission?.status || 'DRAFT';
  const photoDocument = overview.checklist.find((item) => item.docType === 'FOTO_3X4')?.portalDocument || null;
  const photoUrl = photoDocument?.mimeType.startsWith('image/')
    ? `/api/submission/documents/${encodeURIComponent(photoDocument.id)}?inline=1`
    : '';

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo-color.png" alt="Consultare" width={165} height={50} priority className="h-11 w-auto" />
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={`Foto de ${overview.employee.fullName}`}
                className="h-12 w-12 shrink-0 rounded-full border border-slate-200 object-cover shadow-sm"
              />
            ) : (
              <div className="group relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-dashed border-slate-300 bg-slate-50 text-slate-400">
                <UserRound size={22} aria-hidden="true" />
                <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-48 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-center text-xs font-medium text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                  Envie a Foto 3x4 em Documentos.
                </span>
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-slate-950">Portal do colaborador</h1>
              <p className="text-sm text-slate-500">Olá, {overview.employee.fullName.split(' ')[0] || overview.employee.fullName}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setHelpOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
              <CircleHelp size={15} />
              Ajuda
            </button>
            <button type="button" onClick={logout} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
              <LogOut size={15} />
              Sair
            </button>
          </div>
        </div>
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Progresso documental</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-[#2AAE8B]" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </header>

      {error ? (
        <div className="mt-4 flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mt-4 flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          {notice}
        </div>
      ) : null}

      <section className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Status</div>
          <div className="mt-2 text-lg font-bold text-slate-900">{submissionStatusLabel[submissionStatus] || submissionStatus}</div>
          <p className="mt-1 text-sm text-slate-500">Dados pessoais: {submissionStatusLabel[personalStatus] || personalStatus}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Documentos</div>
          <div className="mt-2 text-lg font-bold text-slate-900">{overview.approvedCount}/{overview.checklist.length}</div>
          <p className="mt-1 text-sm text-slate-500">Aprovados ou já existentes</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Pendências</div>
          <div className="mt-2 text-lg font-bold text-slate-900">{overview.pendingCount}</div>
          <p className="mt-1 text-sm text-slate-500">{overview.rejectedCount} com correção solicitada</p>
        </div>
      </section>

      {overview.intranetAccess ? (
        <section className="mt-5 rounded-2xl border border-[#17407E]/15 bg-gradient-to-r from-[#17407E]/5 via-white to-[#2AAE8B]/5 p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#17407E]">Acesso à intranet</p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">Seus dados de acesso já estão prontos</h2>
              <p className="mt-1 text-sm text-slate-600">
                Use este usuário para entrar na intranet da Consultare. A senha inicial aparece apenas uma vez.
              </p>
            </div>
            {overview.intranetAccess.status === 'PENDING_VIEW' ? (
              <button
                type="button"
                onClick={acknowledgeIntranetAccess}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#17407E]/20 bg-white px-3 py-2 text-sm font-semibold text-[#17407E]"
              >
                <CheckCircle2 size={15} />
                Anotei meus dados
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase text-slate-500">Link</div>
              <a href={overview.intranetAccess.intranetUrl} target="_blank" rel="noreferrer" className="mt-2 block text-sm font-semibold text-[#17407E] underline-offset-2 hover:underline">
                Abrir intranet
              </a>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase text-slate-500">Usuário</div>
              <div className="mt-2 text-lg font-bold text-slate-900">{overview.intranetAccess.username}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase text-slate-500">Senha inicial</div>
              <div className="mt-2 text-lg font-bold text-slate-900">
                {overview.intranetAccess.temporaryPassword || 'Já visualizada'}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {overview.intranetAccess.temporaryPassword
                  ? 'Guarde esta senha antes de confirmar.'
                  : 'Se precisar de uma nova senha, solicite ao RH.'}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Dados pessoais</h2>
            <p className="text-sm text-slate-500">Confira e complete seus dados. O DP revisa tudo antes de atualizar o cadastro oficial.</p>
          </div>
          <button
            type="button"
            onClick={savePersonal}
            disabled={!canEdit || savingPersonal}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {savingPersonal ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            Salvar rascunho
          </button>
        </div>

        {overview.submission?.personalRejectionReason ? (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            Correção solicitada: {overview.submission.personalRejectionReason}
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-12">
          <label className="md:col-span-6">
            <span className={labelClassName}>Nome completo</span>
            <input disabled={!canEdit} value={String(personal.fullName || '')} onChange={(event) => setPersonal((current) => ({ ...current, fullName: event.target.value }))} className={inputClassName} />
          </label>
          <label className="md:col-span-3">
            <span className={labelClassName}>CPF</span>
            <input disabled value={formatCpf(overview.employee.cpf || '')} className={inputClassName} />
          </label>
          <label className="md:col-span-3">
            <span className={labelClassName}>Nascimento</span>
            <input disabled value={formatDateBr(overview.employee.birthDate)} className={inputClassName} />
          </label>
          <label className="md:col-span-4">
            <span className={labelClassName}>RG</span>
            <input disabled={!canEdit} value={String(personal.rg || '')} onChange={(event) => setPersonal((current) => ({ ...current, rg: event.target.value }))} className={inputClassName} />
          </label>
          <label className="md:col-span-4">
            <span className={labelClassName}>E-mail</span>
            <input disabled={!canEdit} type="email" value={String(personal.email || '')} onChange={(event) => setPersonal((current) => ({ ...current, email: event.target.value }))} className={inputClassName} />
          </label>
          <label className="md:col-span-4">
            <span className={labelClassName}>Telefone</span>
            <input disabled={!canEdit} value={String(personal.phone || '')} onChange={(event) => setPersonal((current) => ({ ...current, phone: digitsOnly(event.target.value).slice(0, 11) }))} className={inputClassName} />
          </label>
          <label className="md:col-span-2">
            <span className={labelClassName}>CEP</span>
            <input disabled={!canEdit} value={String(personal.zipCode || '')} onChange={(event) => setPersonal((current) => ({ ...current, zipCode: event.target.value }))} className={inputClassName} />
          </label>
          <label className="md:col-span-6">
            <span className={labelClassName}>Logradouro</span>
            <input disabled={!canEdit} value={String(personal.street || '')} onChange={(event) => setPersonal((current) => ({ ...current, street: event.target.value }))} className={inputClassName} />
          </label>
          <label className="md:col-span-2">
            <span className={labelClassName}>Número</span>
            <input disabled={!canEdit} value={String(personal.streetNumber || '')} onChange={(event) => setPersonal((current) => ({ ...current, streetNumber: event.target.value }))} className={inputClassName} />
          </label>
          <label className="md:col-span-2">
            <span className={labelClassName}>UF</span>
            <input disabled={!canEdit} value={String(personal.stateUf || '')} onChange={(event) => setPersonal((current) => ({ ...current, stateUf: event.target.value.toUpperCase().slice(0, 2) }))} className={inputClassName} />
          </label>
          <label className="md:col-span-4">
            <span className={labelClassName}>Complemento</span>
            <input disabled={!canEdit} value={String(personal.addressComplement || '')} onChange={(event) => setPersonal((current) => ({ ...current, addressComplement: event.target.value }))} className={inputClassName} />
          </label>
          <label className="md:col-span-4">
            <span className={labelClassName}>Bairro</span>
            <input disabled={!canEdit} value={String(personal.district || '')} onChange={(event) => setPersonal((current) => ({ ...current, district: event.target.value }))} className={inputClassName} />
          </label>
          <label className="md:col-span-4">
            <span className={labelClassName}>Cidade</span>
            <input disabled={!canEdit} value={String(personal.city || '')} onChange={(event) => setPersonal((current) => ({ ...current, city: event.target.value }))} className={inputClassName} />
          </label>
          <label className="md:col-span-4">
            <span className={labelClassName}>Estado civil</span>
            <select disabled={!canEdit} value={String(personal.maritalStatus || '')} onChange={(event) => setPersonal((current) => ({ ...current, maritalStatus: event.target.value }))} className={inputClassName}>
              <option value="">Não informado</option>
              {MARITAL_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="md:col-span-4 flex items-center gap-2 pt-6 text-sm text-slate-700">
            <input disabled={!canEdit} type="checkbox" checked={Boolean(personal.hasChildren)} onChange={(event) => setPersonal((current) => ({ ...current, hasChildren: event.target.checked, childrenCount: event.target.checked ? current.childrenCount || '1' : '0' }))} />
            Possui filhos
          </label>
          <label className="md:col-span-4">
            <span className={labelClassName}>Quantidade de filhos</span>
            <input disabled={!canEdit || !personal.hasChildren} value={String(personal.childrenCount || '0')} onChange={(event) => setPersonal((current) => ({ ...current, childrenCount: digitsOnly(event.target.value) }))} className={inputClassName} />
          </label>

          {overview.employee.employmentRegime === 'ESTAGIO' ? (
            <>
              <label className="md:col-span-5">
                <span className={labelClassName}>Instituição de ensino</span>
                <input disabled={!canEdit} value={String(personal.educationInstitution || '')} onChange={(event) => setPersonal((current) => ({ ...current, educationInstitution: event.target.value }))} className={inputClassName} />
              </label>
              <label className="md:col-span-3">
                <span className={labelClassName}>Nível</span>
                <select disabled={!canEdit} value={String(personal.educationLevel || '')} onChange={(event) => setPersonal((current) => ({ ...current, educationLevel: event.target.value }))} className={inputClassName}>
                  <option value="">Selecione</option>
                  {EDUCATION_LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="md:col-span-2">
                <span className={labelClassName}>Semestre</span>
                <input disabled={!canEdit} value={String(personal.currentSemester || '')} onChange={(event) => setPersonal((current) => ({ ...current, currentSemester: event.target.value }))} className={inputClassName} />
              </label>
              <label className="md:col-span-2">
                <span className={labelClassName}>Curso</span>
                <input disabled={!canEdit} value={String(personal.courseName || '')} onChange={(event) => setPersonal((current) => ({ ...current, courseName: event.target.value }))} className={inputClassName} />
              </label>
            </>
          ) : null}

          {showBankFields ? (
            <>
              <label className="md:col-span-3">
                <span className={labelClassName}>Banco</span>
                <input disabled={!canEdit} value={String(personal.bankName || '')} onChange={(event) => setPersonal((current) => ({ ...current, bankName: event.target.value }))} className={inputClassName} />
              </label>
              <label className="md:col-span-3">
                <span className={labelClassName}>Agência</span>
                <input disabled={!canEdit} value={String(personal.bankAgency || '')} onChange={(event) => setPersonal((current) => ({ ...current, bankAgency: event.target.value }))} className={inputClassName} />
              </label>
              <label className="md:col-span-3">
                <span className={labelClassName}>Conta</span>
                <input disabled={!canEdit} value={String(personal.bankAccount || '')} onChange={(event) => setPersonal((current) => ({ ...current, bankAccount: event.target.value }))} className={inputClassName} />
              </label>
              <label className="md:col-span-3">
                <span className={labelClassName}>Chave PIX</span>
                <input disabled={!canEdit} value={String(personal.pixKey || '')} onChange={(event) => setPersonal((current) => ({ ...current, pixKey: event.target.value }))} className={inputClassName} />
              </label>
            </>
          ) : null}
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Documentos</h2>
          <p className="text-sm text-slate-500">Envie os documentos solicitados abaixo. O DP revisa cada arquivo antes de aprovar.</p>
        </div>
        <div className="mt-5 grid gap-3">
          {overview.checklist.map((item) => (
            <div key={item.docType} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText size={16} className="text-slate-500" />
                    <h3 className="font-semibold text-slate-900">{item.label}</h3>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {item.portalDocument?.originalName || item.officialDocument?.originalName || 'Nenhum arquivo enviado para este item.'}
                  </p>
                  {item.portalDocument?.rejectionReason ? (
                    <p className="mt-2 rounded-lg border border-rose-200 bg-white p-2 text-sm text-rose-700">
                      Motivo: {item.portalDocument.rejectionReason}
                    </p>
                  ) : null}
                </div>
                {canEdit && !['APPROVED', 'PENDING_REVIEW'].includes(item.status) ? (
                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-semibold text-white">
                    {uploadingDoc === item.docType ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                    Enviar arquivo
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={uploadingDoc === item.docType}
                      onChange={(event) => uploadDocument(item, event.target.files?.[0] || null)}
                    />
                  </label>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-bold text-slate-900">Enviar para revisão</h2>
        <p className="mt-1 text-sm text-slate-500">
          Depois de enviar, o DP confere as informações. Se precisar de correção, o portal será reaberto.
        </p>
        <label className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={consentLgpd}
            disabled={!canEdit}
            onChange={(event) => setConsentLgpd(event.target.checked)}
            className="mt-1"
          />
          Declaro que as informações e documentos enviados são verdadeiros e autorizo o uso para processos internos de cadastro, admissão, folha, benefícios e obrigações legais.
        </label>
        <button
          type="button"
          onClick={submitForReview}
          disabled={!canEdit || submitting || !consentLgpd}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#2AAE8B] px-4 py-3 text-sm font-bold text-white disabled:opacity-60 sm:w-auto"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Enviar para revisão
        </button>
      </section>

      {helpOpen ? <HelpModal onClose={() => setHelpOpen(false)} /> : null}
    </main>
  );
}
