'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  AlertCircle,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
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
  Trash2,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import { hasPermission } from '@/lib/permissions';
import {
  ASO_STATUSES,
  BRAZIL_UFS,
  EDUCATION_LEVELS,
  EMPLOYEE_DOCUMENT_TYPES,
  EMPLOYEE_STATUSES,
  EMPLOYEE_TRANSPORT_VOUCHER_MODES,
  EMPLOYEE_UNIT_LABELS,
  EMPLOYEE_UNITS,
  EMPLOYMENT_REGIMES,
  LIFE_INSURANCE_STATUSES,
  LOCKER_KEY_STATUSES,
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
  getExpectedDocumentTypes,
  getDocumentTypeLabel,
} from '@/lib/colaboradores/status';
import type {
  EmployeeDocument,
  EmployeeLockerAssignment,
  EmployeeListItem,
  EmployeeRecessPeriod,
  EmployeeUniformItem,
} from '@/lib/colaboradores/types';
import { ColaboradoresHelpModal } from './components/ColaboradoresHelpModal';
import { EmployeeLifecyclePanel } from './components/EmployeeLifecyclePanel';

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
  lockerKeyStatuses: SelectOption[];
  transportVoucherModes: SelectOption[];
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
  transportVoucherMode: string;
  transportVoucherMonthlyFixed: string;
  mealVoucherPerDay: string;
  totalpassDiscountFixed: string;
  otherFixedDiscountAmount: string;
  otherFixedDiscountDescription: string;
  payrollNotes: string;
  lifeInsuranceStatus: string;
  maritalStatus: string;
  hasChildren: boolean;
  childrenCount: string;
  bankName: string;
  bankAgency: string;
  bankAccount: string;
  pixKey: string;
  notes: string;
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

type LockerFormState = {
  unitName: string;
  lockerCode: string;
  locationDetail: string;
  keyStatus: string;
  assignedAt: string;
  returnedAt: string;
  notes: string;
  isActive: boolean;
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
  file: File | null;
  docType: EmployeeDocumentTypeCode;
  issueDate: string;
  expiresAt: string;
  notes: string;
};

type ModalTab = 'cadastro' | 'beneficios' | 'uniforme' | 'recesso' | 'documentos';
type PageSection = 'cadastro' | 'lifecycle';

type FiltersState = {
  search: string;
  status: 'all' | EmployeeStatus;
  regime: 'all' | EmploymentRegime;
  unit: string;
  asoStatus: 'all' | 'PENDENTE' | 'OK' | 'VENCENDO' | 'VENCIDO';
  pendencyStatus: 'all' | 'pending' | 'complete';
};

const areFiltersEqual = (left: FiltersState, right: FiltersState) =>
  left.search === right.search &&
  left.status === right.status &&
  left.regime === right.regime &&
  left.unit === right.unit &&
  left.asoStatus === right.asoStatus &&
  left.pendencyStatus === right.pendencyStatus;

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
  lockerKeyStatuses: LOCKER_KEY_STATUSES,
  transportVoucherModes: EMPLOYEE_TRANSPORT_VOUCHER_MODES,
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
  status: 'ATIVO',
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
  transportVoucherMode: 'PER_DAY',
  transportVoucherMonthlyFixed: '',
  mealVoucherPerDay: '',
  totalpassDiscountFixed: '',
  otherFixedDiscountAmount: '',
  otherFixedDiscountDescription: '',
  payrollNotes: '',
  lifeInsuranceStatus: 'INATIVO',
  maritalStatus: '',
  hasChildren: false,
  childrenCount: '0',
  bankName: '',
  bankAgency: '',
  bankAccount: '',
  pixKey: '',
  notes: '',
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

const emptyLockerForm = (): LockerFormState => ({
  unitName: '',
  lockerCode: '',
  locationDetail: '',
  keyStatus: 'COLABORADOR',
  assignedAt: '',
  returnedAt: '',
  notes: '',
  isActive: true,
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
  transportVoucherMode: employee.transportVoucherMode || 'PER_DAY',
  transportVoucherMonthlyFixed: employee.transportVoucherMonthlyFixed === null ? '' : String(employee.transportVoucherMonthlyFixed),
  mealVoucherPerDay: employee.mealVoucherPerDay === null ? '' : String(employee.mealVoucherPerDay),
  totalpassDiscountFixed: employee.totalpassDiscountFixed === null ? '' : String(employee.totalpassDiscountFixed),
  otherFixedDiscountAmount: employee.otherFixedDiscountAmount === null ? '' : String(employee.otherFixedDiscountAmount),
  otherFixedDiscountDescription: employee.otherFixedDiscountDescription || '',
  payrollNotes: employee.payrollNotes || '',
  lifeInsuranceStatus: employee.lifeInsuranceStatus || 'INATIVO',
  maritalStatus: employee.maritalStatus || '',
  hasChildren: Boolean(employee.hasChildren),
  childrenCount: String(employee.childrenCount || 0),
  bankName: employee.bankName || '',
  bankAgency: employee.bankAgency || '',
  bankAccount: employee.bankAccount || '',
  pixKey: employee.pixKey || '',
  notes: employee.notes || '',
});

