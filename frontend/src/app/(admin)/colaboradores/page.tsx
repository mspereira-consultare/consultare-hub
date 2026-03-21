'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  AlertCircle,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  Edit3,
  FileDown,
  FileText,
  FileUp,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Shirt,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import { hasPermission } from '@/lib/permissions';
import {
  ASO_STATUSES,
  EDUCATION_LEVELS,
  EMPLOYEE_DOCUMENT_TYPES,
  EMPLOYEE_STATUSES,
  EMPLOYEE_UNIT_LABELS,
  EMPLOYEE_UNITS,
  EMPLOYMENT_REGIMES,
  LIFE_INSURANCE_STATUSES,
  MARITAL_STATUSES,
  UNIFORM_DELIVERY_TYPES,
  UNIFORM_ITEM_STATUSES,
  type EmployeeDocumentTypeCode,
  type EmployeeStatus,
  type EmploymentRegime,
} from '@/lib/colaboradores/constants';
import {
  computeAsoStatus,
  computeDocumentProgress,
  computeMissingDocuments,
  getDocumentTypeLabel,
} from '@/lib/colaboradores/status';
import type {
  EmployeeDocument,
  EmployeeListItem,
  EmployeeRecessPeriod,
  EmployeeUniformItem,
} from '@/lib/colaboradores/types';

type SessionUser = {
  role?: string;
  permissions?: unknown;
};

type SelectOption = { value: string; label: string };
type DocumentOption = SelectOption & { hasIssueDate?: boolean; hasExpiration?: boolean; optional?: boolean };

type EmployeesOptionsPayload = {
  units: SelectOption[];
  regimes: SelectOption[];
  statuses: SelectOption[];
  asoStatuses: SelectOption[];
  maritalStatuses: SelectOption[];
  lifeInsuranceStatuses: SelectOption[];
  uniformDeliveryTypes: SelectOption[];
  uniformItemStatuses: SelectOption[];
  documentTypes: DocumentOption[];
  supervisors: string[];
  departments: string[];
  jobTitles: string[];
  costCenters: string[];
  defaultPageSize: number;
  maxPageSize: number;
};

type PaginationPayload = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type EmployeeFormState = {
  fullName: string;
  employmentRegime: EmploymentRegime;
  status: EmployeeStatus;
  rg: string;
  cpf: string;
  email: string;
  phone: string;
  birthDate: string;
  street: string;
  streetNumber: string;
  addressComplement: string;
  district: string;
  city: string;
  stateUf: string;
  zipCode: string;
  educationInstitution: string;
  educationLevel: string;
  courseName: string;
  currentSemester: string;
  workSchedule: string;
  salaryAmount: string;
  contractDurationText: string;
  admissionDate: string;
  contractEndDate: string;
  terminationDate: string;
  terminationReason: string;
  terminationNotes: string;
  units: string[];
  jobTitle: string;
  department: string;
  supervisorName: string;
  costCenter: string;
  insalubrityPercent: string;
  transportVoucherPerDay: string;
  mealVoucherPerDay: string;
  lifeInsuranceStatus: string;
  maritalStatus: string;
  hasChildren: boolean;
  childrenCount: string;
  bankName: string;
  bankAgency: string;
  bankAccount: string;
  pixKey: string;
};

type UniformFormState = {
  withdrawalDate: string;
  itemDescription: string;
  quantity: string;
  signedReceipt: boolean;
  deliveryType: string;
  deliveredBy: string;
  status: string;
};

type RecessFormState = {
  acquisitionStartDate: string;
  acquisitionEndDate: string;
  daysDue: string;
  daysPaid: string;
  leaveDeadlineDate: string;
  vacationStartDate: string;
  vacationDurationDays: string;
  sellTenDays: boolean;
  thirteenthOnVacation: boolean;
};

type PendingUpload = {
  localId: string;
  file: File;
  docType: EmployeeDocumentTypeCode;
  issueDate: string;
  expiresAt: string;
  notes: string;
};

type ModalTab = 'cadastro' | 'beneficios' | 'uniforme' | 'recesso' | 'documentos';

type FiltersState = {
  search: string;
  status: 'all' | EmployeeStatus;
  regime: 'all' | EmploymentRegime;
  unit: string;
  asoStatus: 'all' | 'PENDENTE' | 'OK' | 'VENCENDO' | 'VENCIDO';
  pendencyStatus: 'all' | 'pending' | 'complete';
};

const filterInputClassName =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200';
const sectionClassName = 'rounded-xl border border-slate-200 bg-slate-50/70 p-4';
const fieldLabelClassName = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500';
const pageSize = 20;

const emptyOptions: EmployeesOptionsPayload = {
  units: EMPLOYEE_UNITS.map((value) => ({ value, label: EMPLOYEE_UNIT_LABELS[value] })),
  regimes: EMPLOYMENT_REGIMES,
  statuses: EMPLOYEE_STATUSES,
  asoStatuses: ASO_STATUSES,
  maritalStatuses: MARITAL_STATUSES,
  lifeInsuranceStatuses: LIFE_INSURANCE_STATUSES,
  uniformDeliveryTypes: UNIFORM_DELIVERY_TYPES,
  uniformItemStatuses: UNIFORM_ITEM_STATUSES,
  documentTypes: EMPLOYEE_DOCUMENT_TYPES.map((item) => ({
    value: item.code,
    label: item.label,
    hasIssueDate: item.hasIssueDate,
    hasExpiration: item.hasExpiration,
    optional: item.optional,
  })),
  supervisors: [],
  departments: [],
  jobTitles: [],
  costCenters: [],
  defaultPageSize: 20,
  maxPageSize: 100,
};

const emptyFilters = (): FiltersState => ({
  search: '',
  status: 'all',
  regime: 'all',
  unit: 'all',
  asoStatus: 'all',
  pendencyStatus: 'all',
});

const emptyEmployeeForm = (): EmployeeFormState => ({
  fullName: '',
  employmentRegime: 'CLT',
  status: 'ATIVO',
  rg: '',
  cpf: '',
  email: '',
  phone: '',
  birthDate: '',
  street: '',
  streetNumber: '',
  addressComplement: '',
  district: '',
  city: '',
  stateUf: 'SP',
  zipCode: '',
  educationInstitution: '',
  educationLevel: '',
  courseName: '',
  currentSemester: '',
  workSchedule: '',
  salaryAmount: '',
  contractDurationText: '',
  admissionDate: '',
  contractEndDate: '',
  terminationDate: '',
  terminationReason: '',
  terminationNotes: '',
  units: [],
  jobTitle: '',
  department: '',
  supervisorName: '',
  costCenter: '',
  insalubrityPercent: '',
  transportVoucherPerDay: '',
  mealVoucherPerDay: '',
  lifeInsuranceStatus: 'INATIVO',
  maritalStatus: '',
  hasChildren: false,
  childrenCount: '0',
  bankName: '',
  bankAgency: '',
  bankAccount: '',
  pixKey: '',
});

const emptyUniformForm = (): UniformFormState => ({
  withdrawalDate: '',
  itemDescription: '',
  quantity: '1',
  signedReceipt: false,
  deliveryType: 'PRIMEIRA_ENTREGA',
  deliveredBy: '',
  status: 'ATIVO',
});

const emptyRecessForm = (): RecessFormState => ({
  acquisitionStartDate: '',
  acquisitionEndDate: '',
  daysDue: '0',
  daysPaid: '0',
  leaveDeadlineDate: '',
  vacationStartDate: '',
  vacationDurationDays: '0',
  sellTenDays: false,
  thirteenthOnVacation: false,
});

const formatDateBr = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '-';
  return `${match[3]}/${match[2]}/${match[1]}`;
};

const formatDateTime = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 19).replace('T', ' ');
  return raw;
};

const formatCpf = (value: string | null | undefined) => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
};

const formatPhone = (value: string | null | undefined) => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const formatFilesize = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const parseNumericInput = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return raw;
};

