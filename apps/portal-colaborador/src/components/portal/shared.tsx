'use client';

import Image from 'next/image';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, CircleHelp, LogOut, UserRound, X } from 'lucide-react';
import type {
  EmployeePortalChecklistItem,
  EmployeePortalOverview,
  EmployeePortalPersonalData,
} from '@consultare/core/employee-portal/types';

export type LoginState = {
  token: string;
  cpf: string;
  birthDate: string;
};

export type CredentialLoginState = {
  usernameOrEmail: string;
  password: string;
};

export type LoginTab = 'invite' | 'credentials';

export type AuthResponse = {
  status: string;
  data: {
    expiresAt: string;
    authMethod: 'INVITE' | 'CREDENTIALS';
    credentialIssuedNow: boolean;
  };
};

export const inputClassName =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500';
export const labelClassName = 'mb-1 block text-[11px] font-semibold uppercase text-slate-500';
const EMPLOYEE_PORTAL_OVERVIEW_CACHE_KEY = 'consultare:portal-colaborador:overview';

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

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((payload as { error?: unknown }).error || 'Falha ao carregar dados.'));
  }
  return payload as T;
}

export const readEmployeePortalOverviewCache = (): EmployeePortalOverview | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(EMPLOYEE_PORTAL_OVERVIEW_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as EmployeePortalOverview;
  } catch {
    return null;
  }
};

export const writeEmployeePortalOverviewCache = (overview: EmployeePortalOverview | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (!overview) {
      window.sessionStorage.removeItem(EMPLOYEE_PORTAL_OVERVIEW_CACHE_KEY);
      return;
    }
    window.sessionStorage.setItem(EMPLOYEE_PORTAL_OVERVIEW_CACHE_KEY, JSON.stringify(overview));
  } catch {
    // Ignore cache failures in the browser.
  }
};

export const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export const digitsOnly = (value: string) => value.replace(/\D/g, '');

export const formatCpf = (value: string | null | undefined) => {
  const digits = digitsOnly(String(value || '')).slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
};

export const formatDateBr = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '-';
  return `${match[3]}/${match[2]}/${match[1]}`;
};