const mapLockerToForm = (item: EmployeeLockerAssignment): LockerFormState => ({
  unitName: item.unitName || '',
  lockerCode: item.lockerCode || '',
  locationDetail: item.locationDetail || '',
  keyStatus: item.keyStatus || 'COLABORADOR',
  assignedAt: item.assignedAt || '',
  returnedAt: item.returnedAt || '',
  notes: item.notes || '',
  isActive: item.isActive,
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
    : status === 'PRE_ADMISSAO'
      ? 'bg-blue-100 text-[#17407E] border-blue-200'
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<PageSection>('cadastro');

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
  const [lockerItems, setLockerItems] = useState<EmployeeLockerAssignment[]>([]);
  const [recessItems, setRecessItems] = useState<EmployeeRecessPeriod[]>([]);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [uploadingDocuments, setUploadingDocuments] = useState(false);
  const [uniformForm, setUniformForm] = useState<UniformFormState>(emptyUniformForm());
  const [uniformEditingId, setUniformEditingId] = useState<string | null>(null);
  const [uniformSaving, setUniformSaving] = useState(false);
  const [lockerForm, setLockerForm] = useState<LockerFormState>(emptyLockerForm());
  const [lockerEditingId, setLockerEditingId] = useState<string | null>(null);
  const [lockerSaving, setLockerSaving] = useState(false);
  const [recessForm, setRecessForm] = useState<RecessFormState>(emptyRecessForm());
  const [recessEditingId, setRecessEditingId] = useState<string | null>(null);
  const [recessSaving, setRecessSaving] = useState(false);
  const defaultListFilters = useMemo(() => emptyFilters(), []);

  const filtersApplied = useMemo(
    () =>
      Boolean(
        filters.search !== defaultListFilters.search ||
          filters.status !== defaultListFilters.status ||
          filters.regime !== defaultListFilters.regime ||
          filters.unit !== defaultListFilters.unit ||
          filters.asoStatus !== defaultListFilters.asoStatus ||
          filters.pendencyStatus !== defaultListFilters.pendencyStatus
      ),
    [defaultListFilters, filters]
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

  const activeLocker = useMemo(
    () => lockerItems.find((item) => item.isActive) || null,
    [lockerItems]
  );

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
      console.error('Erro ao carregar opções de colaboradores:', optionsError);
      setError(optionsError?.message || 'Falha ao carregar opções do módulo.');
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
    const [documentsPayload, uniformsPayload, lockersPayload, recessPayload] = await Promise.all([
      fetchJson<{ status: string; data: EmployeeDocument[] }>(
        `/api/admin/colaboradores/${encodeURIComponent(employeeId)}/documentos`
      ),
      fetchJson<{ status: string; data: EmployeeUniformItem[] }>(
        `/api/admin/colaboradores/${encodeURIComponent(employeeId)}/uniformes`
      ),
      fetchJson<{ status: string; data: EmployeeLockerAssignment[] }>(
        `/api/admin/colaboradores/${encodeURIComponent(employeeId)}/armarios`
      ),
      fetchJson<{ status: string; data: EmployeeRecessPeriod[] }>(
        `/api/admin/colaboradores/${encodeURIComponent(employeeId)}/recessos`
      ),
    ]);

    setDocuments(documentsPayload.data || []);
    setUniformItems(uniformsPayload.data || []);
    setLockerItems(lockersPayload.data || []);
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

  useEffect(() => {
    if (!canView) return;
    if (areFiltersEqual(filters, appliedFilters)) return;

    const waitMs = filters.search !== appliedFilters.search ? 300 : 0;
    const timer = window.setTimeout(() => {
      setPagination((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
      setAppliedFilters(filters);
    }, waitMs);

    return () => window.clearTimeout(timer);
  }, [appliedFilters, canView, filters]);

  const resetModalState = () => {
    setCurrentEmployeeId(null);
    setForm(emptyEmployeeForm());
    setDocuments([]);
    setUniformItems([]);
    setLockerItems([]);
    setRecessItems([]);
    setPendingUploads([]);
    setUniformForm(emptyUniformForm());
    setUniformEditingId(null);
    setLockerForm(emptyLockerForm());
    setLockerEditingId(null);
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

  const deleteEmployee = async (employee: EmployeeListItem) => {
    if (!canEdit) return;
    const ok = window.confirm(
      `Excluir "${employee.fullName}"? O colaborador será marcado como desligado e sairá da visão padrão da página.`,
    );
    if (!ok) return;

    try {
      setError('');
      setNotice('');
      await fetchJson<{ status: string; data: EmployeeListItem }>(
        `/api/admin/colaboradores/${encodeURIComponent(employee.id)}`,
        { method: 'DELETE' }
      );
      if (currentEmployeeId === employee.id) {
        setIsModalOpen(false);
        resetModalState();
      }
      setPagination((prev) => ({ ...prev, page: 1 }));
      await loadList(1, appliedFilters);
      setNotice('Colaborador inativado com sucesso.');
    } catch (deleteError: any) {
      console.error('Erro ao inativar colaborador:', deleteError);
      setError(deleteError?.message || 'Falha ao inativar colaborador.');
    }
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
  const documentTypeMeta = useMemo(
    () => new Map(currentDocumentTypes.map((item) => [item.value, item])),
    [currentDocumentTypes]
  );
  const expectedDocumentTypes = useMemo(
    () =>
      getExpectedDocumentTypes({
        employmentRegime: form.employmentRegime,
        maritalStatus: (form.maritalStatus || null) as any,
        hasChildren: form.hasChildren,
      }),
    [form.employmentRegime, form.maritalStatus, form.hasChildren]
  );
  const activeDocuments = useMemo(
    () => documents.filter((doc) => doc.isActive),
    [documents]
  );
  const inactiveDocuments = useMemo(
    () => documents.filter((doc) => !doc.isActive),
    [documents]
  );
  const activeDocumentByType = useMemo(() => {
    const map = new Map<string, EmployeeDocument>();
    for (const doc of activeDocuments) {
      if (doc.docType === 'OUTRO') continue;
      if (!map.has(doc.docType)) map.set(doc.docType, doc);
    }
    return map;
  }, [activeDocuments]);
  const otherActiveDocuments = useMemo(
    () => activeDocuments.filter((doc) => doc.docType === 'OUTRO'),
    [activeDocuments]
  );
  const currentLockerKeyStatuses = useMemo(
    () =>
      options.lockerKeyStatuses && options.lockerKeyStatuses.length > 0
        ? options.lockerKeyStatuses
        : LOCKER_KEY_STATUSES,
    [options.lockerKeyStatuses]
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
        transportVoucherMonthlyFixed: parseNumericInput(form.transportVoucherMonthlyFixed),
        mealVoucherPerDay: parseNumericInput(form.mealVoucherPerDay),
        totalpassDiscountFixed: parseNumericInput(form.totalpassDiscountFixed),
        otherFixedDiscountAmount: parseNumericInput(form.otherFixedDiscountAmount),
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
          : 'Colaborador criado com sucesso. Agora você pode registrar documentos, uniforme e recessos.'
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

  const submitLocker = async () => {
    if (!currentEmployeeId) return;
    setLockerSaving(true);
    setModalError('');
    try {
      const payload = await fetchJson<{ status: string; data: EmployeeLockerAssignment[] }>(
        lockerEditingId
          ? `/api/admin/colaboradores/${encodeURIComponent(currentEmployeeId)}/armarios/${encodeURIComponent(lockerEditingId)}`
          : `/api/admin/colaboradores/${encodeURIComponent(currentEmployeeId)}/armarios`,
        {
          method: lockerEditingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(lockerForm),
        }
      );
      setLockerItems(payload.data || []);
      setLockerForm(emptyLockerForm());
      setLockerEditingId(null);
      setModalNotice('Armário salvo com sucesso.');
    } catch (lockerError: any) {
      console.error('Erro ao salvar armário:', lockerError);
      setModalError(lockerError?.message || 'Falha ao salvar armário.');
    } finally {
      setLockerSaving(false);
    }
  };

  const deleteLocker = async (entryId: string) => {
    if (!currentEmployeeId || !canEdit) return;
    try {
      const payload = await fetchJson<{ status: string; data: EmployeeLockerAssignment[] }>(
        `/api/admin/colaboradores/${encodeURIComponent(currentEmployeeId)}/armarios/${encodeURIComponent(entryId)}`,
        { method: 'DELETE' }
      );
      setLockerItems(payload.data || []);
      setLockerForm(emptyLockerForm());
      setLockerEditingId(null);
      setModalNotice('Registro de armário removido.');
    } catch (lockerError: any) {
      setModalError(lockerError?.message || 'Falha ao remover armário.');
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
      setModalNotice('Período de recesso salvo com sucesso.');
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
      setModalNotice('Período de recesso removido.');
    } catch (recessError: any) {
      setModalError(recessError?.message || 'Falha ao remover recesso.');
    }
  };

  const upsertDocumentDraft = (localId: string, patch: Partial<PendingUpload>) => {
    setPendingUploads((prev) => {
      const index = prev.findIndex((item) => item.localId === localId);
      if (index >= 0) {
        return prev.map((item) => (item.localId === localId ? { ...item, ...patch } : item));
      }
      const docType = (patch.docType || localId) as EmployeeDocumentTypeCode;
      return [
        ...prev,
        {
          localId,
          file: patch.file || null,
          docType,
          issueDate: patch.issueDate || '',
          expiresAt: patch.expiresAt || '',
          notes: patch.notes || '',
        },
      ];
    });
  };

  const addOtherDocumentDraft = () => {
    setPendingUploads((prev) => [
      ...prev,
      {
        localId: `OUTRO-${Date.now()}-${Math.random()}`,
        file: null,
        docType: 'OUTRO',
        issueDate: '',
        expiresAt: '',
        notes: '',
      },
    ]);
  };

  const uploadDocuments = async (localId?: string) => {
    if (!currentEmployeeId) return;
    const drafts = localId ? pendingUploads.filter((item) => item.localId === localId) : pendingUploads;
    if (drafts.length === 0) return;
    const missingFile = drafts.find((draft) => !draft.file);
    if (missingFile) {
      setModalError('Selecione um arquivo antes de enviar.');
      return;
    }
    setUploadingDocuments(true);
    setModalError('');
    try {
      for (const draft of drafts) {
        const selectedType = documentTypeMeta.get(draft.docType);
        if (selectedType?.hasIssueDate && !draft.issueDate) {
          throw new Error(`Informe a data de emissão para ${selectedType.label}.`);
        }
        if (selectedType?.hasExpiration && !draft.expiresAt) {
          throw new Error(`Informe a data de vencimento para ${selectedType.label}.`);
        }
        const formData = new FormData();
        formData.append('file', draft.file as File);
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
      setPendingUploads((prev) => localId ? prev.filter((item) => item.localId !== localId) : []);
      setModalNotice(drafts.length === 1 ? 'Documento enviado com sucesso.' : 'Documentos enviados com sucesso.');
      await loadList(pagination.page, appliedFilters);
    } catch (uploadError: any) {
      console.error('Erro ao enviar documentos:', uploadError);
      setModalError(uploadError?.message || 'Falha ao enviar documentos.');
    } finally {
      setUploadingDocuments(false);
    }
  };

  const deactivateEmployeeDocumentFile = async (documentId: string) => {
    if (!currentEmployeeId || !canEdit) return;
    const ok = window.confirm('Remover este arquivo ativo? Ele sairá da checklist e ficará preservado no histórico.');
    if (!ok) return;
    setUploadingDocuments(true);
    setModalError('');
    try {
      await fetchJson<{ status: string; data: EmployeeDocument }>(
        `/api/admin/colaboradores/documentos/${encodeURIComponent(documentId)}`,
        { method: 'DELETE' }
      );
      const docsPayload = await fetchJson<{ status: string; data: EmployeeDocument[] }>(
        `/api/admin/colaboradores/${encodeURIComponent(currentEmployeeId)}/documentos`
      );
      setDocuments(docsPayload.data || []);
      setModalNotice('Documento removido da lista ativa e preservado no histórico.');
      await loadList(pagination.page, appliedFilters);
    } catch (deleteError: any) {
      setModalError(deleteError?.message || 'Falha ao remover documento.');
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
          <h1 className="text-2xl font-bold text-slate-800">Gestão de Colaboradores</h1>
          <p className="text-slate-500">Cadastro, benefícios, documentos, uniforme e recessos do Departamento Pessoal.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <CircleHelp size={14} />
            Como funciona
          </button>
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

      <div className="mb-4 inline-flex flex-wrap rounded-xl border border-slate-200 bg-slate-50 p-1">
        <button
          type="button"
          onClick={() => setActiveSection('cadastro')}
          className={`rounded-lg px-3 py-1.5 text-sm transition ${activeSection === 'cadastro' ? 'border border-slate-200 bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
        >
          Cadastro
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('lifecycle')}
          className={`rounded-lg px-3 py-1.5 text-sm transition ${activeSection === 'lifecycle' ? 'border border-slate-200 bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
        >
          Admissões & Demissões
        </button>
      </div>

      {activeSection === 'cadastro' ? (
        <>
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
            <span className="text-xs text-slate-500">Filtros aplicados automaticamente</span>
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
            <label className={fieldLabelClassName}>Documentação</label>
            <select value={filters.pendencyStatus} onChange={(event) => setFilters((prev) => ({ ...prev, pendencyStatus: event.target.value as any }))} className={filterInputClassName}>
              <option value="all">Todos</option>
              <option value="pending">Com pendência</option>
              <option value="complete">Completo</option>
            </select>
          </div>
          <div className="flex items-end justify-end text-xs text-slate-500">
            {optionsLoading ? 'Atualizando opções...' : `${pagination.total} colaborador(es) encontrado(s)`}
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
                <th className="px-4 py-3">Admissão</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">ASO</th>
                <th className="px-4 py-3">Documentos</th>
                <th className="px-4 py-3">Ações</th>
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
                      <div className="text-xs text-slate-500">{item.department || 'Setor não informado'}</div>
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
                        {item.pendingDocuments ? 'Há pendências documentais' : 'Checklist completo'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(item.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Edit3 size={12} />
                          {canEdit ? 'Editar' : 'Ver'}
                        </button>
                        {canEdit && item.status === 'ATIVO' ? (
                          <button
                            type="button"
                            onClick={() => deleteEmployee(item)}
                            className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                          >
                            <Trash2 size={12} />
                            Excluir
                          </button>
                        ) : null}
                      </div>
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
            Próxima
          </button>
        </div>
      </div>
        </>
      ) : (
        <EmployeeLifecyclePanel canEdit={canEdit} onOpenEmployee={openEdit} onCreateEmployee={openCreate} />
      )}

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex h-[95vh] w-full max-w-[96vw] xl:max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">{currentEmployeeId ? 'Editar colaborador' : 'Novo colaborador'}</h2>
                <p className="text-sm text-slate-500">Modal em abas para cadastro, benefícios, uniforme, recesso e documentos.</p>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="border-b border-slate-200 px-5 py-3">
              <div className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-slate-50 p-1">
                <TabButton active={modalTab === 'cadastro'} onClick={() => setModalTab('cadastro')}>Cadastro</TabButton>
                <TabButton active={modalTab === 'beneficios'} onClick={() => setModalTab('beneficios')}>Benefícios</TabButton>
                <TabButton active={modalTab === 'uniforme'} disabled={!currentEmployeeId} onClick={() => setModalTab('uniforme')}>Uniforme & Armário</TabButton>
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
                      <SectionCard title="Identificação" description="Dados pessoais e status do colaborador." icon={UserRound}>
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
                              <option value="">Não informado</option>
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

                      <SectionCard title="Contato" description="Canais de contato e endereço residencial." icon={Briefcase}>
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
                            <label className={fieldLabelClassName}>Número</label>
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
                            <select
                              disabled={currentEmployeeReadOnly}
                              value={form.stateUf}
                              onChange={(event) => setForm((prev) => ({ ...prev, stateUf: event.target.value }))}
                              className={filterInputClassName}
                            >
                              {BRAZIL_UFS.map((uf) => (
                                <option key={uf} value={uf}>
                                  {uf}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </SectionCard>

                      <SectionCard title="Vínculo contratual" description="Informações de contrato, jornada e vigência." icon={Wallet}>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                          <div className="md:col-span-6">
                            <label className={fieldLabelClassName}>Data de admissão *</label>
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
                            <label className={fieldLabelClassName}>Salário / Bolsa</label>
                            <input disabled={currentEmployeeReadOnly} value={form.salaryAmount} onChange={(event) => setForm((prev) => ({ ...prev, salaryAmount: event.target.value }))} className={filterInputClassName} placeholder="0,00" />
                          </div>
                          <div className="md:col-span-6">
                            <label className={fieldLabelClassName}>Duração do contrato</label>
                            <input disabled={currentEmployeeReadOnly} value={form.contractDurationText} onChange={(event) => setForm((prev) => ({ ...prev, contractDurationText: event.target.value }))} className={filterInputClassName} placeholder="Ex.: 12 meses" />
                          </div>
                        </div>
                      </SectionCard>

                      <SectionCard title="Lotação e gestão" description="Unidades, cargo, setor e liderança." icon={Briefcase}>
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
                              <label className={fieldLabelClassName}>Cargo / Função</label>
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
                        <SectionCard title="Estágio" description="Dados acadêmicos obrigatórios para estagiários." icon={CalendarClock}>
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                            <div className="md:col-span-6">
                              <label className={fieldLabelClassName}>Instituição de ensino</label>
                              <input disabled={currentEmployeeReadOnly} value={form.educationInstitution} onChange={(event) => setForm((prev) => ({ ...prev, educationInstitution: event.target.value }))} className={filterInputClassName} />
                            </div>
                            <div className="md:col-span-3">
                              <label className={fieldLabelClassName}>Nível</label>
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

                      <div className="xl:col-span-2 grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <SectionCard title="Dados bancários" description="Informações de pagamento do colaborador." icon={Wallet}>
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                            <div className="md:col-span-4">
                              <label className={fieldLabelClassName}>Banco</label>
                              <input disabled={currentEmployeeReadOnly} value={form.bankName} onChange={(event) => setForm((prev) => ({ ...prev, bankName: event.target.value }))} className={filterInputClassName} />
                            </div>
                            <div className="md:col-span-4">
                              <label className={fieldLabelClassName}>Agência</label>
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
                        </SectionCard>

                        <SectionCard title="Observações gerais" description="Anotações internas complementares do cadastro." icon={FileText}>
                          <div>
                            <label className={fieldLabelClassName}>Observações gerais</label>
                            <textarea
                              disabled={currentEmployeeReadOnly}
                              value={form.notes}
                              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                              rows={6}
                              className={filterInputClassName}
                            />
                          </div>
                        </SectionCard>

                        {form.status === 'DESLIGADO' ? (
                          <div className="xl:col-span-2">
                            <SectionCard title="Desligamento" description="Informações de encerramento do vínculo." icon={AlertCircle}>
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                                <div className="md:col-span-4">
                                  <label className={fieldLabelClassName}>Data de demissão</label>
                                  <input disabled={currentEmployeeReadOnly} type="date" value={form.terminationDate} onChange={(event) => setForm((prev) => ({ ...prev, terminationDate: event.target.value }))} className={filterInputClassName} />
                                </div>
                                <div className="md:col-span-8">
                                  <label className={fieldLabelClassName}>Motivo da demissão</label>
                                  <input disabled={currentEmployeeReadOnly} value={form.terminationReason} onChange={(event) => setForm((prev) => ({ ...prev, terminationReason: event.target.value }))} className={filterInputClassName} />
                                </div>
                                <div className="md:col-span-12">
                                  <label className={fieldLabelClassName}>Observações</label>
                                  <textarea disabled={currentEmployeeReadOnly} value={form.terminationNotes} onChange={(event) => setForm((prev) => ({ ...prev, terminationNotes: event.target.value }))} rows={3} className={filterInputClassName} />
                                </div>
                              </div>
                            </SectionCard>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {modalTab === 'beneficios' ? (
                    <SectionCard title="Benefícios" description="Benefícios financeiros e adicionais do colaborador." icon={Wallet}>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                        <div className="md:col-span-3">
                          <label className={fieldLabelClassName}>Insalubridade (%)</label>
                          <input disabled={currentEmployeeReadOnly} value={form.insalubrityPercent} onChange={(event) => setForm((prev) => ({ ...prev, insalubrityPercent: event.target.value }))} className={filterInputClassName} placeholder="0,00" />
                        </div>
                        <div className="md:col-span-3">
                          <label className={fieldLabelClassName}>Modo do vale-transporte</label>
                          <select disabled={currentEmployeeReadOnly} value={form.transportVoucherMode} onChange={(event) => setForm((prev) => ({ ...prev, transportVoucherMode: event.target.value }))} className={filterInputClassName}>
                            {options.transportVoucherModes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                          </select>
                        </div>
                        <div className="md:col-span-3">
                          <label className={fieldLabelClassName}>Vale-transporte (R$/dia)</label>
                          <input disabled={currentEmployeeReadOnly || form.transportVoucherMode !== 'PER_DAY'} value={form.transportVoucherPerDay} onChange={(event) => setForm((prev) => ({ ...prev, transportVoucherPerDay: event.target.value }))} className={filterInputClassName} placeholder="0,00" />
                        </div>
                        <div className="md:col-span-3">
                          <label className={fieldLabelClassName}>Vale-transporte mensal (R$)</label>
                          <input disabled={currentEmployeeReadOnly || form.transportVoucherMode !== 'MONTHLY_FIXED'} value={form.transportVoucherMonthlyFixed} onChange={(event) => setForm((prev) => ({ ...prev, transportVoucherMonthlyFixed: event.target.value }))} className={filterInputClassName} placeholder="0,00" />
                        </div>
                        <div className="md:col-span-3">
                          <label className={fieldLabelClassName}>Vale-refeição (R$/dia)</label>
                          <input disabled={currentEmployeeReadOnly} value={form.mealVoucherPerDay} onChange={(event) => setForm((prev) => ({ ...prev, mealVoucherPerDay: event.target.value }))} className={filterInputClassName} placeholder="0,00" />
                        </div>
                        <div className="md:col-span-3">
                          <label className={fieldLabelClassName}>Desconto Totalpass (R$)</label>
                          <input disabled={currentEmployeeReadOnly} value={form.totalpassDiscountFixed} onChange={(event) => setForm((prev) => ({ ...prev, totalpassDiscountFixed: event.target.value }))} className={filterInputClassName} placeholder="0,00" />
                        </div>
                        <div className="md:col-span-3">
                          <label className={fieldLabelClassName}>Outro desconto fixo (R$)</label>
                          <input disabled={currentEmployeeReadOnly} value={form.otherFixedDiscountAmount} onChange={(event) => setForm((prev) => ({ ...prev, otherFixedDiscountAmount: event.target.value }))} className={filterInputClassName} placeholder="0,00" />
                        </div>
                        <div className="md:col-span-3">
                          <label className={fieldLabelClassName}>Descrição do outro desconto</label>
                          <input disabled={currentEmployeeReadOnly} value={form.otherFixedDiscountDescription} onChange={(event) => setForm((prev) => ({ ...prev, otherFixedDiscountDescription: event.target.value }))} className={filterInputClassName} placeholder="Ex.: adiantamento" />
                        </div>
                        <div className="md:col-span-3">
                          <label className={fieldLabelClassName}>Seguro de vida</label>
                          <select disabled={currentEmployeeReadOnly} value={form.lifeInsuranceStatus} onChange={(event) => setForm((prev) => ({ ...prev, lifeInsuranceStatus: event.target.value }))} className={filterInputClassName}>
                            {LIFE_INSURANCE_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                          </select>
                        </div>
                        <div className="md:col-span-12">
                          <label className={fieldLabelClassName}>Observações da folha</label>
                          <textarea disabled={currentEmployeeReadOnly} value={form.payrollNotes} onChange={(event) => setForm((prev) => ({ ...prev, payrollNotes: event.target.value }))} rows={3} className={filterInputClassName} placeholder="Observações recorrentes para o fechamento da folha." />
                        </div>
                      </div>
                    </SectionCard>
                  ) : null}

                  {modalTab === 'uniforme' ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px,1fr]">
                        <SectionCard title="Novo registro de uniforme" description="Retiradas, trocas e devoluções de uniforme." icon={Shirt}>
                          <div className="space-y-3">
                            <div>
                              <label className={fieldLabelClassName}>Data de retirada</label>
                              <input disabled={currentEmployeeReadOnly} type="date" value={uniformForm.withdrawalDate} onChange={(event) => setUniformForm((prev) => ({ ...prev, withdrawalDate: event.target.value }))} className={filterInputClassName} />
                            </div>
                            <div>
                              <label className={fieldLabelClassName}>Descrição do item</label>
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
                              <label className={fieldLabelClassName}>Responsável pela entrega</label>
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

                        <div className="grid grid-cols-1 gap-4">
                          <SectionCard title="Armário atual" description="Vínculo de armário e controle da chave do colaborador." icon={Briefcase}>
                            <div className="space-y-3">
                              {activeLocker ? (
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                      <div className="font-semibold">Armário ativo</div>
                                      <div className="mt-1">{EMPLOYEE_UNIT_LABELS[activeLocker.unitName as keyof typeof EMPLOYEE_UNIT_LABELS] || activeLocker.unitName} - {activeLocker.lockerCode}</div>
                                      <div className="mt-1 text-xs text-emerald-700">
                                        Chave: {currentLockerKeyStatuses.find((option) => option.value === activeLocker.keyStatus)?.label || activeLocker.keyStatus}
                                        {activeLocker.locationDetail ? ` - ${activeLocker.locationDetail}` : ''}
                                      </div>
                                    </div>
                                    {canEdit ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setLockerEditingId(activeLocker.id);
                                          setLockerForm(mapLockerToForm(activeLocker));
                                        }}
                                        className="rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                                      >
                                        Editar atual
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              ) : (
                                <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-500">
                                  Nenhum armário ativo cadastrado para este colaborador.
                                </div>
                              )}

                              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div>
                                  <label className={fieldLabelClassName}>Unidade</label>
                                  <select disabled={currentEmployeeReadOnly} value={lockerForm.unitName} onChange={(event) => setLockerForm((prev) => ({ ...prev, unitName: event.target.value }))} className={filterInputClassName}>
                                    <option value="">Selecione</option>
                                    {options.units.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className={fieldLabelClassName}>Número / código do armário</label>
                                  <input disabled={currentEmployeeReadOnly} value={lockerForm.lockerCode} onChange={(event) => setLockerForm((prev) => ({ ...prev, lockerCode: event.target.value.toUpperCase() }))} className={filterInputClassName} />
                                </div>
                                <div>
                                  <label className={fieldLabelClassName}>Localização</label>
                                  <input disabled={currentEmployeeReadOnly} value={lockerForm.locationDetail} onChange={(event) => setLockerForm((prev) => ({ ...prev, locationDetail: event.target.value }))} className={filterInputClassName} placeholder="Ex.: Vestiário feminino" />
                                </div>
                                <div>
                                  <label className={fieldLabelClassName}>Status da chave</label>
                                  <select disabled={currentEmployeeReadOnly} value={lockerForm.keyStatus} onChange={(event) => setLockerForm((prev) => ({ ...prev, keyStatus: event.target.value }))} className={filterInputClassName}>
                                    {currentLockerKeyStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className={fieldLabelClassName}>Data de entrega</label>
                                  <input disabled={currentEmployeeReadOnly} type="date" value={lockerForm.assignedAt} onChange={(event) => setLockerForm((prev) => ({ ...prev, assignedAt: event.target.value }))} className={filterInputClassName} />
                                </div>
                                <div>
                                  <label className={fieldLabelClassName}>Data de devolução</label>
                                  <input disabled={currentEmployeeReadOnly} type="date" value={lockerForm.returnedAt} onChange={(event) => setLockerForm((prev) => ({ ...prev, returnedAt: event.target.value, isActive: event.target.value ? false : prev.isActive }))} className={filterInputClassName} />
                                </div>
                                <div className="md:col-span-2">
                                  <label className={fieldLabelClassName}>Observações</label>
                                  <textarea disabled={currentEmployeeReadOnly} rows={3} value={lockerForm.notes} onChange={(event) => setLockerForm((prev) => ({ ...prev, notes: event.target.value }))} className={filterInputClassName} />
                                </div>
                              </div>

                              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                <input
                                  disabled={currentEmployeeReadOnly || Boolean(lockerForm.returnedAt)}
                                  type="checkbox"
                                  checked={lockerForm.isActive}
                                  onChange={(event) => setLockerForm((prev) => ({ ...prev, isActive: event.target.checked, returnedAt: event.target.checked ? '' : prev.returnedAt }))}
                                />
                                Armário ativo
                              </label>

                              {canEdit ? (
                                <div className="flex flex-wrap gap-2 pt-2">
                                  <button type="button" disabled={lockerSaving} onClick={submitLocker} className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
                                    {lockerSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                    {lockerEditingId ? 'Atualizar armário' : 'Salvar armário'}
                                  </button>
                                  <button type="button" onClick={() => { setLockerForm(emptyLockerForm()); setLockerEditingId(null); }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">
                                    Limpar
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </SectionCard>

                          <SectionCard title="Histórico de armários" description="Trocas, devoluções e vínculos anteriores." icon={FileText}>
                            <div className="overflow-x-auto">
                              <table className="min-w-[860px] w-full text-sm">
                                <thead className="bg-white text-left text-xs uppercase tracking-wide text-slate-500">
                                  <tr>
                                    <th className="px-2 py-2">Período</th>
                                    <th className="px-2 py-2">Unidade</th>
                                    <th className="px-2 py-2">Armário</th>
                                    <th className="px-2 py-2">Localização</th>
                                    <th className="px-2 py-2">Chave</th>
                                    <th className="px-2 py-2">Status</th>
                                    <th className="px-2 py-2">Observações</th>
                                    <th className="px-2 py-2">Ações</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {lockerItems.length === 0 ? (
                                    <tr><td colSpan={8} className="px-2 py-8 text-center text-slate-500">Nenhum armário cadastrado.</td></tr>
                                  ) : lockerItems.map((item) => (
                                    <tr key={item.id} className="border-t border-slate-100 align-top">
                                      <td className="px-2 py-2">
                                        {formatDateBr(item.assignedAt)}
                                        <div className="text-xs text-slate-500">{item.returnedAt ? `Até ${formatDateBr(item.returnedAt)}` : 'Até o momento'}</div>
                                      </td>
                                      <td className="px-2 py-2">{EMPLOYEE_UNIT_LABELS[item.unitName as keyof typeof EMPLOYEE_UNIT_LABELS] || item.unitName}</td>
                                      <td className="px-2 py-2 font-medium text-slate-700">{item.lockerCode}</td>
                                      <td className="px-2 py-2">{item.locationDetail || '-'}</td>
                                      <td className="px-2 py-2">{currentLockerKeyStatuses.find((option) => option.value === item.keyStatus)?.label || item.keyStatus}</td>
                                      <td className="px-2 py-2">
                                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${item.isActive ? 'border-emerald-200 bg-emerald-100 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                                          {item.isActive ? 'Ativo' : 'Histórico'}
                                        </span>
                                      </td>
                                      <td className="px-2 py-2 text-xs text-slate-600">{item.notes || '-'}</td>
                                      <td className="px-2 py-2">
                                        <div className="flex items-center gap-2">
                                          {canEdit ? (
                                            <>
                                              <button type="button" onClick={() => { setLockerEditingId(item.id); setLockerForm(mapLockerToForm(item)); }} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">Editar</button>
                                              <button type="button" onClick={() => deleteLocker(item.id)} className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50">Excluir</button>
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
                      </div>

                      <SectionCard title="Histórico de uniforme" description="Controle de itens ativos, devolvidos e pendentes." icon={FileText}>
                        <div className="overflow-x-auto">
                          <table className="min-w-[760px] w-full text-sm">
                            <thead className="bg-white text-left text-xs uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="px-2 py-2">Data</th>
                                <th className="px-2 py-2">Item</th>
                                <th className="px-2 py-2">Qtd.</th>
                                <th className="px-2 py-2">Entrega</th>
                                <th className="px-2 py-2">Status</th>
                                <th className="px-2 py-2">Responsável</th>
                                <th className="px-2 py-2">Assinado</th>
                                <th className="px-2 py-2">Ações</th>
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
                                  <td className="px-2 py-2">{item.signedReceipt ? 'Sim' : 'Não'}</td>
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
                      <SectionCard title="Novo período" description="Cadastro de períodos aquisitivos e férias." icon={CalendarClock}>
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={fieldLabelClassName}>Período aquisitivo inicial</label>
                              <input disabled={currentEmployeeReadOnly} type="date" value={recessForm.acquisitionStartDate} onChange={(event) => setRecessForm((prev) => ({ ...prev, acquisitionStartDate: event.target.value }))} className={filterInputClassName} />
                            </div>
                            <div>
                              <label className={fieldLabelClassName}>Período aquisitivo final</label>
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
                              <label className={fieldLabelClassName}>Início das férias</label>
                              <input disabled={currentEmployeeReadOnly} type="date" value={recessForm.vacationStartDate} onChange={(event) => setRecessForm((prev) => ({ ...prev, vacationStartDate: event.target.value }))} className={filterInputClassName} />
                            </div>
                            <div>
                              <label className={fieldLabelClassName}>Duração (dias)</label>
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
                              13º nas férias
                            </label>
                          </div>
                          {canEdit ? (
                            <div className="flex flex-wrap gap-2 pt-2">
                              <button type="button" disabled={recessSaving} onClick={submitRecess} className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
                                {recessSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                {recessEditingId ? 'Atualizar período' : 'Adicionar período'}
                              </button>
                              <button type="button" onClick={() => { setRecessForm(emptyRecessForm()); setRecessEditingId(null); }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">
                                Limpar
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </SectionCard>

                      <SectionCard title="Histórico de recessos" description="Saldos, situação e programação de férias." icon={FileText}>
                        <div className="overflow-x-auto">
                          <table className="min-w-[860px] w-full text-sm">
                            <thead className="bg-white text-left text-xs uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="px-2 py-2">Período</th>
                                <th className="px-2 py-2">Dias</th>
                                <th className="px-2 py-2">Saldo</th>
                                <th className="px-2 py-2">Situação</th>
                                <th className="px-2 py-2">Limite</th>
                                <th className="px-2 py-2">Férias</th>
                                <th className="px-2 py-2">Benefícios</th>
                                <th className="px-2 py-2">Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {recessItems.length === 0 ? (
                                <tr><td colSpan={8} className="px-2 py-8 text-center text-slate-500">Nenhum período de recesso cadastrado.</td></tr>
                              ) : recessItems.map((item) => (
                                <tr key={item.id} className="border-t border-slate-100 align-top">
                                  <td className="px-2 py-2">{formatDateBr(item.acquisitionStartDate)} - {formatDateBr(item.acquisitionEndDate)}</td>
                                  <td className="px-2 py-2">Devidos: {item.daysDue}<br />Quitados: {item.daysPaid}</td>
                                  <td className="px-2 py-2 font-medium">{item.balance}</td>
                                  <td className="px-2 py-2">{item.situation}</td>
                                  <td className="px-2 py-2">{formatDateBr(item.leaveDeadlineDate)}</td>
                                  <td className="px-2 py-2">{formatDateBr(item.vacationStartDate)}<br /><span className="text-xs text-slate-500">Até {formatDateBr(item.vacationEndDate)}</span></td>
                                  <td className="px-2 py-2 text-xs text-slate-600">Venda 10 dias: {item.sellTenDays ? 'Sim' : 'Não'}<br />13º nas férias: {item.thirteenthOnVacation ? 'Sim' : 'Não'}</td>
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
                    <div className="space-y-4">
                      <SectionCard title="Checklist documental" description="Envie ou substitua cada documento diretamente na respectiva linha." icon={FileText}>
                        <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
                          <div className="font-semibold text-slate-700">Resumo documental</div>
                          <div className="mt-2">Obrigatórios entregues: {documentSummary.progress.done}/{documentSummary.progress.total}</div>
                          <div>ASO: <span className="font-semibold">{documentSummary.aso.status}</span>{documentSummary.aso.expiresAt ? ` (vence em ${formatDateBr(documentSummary.aso.expiresAt)})` : ''}</div>
                          <div className="mt-2 text-slate-500">
                            Faltando: {documentSummary.missing.length > 0 ? documentSummary.missing.map(getDocumentTypeLabel).join(', ') : 'Nenhum documento obrigatório pendente'}
                          </div>
                        </div>

                        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                          <table className="min-w-[1120px] w-full text-sm">
                            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="px-3 py-3">Documento</th>
                                <th className="px-3 py-3">Arquivo atual</th>
                                <th className="px-3 py-3">Datas</th>
                                <th className="px-3 py-3">Novo arquivo</th>
                                <th className="px-3 py-3">Observações</th>
                                <th className="px-3 py-3">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {expectedDocumentTypes.map((docType) => {
                                const meta = documentTypeMeta.get(docType);
                                const activeDoc = activeDocumentByType.get(docType);
                                const draft = pendingUploads.find((item) => item.localId === docType);
                                return (
                                  <tr key={docType} className="align-top">
                                    <td className="px-3 py-3">
                                      <div className="font-semibold text-slate-800">{meta?.label || getDocumentTypeLabel(docType)}</div>
                                      <div className="mt-1 text-xs text-slate-500">{meta?.optional ? 'Opcional' : 'Obrigatório'}</div>
                                    </td>
                                    <td className="px-3 py-3">
                                      {activeDoc ? (
                                        <div>
                                          <div className="max-w-[260px] truncate font-medium text-slate-700" title={activeDoc.originalName}>{activeDoc.originalName}</div>
                                          <div className="text-xs text-slate-500">{formatFilesize(activeDoc.sizeBytes)} | Enviado em {formatDateTime(activeDoc.createdAt)}</div>
                                          <span className="mt-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Ativo</span>
                                        </div>
                                      ) : (
                                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Pendente</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-3">
                                      <div className="space-y-2">
                                        <label className="block">
                                          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Emissão</span>
                                          <input disabled={currentEmployeeReadOnly || !meta?.hasIssueDate} type="date" value={draft?.issueDate || ''} onChange={(event) => upsertDocumentDraft(docType, { docType, issueDate: event.target.value })} className={filterInputClassName} />
                                        </label>
                                        <label className="block">
                                          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Vencimento</span>
                                          <input disabled={currentEmployeeReadOnly || !meta?.hasExpiration} type="date" value={draft?.expiresAt || ''} onChange={(event) => upsertDocumentDraft(docType, { docType, expiresAt: event.target.value })} className={filterInputClassName} />
                                        </label>
                                      </div>
                                    </td>
                                    <td className="px-3 py-3">
                                      <input disabled={currentEmployeeReadOnly} type="file" onChange={(event) => upsertDocumentDraft(docType, { docType, file: event.target.files?.[0] || null })} className={filterInputClassName} />
                                      {draft?.file ? <div className="mt-1 text-xs text-slate-500">Selecionado: {draft.file.name}</div> : null}
                                    </td>
                                    <td className="px-3 py-3">
                                      <input disabled={currentEmployeeReadOnly} value={draft?.notes || ''} onChange={(event) => upsertDocumentDraft(docType, { docType, notes: event.target.value })} placeholder="Observações do envio" className={filterInputClassName} />
                                    </td>
                                    <td className="px-3 py-3">
                                      <div className="flex flex-wrap gap-2">
                                        {activeDoc ? (
                                          <>
                                            <button type="button" onClick={() => window.open(`/api/admin/colaboradores/documentos/${encodeURIComponent(activeDoc.id)}/download?inline=1`, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
                                              <FileText size={12} /> Ver
                                            </button>
                                            <button type="button" onClick={() => window.open(`/api/admin/colaboradores/documentos/${encodeURIComponent(activeDoc.id)}/download`, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
                                              <FileDown size={12} /> Baixar
                                            </button>
                                            {canEdit ? (
                                              <button type="button" disabled={uploadingDocuments} onClick={() => deactivateEmployeeDocumentFile(activeDoc.id)} className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50">
                                                <Trash2 size={12} /> Excluir
                                              </button>
                                            ) : null}
                                          </>
                                        ) : null}
                                        {canEdit ? (
                                          <button type="button" disabled={uploadingDocuments || !draft?.file} onClick={() => uploadDocuments(docType)} className="inline-flex items-center gap-1 rounded-md bg-[#17407E] px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">
                                            {uploadingDocuments ? <Loader2 size={12} className="animate-spin" /> : <FileUp size={12} />}
                                            {activeDoc ? 'Substituir' : 'Enviar'}
                                          </button>
                                        ) : null}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </SectionCard>

                      <SectionCard title="Documentos diversos" description="Use para anexos complementares que não fazem parte da checklist obrigatória." icon={FileUp}>
                        <div className="space-y-3">
                          {canEdit ? (
                            <button type="button" onClick={addOtherDocumentDraft} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-[#17407E] hover:bg-blue-100">
                              <Plus size={14} /> Adicionar documento diverso
                            </button>
                          ) : null}

                          {pendingUploads.filter((draft) => draft.docType === 'OUTRO').map((draft) => (
                            <div key={draft.localId} className="grid gap-3 rounded-lg border border-dashed border-slate-300 bg-white p-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                              <label>
                                <span className={fieldLabelClassName}>Arquivo</span>
                                <input disabled={currentEmployeeReadOnly} type="file" onChange={(event) => upsertDocumentDraft(draft.localId, { docType: 'OUTRO', file: event.target.files?.[0] || null })} className={filterInputClassName} />
                              </label>
                              <label>
                                <span className={fieldLabelClassName}>Descrição/observação</span>
                                <input disabled={currentEmployeeReadOnly} value={draft.notes} onChange={(event) => upsertDocumentDraft(draft.localId, { notes: event.target.value })} placeholder="Ex.: certificado complementar" className={filterInputClassName} />
                              </label>
                              <div className="flex gap-2">
                                <button type="button" disabled={uploadingDocuments || !draft.file} onClick={() => uploadDocuments(draft.localId)} className="inline-flex items-center gap-1 rounded-md bg-[#17407E] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                                  <FileUp size={12} /> Enviar
                                </button>
                                <button type="button" disabled={currentEmployeeReadOnly} onClick={() => setPendingUploads((prev) => prev.filter((item) => item.localId !== draft.localId))} className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50">
                                  Remover
                                </button>
                              </div>
                            </div>
                          ))}

                          {otherActiveDocuments.length === 0 ? (
                            <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">Nenhum documento diverso ativo.</div>
                          ) : (
                            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                              <table className="min-w-[760px] w-full text-sm">
                                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                                  <tr>
                                    <th className="px-3 py-2">Arquivo</th>
                                    <th className="px-3 py-2">Observações</th>
                                    <th className="px-3 py-2">Upload</th>
                                    <th className="px-3 py-2">Ações</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {otherActiveDocuments.map((doc) => (
                                    <tr key={doc.id}>
                                      <td className="px-3 py-2 font-medium text-slate-700">{doc.originalName}<div className="text-xs text-slate-500">{formatFilesize(doc.sizeBytes)}</div></td>
                                      <td className="px-3 py-2 text-slate-600">{doc.notes || '-'}</td>
                                      <td className="px-3 py-2 text-xs text-slate-500">{formatDateTime(doc.createdAt)}</td>
                                      <td className="px-3 py-2">
                                        <div className="flex flex-wrap gap-2">
                                          <button type="button" onClick={() => window.open(`/api/admin/colaboradores/documentos/${encodeURIComponent(doc.id)}/download?inline=1`, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"><FileText size={12} /> Ver</button>
                                          <button type="button" onClick={() => window.open(`/api/admin/colaboradores/documentos/${encodeURIComponent(doc.id)}/download`, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"><FileDown size={12} /> Baixar</button>
                                          {canEdit ? <button type="button" disabled={uploadingDocuments} onClick={() => deactivateEmployeeDocumentFile(doc.id)} className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"><Trash2 size={12} /> Excluir</button> : null}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </SectionCard>

                      <SectionCard title="Histórico de documentos" description="Arquivos substituídos ou excluídos da lista ativa continuam preservados para consulta." icon={FileText}>
                        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                          <table className="min-w-[900px] w-full text-sm">
                            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="px-3 py-2">Tipo</th>
                                <th className="px-3 py-2">Arquivo</th>
                                <th className="px-3 py-2">Vencimento</th>
                                <th className="px-3 py-2">Upload original</th>
                                <th className="px-3 py-2">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {inactiveDocuments.length === 0 ? (
                                <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">Nenhum documento histórico.</td></tr>
                              ) : inactiveDocuments.map((doc) => (
                                <tr key={doc.id}>
                                  <td className="px-3 py-2 font-medium text-slate-700">{getDocumentTypeLabel(doc.docType)}</td>
                                  <td className="px-3 py-2">{doc.originalName}<div className="text-xs text-slate-500">{formatFilesize(doc.sizeBytes)}</div></td>
                                  <td className="px-3 py-2">{formatDateBr(doc.expiresAt)}</td>
                                  <td className="px-3 py-2 text-xs text-slate-500">{formatDateTime(doc.createdAt)}</td>
                                  <td className="px-3 py-2">
                                    <div className="flex flex-wrap gap-2">
                                      <button type="button" onClick={() => window.open(`/api/admin/colaboradores/documentos/${encodeURIComponent(doc.id)}/download?inline=1`, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"><FileText size={12} /> Ver</button>
                                      <button type="button" onClick={() => window.open(`/api/admin/colaboradores/documentos/${encodeURIComponent(doc.id)}/download`, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"><FileDown size={12} /> Baixar</button>
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
                    {currentEmployeeId ? 'Salvar alterações' : 'Salvar colaborador'}
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
      <ColaboradoresHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
