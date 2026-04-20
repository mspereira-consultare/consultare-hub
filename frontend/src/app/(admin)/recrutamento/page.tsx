'use client';

import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  CircleHelp,
  Download,
  FileText,
  FileUp,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  UserRoundPlus,
  Users,
  X,
} from 'lucide-react';
import { EMPLOYEE_UNIT_LABELS, EMPLOYEE_UNITS, EMPLOYMENT_REGIMES, type EmploymentRegime } from '@/lib/colaboradores/constants';
import { hasPermission } from '@/lib/permissions';
import { RECRUITMENT_JOB_STATUSES, RECRUITMENT_STAGES } from '@/lib/recrutamento/constants';
import type {
  RecruitmentCandidate,
  RecruitmentCandidateStage,
  RecruitmentDashboard,
  RecruitmentJobStatus,
} from '@/lib/recrutamento/types';

type CandidateCreateResponse = RecruitmentDashboard & {
  createdCandidateId?: string;
};

type SessionUser = {
  role?: string;
  permissions?: unknown;
};

type JobFormState = {
  title: string;
  department: string;
  unitName: string;
  employmentRegime: EmploymentRegime;
  ownerName: string;
  notes: string;
};

type CandidateFormState = {
  jobId: string;
  fullName: string;
  cpf: string;
  email: string;
  phone: string;
  source: string;
};

type CandidateDraftState = CandidateFormState & {
  stage: RecruitmentCandidateStage;
  notes: string;
  historyNotes: string;
};

const emptyDashboard: RecruitmentDashboard = {
  jobs: [],
  candidates: [],
  summary: {
    openJobs: 0,
    totalCandidates: 0,
    activeCandidates: 0,
    approvedCandidates: 0,
    convertedCandidates: 0,
  },
};

const initialJobForm: JobFormState = {
  title: '',
  department: '',
  unitName: '',
  employmentRegime: 'CLT',
  ownerName: '',
  notes: '',
};

const initialCandidateForm: CandidateFormState = {
  jobId: '',
  fullName: '',
  cpf: '',
  email: '',
  phone: '',
  source: '',
};

const fieldClassName =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

const textareaClassName =
  'min-h-[88px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

const stageToneMap: Record<RecruitmentCandidateStage, string> = {
  RECEBIDO: 'border-slate-200 bg-slate-50 text-slate-700',
  TRIAGEM: 'border-blue-200 bg-blue-50 text-blue-700',
  ENTREVISTA: 'border-amber-200 bg-amber-50 text-amber-700',
  BANCO: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  APROVADO: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  RECUSADO: 'border-rose-200 bg-rose-50 text-rose-700',
  CONTRATADO: 'border-indigo-200 bg-indigo-50 text-indigo-700',
};

const jobStatusToneMap: Record<RecruitmentJobStatus, string> = {
  OPEN: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  PAUSED: 'border-amber-200 bg-amber-50 text-amber-700',
  CLOSED: 'border-slate-200 bg-slate-50 text-slate-600',
};

const todaySaoPaulo = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const stageLabel = (stage: RecruitmentCandidateStage) => RECRUITMENT_STAGES.find((item) => item.value === stage)?.label || stage;
const jobStatusLabel = (status: RecruitmentJobStatus) => RECRUITMENT_JOB_STATUSES.find((item) => item.value === status)?.label || status;

const formatDateTimeBr = (value: string | null) => {
  if (!value) return 'Não informado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const formatCpf = (value: string | null) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 11) return value || 'CPF não informado';
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

const formatFileSize = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0 KB';
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

const draftFromCandidate = (candidate: RecruitmentCandidate): CandidateDraftState => ({
  jobId: candidate.jobId,
  fullName: candidate.fullName,
  cpf: candidate.cpf || '',
  email: candidate.email || '',
  phone: candidate.phone || '',
  source: candidate.source || '',
  stage: candidate.stage,
  notes: candidate.notes || '',
  historyNotes: '',
});

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String((payload as { error?: unknown })?.error || 'Falha ao carregar dados.'));
  return payload as T;
}