export const personalFromOverview = (overview: EmployeePortalOverview): EmployeePortalPersonalData => {
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

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Precisa de ajuda?</h2>
            <p className="mt-1 text-sm text-slate-500">Veja orientações rápidas para concluir seu acesso e seus envios.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          {[
            ['Primeiro acesso', 'Use o link ou código do convite enviado pelo RH junto com seu CPF e data de nascimento. Esse passo é necessário apenas na primeira entrada.'],
            ['Acessos seguintes', 'Depois da validação inicial, use seu usuário e senha. Se não lembrar a senha, solicite uma nova ao RH ou DP.'],
            ['Código do convite', 'Se o convite não vier automaticamente no link, copie o código enviado pelo RH e cole no campo do primeiro acesso.'],
            ['Dados de identificação', 'Digite o CPF apenas com números ou no formato 000.000.000-00 e confirme a data de nascimento cadastrada pelo RH.'],
            ['Dados pessoais', 'Preencha os dados com atenção. O DP vai conferir as informações antes de atualizar seu cadastro oficial.'],
            ['Documentos', 'Envie PDF ou foto legível em JPG, JPEG, PNG ou WEBP. O limite por arquivo é 15 MB. Evite fotos cortadas, tremidas ou escuras.'],
            ['Produção', 'Na aba Produção, registre Resolve e Check-up um paciente por vez, sempre com o nome completo. Apenas lançamentos vinculados a Feegow contam para meta.'],
            ['Suporte', 'Se continuar sem conseguir acessar ou enviar, fale com o RH ou Departamento Pessoal para confirmar seu cadastro.'],
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

export function StatusBadge({ status }: { status: EmployeePortalChecklistItem['status'] }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${documentStatusClassName[status]}`}>
      {documentStatusLabel[status]}
    </span>
  );
}

export function PortalLoginCard(props: {
  error: string;
  helpOpen: boolean;
  authenticating: boolean;
  inviteLogin: LoginState;
  credentialLogin: CredentialLoginState;
  loginTab: LoginTab;
  onInviteChange: (next: LoginState) => void;
  onCredentialChange: (next: CredentialLoginState) => void;
  onTabChange: (tab: LoginTab) => void;
  onInviteSubmit: () => void;
  onCredentialSubmit: () => void;
  onHelpOpen: () => void;
  onHelpClose: () => void;
}) {
  const {
    error,
    helpOpen,
    authenticating,
    inviteLogin,
    credentialLogin,
    loginTab,
    onInviteChange,
    onCredentialChange,
    onTabChange,
    onInviteSubmit,
    onCredentialSubmit,
    onHelpOpen,
    onHelpClose,
  } = props;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center p-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <Image src="/logo-color.png" alt="Consultare" width={180} height={55} priority className="h-12 w-auto" />
        <h1 className="mt-6 text-2xl font-bold text-slate-950">Portal do colaborador</h1>
        <p className="mt-2 text-sm text-slate-600">
          Use o convite recebido do RH no primeiro acesso. Depois disso, entre com seu usuário e senha.
        </p>

        {error ? (
          <div className="mt-4 flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        ) : null}

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-1">
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => onTabChange('invite')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                loginTab === 'invite' ? 'bg-white text-[#17407E] shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Primeiro acesso
            </button>
            <button
              type="button"
              onClick={() => onTabChange('credentials')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                loginTab === 'credentials' ? 'bg-white text-[#17407E] shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Entrar
            </button>
          </div>
        </div>

        <div className="mt-5">
          {loginTab === 'invite' ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-[#17407E]">
                Use este modo apenas no primeiro acesso ao portal.
              </div>
              <label className="block">
                <span className={labelClassName}>CPF</span>
                <input
                  value={inviteLogin.cpf}
                  onChange={(event) => onInviteChange({ ...inviteLogin, cpf: formatCpf(event.target.value) })}
                  className={inputClassName}
                  placeholder="000.000.000-00"
                />
              </label>
              <label className="block">
                <span className={labelClassName}>Data de nascimento</span>
                <input
                  type="date"
                  value={inviteLogin.birthDate}
                  onChange={(event) => onInviteChange({ ...inviteLogin, birthDate: event.target.value })}
                  className={inputClassName}
                />
              </label>
              {!inviteLogin.token ? (
                <label className="block">
                  <span className={labelClassName}>Código do convite</span>
                  <input
                    value={inviteLogin.token}
                    onChange={(event) => onInviteChange({ ...inviteLogin, token: event.target.value })}
                    className={inputClassName}
                    placeholder="Cole o código recebido pelo RH"
                  />
                </label>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                  Convite identificado no link. Confira o CPF e a data de nascimento para continuar.
                </div>
              )}
              <button
                type="button"
                onClick={onInviteSubmit}
                disabled={authenticating || !inviteLogin.token || !inviteLogin.cpf || !inviteLogin.birthDate}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#17407E] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                Continuar
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Depois do primeiro acesso, use aqui o usuário e a senha liberados no portal.
              </div>
              <label className="block">
                <span className={labelClassName}>Usuário ou e-mail</span>
                <input
                  value={credentialLogin.usernameOrEmail}
                  onChange={(event) => onCredentialChange({ ...credentialLogin, usernameOrEmail: event.target.value })}
                  className={inputClassName}
                  placeholder="Seu usuário ou e-mail"
                  autoComplete="username"
                />
              </label>
              <label className="block">
                <span className={labelClassName}>Senha</span>
                <input
                  type="password"
                  value={credentialLogin.password}
                  onChange={(event) => onCredentialChange({ ...credentialLogin, password: event.target.value })}
                  className={inputClassName}
                  placeholder="Digite sua senha"
                  autoComplete="current-password"
                />
              </label>
              <button
                type="button"
                onClick={onCredentialSubmit}
                disabled={authenticating || !credentialLogin.usernameOrEmail.trim() || !credentialLogin.password}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#17407E] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                Entrar
              </button>
              <button type="button" onClick={onHelpOpen} className="inline-flex items-center gap-2 text-sm font-semibold text-[#17407E]">
                <CircleHelp size={15} />
                Preciso de ajuda para acessar
              </button>
            </div>
          )}
        </div>

        {loginTab === 'invite' ? (
          <button type="button" onClick={onHelpOpen} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#17407E]">
            <CircleHelp size={15} />
            Precisa de ajuda?
          </button>
        ) : null}
      </div>
      {helpOpen ? <HelpModal onClose={onHelpClose} /> : null}
    </main>
  );
}

export function PortalShell(props: {
  overview: EmployeePortalOverview;
  progress: number;
  error: string;
  notice: string;
  activeTab: 'cadastro' | 'producao';
  helpOpen: boolean;
  onHelpOpen: () => void;
  onHelpClose: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const { overview, progress, error, notice, activeTab, helpOpen, onHelpOpen, onHelpClose, onLogout, children } = props;
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
              <Image
                src={photoUrl}
                alt={`Foto de ${overview.employee.fullName}`}
                width={48}
                height={48}
                unoptimized
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
            <button type="button" onClick={onHelpOpen} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
              <CircleHelp size={15} />
              Ajuda
            </button>
            <button type="button" onClick={onLogout} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
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

        <div className="mt-5 border-t border-slate-200 pt-4">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <Link
              href="/"
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'cadastro' ? 'bg-white text-[#17407E] shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cadastro e documentos
            </Link>
            <Link
              href="/producao"
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'producao' ? 'bg-white text-[#17407E] shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Produção
            </Link>
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

      {children}
      {helpOpen ? <HelpModal onClose={onHelpClose} /> : null}
    </main>
  );
}