const mapEmployeeToForm = (employee: EmployeeListItem): EmployeeFormState => ({
  fullName: employee.fullName || '',
  employmentRegime: employee.employmentRegime,
  status: employee.status,
  rg: employee.rg || '',
  cpf: formatCpf(employee.cpf || ''),
  email: employee.email || '',
  phone: formatPhone(employee.phone || ''),
  birthDate: employee.birthDate || '',
  street: employee.street || '',
  streetNumber: employee.streetNumber || '',
  addressComplement: employee.addressComplement || '',
  district: employee.district || '',
  city: employee.city || '',
  stateUf: employee.stateUf || 'SP',
  zipCode: employee.zipCode || '',
  educationInstitution: employee.educationInstitution || '',
  educationLevel: employee.educationLevel || '',
  courseName: employee.courseName || '',
  currentSemester: employee.currentSemester || '',
  workSchedule: employee.workSchedule || '',
  salaryAmount: employee.salaryAmount === null ? '' : String(employee.salaryAmount),
  contractDurationText: employee.contractDurationText || '',
  admissionDate: employee.admissionDate || '',
  contractEndDate: employee.contractEndDate || '',
  terminationDate: employee.terminationDate || '',
  terminationReason: employee.terminationReason || '',
  terminationNotes: employee.terminationNotes || '',
  units: employee.units || [],
  jobTitle: employee.jobTitle || '',
  department: employee.department || '',
  supervisorName: employee.supervisorName || '',
  costCenter: employee.costCenter || '',
  insalubrityPercent: employee.insalubrityPercent === null ? '' : String(employee.insalubrityPercent),
  transportVoucherPerDay: employee.transportVoucherPerDay === null ? '' : String(employee.transportVoucherPerDay),
  mealVoucherPerDay: employee.mealVoucherPerDay === null ? '' : String(employee.mealVoucherPerDay),
  lifeInsuranceStatus: employee.lifeInsuranceStatus || 'INATIVO',
  maritalStatus: employee.maritalStatus || '',
  hasChildren: Boolean(employee.hasChildren),
  childrenCount: String(employee.childrenCount || 0),
  bankName: employee.bankName || '',
  bankAgency: employee.bankAgency || '',
  bankAccount: employee.bankAccount || '',
  pixKey: employee.pixKey || '',
});

const mapAsoBadge = (status: string) => {
  switch (status) {
    case 'OK':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'VENCENDO':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'VENCIDO':
      return 'bg-rose-100 text-rose-700 border-rose-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

const mapStatusBadge = (status: EmployeeStatus) =>
  status === 'ATIVO'
    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : 'bg-rose-100 text-rose-700 border-rose-200';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((payload as { error?: unknown }).error || 'Falha ao carregar dados.'));
  }
  return payload as T;
}

function SectionCard({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: typeof UserRound;
  children: React.ReactNode;
}) {
  return (
    <div className={sectionClassName}>
      <div className="mb-4 flex items-start gap-3 border-b border-slate-200 pb-3">
        {Icon ? (
          <div className="rounded-lg bg-white p-2 text-slate-600 shadow-sm ring-1 ring-slate-200">
            <Icon size={18} />
          </div>
        ) : null}
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

function TabButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-1.5 text-sm transition ${active ? 'border border-slate-200 bg-white text-slate-900 shadow-sm' : 'text-slate-600'} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      {children}
    </button>
  );
}