const errorMessage = (error: unknown) => String(error instanceof Error ? error.message : error);

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function StatusBadge({ children, tone }: { children: ReactNode; tone: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>{children}</span>;
}

export default function RecrutamentoPage() {
  const { data: session } = useSession();
  const role = String((session?.user as SessionUser | undefined)?.role || 'OPERADOR');
  const permissions = (session?.user as SessionUser | undefined)?.permissions;
  const canView = hasPermission(permissions, 'recrutamento', 'view', role);
  const canEdit = hasPermission(permissions, 'recrutamento', 'edit', role);
  const canRefresh = hasPermission(permissions, 'recrutamento', 'refresh', role);

  const [dashboard, setDashboard] = useState<RecruitmentDashboard>(emptyDashboard);
  const [jobForm, setJobForm] = useState<JobFormState>(initialJobForm);
  const [candidateForm, setCandidateForm] = useState<CandidateFormState>(initialCandidateForm);
  const [candidateResumeFile, setCandidateResumeFile] = useState<File | null>(null);
  const [candidateResumeInputKey, setCandidateResumeInputKey] = useState(0);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [candidateDraft, setCandidateDraft] = useState<CandidateDraftState | null>(null);
  const [convertAdmissionDate, setConvertAdmissionDate] = useState(todaySaoPaulo());
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedCandidate = useMemo(
    () => dashboard.candidates.find((candidate) => candidate.id === selectedCandidateId) || null,
    [dashboard.candidates, selectedCandidateId],
  );

  const openJobs = useMemo(() => dashboard.jobs.filter((job) => job.status === 'OPEN'), [dashboard.jobs]);
  const jobsById = useMemo(() => new Map(dashboard.jobs.map((job) => [job.id, job])), [dashboard.jobs]);

  const loadData = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');
    try {
      const payload = await fetchJson<{ status: string; data: RecruitmentDashboard }>('/api/admin/recrutamento');
      setDashboard(payload.data || emptyDashboard);
      const firstJobId = payload.data?.jobs?.[0]?.id || '';
      if (firstJobId) {
        setCandidateForm((current) => ({ ...current, jobId: current.jobId || firstJobId }));
      }
    } catch (fetchError: unknown) {
      setError(errorMessage(fetchError));
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void Promise.resolve()
      .then(() => loadData())
      .catch((fetchError) => setError(errorMessage(fetchError)));
  }, [loadData]);

  const closeCandidate = useCallback(() => {
    setSelectedCandidateId('');
    setCandidateDraft(null);
    setUploadFile(null);
  }, []);

  const openCandidate = (candidate: RecruitmentCandidate) => {
    setSelectedCandidateId(candidate.id);
    setCandidateDraft(draftFromCandidate(candidate));
    setConvertAdmissionDate(todaySaoPaulo());
    setUploadFile(null);
  };

  useEffect(() => {
    if (!selectedCandidateId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCandidate();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeCandidate, selectedCandidateId]);

  const applyDashboard = (next: RecruitmentDashboard) => {
    setDashboard(next || emptyDashboard);
    if (selectedCandidateId && !next.candidates.some((candidate) => candidate.id === selectedCandidateId)) {
      closeCandidate();
    }
  };

  const handleCreateJob = async (event: FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    setSaving('job');
    setError('');
    setNotice('');
    try {
      const payload = await fetchJson<{ status: string; data: RecruitmentDashboard }>('/api/admin/recrutamento/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jobForm),
      });
      applyDashboard(payload.data);
      setJobForm(initialJobForm);
      setNotice('Vaga cadastrada para acompanhamento do RH.');
    } catch (fetchError: unknown) {
      setError(errorMessage(fetchError));
    } finally {
      setSaving('');
    }
  };

  const handleCreateCandidate = async (event: FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    setSaving('candidate');
    setError('');
    setNotice('');
    try {
      const payload = await fetchJson<{ status: string; data: CandidateCreateResponse }>('/api/admin/recrutamento/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidateForm),
      });
      applyDashboard(payload.data);
      let uploadedResume = false;
      let resumeWarning = '';

      if (candidateResumeFile && payload.data.createdCandidateId) {
        const formData = new FormData();
        formData.append('file', candidateResumeFile);
        try {
          const uploadPayload = await fetchJson<{ status: string; data: RecruitmentDashboard }>(
            `/api/admin/recrutamento/candidates/${encodeURIComponent(payload.data.createdCandidateId)}/files`,
            { method: 'POST', body: formData },
          );
          applyDashboard(uploadPayload.data);
          uploadedResume = true;
        } catch (uploadError: unknown) {
          resumeWarning = `Candidato cadastrado, mas não foi possível anexar o currículo automaticamente: ${errorMessage(uploadError)}`;
        }
      } else if (candidateResumeFile) {
        resumeWarning = 'Candidato cadastrado, mas o currículo não foi anexado automaticamente. Abra os detalhes do candidato para anexar o arquivo.';
      }

      setCandidateForm({ ...initialCandidateForm, jobId: candidateForm.jobId });
      setCandidateResumeFile(null);
      setCandidateResumeInputKey((current) => current + 1);
      setNotice(uploadedResume ? 'Candidato cadastrado com currículo anexado.' : 'Candidato cadastrado no funil.');
      if (resumeWarning) setError(resumeWarning);
    } catch (fetchError: unknown) {
      setError(errorMessage(fetchError));
    } finally {
      setSaving('');
    }
  };

  const updateJobStatus = async (jobId: string, status: RecruitmentJobStatus) => {
    if (!canEdit) return;
    setSaving(`job-${jobId}`);
    setError('');
    setNotice('');
    try {
      const payload = await fetchJson<{ status: string; data: RecruitmentDashboard }>(`/api/admin/recrutamento/jobs/${encodeURIComponent(jobId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      applyDashboard(payload.data);
    } catch (fetchError: unknown) {
      setError(errorMessage(fetchError));
    } finally {
      setSaving('');
    }
  };

  const saveCandidate = async () => {
    if (!canEdit || !selectedCandidate || !candidateDraft) return;
    setSaving('candidate-detail');
    setError('');
    setNotice('');
    try {
      const payload = await fetchJson<{ status: string; data: RecruitmentDashboard }>(
        `/api/admin/recrutamento/candidates/${encodeURIComponent(selectedCandidate.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(candidateDraft),
        },
      );
      applyDashboard(payload.data);
      setNotice('Candidato atualizado.');
    } catch (fetchError: unknown) {
      setError(errorMessage(fetchError));
    } finally {
      setSaving('');
    }
  };

  const uploadCandidateFile = async () => {
    if (!canEdit || !selectedCandidate || !uploadFile) return;
    setSaving('candidate-file');
    setError('');
    setNotice('');
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      const payload = await fetchJson<{ status: string; data: RecruitmentDashboard }>(
        `/api/admin/recrutamento/candidates/${encodeURIComponent(selectedCandidate.id)}/files`,
        { method: 'POST', body: formData },
      );
      applyDashboard(payload.data);
      setUploadFile(null);
      setNotice('Arquivo anexado ao candidato.');
    } catch (fetchError: unknown) {
      setError(errorMessage(fetchError));
    } finally {
      setSaving('');
    }
  };

  const convertCandidate = async () => {
    if (!canEdit || !selectedCandidate) return;
    const confirmed = window.confirm('Converter este candidato em pré-admissão no cadastro oficial de colaboradores? O CPF/e-mail será validado para evitar duplicidade.');
    if (!confirmed) return;
    setSaving('candidate-convert');
    setError('');
    setNotice('');
    try {
      const payload = await fetchJson<{ status: string; data: RecruitmentDashboard }>(
        `/api/admin/recrutamento/candidates/${encodeURIComponent(selectedCandidate.id)}/convert`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ admissionDate: convertAdmissionDate }),
        },
      );
      applyDashboard(payload.data);
      setNotice('Candidato convertido em pré-admissão no cadastro de colaboradores.');
    } catch (fetchError: unknown) {
      setError(errorMessage(fetchError));
    } finally {
      setSaving('');
    }
  };

  if (!canView) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5" />
            <div>
              <h1 className="text-lg font-semibold">Sem permissão para acessar recrutamento</h1>
              <p className="mt-1 text-sm">Se precisar, ajuste a permissão de recrutamento para esse usuário.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="rounded-xl bg-blue-900 p-3 text-white shadow-md">
              <Briefcase size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Recrutamento</h1>
              <p className="mt-1 text-xs text-slate-500">
                Acompanhe vagas, candidatos, anexos e conversão para pré-admissão sem duplicar o cadastro oficial de colaboradores.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:ml-auto lg:max-w-[660px] lg:justify-end">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <CircleHelp size={16} /> Como funciona
            </button>
            {canRefresh ? (
              <button
                type="button"
                onClick={() => loadData()}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                Atualizar
              </button>
            ) : null}
            {canEdit ? (
              <a href="#novo-candidato" className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-semibold text-white">
                <Plus size={16} /> Novo candidato
              </a>
            ) : null}
          </div>
        </div>
      </section>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={16} />
          {notice}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Vagas abertas" value={dashboard.summary.openJobs} helper="Status aberto" />
        <SummaryCard label="Candidatos" value={dashboard.summary.totalCandidates} helper="No funil atual" />
        <SummaryCard label="Em andamento" value={dashboard.summary.activeCandidates} helper="Sem recusados/contratados" />
        <SummaryCard label="Aprovados" value={dashboard.summary.approvedCandidates} helper="Prontos para converter" />
        <SummaryCard label="Convertidos" value={dashboard.summary.convertedCandidates} helper="Já viraram pré-admissão" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,0.65fr)]">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Vagas acompanhadas</h2>
              <p className="mt-1 text-xs text-slate-500">Cada candidato nasce vinculado a uma vaga para manter o funil auditável.</p>
            </div>
            <Briefcase className="h-5 w-5 text-slate-400" />
          </div>
          <div className="divide-y divide-slate-100">
            {dashboard.jobs.length ? (
              dashboard.jobs.map((job) => (
                <div key={job.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-800">{job.title}</p>
                      <StatusBadge tone={jobStatusToneMap[job.status]}>{jobStatusLabel(job.status)}</StatusBadge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {job.department || 'Setor não informado'} · {job.unitName ? EMPLOYEE_UNIT_LABELS[job.unitName as keyof typeof EMPLOYEE_UNIT_LABELS] || job.unitName : 'Unidade não informada'} · {job.employmentRegime}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {job.totalCandidates} candidato(s), {job.activeCandidates} em andamento · Responsável: {job.ownerName || 'não informado'}
                    </p>
                  </div>
                  {canEdit ? (
                    <select
                      value={job.status}
                      onChange={(event) => updateJobStatus(job.id, event.target.value as RecruitmentJobStatus)}
                      disabled={saving === `job-${job.id}`}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-[#17407E] focus:ring-2 focus:ring-blue-100"
                    >
                      {RECRUITMENT_JOB_STATUSES.map((status) => (
                        <option key={status.value} value={status.value}>{status.label}</option>
                      ))}
                    </select>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="px-5 py-8 text-sm text-slate-500">Nenhuma vaga cadastrada ainda. Cadastre a primeira vaga para liberar o funil de candidatos.</div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {canEdit ? (
            <form onSubmit={handleCreateJob} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-slate-800">Nova vaga</h2>
                <p className="mt-1 text-xs text-slate-500">Crie a vaga antes de cadastrar candidatos para manter o histórico organizado.</p>
              </div>
              <div className="space-y-3">
                <Field label="Título da vaga">
                  <input value={jobForm.title} onChange={(event) => setJobForm((current) => ({ ...current, title: event.target.value }))} className={fieldClassName} placeholder="Ex.: Recepcionista" />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Setor">
                    <input value={jobForm.department} onChange={(event) => setJobForm((current) => ({ ...current, department: event.target.value }))} className={fieldClassName} placeholder="RH, Operação..." />
                  </Field>
                  <Field label="Regime">
                    <select value={jobForm.employmentRegime} onChange={(event) => setJobForm((current) => ({ ...current, employmentRegime: event.target.value as EmploymentRegime }))} className={fieldClassName}>
                      {EMPLOYMENT_REGIMES.map((regime) => <option key={regime.value} value={regime.value}>{regime.label}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Unidade">
                  <select value={jobForm.unitName} onChange={(event) => setJobForm((current) => ({ ...current, unitName: event.target.value }))} className={fieldClassName}>
                    <option value="">Não informada</option>
                    {EMPLOYEE_UNITS.map((unit) => <option key={unit} value={unit}>{EMPLOYEE_UNIT_LABELS[unit]}</option>)}
                  </select>
                </Field>
                <Field label="Responsável">
                  <input value={jobForm.ownerName} onChange={(event) => setJobForm((current) => ({ ...current, ownerName: event.target.value }))} className={fieldClassName} placeholder="Pessoa responsável" />
                </Field>
                <Field label="Observações">
                  <textarea value={jobForm.notes} onChange={(event) => setJobForm((current) => ({ ...current, notes: event.target.value }))} className={textareaClassName} placeholder="Contexto rápido da vaga" />
                </Field>
                <button type="submit" disabled={saving === 'job'} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                  {saving === 'job' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Criar vaga
                </button>
              </div>
            </form>
          ) : null}

          {canEdit ? (
            <form id="novo-candidato" onSubmit={handleCreateCandidate} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-slate-800">Novo candidato</h2>
                <p className="mt-1 text-xs text-slate-500">Use esta área para pessoas já recebidas no processo seletivo.</p>
              </div>
              <div className="space-y-3">
                <Field label="Vaga">
                  <select value={candidateForm.jobId} onChange={(event) => setCandidateForm((current) => ({ ...current, jobId: event.target.value }))} className={fieldClassName} disabled={!dashboard.jobs.length}>
                    <option value="">Selecione</option>
                    {(openJobs.length ? openJobs : dashboard.jobs).map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
                  </select>
                </Field>
                <Field label="Nome completo">
                  <input value={candidateForm.fullName} onChange={(event) => setCandidateForm((current) => ({ ...current, fullName: event.target.value }))} className={fieldClassName} placeholder="Nome do candidato" />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="CPF">
                    <input value={candidateForm.cpf} onChange={(event) => setCandidateForm((current) => ({ ...current, cpf: event.target.value }))} className={fieldClassName} placeholder="Opcional até aprovar" />
                  </Field>
                  <Field label="Telefone">
                    <input value={candidateForm.phone} onChange={(event) => setCandidateForm((current) => ({ ...current, phone: event.target.value }))} className={fieldClassName} placeholder="Contato" />
                  </Field>
                </div>
                <Field label="E-mail">
                  <input value={candidateForm.email} onChange={(event) => setCandidateForm((current) => ({ ...current, email: event.target.value }))} className={fieldClassName} placeholder="email@exemplo.com" />
                </Field>
                <Field label="Origem">
                  <input value={candidateForm.source} onChange={(event) => setCandidateForm((current) => ({ ...current, source: event.target.value }))} className={fieldClassName} placeholder="Indicação, banco, site..." />
                </Field>
                <Field label="Currículo">
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-3">
                    <input
                      key={candidateResumeInputKey}
                      type="file"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={(event) => setCandidateResumeFile(event.target.files?.[0] || null)}
                      className="w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-700"
                    />
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      Anexe o CV já no cadastro. Ele ficará no processo seletivo e poderá ser usado futuramente para análise de aderência com IA.
                    </p>
                  </div>
                </Field>
                <button type="submit" disabled={saving === 'candidate' || !dashboard.jobs.length} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                  {saving === 'candidate' ? <Loader2 size={16} className="animate-spin" /> : <UserRoundPlus size={16} />}
                  Cadastrar candidato
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Funil de candidatos</h2>
            <p className="mt-1 text-xs text-slate-500">Arraste mentalmente por enquanto: a mudança de etapa acontece no modal de detalhes para preservar histórico.</p>
          </div>
          {loading ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : null}
        </div>
        <div className="grid gap-4 overflow-x-auto p-5 xl:grid-cols-7">
          {RECRUITMENT_STAGES.map((stage) => {
            const items = dashboard.candidates.filter((candidate) => candidate.stage === stage.value);
            return (
              <div key={stage.value} className="min-w-[240px] rounded-xl border border-slate-200 bg-slate-50/70">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-3">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{stage.label}</h3>
                    <p className="mt-1 text-xs text-slate-400">{items.length} candidato(s)</p>
                  </div>
                  <StatusBadge tone={stageToneMap[stage.value]}>{items.length}</StatusBadge>
                </div>
                <div className="space-y-3 p-3">
                  {items.length ? (
                    items.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => openCandidate(candidate)}
                        className="block w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-[#17407E]/40 hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-800">{candidate.fullName}</p>
                            <p className="mt-1 truncate text-xs text-slate-500">{candidate.jobTitle}</p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-slate-300" />
                        </div>
                        <div className="mt-3 space-y-1 text-xs text-slate-500">
                          <p>{formatCpf(candidate.cpf)}</p>
                          <p className="truncate">{candidate.email || candidate.phone || 'Contato não informado'}</p>
                          <p>{candidate.files.length} anexo(s) · {candidate.history.length} movimentação(ões)</p>
                        </div>
                        {candidate.convertedEmployeeId ? (
                          <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700">
                            Pré-admissão criada
                          </div>
                        ) : null}
                      </button>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-400">Sem candidatos nesta etapa.</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {selectedCandidate && candidateDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={closeCandidate}>
          <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <StatusBadge tone={stageToneMap[selectedCandidate.stage]}>{stageLabel(selectedCandidate.stage)}</StatusBadge>
                  {selectedCandidate.convertedEmployeeId ? <StatusBadge tone="border-indigo-200 bg-indigo-50 text-indigo-700">Cadastro oficial criado</StatusBadge> : null}
                </div>
                <h2 className="text-lg font-bold text-slate-800">{selectedCandidate.fullName}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {formatCpf(selectedCandidate.cpf)} · {selectedCandidate.email || 'E-mail não informado'} · {selectedCandidate.phone || 'Telefone não informado'}
                </p>
              </div>
              <button type="button" onClick={closeCandidate} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[calc(92vh-88px)] overflow-y-auto p-5">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
                <div className="space-y-5">
                  <section className="rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="text-sm font-semibold text-slate-800">Dados do candidato</h3>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <Field label="Vaga">
                        <select value={candidateDraft.jobId} onChange={(event) => setCandidateDraft((current) => current ? ({ ...current, jobId: event.target.value }) : current)} className={fieldClassName} disabled={!canEdit}>
                          {dashboard.jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
                        </select>
                      </Field>
                      <Field label="Etapa">
                        <select value={candidateDraft.stage} onChange={(event) => setCandidateDraft((current) => current ? ({ ...current, stage: event.target.value as RecruitmentCandidateStage }) : current)} className={fieldClassName} disabled={!canEdit}>
                          {RECRUITMENT_STAGES.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
                        </select>
                      </Field>
                      <Field label="Nome completo">
                        <input value={candidateDraft.fullName} onChange={(event) => setCandidateDraft((current) => current ? ({ ...current, fullName: event.target.value }) : current)} className={fieldClassName} disabled={!canEdit} />
                      </Field>
                      <Field label="CPF">
                        <input value={candidateDraft.cpf} onChange={(event) => setCandidateDraft((current) => current ? ({ ...current, cpf: event.target.value }) : current)} className={fieldClassName} disabled={!canEdit || Boolean(selectedCandidate.convertedEmployeeId)} />
                      </Field>
                      <Field label="E-mail">
                        <input value={candidateDraft.email} onChange={(event) => setCandidateDraft((current) => current ? ({ ...current, email: event.target.value }) : current)} className={fieldClassName} disabled={!canEdit || Boolean(selectedCandidate.convertedEmployeeId)} />
                      </Field>
                      <Field label="Telefone">
                        <input value={candidateDraft.phone} onChange={(event) => setCandidateDraft((current) => current ? ({ ...current, phone: event.target.value }) : current)} className={fieldClassName} disabled={!canEdit} />
                      </Field>
                      <Field label="Origem">
                        <input value={candidateDraft.source} onChange={(event) => setCandidateDraft((current) => current ? ({ ...current, source: event.target.value }) : current)} className={fieldClassName} disabled={!canEdit} />
                      </Field>
                      <Field label="Motivo da movimentação">
                        <input value={candidateDraft.historyNotes} onChange={(event) => setCandidateDraft((current) => current ? ({ ...current, historyNotes: event.target.value }) : current)} className={fieldClassName} disabled={!canEdit} placeholder="Opcional, entra no histórico" />
                      </Field>
                      <div className="md:col-span-2">
                        <Field label="Observações">
                          <textarea value={candidateDraft.notes} onChange={(event) => setCandidateDraft((current) => current ? ({ ...current, notes: event.target.value }) : current)} className={textareaClassName} disabled={!canEdit} />
                        </Field>
                      </div>
                    </div>
                    {canEdit ? (
                      <div className="mt-4 flex justify-end">
                        <button type="button" onClick={saveCandidate} disabled={saving === 'candidate-detail'} className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                          {saving === 'candidate-detail' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                          Salvar alterações
                        </button>
                      </div>
                    ) : null}
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="text-sm font-semibold text-slate-800">Anexos do candidato</h3>
                    <p className="mt-1 text-xs text-slate-500">Currículo e arquivos de apoio ficam no processo seletivo. Documentos admissionais continuam no cadastro oficial.</p>
                    {canEdit ? (
                      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center">
                        <input type="file" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} className="min-w-0 flex-1 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-700" />
                        <button type="button" onClick={uploadCandidateFile} disabled={!uploadFile || saving === 'candidate-file'} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60">
                          {saving === 'candidate-file' ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
                          Anexar
                        </button>
                      </div>
                    ) : null}
                    <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
                      {selectedCandidate.files.length ? (
                        selectedCandidate.files.map((file) => (
                          <div key={file.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-800">{file.originalName}</p>
                              <p className="text-xs text-slate-500">{formatFileSize(file.sizeBytes)} · {formatDateTimeBr(file.createdAt)}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => window.open(`/api/admin/recrutamento/files/${encodeURIComponent(file.id)}/download?inline=1`, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
                                <FileText size={12} /> Ver
                              </button>
                              <button type="button" onClick={() => window.open(`/api/admin/recrutamento/files/${encodeURIComponent(file.id)}/download`, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
                                <Download size={12} /> Baixar
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-6 text-center text-sm text-slate-500">Nenhum anexo cadastrado para este candidato.</div>
                      )}
                    </div>
                  </section>
                </div>

                <div className="space-y-5">
                  <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <h3 className="text-sm font-semibold text-slate-800">Conversão para colaborador</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Ao aprovar, converta para pré-admissão. O cadastro oficial passa a ser a fonte da verdade para documentos, benefícios e folha.
                    </p>
                    <div className="mt-4 space-y-3">
                      <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
                        Vaga: <span className="font-semibold text-slate-800">{jobsById.get(selectedCandidate.jobId)?.title || selectedCandidate.jobTitle}</span>
                      </div>
                      {selectedCandidate.convertedEmployeeId ? (
                        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-700">
                          Este candidato já foi convertido em pré-admissão no cadastro oficial.
                        </div>
                      ) : selectedCandidate.stage === 'APROVADO' ? (
                        <>
                          <Field label="Data prevista de admissão">
                            <input type="date" value={convertAdmissionDate} onChange={(event) => setConvertAdmissionDate(event.target.value)} className={fieldClassName} disabled={!canEdit} />
                          </Field>
                          {canEdit ? (
                            <button type="button" onClick={convertCandidate} disabled={saving === 'candidate-convert'} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                              {saving === 'candidate-convert' ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />}
                              Converter em pré-admissão
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                          Mova o candidato para “Aprovado” antes de converter para colaborador.
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="text-sm font-semibold text-slate-800">Histórico de movimentações</h3>
                    <div className="mt-4 space-y-3">
                      {selectedCandidate.history.length ? (
                        selectedCandidate.history.map((item) => (
                          <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{item.action.replace(/_/g, ' ')}</span>
                              {item.toStage ? <StatusBadge tone={stageToneMap[item.toStage]}>{stageLabel(item.toStage)}</StatusBadge> : null}
                            </div>
                            {item.notes ? <p className="mt-1 text-xs text-slate-600">{item.notes}</p> : null}
                            <p className="mt-1 text-[11px] text-slate-400">{formatDateTimeBr(item.createdAt)}</p>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">Sem histórico registrado.</div>
                      )}
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <RecruitmentHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

function SummaryCard({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-bold text-slate-800">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{helper}</div>
    </div>
  );
}

function RecruitmentHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Como usar o recrutamento</h2>
            <p className="mt-1 text-sm text-slate-500">Fluxo simples para acompanhar candidatos até a pré-admissão oficial.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[calc(90vh-84px)] overflow-y-auto p-5">
          <div className="space-y-4">
            <HelpStep title="1. Cadastre a vaga">
              Informe o título, setor, unidade, regime e responsável. A vaga serve como eixo do funil e ajuda o RH a entender para qual posição cada candidato está sendo avaliado.
            </HelpStep>
            <HelpStep title="2. Cadastre o candidato">
              Vincule a pessoa a uma vaga, preencha os contatos principais e, se já tiver o arquivo, anexe o currículo no próprio cadastro. CPF e e-mail ajudam a evitar duplicidade, mas o CPF pode ser completado antes da conversão.
            </HelpStep>
            <HelpStep title="3. Use o funil para acompanhar etapas">
              Abra o card do candidato para mudar entre recebido, triagem, entrevista, banco, aprovado, recusado ou contratado. Cada mudança fica registrada no histórico.
            </HelpStep>
            <HelpStep title="4. Anexe currículo e arquivos de apoio">
              Os anexos desta tela são do processo seletivo e ficam disponíveis para consulta do RH. Essa base também prepara a evolução futura de análise de currículo com IA contra a descrição da vaga. Documentos admissionais oficiais continuam sendo controlados no cadastro de colaboradores após a conversão.
            </HelpStep>
            <HelpStep title="5. Converta aprovado em pré-admissão">
              Quando o candidato estiver aprovado, use a conversão para criar o rascunho no cadastro oficial. A partir daí, colaboradores passa a ser a fonte da verdade para documentos, benefícios, folha e processos de admissão.
            </HelpStep>
          </div>
        </div>
      </div>
    </div>
  );
}

function HelpStep({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{children}</p>
    </div>
  );
}