export default function ColaboradoresPage() {
  const { data: session } = useSession();
  const sessionUser = (session?.user || {}) as SessionUser;
  const role = String(sessionUser.role || 'OPERADOR').toUpperCase();
  const canView = hasPermission(sessionUser.permissions, 'colaboradores', 'view', role);
  const canEdit = hasPermission(sessionUser.permissions, 'colaboradores', 'edit', role);
  const canRefresh = hasPermission(sessionUser.permissions, 'colaboradores', 'refresh', role);

  const [filters, setFilters] = useState<FiltersState>(emptyFilters());
  const [appliedFilters, setAppliedFilters] = useState<FiltersState>(emptyFilters());
  const [items, setItems] = useState<EmployeeListItem[]>([]);
  const [pagination, setPagination] = useState<PaginationPayload>({ page: 1, pageSize, total: 0, totalPages: 1 });
  const [options, setOptions] = useState<EmployeesOptionsPayload>(emptyOptions);
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const [modalNotice, setModalNotice] = useState('');
  const [modalTab, setModalTab] = useState<ModalTab>('cadastro');
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);
  const [form, setForm] = useState<EmployeeFormState>(emptyEmployeeForm());
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [uniformItems, setUniformItems] = useState<EmployeeUniformItem[]>([]);
  const [recessItems, setRecessItems] = useState<EmployeeRecessPeriod[]>([]);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [uploadingDocuments, setUploadingDocuments] = useState(false);
  const [uniformForm, setUniformForm] = useState<UniformFormState>(emptyUniformForm());
  const [uniformEditingId, setUniformEditingId] = useState<string | null>(null);
  const [uniformSaving, setUniformSaving] = useState(false);
  const [recessForm, setRecessForm] = useState<RecessFormState>(emptyRecessForm());
  const [recessEditingId, setRecessEditingId] = useState<string | null>(null);
  const [recessSaving, setRecessSaving] = useState(false);

  const filtersApplied = useMemo(
    () =>
      Boolean(
        filters.search ||
          filters.status !== 'all' ||
          filters.regime !== 'all' ||
          filters.unit !== 'all' ||
          filters.asoStatus !== 'all' ||
          filters.pendencyStatus !== 'all'
      ),
    [filters]
  );

  const documentSummary = useMemo(() => {
    const docs = documents.filter((doc) => doc.isActive);
    const progress = computeDocumentProgress(
      {
        employmentRegime: form.employmentRegime,
        maritalStatus: (form.maritalStatus || null) as any,
        hasChildren: form.hasChildren,
      },
      docs
    );
    const missing = computeMissingDocuments(
      {
        employmentRegime: form.employmentRegime,
        maritalStatus: (form.maritalStatus || null) as any,
        hasChildren: form.hasChildren,
      },
      docs
    );
    const aso = computeAsoStatus(docs);
    return { progress, missing, aso };
  }, [documents, form.employmentRegime, form.maritalStatus, form.hasChildren]);

  const buildListQuery = useCallback((pageNumber: number, currentFilters: FiltersState) => {
    const params = new URLSearchParams();
    params.set('page', String(pageNumber));
    params.set('pageSize', String(pageSize));
    if (currentFilters.search.trim()) params.set('search', currentFilters.search.trim());
    if (currentFilters.status !== 'all') params.set('status', currentFilters.status);
    if (currentFilters.regime !== 'all') params.set('regime', currentFilters.regime);
    if (currentFilters.unit !== 'all') params.set('unit', currentFilters.unit);
    if (currentFilters.asoStatus !== 'all') params.set('asoStatus', currentFilters.asoStatus);
    if (currentFilters.pendencyStatus !== 'all') params.set('pendencyStatus', currentFilters.pendencyStatus);
    return params.toString();
  }, []);

  const loadOptions = useCallback(async () => {
    setOptionsLoading(true);
    try {
      const payload = await fetchJson<{ status: string; data: EmployeesOptionsPayload }>('/api/admin/colaboradores/options');
      setOptions(payload.data || emptyOptions);
    } catch (optionsError: any) {
      console.error('Erro ao carregar opcoes de colaboradores:', optionsError);
      setError(optionsError?.message || 'Falha ao carregar opcoes do modulo.');
    } finally {
      setOptionsLoading(false);
    }
  }, []);

  const loadList = useCallback(
    async (pageNumber = pagination.page, currentFilters = appliedFilters) => {
      setLoading(true);
      setError('');
      try {
        const payload = await fetchJson<{ status: string; data: EmployeeListItem[]; pagination: PaginationPayload }>(
          `/api/admin/colaboradores?${buildListQuery(pageNumber, currentFilters)}`
        );
        setItems(payload.data || []);
        setPagination(payload.pagination || { page: pageNumber, pageSize, total: 0, totalPages: 1 });
      } catch (listError: any) {
        console.error('Erro ao carregar colaboradores:', listError);
        setError(listError?.message || 'Falha ao carregar colaboradores.');
      } finally {
        setLoading(false);
      }
    },
    [appliedFilters, buildListQuery, pagination.page]
  );

  const loadEmployeeResources = useCallback(async (employeeId: string) => {
    const [documentsPayload, uniformsPayload, recessPayload] = await Promise.all([
      fetchJson<{ status: string; data: EmployeeDocument[] }>(
        `/api/admin/colaboradores/${encodeURIComponent(employeeId)}/documentos`
      ),
      fetchJson<{ status: string; data: EmployeeUniformItem[] }>(
        `/api/admin/colaboradores/${encodeURIComponent(employeeId)}/uniformes`
      ),
      fetchJson<{ status: string; data: EmployeeRecessPeriod[] }>(
        `/api/admin/colaboradores/${encodeURIComponent(employeeId)}/recessos`
      ),
    ]);

    setDocuments(documentsPayload.data || []);
    setUniformItems(uniformsPayload.data || []);
    setRecessItems(recessPayload.data || []);
  }, []);

  useEffect(() => {
    if (!canView) return;
    loadOptions();
  }, [canView, loadOptions]);

  useEffect(() => {
    if (!canView) return;
    loadList();
  }, [canView, loadList]);

  const resetModalState = () => {
    setCurrentEmployeeId(null);
    setForm(emptyEmployeeForm());
    setDocuments([]);
    setUniformItems([]);
    setRecessItems([]);
    setPendingUploads([]);
    setUniformForm(emptyUniformForm());
    setUniformEditingId(null);
    setRecessForm(emptyRecessForm());
    setRecessEditingId(null);
    setModalError('');
    setModalNotice('');
    setModalTab('cadastro');
  };

  const openCreate = () => {
    resetModalState();
    setIsModalOpen(true);
  };

  const openEdit = async (employeeId: string) => {
    resetModalState();
    setIsModalOpen(true);
    setModalLoading(true);
    try {
      const payload = await fetchJson<{ status: string; data: EmployeeListItem }>(
        `/api/admin/colaboradores/${encodeURIComponent(employeeId)}`
      );
      setCurrentEmployeeId(payload.data.id);
      setForm(mapEmployeeToForm(payload.data));
      await loadEmployeeResources(employeeId);
    } catch (employeeError: any) {
      console.error('Erro ao abrir colaborador:', employeeError);
      setModalError(employeeError?.message || 'Falha ao carregar cadastro do colaborador.');
    } finally {
      setModalLoading(false);
    }
  };

  const currentEmployeeReadOnly = !canEdit;
  const currentDocumentTypes = useMemo(
    () =>
      options.documentTypes && options.documentTypes.length > 0
        ? options.documentTypes
        : EMPLOYEE_DOCUMENT_TYPES.map((item) => ({
            value: item.code,
            label: item.label,
            hasIssueDate: item.hasIssueDate,
            hasExpiration: item.hasExpiration,
            optional: item.optional,
          })),
    [options.documentTypes]
  );

  const submitEmployee = async () => {
    setModalSaving(true);
    setModalError('');
    setModalNotice('');
    try {
      const method = currentEmployeeId ? 'PUT' : 'POST';
      const url = currentEmployeeId
        ? `/api/admin/colaboradores/${encodeURIComponent(currentEmployeeId)}`
        : '/api/admin/colaboradores';

      const payload = {
        ...form,
        cpf: form.cpf,
        phone: form.phone,
        salaryAmount: parseNumericInput(form.salaryAmount),
        insalubrityPercent: parseNumericInput(form.insalubrityPercent),
        transportVoucherPerDay: parseNumericInput(form.transportVoucherPerDay),
        mealVoucherPerDay: parseNumericInput(form.mealVoucherPerDay),
        childrenCount: form.hasChildren ? form.childrenCount : '0',
      };

      const response = await fetchJson<{ status: string; data: EmployeeListItem }>(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const createdNow = !currentEmployeeId;
      setCurrentEmployeeId(response.data.id);
      setForm(mapEmployeeToForm(response.data));
      setModalNotice(
        currentEmployeeId
          ? 'Cadastro atualizado com sucesso.'
          : 'Colaborador criado com sucesso. Agora voce pode registrar documentos, uniforme e recessos.'
      );
      setPagination((prev) => ({ ...prev, page: createdNow ? 1 : prev.page }));
      await loadList(createdNow ? 1 : pagination.page, appliedFilters);
      if (response.data.id) {
        await loadEmployeeResources(response.data.id);
      }
    } catch (saveError: any) {
      console.error('Erro ao salvar colaborador:', saveError);
      setModalError(saveError?.message || 'Falha ao salvar colaborador.');
    } finally {
      setModalSaving(false);
    }
  };

  const submitUniform = async () => {
    if (!currentEmployeeId) return;
    setUniformSaving(true);
    setModalError('');
    try {
      const payload = await fetchJson<{ status: string; data: EmployeeUniformItem[] }>(
        uniformEditingId
          ? `/api/admin/colaboradores/${encodeURIComponent(currentEmployeeId)}/uniformes/${encodeURIComponent(uniformEditingId)}`
          : `/api/admin/colaboradores/${encodeURIComponent(currentEmployeeId)}/uniformes`,
        {
          method: uniformEditingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(uniformForm),
        }
      );
      setUniformItems(payload.data || []);
      setUniformForm(emptyUniformForm());
      setUniformEditingId(null);
      setModalNotice('Registro de uniforme salvo com sucesso.');
    } catch (uniformError: any) {
      console.error('Erro ao salvar uniforme:', uniformError);
      setModalError(uniformError?.message || 'Falha ao salvar uniforme.');
    } finally {
      setUniformSaving(false);
    }
  };

  const deleteUniform = async (entryId: string) => {
    if (!currentEmployeeId || !canEdit) return;
    try {
      const payload = await fetchJson<{ status: string; data: EmployeeUniformItem[] }>(
        `/api/admin/colaboradores/${encodeURIComponent(currentEmployeeId)}/uniformes/${encodeURIComponent(entryId)}`,
        { method: 'DELETE' }
      );
      setUniformItems(payload.data || []);
      setUniformForm(emptyUniformForm());
      setUniformEditingId(null);
      setModalNotice('Registro de uniforme removido.');
    } catch (uniformError: any) {
      setModalError(uniformError?.message || 'Falha ao remover uniforme.');
    }
  };

  const submitRecess = async () => {
    if (!currentEmployeeId) return;
    setRecessSaving(true);
    setModalError('');
    try {
      const payload = await fetchJson<{ status: string; data: EmployeeRecessPeriod[] }>(
        recessEditingId
          ? `/api/admin/colaboradores/${encodeURIComponent(currentEmployeeId)}/recessos/${encodeURIComponent(recessEditingId)}`
          : `/api/admin/colaboradores/${encodeURIComponent(currentEmployeeId)}/recessos`,
        {
          method: recessEditingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(recessForm),
        }
      );
      setRecessItems(payload.data || []);
      setRecessForm(emptyRecessForm());
      setRecessEditingId(null);
      setModalNotice('Periodo de recesso salvo com sucesso.');
    } catch (recessError: any) {
      console.error('Erro ao salvar recesso:', recessError);
      setModalError(recessError?.message || 'Falha ao salvar recesso.');
    } finally {
      setRecessSaving(false);
    }
  };

  const deleteRecess = async (entryId: string) => {
    if (!currentEmployeeId || !canEdit) return;
    try {
      const payload = await fetchJson<{ status: string; data: EmployeeRecessPeriod[] }>(
        `/api/admin/colaboradores/${encodeURIComponent(currentEmployeeId)}/recessos/${encodeURIComponent(entryId)}`,
        { method: 'DELETE' }
      );
      setRecessItems(payload.data || []);
      setRecessForm(emptyRecessForm());
      setRecessEditingId(null);
      setModalNotice('Periodo de recesso removido.');
    } catch (recessError: any) {
      setModalError(recessError?.message || 'Falha ao remover recesso.');
    }
  };

  const uploadDocuments = async () => {
    if (!currentEmployeeId || pendingUploads.length === 0) return;
    setUploadingDocuments(true);
    setModalError('');
    try {
      for (const draft of pendingUploads) {
        const formData = new FormData();
        formData.append('file', draft.file);
        formData.append('docType', draft.docType);
        if (draft.issueDate) formData.append('issueDate', draft.issueDate);
        if (draft.expiresAt) formData.append('expiresAt', draft.expiresAt);
        if (draft.notes.trim()) formData.append('notes', draft.notes.trim());

        await fetchJson<{ status: string; data: EmployeeDocument }>(
          `/api/admin/colaboradores/${encodeURIComponent(currentEmployeeId)}/documentos`,
          {
            method: 'POST',
            body: formData,
          }
        );
      }

      const docsPayload = await fetchJson<{ status: string; data: EmployeeDocument[] }>(
        `/api/admin/colaboradores/${encodeURIComponent(currentEmployeeId)}/documentos`
      );
      setDocuments(docsPayload.data || []);
      setPendingUploads([]);
      setModalNotice('Documentos enviados com sucesso.');
      await loadList(pagination.page, appliedFilters);
    } catch (uploadError: any) {
      console.error('Erro ao enviar documentos:', uploadError);
      setModalError(uploadError?.message || 'Falha ao enviar documentos.');
    } finally {
      setUploadingDocuments(false);
    }
  };

  if (!canView) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5" />
            <div>
              <h1 className="text-lg font-semibold">Sem permissao para acessar colaboradores</h1>
              <p className="mt-1 text-sm">Se precisar, a gente pode ajustar as permissoes desse usuario antes de seguir.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1700px] p-8">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Gestao de Colaboradores</h1>
          <p className="text-slate-500">Cadastro, beneficios, documentos, uniforme e recessos do Departamento Pessoal.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              loadOptions();
              loadList(pagination.page, appliedFilters);
            }}
            disabled={loading || optionsLoading || !canRefresh}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading || optionsLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Recarregar lista
          </button>
          {canEdit ? (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-medium text-white"
            >
              <Plus size={14} />
              Novo colaborador
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertCircle size={14} />
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 size={14} />
          {notice}
        </div>
      ) : null}

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-end">
          <div className="relative lg:col-span-5">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
              placeholder="Buscar por nome, CPF ou e-mail"
              className={`${filterInputClassName} pl-9`}
            />
          </div>
          <div className="lg:col-span-2">
            <label className={fieldLabelClassName}>Status</label>
            <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value as any }))} className={filterInputClassName}>
              <option value="all">Todos</option>
              {EMPLOYEE_STATUSES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className={fieldLabelClassName}>Regime</label>
            <select value={filters.regime} onChange={(event) => setFilters((prev) => ({ ...prev, regime: event.target.value as any }))} className={filterInputClassName}>
              <option value="all">Todos</option>
              {EMPLOYMENT_REGIMES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-3 flex flex-wrap items-center gap-2 lg:justify-end">
            <button
              type="button"
              onClick={() => {
                setPagination((prev) => ({ ...prev, page: 1 }));
                setAppliedFilters(filters);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-medium text-white"
            >
              <Search size={14} />
              Aplicar filtros
            </button>
            <button
              type="button"
              disabled={!filtersApplied}
              onClick={() => {
                const next = emptyFilters();
                setFilters(next);
                setAppliedFilters(next);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Limpar
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className={fieldLabelClassName}>Unidade</label>
            <select value={filters.unit} onChange={(event) => setFilters((prev) => ({ ...prev, unit: event.target.value }))} className={filterInputClassName}>
              <option value="all">Todas</option>
              {options.units.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={fieldLabelClassName}>Status do ASO</label>
            <select value={filters.asoStatus} onChange={(event) => setFilters((prev) => ({ ...prev, asoStatus: event.target.value as any }))} className={filterInputClassName}>
              <option value="all">Todos</option>
              {ASO_STATUSES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={fieldLabelClassName}>Documentacao</label>
            <select value={filters.pendencyStatus} onChange={(event) => setFilters((prev) => ({ ...prev, pendencyStatus: event.target.value as any }))} className={filterInputClassName}>
              <option value="all">Todos</option>
              <option value="pending">Com pendencia</option>
              <option value="complete">Completo</option>
            </select>
          </div>
          <div className="flex items-end justify-end text-xs text-slate-500">
            {optionsLoading ? 'Atualizando opcoes...' : `${pagination.total} colaborador(es) encontrado(s)`}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Colaborador</th>
                <th className="px-4 py-3">Regime</th>
                <th className="px-4 py-3">Cargo / Setor</th>
                <th className="px-4 py-3">Unidades</th>
                <th className="px-4 py-3">Admissao</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">ASO</th>
                <th className="px-4 py-3">Documentos</th>
                <th className="px-4 py-3">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={15} className="animate-spin" />
                      Carregando colaboradores...
                    </span>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                    Nenhum colaborador encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3 min-w-[260px]">
                      <div className="font-semibold text-slate-800">{item.fullName}</div>
                      <div className="mt-1 text-xs text-slate-500">CPF: {formatCpf(item.cpf)}</div>
                      <div className="text-xs text-slate-500">{item.email || item.phone || '-'}</div>
                    </td>
                    <td className="px-4 py-3">{EMPLOYMENT_REGIMES.find((regime) => regime.value === item.employmentRegime)?.label || item.employmentRegime}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-700">{item.jobTitle || '-'}</div>
                      <div className="text-xs text-slate-500">{item.department || 'Setor nao informado'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {(item.units || []).length > 0 ? (
                          item.units.map((unit) => (
                            <span key={`${item.id}-${unit}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                              {EMPLOYEE_UNIT_LABELS[unit as keyof typeof EMPLOYEE_UNIT_LABELS] || unit}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400">Sem unidade</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">{formatDateBr(item.admissionDate)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${mapStatusBadge(item.status)}`}>
                        {item.status === 'ATIVO' ? 'Ativo' : 'Desligado'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${mapAsoBadge(item.asoStatus)}`}>
                          {item.asoStatus}
                        </span>
                        <span className="text-xs text-slate-500">{item.asoExpiresAt ? `Vence em ${formatDateBr(item.asoExpiresAt)}` : 'Sem ASO ativo'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-700">{item.requiredDocsDone}/{item.requiredDocsTotal}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {item.pendingDocuments ? 'Ha pendencias documentais' : 'Checklist completo'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openEdit(item.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Edit3 size={12} />
                        {canEdit ? 'Editar' : 'Ver'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
        <span>
          Total: <strong>{pagination.total}</strong>
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pagination.page <= 1}
            onClick={() => {
              const next = Math.max(1, pagination.page - 1);
              setPagination((prev) => ({ ...prev, page: next }));
              loadList(next, appliedFilters);
            }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Anterior
          </button>
          <span>{pagination.page}/{pagination.totalPages}</span>
          <button
            type="button"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => {
              const next = Math.min(pagination.totalPages, pagination.page + 1);
              setPagination((prev) => ({ ...prev, page: next }));
              loadList(next, appliedFilters);
            }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Proxima
          </button>
        </div>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex h-[95vh] w-full max-w-[96vw] xl:max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">{currentEmployeeId ? 'Editar colaborador' : 'Novo colaborador'}</h2>
                <p className="text-sm text-slate-500">Modal em abas para cadastro, beneficios, uniforme, recesso e documentos.</p>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="border-b border-slate-200 px-5 py-3">
              <div className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-slate-50 p-1">
                <TabButton active={modalTab === 'cadastro'} onClick={() => setModalTab('cadastro')}>Cadastro</TabButton>
                <TabButton active={modalTab === 'beneficios'} onClick={() => setModalTab('beneficios')}>Beneficios</TabButton>
                <TabButton active={modalTab === 'uniforme'} disabled={!currentEmployeeId} onClick={() => setModalTab('uniforme')}>Uniforme & Armario</TabButton>
                <TabButton active={modalTab === 'recesso'} disabled={!currentEmployeeId} onClick={() => setModalTab('recesso')}>Recesso</TabButton>
                <TabButton active={modalTab === 'documentos'} disabled={!currentEmployeeId} onClick={() => setModalTab('documentos')}>Documentos</TabButton>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-5">
              {modalLoading ? (
                <div className="flex h-full items-center justify-center text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    Carregando cadastro...
                  </span>
                </div>
              ) : (
                <div className="space-y-5">
                  {modalError ? (
                    <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      <AlertCircle size={14} />
                      {modalError}
                    </div>
                  ) : null}
                  {modalNotice ? (
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      <CheckCircle2 size={14} />
                      {modalNotice}
                    </div>
                  ) : null}

                  {modalTab === 'cadastro' ? (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <SectionCard title="Identificacao" description="Dados pessoais e status do colaborador." icon={UserRound}>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                          <div className="md:col-span-8">
                            <label className={fieldLabelClassName}>Nome completo *</label>
                            <input disabled={currentEmployeeReadOnly} value={form.fullName} onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))} className={filterInputClassName} />
                          </div>
                          <div className="md:col-span-4">
                            <label className={fieldLabelClassName}>Status *</label>
                            <select disabled={currentEmployeeReadOnly} value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as EmployeeStatus }))} className={filterInputClassName}>
                              {EMPLOYEE_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                            </select>
                          </div>
                          <div className="md:col-span-4">
                            <label className={fieldLabelClassName}>Regime contratual *</label>
                            <select disabled={currentEmployeeReadOnly} value={form.employmentRegime} onChange={(event) => setForm((prev) => ({ ...prev, employmentRegime: event.target.value as EmploymentRegime }))} className={filterInputClassName}>
                              {EMPLOYMENT_REGIMES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                            </select>
                          </div>
                          <div className="md:col-span-4">
                            <label className={fieldLabelClassName}>RG</label>
                            <input disabled={currentEmployeeReadOnly} value={form.rg} onChange={(event) => setForm((prev) => ({ ...prev, rg: event.target.value }))} className={filterInputClassName} />
                          </div>
                          <div className="md:col-span-4">
                            <label className={fieldLabelClassName}>CPF *</label>
                            <input disabled={currentEmployeeReadOnly} value={form.cpf} onChange={(event) => setForm((prev) => ({ ...prev, cpf: formatCpf(event.target.value) }))} className={filterInputClassName} placeholder="000.000.000-00" />
                          </div>
                          <div className="md:col-span-4">
                            <label className={fieldLabelClassName}>Data de nascimento</label>
                            <input disabled={currentEmployeeReadOnly} type="date" value={form.birthDate} onChange={(event) => setForm((prev) => ({ ...prev, birthDate: event.target.value }))} className={filterInputClassName} />
                          </div>
                          <div className="md:col-span-4">
                            <label className={fieldLabelClassName}>Estado civil</label>
                            <select disabled={currentEmployeeReadOnly} value={form.maritalStatus} onChange={(event) => setForm((prev) => ({ ...prev, maritalStatus: event.target.value }))} className={filterInputClassName}>
                              <option value="">Nao informado</option>
                              {MARITAL_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                            </select>
                          </div>
                          <label className="md:col-span-4 mt-6 inline-flex items-center gap-2 text-sm text-slate-700">
                            <input disabled={currentEmployeeReadOnly} type="checkbox" checked={form.hasChildren} onChange={(event) => setForm((prev) => ({ ...prev, hasChildren: event.target.checked, childrenCount: event.target.checked ? prev.childrenCount : '0' }))} />
                            Possui filhos
                          </label>
                          <div className="md:col-span-4">
                            <label className={fieldLabelClassName}>Quantidade de filhos</label>
                            <input disabled={currentEmployeeReadOnly || !form.hasChildren} value={form.childrenCount} onChange={(event) => setForm((prev) => ({ ...prev, childrenCount: event.target.value.replace(/\D/g, '') }))} className={filterInputClassName} />
                          </div>
                        </div>
                      </SectionCard>

                      <SectionCard title="Contato" description="Canais de contato e endereco residencial." icon={Briefcase}>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                          <div className="md:col-span-6">
                            <label className={fieldLabelClassName}>E-mail</label>
                            <input disabled={currentEmployeeReadOnly} type="email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} className={filterInputClassName} />
                          </div>
                          <div className="md:col-span-6">
                            <label className={fieldLabelClassName}>Telefone</label>
                            <input disabled={currentEmployeeReadOnly} value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: formatPhone(event.target.value) }))} className={filterInputClassName} placeholder="(19) 99999-9999" />
                          </div>
                          <div className="md:col-span-8">
                            <label className={fieldLabelClassName}>Logradouro</label>
                            <input disabled={currentEmployeeReadOnly} value={form.street} onChange={(event) => setForm((prev) => ({ ...prev, street: event.target.value }))} className={filterInputClassName} />
                          </div>
                          <div className="md:col-span-4">
                            <label className={fieldLabelClassName}>Numero</label>
                            <input disabled={currentEmployeeReadOnly} value={form.streetNumber} onChange={(event) => setForm((prev) => ({ ...prev, streetNumber: event.target.value }))} className={filterInputClassName} />
                          </div>
                          <div className="md:col-span-5">
                            <label className={fieldLabelClassName}>Complemento</label>
                            <input disabled={currentEmployeeReadOnly} value={form.addressComplement} onChange={(event) => setForm((prev) => ({ ...prev, addressComplement: event.target.value }))} className={filterInputClassName} />
                          </div>
                          <div className="md:col-span-4">
                            <label className={fieldLabelClassName}>Bairro</label>
                            <input disabled={currentEmployeeReadOnly} value={form.district} onChange={(event) => setForm((prev) => ({ ...prev, district: event.target.value }))} className={filterInputClassName} />
                          </div>
                          <div className="md:col-span-3">
                            <label className={fieldLabelClassName}>CEP</label>
                            <input disabled={currentEmployeeReadOnly} value={form.zipCode} onChange={(event) => setForm((prev) => ({ ...prev, zipCode: event.target.value }))} className={filterInputClassName} />
                          </div>
                          <div className="md:col-span-6">
                            <label className={fieldLabelClassName}>Cidade</label>
                            <input disabled={currentEmployeeReadOnly} value={form.city} onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))} className={filterInputClassName} />
                          </div>
                          <div className="md:col-span-2">
                            <label className={fieldLabelClassName}>UF</label>
                            <input disabled={currentEmployeeReadOnly} value={form.stateUf} maxLength={2} onChange={(event) => setForm((prev) => ({ ...prev, stateUf: event.target.value.toUpperCase() }))} className={filterInputClassName} />
                          </div>
                        </div>
                      </SectionCard>

                      <SectionCard title="Vinculo contratual" description="Informacoes de contrato, jornada e vigencia." icon={Wallet}>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                          <div className="md:col-span-6">
                            <label className={fieldLabelClassName}>Data de admissao *</label>
                            <input disabled={currentEmployeeReadOnly} type="date" value={form.admissionDate} onChange={(event) => setForm((prev) => ({ ...prev, admissionDate: event.target.value }))} className={filterInputClassName} />
                          </div>
                          <div className="md:col-span-6">
                            <label className={fieldLabelClassName}>Data de fim</label>
                            <input disabled={currentEmployeeReadOnly} type="date" value={form.contractEndDate} onChange={(event) => setForm((prev) => ({ ...prev, contractEndDate: event.target.value }))} className={filterInputClassName} />
                          </div>
                          <div className="md:col-span-8">
                            <label className={fieldLabelClassName}>Jornada de trabalho</label>
                            <textarea disabled={currentEmployeeReadOnly} value={form.workSchedule} onChange={(event) => setForm((prev) => ({ ...prev, workSchedule: event.target.value }))} rows={3} className={filterInputClassName} />
                          </div>
                          <div className="md:col-span-4">
                            <label className={fieldLabelClassName}>Salario / Bolsa</label>
                            <input disabled={currentEmployeeReadOnly} value={form.salaryAmount} onChange={(event) => setForm((prev) => ({ ...prev, salaryAmount: event.target.value }))} className={filterInputClassName} placeholder="0,00" />
                          </div>
                          <div className="md:col-span-6">
                            <label className={fieldLabelClassName}>Duracao do contrato</label>
                            <input disabled={currentEmployeeReadOnly} value={form.contractDurationText} onChange={(event) => setForm((prev) => ({ ...prev, contractDurationText: event.target.value }))} className={filterInputClassName} placeholder="Ex.: 12 meses" />
                          </div>
                        </div>
                      </SectionCard>

                      <SectionCard title="Lotacao e gestao" description="Unidades, cargo, setor e lideranca." icon={Briefcase}>
                        <div className="space-y-3">
                          <div>
                            <label className={fieldLabelClassName}>Unidades</label>
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                              {options.units.map((unit) => (
                                <label key={unit.value} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                                  <input
                                    type="checkbox"
                                    disabled={currentEmployeeReadOnly}
                                    checked={form.units.includes(unit.value)}
                                    onChange={(event) =>
                                      setForm((prev) => ({
                                        ...prev,
                                        units: event.target.checked
                                          ? Array.from(new Set([...prev.units, unit.value]))
                                          : prev.units.filter((value) => value !== unit.value),
                                      }))
                                    }
                                  />
                                  {unit.label}
                                </label>
                              ))}
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                            <div className="md:col-span-6">
                              <label className={fieldLabelClassName}>Cargo / Funcao</label>
                              <input list="employee-job-titles" disabled={currentEmployeeReadOnly} value={form.jobTitle} onChange={(event) => setForm((prev) => ({ ...prev, jobTitle: event.target.value }))} className={filterInputClassName} />
                            </div>
                            <div className="md:col-span-6">
                              <label className={fieldLabelClassName}>Setor</label>
                              <input list="employee-departments" disabled={currentEmployeeReadOnly} value={form.department} onChange={(event) => setForm((prev) => ({ ...prev, department: event.target.value }))} className={filterInputClassName} />
                            </div>
                            <div className="md:col-span-6">
                              <label className={fieldLabelClassName}>Supervisor</label>
                              <input list="employee-supervisors" disabled={currentEmployeeReadOnly} value={form.supervisorName} onChange={(event) => setForm((prev) => ({ ...prev, supervisorName: event.target.value }))} className={filterInputClassName} />
                            </div>
                            <div className="md:col-span-6">
                              <label className={fieldLabelClassName}>Centro de custo</label>
                              <input list="employee-cost-centers" disabled={currentEmployeeReadOnly} value={form.costCenter} onChange={(event) => setForm((prev) => ({ ...prev, costCenter: event.target.value }))} className={filterInputClassName} />
                            </div>
                          </div>
                        </div>
                      </SectionCard>

                      {form.employmentRegime === 'ESTAGIO' ? (
                        <SectionCard title="Estagio" description="Dados academicos obrigatorios para estagiarios." icon={CalendarClock}>
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                            <div className="md:col-span-6">
                              <label className={fieldLabelClassName}>Instituicao de ensino</label>
                              <input disabled={currentEmployeeReadOnly} value={form.educationInstitution} onChange={(event) => setForm((prev) => ({ ...prev, educationInstitution: event.target.value }))} className={filterInputClassName} />
                            </div>
                            <div className="md:col-span-3">
                              <label className={fieldLabelClassName}>Nivel</label>
                              <select disabled={currentEmployeeReadOnly} value={form.educationLevel} onChange={(event) => setForm((prev) => ({ ...prev, educationLevel: event.target.value }))} className={filterInputClassName}>
                                <option value="">Selecione</option>
                                {EDUCATION_LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                              </select>
                            </div>
                            <div className="md:col-span-3">
                              <label className={fieldLabelClassName}>Semestre atual</label>
                              <input disabled={currentEmployeeReadOnly} value={form.currentSemester} onChange={(event) => setForm((prev) => ({ ...prev, currentSemester: event.target.value }))} className={filterInputClassName} />
                            </div>
                            <div className="md:col-span-12">
                              <label className={fieldLabelClassName}>Curso</label>
                              <input disabled={currentEmployeeReadOnly} value={form.courseName} onChange={(event) => setForm((prev) => ({ ...prev, courseName: event.target.value }))} className={filterInputClassName} />
                            </div>
                          </div>
                        </SectionCard>
                      ) : null}

                      <SectionCard title="Dados bancarios e desligamento" description="Informacoes de pagamento e encerramento de contrato." icon={Wallet}>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                          <div className="md:col-span-4">
                            <label className={fieldLabelClassName}>Banco</label>
                            <input disabled={currentEmployeeReadOnly} value={form.bankName} onChange={(event) => setForm((prev) => ({ ...prev, bankName: event.target.value }))} className={filterInputClassName} />
                          </div>
                          <div className="md:col-span-4">
                            <label className={fieldLabelClassName}>Agencia</label>
                            <input disabled={currentEmployeeReadOnly} value={form.bankAgency} onChange={(event) => setForm((prev) => ({ ...prev, bankAgency: event.target.value }))} className={filterInputClassName} />
                          </div>
                          <div className="md:col-span-4">
                            <label className={fieldLabelClassName}>Conta</label>
                            <input disabled={currentEmployeeReadOnly} value={form.bankAccount} onChange={(event) => setForm((prev) => ({ ...prev, bankAccount: event.target.value }))} className={filterInputClassName} />
                          </div>
                          <div className="md:col-span-6">
                            <label className={fieldLabelClassName}>Chave PIX</label>
                            <input disabled={currentEmployeeReadOnly} value={form.pixKey} onChange={(event) => setForm((prev) => ({ ...prev, pixKey: event.target.value }))} className={filterInputClassName} />
                          </div>
                        </div>

                        {form.status === 'DESLIGADO' ? (
                          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-200 pt-4 md:grid-cols-12">
                            <div className="md:col-span-4">
                              <label className={fieldLabelClassName}>Data de demissao</label>
                              <input disabled={currentEmployeeReadOnly} type="date" value={form.terminationDate} onChange={(event) => setForm((prev) => ({ ...prev, terminationDate: event.target.value }))} className={filterInputClassName} />
                            </div>
                            <div className="md:col-span-8">
                              <label className={fieldLabelClassName}>Motivo da demissao</label>
                              <input disabled={currentEmployeeReadOnly} value={form.terminationReason} onChange={(event) => setForm((prev) => ({ ...prev, terminationReason: event.target.value }))} className={filterInputClassName} />
                            </div>
                            <div className="md:col-span-12">
                              <label className={fieldLabelClassName}>Observacoes</label>
                              <textarea disabled={currentEmployeeReadOnly} value={form.terminationNotes} onChange={(event) => setForm((prev) => ({ ...prev, terminationNotes: event.target.value }))} rows={3} className={filterInputClassName} />
                            </div>
                          </div>
                        ) : null}
                      </SectionCard>
                    </div>
                  ) : null}

                  {modalTab === 'beneficios' ? (
                    <SectionCard title="Beneficios" description="Beneficios financeiros e adicionais do colaborador." icon={Wallet}>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                        <div className="md:col-span-3">
                          <label className={fieldLabelClassName}>Insalubridade (%)</label>
                          <input disabled={currentEmployeeReadOnly} value={form.insalubrityPercent} onChange={(event) => setForm((prev) => ({ ...prev, insalubrityPercent: event.target.value }))} className={filterInputClassName} placeholder="0,00" />
                        </div>
                        <div className="md:col-span-3">
                          <label className={fieldLabelClassName}>Vale transporte (R$/dia)</label>
                          <input disabled={currentEmployeeReadOnly} value={form.transportVoucherPerDay} onChange={(event) => setForm((prev) => ({ ...prev, transportVoucherPerDay: event.target.value }))} className={filterInputClassName} placeholder="0,00" />
                        </div>
                        <div className="md:col-span-3">
                          <label className={fieldLabelClassName}>Vale refeicao (R$/dia)</label>
                          <input disabled={currentEmployeeReadOnly} value={form.mealVoucherPerDay} onChange={(event) => setForm((prev) => ({ ...prev, mealVoucherPerDay: event.target.value }))} className={filterInputClassName} placeholder="0,00" />
                        </div>
                        <div className="md:col-span-3">
                          <label className={fieldLabelClassName}>Seguro de vida</label>
                          <select disabled={currentEmployeeReadOnly} value={form.lifeInsuranceStatus} onChange={(event) => setForm((prev) => ({ ...prev, lifeInsuranceStatus: event.target.value }))} className={filterInputClassName}>
                            {LIFE_INSURANCE_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                          </select>
                        </div>
                      </div>
                    </SectionCard>
                  ) : null}

                  {modalTab === 'uniforme' ? (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px,1fr]">
                      <SectionCard title="Novo registro" description="Retiradas, trocas e devolucoes de uniforme." icon={Shirt}>
                        <div className="space-y-3">
                          <div>
                            <label className={fieldLabelClassName}>Data de retirada</label>
                            <input disabled={currentEmployeeReadOnly} type="date" value={uniformForm.withdrawalDate} onChange={(event) => setUniformForm((prev) => ({ ...prev, withdrawalDate: event.target.value }))} className={filterInputClassName} />
                          </div>
                          <div>
                            <label className={fieldLabelClassName}>Descricao do item</label>
                            <input disabled={currentEmployeeReadOnly} value={uniformForm.itemDescription} onChange={(event) => setUniformForm((prev) => ({ ...prev, itemDescription: event.target.value }))} className={filterInputClassName} />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={fieldLabelClassName}>Quantidade</label>
                              <input disabled={currentEmployeeReadOnly} value={uniformForm.quantity} onChange={(event) => setUniformForm((prev) => ({ ...prev, quantity: event.target.value.replace(/\D/g, '') }))} className={filterInputClassName} />
                            </div>
                            <div>
                              <label className={fieldLabelClassName}>Status</label>
                              <select disabled={currentEmployeeReadOnly} value={uniformForm.status} onChange={(event) => setUniformForm((prev) => ({ ...prev, status: event.target.value }))} className={filterInputClassName}>
                                {UNIFORM_ITEM_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className={fieldLabelClassName}>Tipo de entrega</label>
                            <select disabled={currentEmployeeReadOnly} value={uniformForm.deliveryType} onChange={(event) => setUniformForm((prev) => ({ ...prev, deliveryType: event.target.value }))} className={filterInputClassName}>
                              {UNIFORM_DELIVERY_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={fieldLabelClassName}>Responsavel pela entrega</label>
                            <input disabled={currentEmployeeReadOnly} value={uniformForm.deliveredBy} onChange={(event) => setUniformForm((prev) => ({ ...prev, deliveredBy: event.target.value }))} className={filterInputClassName} />
                          </div>
                          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                            <input disabled={currentEmployeeReadOnly} type="checkbox" checked={uniformForm.signedReceipt} onChange={(event) => setUniformForm((prev) => ({ ...prev, signedReceipt: event.target.checked }))} />
                            Assinou documento de retirada
                          </label>
                          {canEdit ? (
                            <div className="flex flex-wrap gap-2 pt-2">
                              <button type="button" disabled={uniformSaving} onClick={submitUniform} className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
                                {uniformSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                {uniformEditingId ? 'Atualizar registro' : 'Adicionar registro'}
                              </button>
                              <button type="button" onClick={() => { setUniformForm(emptyUniformForm()); setUniformEditingId(null); }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">
                                Limpar
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </SectionCard>

                      <SectionCard title="Historico de uniforme" description="Controle de itens ativos, devolvidos e pendentes." icon={FileText}>
                        <div className="overflow-x-auto">
                          <table className="min-w-[760px] w-full text-sm">
                            <thead className="bg-white text-left text-xs uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="px-2 py-2">Data</th>
                                <th className="px-2 py-2">Item</th>
                                <th className="px-2 py-2">Qtd.</th>
                                <th className="px-2 py-2">Entrega</th>
                                <th className="px-2 py-2">Status</th>
                                <th className="px-2 py-2">Responsavel</th>
                                <th className="px-2 py-2">Assinado</th>
                                <th className="px-2 py-2">Acoes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {uniformItems.length === 0 ? (
                                <tr><td colSpan={8} className="px-2 py-8 text-center text-slate-500">Nenhum registro de uniforme cadastrado.</td></tr>
                              ) : uniformItems.map((item) => (
                                <tr key={item.id} className="border-t border-slate-100">
                                  <td className="px-2 py-2">{formatDateBr(item.withdrawalDate)}</td>
                                  <td className="px-2 py-2 font-medium text-slate-700">{item.itemDescription}</td>
                                  <td className="px-2 py-2">{item.quantity}</td>
                                  <td className="px-2 py-2">{UNIFORM_DELIVERY_TYPES.find((option) => option.value === item.deliveryType)?.label || item.deliveryType}</td>
                                  <td className="px-2 py-2">{UNIFORM_ITEM_STATUSES.find((option) => option.value === item.status)?.label || item.status}</td>
                                  <td className="px-2 py-2">{item.deliveredBy || '-'}</td>
                                  <td className="px-2 py-2">{item.signedReceipt ? 'Sim' : 'Nao'}</td>
                                  <td className="px-2 py-2">
                                    <div className="flex items-center gap-2">
                                      {canEdit ? (
                                        <>
                                          <button type="button" onClick={() => { setUniformEditingId(item.id); setUniformForm({ withdrawalDate: item.withdrawalDate || '', itemDescription: item.itemDescription, quantity: String(item.quantity || 1), signedReceipt: item.signedReceipt, deliveryType: item.deliveryType, deliveredBy: item.deliveredBy || '', status: item.status }); }} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">Editar</button>
                                          <button type="button" onClick={() => deleteUniform(item.id)} className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50">Excluir</button>
                                        </>
                                      ) : <span className="text-xs text-slate-400">Somente leitura</span>}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </SectionCard>
                    </div>
                  ) : null}

                  {modalTab === 'recesso' ? (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[420px,1fr]">
                      <SectionCard title="Novo periodo" description="Cadastro de periodos aquisitivos e ferias." icon={CalendarClock}>
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={fieldLabelClassName}>Periodo aquisitivo inicial</label>
                              <input disabled={currentEmployeeReadOnly} type="date" value={recessForm.acquisitionStartDate} onChange={(event) => setRecessForm((prev) => ({ ...prev, acquisitionStartDate: event.target.value }))} className={filterInputClassName} />
                            </div>
                            <div>
                              <label className={fieldLabelClassName}>Periodo aquisitivo final</label>
                              <input disabled={currentEmployeeReadOnly} type="date" value={recessForm.acquisitionEndDate} onChange={(event) => setRecessForm((prev) => ({ ...prev, acquisitionEndDate: event.target.value }))} className={filterInputClassName} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={fieldLabelClassName}>Dias devidos</label>
                              <input disabled={currentEmployeeReadOnly} value={recessForm.daysDue} onChange={(event) => setRecessForm((prev) => ({ ...prev, daysDue: event.target.value.replace(/\D/g, '') }))} className={filterInputClassName} />
                            </div>
                            <div>
                              <label className={fieldLabelClassName}>Dias quitados</label>
                              <input disabled={currentEmployeeReadOnly} value={recessForm.daysPaid} onChange={(event) => setRecessForm((prev) => ({ ...prev, daysPaid: event.target.value.replace(/\D/g, '') }))} className={filterInputClassName} />
                            </div>
                          </div>
                          <div>
                            <label className={fieldLabelClassName}>Data limite para sair</label>
                            <input disabled={currentEmployeeReadOnly} type="date" value={recessForm.leaveDeadlineDate} onChange={(event) => setRecessForm((prev) => ({ ...prev, leaveDeadlineDate: event.target.value }))} className={filterInputClassName} />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={fieldLabelClassName}>Inicio das ferias</label>
                              <input disabled={currentEmployeeReadOnly} type="date" value={recessForm.vacationStartDate} onChange={(event) => setRecessForm((prev) => ({ ...prev, vacationStartDate: event.target.value }))} className={filterInputClassName} />
                            </div>
                            <div>
                              <label className={fieldLabelClassName}>Duracao (dias)</label>
                              <input disabled={currentEmployeeReadOnly} value={recessForm.vacationDurationDays} onChange={(event) => setRecessForm((prev) => ({ ...prev, vacationDurationDays: event.target.value.replace(/\D/g, '') }))} className={filterInputClassName} />
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                              <input disabled={currentEmployeeReadOnly} type="checkbox" checked={recessForm.sellTenDays} onChange={(event) => setRecessForm((prev) => ({ ...prev, sellTenDays: event.target.checked }))} />
                              Venda de 10 dias
                            </label>
                            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                              <input disabled={currentEmployeeReadOnly} type="checkbox" checked={recessForm.thirteenthOnVacation} onChange={(event) => setRecessForm((prev) => ({ ...prev, thirteenthOnVacation: event.target.checked }))} />
                              13o nas ferias
                            </label>
                          </div>
                          {canEdit ? (
                            <div className="flex flex-wrap gap-2 pt-2">
                              <button type="button" disabled={recessSaving} onClick={submitRecess} className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
                                {recessSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                {recessEditingId ? 'Atualizar periodo' : 'Adicionar periodo'}
                              </button>
                              <button type="button" onClick={() => { setRecessForm(emptyRecessForm()); setRecessEditingId(null); }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">
                                Limpar
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </SectionCard>

                      <SectionCard title="Historico de recessos" description="Saldos, situacao e programacao de ferias." icon={FileText}>
                        <div className="overflow-x-auto">
                          <table className="min-w-[860px] w-full text-sm">
                            <thead className="bg-white text-left text-xs uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="px-2 py-2">Periodo</th>
                                <th className="px-2 py-2">Dias</th>
                                <th className="px-2 py-2">Saldo</th>
                                <th className="px-2 py-2">Situacao</th>
                                <th className="px-2 py-2">Limite</th>
                                <th className="px-2 py-2">Ferias</th>
                                <th className="px-2 py-2">Beneficios</th>
                                <th className="px-2 py-2">Acoes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {recessItems.length === 0 ? (
                                <tr><td colSpan={8} className="px-2 py-8 text-center text-slate-500">Nenhum periodo de recesso cadastrado.</td></tr>
                              ) : recessItems.map((item) => (
                                <tr key={item.id} className="border-t border-slate-100 align-top">
                                  <td className="px-2 py-2">{formatDateBr(item.acquisitionStartDate)} - {formatDateBr(item.acquisitionEndDate)}</td>
                                  <td className="px-2 py-2">Devidos: {item.daysDue}<br />Quitados: {item.daysPaid}</td>
                                  <td className="px-2 py-2 font-medium">{item.balance}</td>
                                  <td className="px-2 py-2">{item.situation}</td>
                                  <td className="px-2 py-2">{formatDateBr(item.leaveDeadlineDate)}</td>
                                  <td className="px-2 py-2">{formatDateBr(item.vacationStartDate)}<br /><span className="text-xs text-slate-500">Ate {formatDateBr(item.vacationEndDate)}</span></td>
                                  <td className="px-2 py-2 text-xs text-slate-600">Venda 10 dias: {item.sellTenDays ? 'Sim' : 'Nao'}<br />13o nas ferias: {item.thirteenthOnVacation ? 'Sim' : 'Nao'}</td>
                                  <td className="px-2 py-2">
                                    <div className="flex items-center gap-2">
                                      {canEdit ? (
                                        <>
                                          <button type="button" onClick={() => { setRecessEditingId(item.id); setRecessForm({ acquisitionStartDate: item.acquisitionStartDate || '', acquisitionEndDate: item.acquisitionEndDate || '', daysDue: String(item.daysDue || 0), daysPaid: String(item.daysPaid || 0), leaveDeadlineDate: item.leaveDeadlineDate || '', vacationStartDate: item.vacationStartDate || '', vacationDurationDays: String(item.vacationDurationDays || 0), sellTenDays: item.sellTenDays, thirteenthOnVacation: item.thirteenthOnVacation }); }} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">Editar</button>
                                          <button type="button" onClick={() => deleteRecess(item.id)} className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50">Excluir</button>
                                        </>
                                      ) : <span className="text-xs text-slate-400">Somente leitura</span>}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </SectionCard>
                    </div>
                  ) : null}

                  {modalTab === 'documentos' ? (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[420px,1fr]">
                      <SectionCard title="Upload em massa" description="Selecione varios arquivos e classifique o tipo antes de salvar." icon={FileUp}>
                        <div className="space-y-3">
                          <input
                            type="file"
                            multiple
                            disabled={currentEmployeeReadOnly}
                            onChange={(event) => {
                              const files = Array.from(event.target.files || []);
                              if (files.length === 0) return;
                              setPendingUploads((prev) => [
                                ...prev,
                                ...files.map((file) => ({
                                  localId: `${Date.now()}-${file.name}-${Math.random()}`,
                                  file,
                                  docType: 'CURRICULO' as EmployeeDocumentTypeCode,
                                  issueDate: '',
                                  expiresAt: '',
                                  notes: '',
                                })),
                              ]);
                              event.currentTarget.value = '';
                            }}
                            className={filterInputClassName}
                          />
                          <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
                            <div className="font-semibold text-slate-700">Resumo documental</div>
                            <div className="mt-2">Obrigatorios entregues: {documentSummary.progress.done}/{documentSummary.progress.total}</div>
                            <div>ASO: <span className="font-semibold">{documentSummary.aso.status}</span>{documentSummary.aso.expiresAt ? ` (vence em ${formatDateBr(documentSummary.aso.expiresAt)})` : ''}</div>
                            <div className="mt-2 text-slate-500">
                              Faltando: {documentSummary.missing.length > 0 ? documentSummary.missing.map(getDocumentTypeLabel).join(', ') : 'Nenhum documento obrigatorio pendente'}
                            </div>
                          </div>

                          {pendingUploads.length > 0 ? (
                            <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                              {pendingUploads.map((draft) => {
                                const selectedType = currentDocumentTypes.find((item) => item.value === draft.docType);
                                return (
                                  <div key={draft.localId} className="rounded-lg border border-slate-200 p-3">
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <div className="text-sm font-medium text-slate-800">{draft.file.name}</div>
                                        <div className="text-xs text-slate-500">{formatFilesize(draft.file.size)}</div>
                                      </div>
                                      <button type="button" disabled={currentEmployeeReadOnly} onClick={() => setPendingUploads((prev) => prev.filter((item) => item.localId !== draft.localId))} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50">
                                        Remover
                                      </button>
                                    </div>
                                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                                      <div className="md:col-span-2">
                                        <label className={fieldLabelClassName}>Tipo documental</label>
                                        <select disabled={currentEmployeeReadOnly} value={draft.docType} onChange={(event) => setPendingUploads((prev) => prev.map((item) => item.localId === draft.localId ? { ...item, docType: event.target.value as EmployeeDocumentTypeCode } : item))} className={filterInputClassName}>
                                          {currentDocumentTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                                        </select>
                                      </div>
                                      <div>
                                        <label className={fieldLabelClassName}>Data de emissao</label>
                                        <input disabled={currentEmployeeReadOnly || !selectedType?.hasIssueDate} type="date" value={draft.issueDate} onChange={(event) => setPendingUploads((prev) => prev.map((item) => item.localId === draft.localId ? { ...item, issueDate: event.target.value } : item))} className={filterInputClassName} />
                                      </div>
                                      <div>
                                        <label className={fieldLabelClassName}>Data de vencimento</label>
                                        <input disabled={currentEmployeeReadOnly || !selectedType?.hasExpiration} type="date" value={draft.expiresAt} onChange={(event) => setPendingUploads((prev) => prev.map((item) => item.localId === draft.localId ? { ...item, expiresAt: event.target.value } : item))} className={filterInputClassName} />
                                      </div>
                                      <div className="md:col-span-2">
                                        <label className={fieldLabelClassName}>Observacoes</label>
                                        <input disabled={currentEmployeeReadOnly} value={draft.notes} onChange={(event) => setPendingUploads((prev) => prev.map((item) => item.localId === draft.localId ? { ...item, notes: event.target.value } : item))} className={filterInputClassName} />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                              {canEdit ? (
                                <button type="button" disabled={uploadingDocuments} onClick={uploadDocuments} className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
                                  {uploadingDocuments ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
                                  Salvar documentos selecionados
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                              Nenhum arquivo em fila. Selecione um ou varios documentos para classificar antes do upload.
                            </div>
                          )}
                        </div>
                      </SectionCard>

                      <SectionCard title="Documentos enviados" description="Arquivos ativos e historico documental do colaborador." icon={FileText}>
                        <div className="overflow-x-auto">
                          <table className="min-w-[900px] w-full text-sm">
                            <thead className="bg-white text-left text-xs uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="px-2 py-2">Tipo</th>
                                <th className="px-2 py-2">Arquivo</th>
                                <th className="px-2 py-2">Emissao</th>
                                <th className="px-2 py-2">Vencimento</th>
                                <th className="px-2 py-2">Status</th>
                                <th className="px-2 py-2">Upload</th>
                                <th className="px-2 py-2">Acoes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {documents.length === 0 ? (
                                <tr><td colSpan={7} className="px-2 py-8 text-center text-slate-500">Nenhum documento cadastrado.</td></tr>
                              ) : documents.map((doc) => (
                                <tr key={doc.id} className="border-t border-slate-100">
                                  <td className="px-2 py-2 font-medium text-slate-700">{getDocumentTypeLabel(doc.docType)}</td>
                                  <td className="px-2 py-2">
                                    <div>{doc.originalName}</div>
                                    <div className="text-xs text-slate-500">{formatFilesize(doc.sizeBytes)}</div>
                                  </td>
                                  <td className="px-2 py-2">{formatDateBr(doc.issueDate)}</td>
                                  <td className="px-2 py-2">{formatDateBr(doc.expiresAt)}</td>
                                  <td className="px-2 py-2">
                                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${doc.isActive ? 'border-emerald-200 bg-emerald-100 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-500'}`}>
                                      {doc.isActive ? 'Ativo' : 'Historico'}
                                    </span>
                                  </td>
                                  <td className="px-2 py-2 text-xs text-slate-500">{formatDateTime(doc.createdAt)}</td>
                                  <td className="px-2 py-2">
                                    <div className="flex items-center gap-2">
                                      <button type="button" onClick={() => window.open(`/api/admin/colaboradores/documentos/${encodeURIComponent(doc.id)}/download?inline=1`, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
                                        <FileText size={12} /> Ver
                                      </button>
                                      <button type="button" onClick={() => window.open(`/api/admin/colaboradores/documentos/${encodeURIComponent(doc.id)}/download`, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
                                        <FileDown size={12} /> Baixar
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </SectionCard>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
              <div className="text-xs text-slate-500">
                {currentEmployeeId ? `ID do colaborador: ${currentEmployeeId}` : 'Salve o cadastro inicial para liberar uniforme, recesso e documentos.'}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">
                  Fechar
                </button>
                {canEdit ? (
                  <button type="button" onClick={submitEmployee} disabled={modalSaving || modalLoading} className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
                    {modalSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    {currentEmployeeId ? 'Salvar alteracoes' : 'Salvar colaborador'}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <datalist id="employee-supervisors">
        {options.supervisors.map((value) => <option key={value} value={value} />)}
      </datalist>
      <datalist id="employee-departments">
        {options.departments.map((value) => <option key={value} value={value} />)}
      </datalist>
      <datalist id="employee-job-titles">
        {options.jobTitles.map((value) => <option key={value} value={value} />)}
      </datalist>
      <datalist id="employee-cost-centers">
        {options.costCenters.map((value) => <option key={value} value={value} />)}
      </datalist>
    </div>
  );
}
