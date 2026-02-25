'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AlertCircle, ChevronDown, ChevronRight, Download, Edit3, Eye, FileUp, Loader2, Plus, RefreshCw, RotateCcw, Search, User, X } from 'lucide-react';
import {
  BRAZIL_UFS,
  CHECKLIST_DOCUMENT_TYPES,
  CONTRACT_TYPES,
  COUNCIL_TYPES,
  DOCUMENT_TYPES,
  normalizeContractTypeCode,
  PERSONAL_DOC_TYPES,
  PROFESSIONAL_SERVICE_UNITS,
  type ContractPartyType,
} from '@/lib/profissionais/constants';
import type {
  FeegowProcedureCatalogItem,
  ProfessionalContract,
  ProfessionalDocument,
  ProfessionalListItem,
  ProfessionalProcedureRate,
} from '@/lib/profissionais/types';
import { hasPermission } from '@/lib/permissions';

type FormRegistration = { id?: string; councilType: string; councilNumber: string; councilUf: string; isPrimary: boolean };
type FormChecklist = { docType: string; hasPhysicalCopy: boolean; hasDigitalCopy: boolean; expiresAt: string; notes: string };
type FormSpecialty = { name: string; isPrimary: boolean };
type ContractTemplateOption = { id: string; name: string; contractType: string; version: number };
type ServiceStatus = {
  service_name: string;
  status: string;
  last_run: string | null;
  details: string | null;
};
type FormProcedureRate = {
  procedimentoId: number;
  procedimentoNome: string;
  valorBase: number;
  valorProfissional: string;
};
type FormState = {
  name: string; contractPartyType: ContractPartyType; contractType: string; cpf: string; cnpj: string; legalName: string;
  specialties: FormSpecialty[]; phone: string; email: string; ageMin: number; ageMax: number; serviceUnits: string[];
  hasFeegowPermissions: boolean;
  paymentMinimumText: string;
  personalDocType: string; personalDocNumber: string; addressText: string; isActive: boolean;
  hasPhysicalFolder: boolean; physicalFolderNote: string; contractTemplateId: string; contractStartDate: string; contractEndDate: string;
  registrations: FormRegistration[]; checklist: FormChecklist[];
};
type ModalTab = 'cadastro' | 'procedimentos' | 'contratos';

const pageSize = 20;

const newChecklist = () => CHECKLIST_DOCUMENT_TYPES.map((d) => ({ docType: d.code, hasPhysicalCopy: false, hasDigitalCopy: false, expiresAt: '', notes: '' }));
const stripDigits = (value: string | null | undefined) => String(value || '').replace(/\D/g, '');

const formatCpf = (value: string | null | undefined) => {
  const v = stripDigits(value).slice(0, 11);
  if (!v) return '';
  if (v.length <= 3) return v;
  if (v.length <= 6) return `${v.slice(0, 3)}.${v.slice(3)}`;
  if (v.length <= 9) return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6)}`;
  return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9, 11)}`;
};

const formatCnpj = (value: string | null | undefined) => {
  const v = stripDigits(value).slice(0, 14);
  if (!v) return '';
  if (v.length <= 2) return v;
  if (v.length <= 5) return `${v.slice(0, 2)}.${v.slice(2)}`;
  if (v.length <= 8) return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5)}`;
  if (v.length <= 12) return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8)}`;
  return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12, 14)}`;
};

const formatPhone = (value: string | null | undefined) => {
  const v = stripDigits(value).slice(0, 11);
  if (!v) return '';
  if (v.length <= 2) return `(${v}`;
  if (v.length <= 6) return `(${v.slice(0, 2)}) ${v.slice(2)}`;
  if (v.length <= 10) return `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`;
  return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
};

const parseAgeRange = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{1,3})-(\d{1,3})$/);
  if (!m) return { min: 0, max: 120 };
  const min = Number(m[1]);
  const max = Number(m[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max > 120 || min > max) {
    return { min: 0, max: 120 };
  }
  return { min, max };
};
const emptyForm = (): FormState => ({
  name: '', contractPartyType: 'PF', contractType: CONTRACT_TYPES.find((c) => c.isActive)?.code || '', cpf: '', cnpj: '', legalName: '',
  specialties: [{ name: '', isPrimary: true }], phone: '', email: '', ageMin: 0, ageMax: 120, serviceUnits: [], hasFeegowPermissions: false,
  paymentMinimumText: '',
  personalDocType: PERSONAL_DOC_TYPES[0], personalDocNumber: '', addressText: '', isActive: true, hasPhysicalFolder: false,
  physicalFolderNote: '', contractTemplateId: '', contractStartDate: '', contractEndDate: '',
  registrations: [{ councilType: 'CRM', councilNumber: '', councilUf: 'SP', isPrimary: true }], checklist: newChecklist(),
});

const toForm = (item: ProfessionalListItem): FormState => {
  const age = parseAgeRange(item.ageRange);
  const rawSpecialties = Array.isArray(item.specialties) && item.specialties.length > 0
    ? item.specialties
    : (item.specialty ? [item.specialty] : []);
  const primary = item.primarySpecialty || item.specialty || rawSpecialties[0] || '';
  const specialties = rawSpecialties.map((name, idx) => ({
    name,
    isPrimary: name === primary || (idx === 0 && !rawSpecialties.includes(primary)),
  }));
  if (specialties.length === 0) specialties.push({ name: '', isPrimary: true });
  if (!specialties.some((s) => s.isPrimary)) specialties[0] = { ...specialties[0], isPrimary: true };

  return ({
  name: item.name || '', contractPartyType: item.contractPartyType || 'PF', contractType: item.contractType || '', cpf: formatCpf(item.cpf || ''),
  cnpj: formatCnpj(item.cnpj || ''), legalName: item.legalName || '', specialties,
  phone: formatPhone(item.phone || ''), email: item.email || '', ageMin: age.min, ageMax: age.max, serviceUnits: item.serviceUnits || [],
  hasFeegowPermissions: Boolean(item.hasFeegowPermissions),
  paymentMinimumText: item.paymentMinimumText || '',
  personalDocType: item.personalDocType || 'RG',
  personalDocNumber: item.personalDocNumber || '', addressText: item.addressText || '', isActive: Boolean(item.isActive),
  hasPhysicalFolder: Boolean(item.hasPhysicalFolder), physicalFolderNote: item.physicalFolderNote || '',
  contractTemplateId: item.contractTemplateId || '',
  contractStartDate: item.contractStartDate || '', contractEndDate: item.contractEndDate || '',
  registrations: (item.registrations || []).map((r) => ({ id: r.id, councilType: r.councilType, councilNumber: r.councilNumber, councilUf: r.councilUf, isPrimary: Boolean(r.isPrimary) })),
  checklist: newChecklist().map((base) => {
    const f = item.checklist?.find((x) => x.docType === base.docType);
    return { ...base, hasPhysicalCopy: Boolean(f?.hasPhysicalCopy), hasDigitalCopy: Boolean(f?.hasDigitalCopy), expiresAt: f?.expiresAt || '', notes: f?.notes || '' };
  }),
}); };

const maskCpf = (cpf: string | null) => {
  const d = stripDigits(cpf);
  if (d.length !== 11) return cpf || '-';
  return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
};

const formatDateBr = (isoDate: string | null | undefined) => {
  const raw = String(isoDate || '').trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '-';
  return `${m[3]}/${m[2]}/${m[1]}`;
};

const parseMoneyInput = (value: string | number | null | undefined) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value || '').trim();
  if (!raw) return 0;
  let normalized = raw.replace(/\s+/g, '').replace(/[^0-9,.-]/g, '');
  const hasDot = normalized.includes('.');
  const hasComma = normalized.includes(',');
  if (hasDot && hasComma) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    normalized = normalized.replace(',', '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const toMoneyInputString = (value: number) => Number(value || 0).toFixed(2).replace('.', ',');

const hasGeneratedFileInMeta = (contract: ProfessionalContract, format: 'pdf' | 'docx') => {
  const filesRaw = contract.meta?.files;
  if (!filesRaw || typeof filesRaw !== 'object' || Array.isArray(filesRaw)) return false;
  const byFormat = (filesRaw as Record<string, unknown>)[format];
  if (!byFormat || typeof byFormat !== 'object' || Array.isArray(byFormat)) return false;
  const file = byFormat as Record<string, unknown>;
  return Boolean(String(file.storageProvider || '').trim() && String(file.storageKey || '').trim());
};

const hasGeneratedDocx = (contract: ProfessionalContract) => {
  if (hasGeneratedFileInMeta(contract, 'docx')) return true;
  return Boolean(contract.documentId || contract.storageKey);
};

const hasGeneratedPdf = (contract: ProfessionalContract) =>
  hasGeneratedFileInMeta(contract, 'pdf');

export default function ProfessionalsPage() {
  const { data: session } = useSession();
  const role = String((session?.user as any)?.role || 'OPERADOR').toUpperCase();
  const canEdit = hasPermission((session?.user as any)?.permissions, 'profissionais', 'edit', role);
  const canRefresh = hasPermission((session?.user as any)?.permissions, 'profissionais', 'refresh', role);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [items, setItems] = useState<ProfessionalListItem[]>([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive' | 'pending'>('all');
  const [certidaoStatus, setCertidaoStatus] = useState<'all' | 'OK' | 'VENCENDO' | 'VENCIDA' | 'PENDENTE'>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<ProfessionalDocument[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadDocType, setUploadDocType] = useState<string>(DOCUMENT_TYPES[0]?.code || 'RG');
  const [uploadExpiresAt, setUploadExpiresAt] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [modalError, setModalError] = useState('');
  const [modalNotice, setModalNotice] = useState('');
  const [photoLoadError, setPhotoLoadError] = useState(false);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [activeContractTemplates, setActiveContractTemplates] = useState<ContractTemplateOption[]>([]);
  const [specialtiesSource, setSpecialtiesSource] = useState<'feegow_api' | 'database' | 'unknown'>('unknown');
  const [deleteTarget, setDeleteTarget] = useState<ProfessionalListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [isUploadExpanded, setIsUploadExpanded] = useState(false);
  const [isChecklistExpanded, setIsChecklistExpanded] = useState(false);
  const [sortBy, setSortBy] = useState<'status' | 'name' | 'specialty' | 'contractEndDate' | 'registration' | 'contractType' | 'documents' | 'certidao'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [modalTab, setModalTab] = useState<ModalTab>('cadastro');
  const [contractsLoading, setContractsLoading] = useState(false);
  const [contracts, setContracts] = useState<ProfessionalContract[]>([]);
  const [generatingContract, setGeneratingContract] = useState(false);
  const [reprocessingContractId, setReprocessingContractId] = useState<string | null>(null);
  const [proceduresLoading, setProceduresLoading] = useState(false);
  const [procedureSaveLoading, setProcedureSaveLoading] = useState(false);
  const [procedureOptionsLoading, setProcedureOptionsLoading] = useState(false);
  const [procedureOptions, setProcedureOptions] = useState<FeegowProcedureCatalogItem[]>([]);
  const [procedureSearch, setProcedureSearch] = useState('');
  const [procedureSource, setProcedureSource] = useState<
    'catalog_db' | 'feegow_api_fallback' | 'empty' | 'unknown'
  >('unknown');
  const [procedureWorkerStatus, setProcedureWorkerStatus] = useState<ServiceStatus | null>(null);
  const [procedureWorkerRefreshing, setProcedureWorkerRefreshing] = useState(false);
  const [selectedProcedureId, setSelectedProcedureId] = useState('');
  const [procedureRates, setProcedureRates] = useState<FormProcedureRate[]>([]);

  const contractLabelByCode = useMemo(() => new Map(CONTRACT_TYPES.map((c) => [c.code, c.label])), []);
  const specialtiesOptions = useMemo(() => {
    const all = new Set((specialties || []).map((s) => String(s || '').trim()).filter(Boolean));
    for (const sp of form.specialties) {
      if (sp.name && !all.has(sp.name)) all.add(sp.name);
    }
    return Array.from(all).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [specialties, form.specialties]);
  const contractTemplateOptions = useMemo(
    () => {
      if (activeContractTemplates.length === 0) return [];
      const filtered = activeContractTemplates.filter((tpl) => {
        const tplType = normalizeContractTypeCode(tpl.contractType);
        const formType = normalizeContractTypeCode(form.contractType);
        return Boolean(tplType && formType && tplType === formType);
      });
      // Fallback para cadastros legados com tipo de contrato fora do padrao.
      return filtered.length > 0 ? filtered : activeContractTemplates;
    },
    [activeContractTemplates, form.contractType]
  );
  const photoDoc = useMemo(
    () => uploadedDocs.find((doc) => doc.docType === 'FOTO' && doc.isActive),
    [uploadedDocs]
  );
  const sortedItems = useMemo(() => {
    const arr = [...items];
    const factor = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';

      switch (sortBy) {
        case 'status':
          av = a.isActive ? 1 : 0;
          bv = b.isActive ? 1 : 0;
          break;
        case 'name':
          av = a.name || '';
          bv = b.name || '';
          break;
        case 'specialty':
          av = a.specialty || '';
          bv = b.specialty || '';
          break;
        case 'contractEndDate':
          av = a.contractEndDate || '';
          bv = b.contractEndDate || '';
          break;
        case 'registration':
          av = a.primaryRegistration ? `${a.primaryRegistration.councilType}-${a.primaryRegistration.councilUf}-${a.primaryRegistration.councilNumber}` : '';
          bv = b.primaryRegistration ? `${b.primaryRegistration.councilType}-${b.primaryRegistration.councilUf}-${b.primaryRegistration.councilNumber}` : '';
          break;
        case 'contractType':
          av = contractLabelByCode.get(a.contractType) || a.contractType || '';
          bv = contractLabelByCode.get(b.contractType) || b.contractType || '';
          break;
        case 'documents':
          av = a.requiredDocsDone / Math.max(1, a.requiredDocsTotal);
          bv = b.requiredDocsDone / Math.max(1, b.requiredDocsTotal);
          break;
        case 'certidao':
          av = a.certidaoStatus || '';
          bv = b.certidaoStatus || '';
          break;
      }

      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
      return String(av).localeCompare(String(bv), 'pt-BR') * factor;
    });
    return arr;
  }, [items, sortBy, sortDir, contractLabelByCode]);

  useEffect(() => {
    setPhotoLoadError(false);
  }, [editingId, photoDoc?.id]);

  const fetchList = async (forcePage?: number) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(forcePage || page),
        pageSize: String(pageSize),
        search: search.trim(),
        status,
        certidaoStatus,
      });
      const res = await fetch(`/api/admin/profissionais?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao carregar profissionais.');
      setItems(Array.isArray(data?.data) ? data.data : []);
      setTotal(Number(data?.pagination?.total || 0));
    } catch (e: any) {
      setItems([]);
      setTotal(0);
      setError(e?.message || 'Erro ao carregar profissionais.');
    } finally {
      setLoading(false);
    }
  };

  const fetchSpecialties = async () => {
    try {
      const res = await fetch('/api/admin/profissionais/options', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao carregar especialidades.');
      setSpecialties(Array.isArray(data?.data?.specialties) ? data.data.specialties : []);
      setActiveContractTemplates(
        Array.isArray(data?.data?.activeContractTemplates) ? data.data.activeContractTemplates : []
      );
      setSpecialtiesSource(
        data?.data?.source === 'feegow_api' || data?.data?.source === 'database'
          ? data.data.source
          : 'unknown'
      );
    } catch {
      setSpecialties([]);
      setActiveContractTemplates([]);
      setSpecialtiesSource('unknown');
    }
  };

  const onSort = (
    field: 'status' | 'name' | 'specialty' | 'contractEndDate' | 'registration' | 'contractType' | 'documents' | 'certidao'
  ) => {
    setSortBy((current) => {
      if (current === field) {
        setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
        return current;
      }
      setSortDir('asc');
      return field;
    });
  };

  const sortIndicator = (
    field: 'status' | 'name' | 'specialty' | 'contractEndDate' | 'registration' | 'contractType' | 'documents' | 'certidao'
  ) => {
    if (sortBy !== field) return '<>';
    return sortDir === 'asc' ? '^' : 'v';
  };

  const fetchDocuments = async (professionalId: string) => {
    setDocsLoading(true);
    setModalError('');
    try {
      const res = await fetch(`/api/admin/profissionais/${encodeURIComponent(professionalId)}/documentos`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao carregar documentos.');
      const docs = Array.isArray(data?.data) ? data.data : [];
      setUploadedDocs(
        docs.filter((doc: ProfessionalDocument) => String(doc?.docType || '').toUpperCase() !== 'CONTRATO_GERADO')
      );
    } catch (e: any) {
      setUploadedDocs([]);
      setModalError(e?.message || 'Falha ao carregar documentos.');
    } finally {
      setDocsLoading(false);
    }
  };

  const fetchContracts = async (professionalId: string) => {
    setContractsLoading(true);
    setModalError('');
    try {
      const res = await fetch(`/api/admin/profissionais/${encodeURIComponent(professionalId)}/contratos`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao carregar contratos.');
      setContracts(Array.isArray(data?.data) ? data.data : []);
    } catch (e: any) {
      setContracts([]);
      setModalError(e?.message || 'Falha ao carregar contratos.');
    } finally {
      setContractsLoading(false);
    }
  };

  const mapProcedureRateToForm = (row: ProfessionalProcedureRate): FormProcedureRate => ({
    procedimentoId: Number(row.procedimentoId || 0),
    procedimentoNome: String(row.procedimentoNome || '').trim(),
    valorBase: Number(row.valorBase || 0),
    valorProfissional: toMoneyInputString(Number(row.valorProfissional || 0)),
  });

  const fetchProcedureOptions = async (searchText = '') => {
    setProcedureOptionsLoading(true);
    try {
      const qs = new URLSearchParams();
      if (searchText.trim()) qs.set('search', searchText.trim());
      qs.set('limit', '120');
      const res = await fetch(`/api/admin/profissionais/procedures/options?${qs.toString()}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao carregar procedimentos.');
      const list = Array.isArray(data?.data) ? data.data : [];
      setProcedureOptions(list);
      setProcedureSource(
        data?.source === 'catalog_db' || data?.source === 'feegow_api_fallback' || data?.source === 'empty'
          ? data.source
          : 'unknown'
      );
    } catch {
      setProcedureOptions([]);
      setProcedureSource('unknown');
    } finally {
      setProcedureOptionsLoading(false);
    }
  };

  const loadProceduresWorkerStatus = async (forceFresh = false) => {
    try {
      const refreshQ = forceFresh ? `?refresh=${Date.now()}` : '';
      const res = await fetch(`/api/admin/status${refreshQ}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) return false;

      const normalize = (v: string) => String(v || '').trim().toLowerCase();
      const row = (data as ServiceStatus[]).find((item) =>
        ['procedures_catalog', 'worker_feegow_procedures', 'feegow_procedures', 'procedures'].includes(
          normalize(item.service_name)
        )
      );
      setProcedureWorkerStatus(row || null);
      const st = normalize(String(row?.status || ''));
      return st === 'pending' || st === 'running';
    } catch {
      return false;
    }
  };

  const triggerProceduresCatalogRefresh = async () => {
    if (!canRefresh) {
      setModalError('Sem permissao para atualizar o catalogo de procedimentos.');
      return;
    }
    setProcedureWorkerRefreshing(true);
    setModalError('');
    try {
      const refreshRes = await fetch('/api/admin/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: 'procedures_catalog' }),
      });
      const refreshData = await refreshRes.json().catch(() => ({}));
      if (!refreshRes.ok) {
        throw new Error(refreshData?.error || 'Falha ao acionar atualizacao do catalogo.');
      }

      let attempts = 0;
      const maxAttempts = 40;
      while (attempts < maxAttempts) {
        attempts += 1;
        const stillRunning = await loadProceduresWorkerStatus(true);
        if (!stillRunning) break;
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      await fetchProcedureOptions(procedureSearch);
      if (editingId) await fetchProcedureRates(editingId);
      await loadProceduresWorkerStatus(true);
    } catch (e: any) {
      setModalError(e?.message || 'Falha ao atualizar catalogo de procedimentos.');
    } finally {
      setProcedureWorkerRefreshing(false);
    }
  };

  const fetchProcedureRates = async (professionalId: string) => {
    setProceduresLoading(true);
    setModalError('');
    try {
      const res = await fetch(
        `/api/admin/profissionais/${encodeURIComponent(professionalId)}/procedimentos`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao carregar procedimentos do profissional.');
      const list = Array.isArray(data?.data) ? data.data : [];
      setProcedureRates(list.map((row: ProfessionalProcedureRate) => mapProcedureRateToForm(row)));
    } catch (e: any) {
      setProcedureRates([]);
      setModalError(e?.message || 'Falha ao carregar procedimentos do profissional.');
    } finally {
      setProceduresLoading(false);
    }
  };

  const addSelectedProcedure = () => {
    const procedureId = Number(selectedProcedureId || 0);
    if (!Number.isFinite(procedureId) || procedureId <= 0) {
      setModalError('Selecione um procedimento valido para adicionar.');
      return;
    }
    const option = procedureOptions.find((item) => Number(item.procedimentoId) === procedureId);
    if (!option) {
      setModalError('Procedimento selecionado nao encontrado no catalogo.');
      return;
    }
    if (procedureRates.some((item) => item.procedimentoId === procedureId)) {
      setModalError('Este procedimento ja foi adicionado para o profissional.');
      return;
    }
    setModalError('');
    setProcedureRates((prev) => [
      ...prev,
      {
        procedimentoId: procedureId,
        procedimentoNome: option.nome,
        valorBase: Number(option.valor || 0),
        valorProfissional: toMoneyInputString(Number(option.valor || 0)),
      },
    ]);
    setSelectedProcedureId('');
  };

  const saveProcedureRates = async () => {
    if (!editingId) {
      setModalError('Salve o cadastro do profissional antes de configurar procedimentos.');
      return;
    }
    setProcedureSaveLoading(true);
    setModalError('');
    setModalNotice('');
    try {
      const payload = {
        procedures: procedureRates.map((row) => ({
          procedimentoId: row.procedimentoId,
          procedimentoNome: row.procedimentoNome,
          valorBase: Number(row.valorBase || 0),
          valorProfissional: parseMoneyInput(row.valorProfissional),
        })),
      };
      const res = await fetch(
        `/api/admin/profissionais/${encodeURIComponent(editingId)}/procedimentos`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao salvar procedimentos do profissional.');
      const list = Array.isArray(data?.data) ? data.data : [];
      setProcedureRates(list.map((row: ProfessionalProcedureRate) => mapProcedureRateToForm(row)));
      setModalNotice('Procedimentos salvos com sucesso.');
    } catch (e: any) {
      setModalError(e?.message || 'Falha ao salvar procedimentos do profissional.');
    } finally {
      setProcedureSaveLoading(false);
    }
  };

  const generateContractNow = async () => {
    if (!editingId) {
      setModalError('Salve o cadastro do profissional antes de gerar contrato.');
      return;
    }
    setGeneratingContract(true);
    setModalError('');
    setModalNotice('');
    try {
      const res = await fetch(`/api/admin/profissionais/${encodeURIComponent(editingId)}/contratos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: form.contractTemplateId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao gerar contrato.');
      setModalNotice('Contrato gerado com sucesso (PDF + Word).');
      await fetchContracts(editingId);
    } catch (e: any) {
      setModalError(e?.message || 'Falha ao gerar contrato.');
    } finally {
      setGeneratingContract(false);
    }
  };

  const reprocessContract = async (contractId: string) => {
    if (!editingId) return;
    setReprocessingContractId(contractId);
    setModalError('');
    setModalNotice('');
    try {
      const res = await fetch(
        `/api/admin/profissionais/${encodeURIComponent(editingId)}/contratos/${encodeURIComponent(contractId)}/reprocess`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao reprocessar contrato.');
      setModalNotice('Contrato reprocessado com sucesso (PDF + Word).');
      await fetchContracts(editingId);
    } catch (e: any) {
      setModalError(e?.message || 'Falha ao reprocessar contrato.');
    } finally {
      setReprocessingContractId(null);
    }
  };

  const uploadDocument = async () => {
    if (!editingId) {
      setModalError('Salve o cadastro primeiro para habilitar upload.');
      return;
    }
    if (!uploadFile) {
      setModalError('Selecione um arquivo para upload.');
      return;
    }
    const selectedType = DOCUMENT_TYPES.find((d) => d.code === uploadDocType);
    if (selectedType?.hasExpiration && !uploadExpiresAt) {
      setModalError('Este tipo de documento exige data de expiracao.');
      return;
    }
    setUploadingDoc(true);
    setModalError('');
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('docType', uploadDocType);
      if (uploadExpiresAt) fd.append('expiresAt', uploadExpiresAt);

      const res = await fetch(`/api/admin/profissionais/${encodeURIComponent(editingId)}/documentos`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha no upload.');

      setUploadFile(null);
      setUploadExpiresAt('');
      await fetchDocuments(editingId);
    } catch (e: any) {
      setModalError(e?.message || 'Falha no upload.');
    } finally {
      setUploadingDoc(false);
    }
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, certidaoStatus]);

  useEffect(() => {
    fetchSpecialties();
    fetchProcedureOptions();
  }, []);

  useEffect(() => {
    if (!isModalOpen || modalTab !== 'procedimentos') return;
    loadProceduresWorkerStatus().catch(() => null);
  }, [isModalOpen, modalTab]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setUploadedDocs([]);
    setContracts([]);
    setProcedureRates([]);
    setProcedureSearch('');
    setSelectedProcedureId('');
    setUploadFile(null);
    setUploadExpiresAt('');
    setUploadDocType(DOCUMENT_TYPES[0]?.code || 'RG');
    setModalError('');
    setModalNotice('');
    setIsUploadExpanded(false);
    setIsChecklistExpanded(false);
    setModalTab('cadastro');
    setIsModalOpen(true);
  };

  const openEdit = async (id: string) => {
    setError('');
    setModalError('');
    try {
      const res = await fetch(`/api/admin/profissionais/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao abrir profissional.');
      setEditingId(id);
      setForm(toForm(data.data));
      setUploadFile(null);
      setUploadExpiresAt('');
      setUploadDocType(DOCUMENT_TYPES[0]?.code || 'RG');
      setProcedureSearch('');
      setSelectedProcedureId('');
      setIsUploadExpanded(false);
      setIsChecklistExpanded(false);
      setModalTab('cadastro');
      setModalNotice('');
      setIsModalOpen(true);
      await Promise.all([fetchDocuments(id), fetchContracts(id), fetchProcedureRates(id)]);
    } catch (e: any) {
      setError(e?.message || 'Falha ao abrir profissional.');
    }
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        cpf: stripDigits(form.cpf) || null,
        cnpj: stripDigits(form.cnpj) || null,
        legalName: form.legalName || null,
        specialty: form.specialties.find((s) => s.isPrimary)?.name || form.specialties[0]?.name || null,
        specialties: form.specialties
          .map((s) => ({ name: s.name.trim(), isPrimary: s.isPrimary }))
          .filter((s) => Boolean(s.name)),
        primarySpecialty:
          form.specialties.find((s) => s.isPrimary && s.name.trim())?.name ||
          form.specialties.find((s) => s.name.trim())?.name ||
          null,
        phone: stripDigits(form.phone) || null,
        email: form.email || null,
        ageRange: `${form.ageMin}-${form.ageMax}`,
        serviceUnits: form.serviceUnits || [],
        hasFeegowPermissions: form.hasFeegowPermissions,
        paymentMinimumText: form.paymentMinimumText || null,
        physicalFolderNote: form.physicalFolderNote || null,
        contractTemplateId: form.contractTemplateId || null,
        contractStartDate: form.contractStartDate || null,
        contractEndDate: form.contractEndDate || null,
        checklist: form.checklist.map((c) => ({ ...c, expiresAt: c.expiresAt || null })),
      };
      const res = await fetch(editingId ? `/api/admin/profissionais/${encodeURIComponent(editingId)}` : '/api/admin/profissionais', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao salvar profissional.');
      setIsModalOpen(false);
      setEditingId(null);
      setForm(emptyForm());
      await fetchList();
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar profissional.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/profissionais/${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao excluir profissional.');
      setDeleteTarget(null);
      if (editingId === deleteTarget.id) {
        setIsModalOpen(false);
        setEditingId(null);
      }
      await fetchList();
    } catch (e: any) {
      setError(e?.message || 'Falha ao excluir profissional.');
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-8 max-w-[1700px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Gestao de Profissionais</h1>
          <p className="text-slate-500">Cadastro de medicos, pendencias documentais e contratos.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fetchList()} className="px-3 py-2 border rounded-lg bg-white text-sm flex items-center gap-2"><RefreshCw size={14} />Atualizar</button>
          {canEdit && <button onClick={openCreate} className="px-3 py-2 rounded-lg bg-[#17407E] text-white text-sm flex items-center gap-2"><Plus size={14} />Novo profissional</button>}
        </div>
      </div>

      {error && <div className="mb-4 px-3 py-2 border border-rose-200 bg-rose-50 rounded-lg text-rose-700 text-sm flex items-center gap-2"><AlertCircle size={14} />{error}</div>}
      <div className="bg-white border rounded-xl p-4 mb-4 grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
        <div className="md:col-span-5 relative"><Search size={15} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-8 pr-3 py-2 border rounded-lg" placeholder="Buscar por nome/especialidade/CPF/CNPJ" /></div>
        <select value={status} onChange={(e) => { setStatus(e.target.value as any); setPage(1); }} className="md:col-span-2 px-3 py-2 border rounded-lg"><option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option><option value="pending">Pendentes</option></select>
        <select value={certidaoStatus} onChange={(e) => { setCertidaoStatus(e.target.value as any); setPage(1); }} className="md:col-span-3 px-3 py-2 border rounded-lg"><option value="all">Certidao: todos</option><option value="OK">OK</option><option value="VENCENDO">Vencendo</option><option value="VENCIDA">Vencida</option><option value="PENDENTE">Pendente</option></select>
        <button onClick={() => { setPage(1); fetchList(1); }} className="md:col-span-2 px-3 py-2 rounded-lg bg-[#17407E] text-white text-sm">Aplicar</button>
      </div>

      <div className="bg-white border rounded-xl overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-600">
            <tr>
              <th className="px-4 py-3"><button type="button" onClick={() => onSort('status')} className="inline-flex items-center gap-1">Status <span>{sortIndicator('status')}</span></button></th>
              <th className="px-4 py-3"><button type="button" onClick={() => onSort('name')} className="inline-flex items-center gap-1">Profissional <span>{sortIndicator('name')}</span></button></th>
              <th className="px-4 py-3"><button type="button" onClick={() => onSort('specialty')} className="inline-flex items-center gap-1">Especialidade <span>{sortIndicator('specialty')}</span></button></th>
              <th className="px-4 py-3"><button type="button" onClick={() => onSort('contractEndDate')} className="inline-flex items-center gap-1">Expiracao Contrato <span>{sortIndicator('contractEndDate')}</span></button></th>
              <th className="px-4 py-3"><button type="button" onClick={() => onSort('registration')} className="inline-flex items-center gap-1">Registro principal <span>{sortIndicator('registration')}</span></button></th>
              <th className="px-4 py-3"><button type="button" onClick={() => onSort('contractType')} className="inline-flex items-center gap-1">Tipo contrato <span>{sortIndicator('contractType')}</span></button></th>
              <th className="px-4 py-3"><button type="button" onClick={() => onSort('documents')} className="inline-flex items-center gap-1">Documentos <span>{sortIndicator('documents')}</span></button></th>
              <th className="px-4 py-3"><button type="button" onClick={() => onSort('certidao')} className="inline-flex items-center gap-1">Certidao <span>{sortIndicator('certidao')}</span></button></th>
              <th className="px-4 py-3">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500"><span className="inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" />Carregando...</span></td></tr>
            ) : sortedItems.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">Nenhum profissional encontrado.</td></tr>
            ) : sortedItems.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${item.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {item.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-3"><div className="font-semibold text-slate-800">{item.name}</div><div className="text-xs text-slate-500">{item.contractPartyType === 'PF' ? `CPF: ${maskCpf(item.cpf)}` : `CNPJ: ${item.cnpj || '-'}`}</div></td>
                <td className="px-4 py-3">{item.specialty || '-'}</td>
                <td className="px-4 py-3">{formatDateBr(item.contractEndDate)}</td>
                <td className="px-4 py-3">{item.primaryRegistration ? `${item.primaryRegistration.councilType}/${item.primaryRegistration.councilUf} ${item.primaryRegistration.councilNumber}` : '-'}</td>
                <td className="px-4 py-3">{contractLabelByCode.get(item.contractType) || item.contractType}</td>
                <td className="px-4 py-3">{item.requiredDocsDone}/{item.requiredDocsTotal} {item.pending && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Pendente</span>}</td>
                <td className="px-4 py-3">{item.certidaoStatus} <span className="text-xs text-slate-500">{item.certidaoExpiresAt || '-'}</span></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(item.id)} className="px-2 py-1 text-xs border rounded-md hover:bg-slate-50 inline-flex items-center gap-1"><Edit3 size={12} />Editar</button>
                    {canEdit && (
                      <button
                        onClick={() => setDeleteTarget(item)}
                        className="px-2 py-1 text-xs border border-rose-300 text-rose-700 rounded-md hover:bg-rose-50"
                      >
                        Excluir
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
        <span>Total: <strong>{total}</strong></span>
        <div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-1.5 border rounded disabled:opacity-50">Anterior</button><span>{page}/{totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="px-3 py-1.5 border rounded disabled:opacity-50">Proxima</button></div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center">
          <div className="w-full max-w-[95vw] xl:max-w-[1500px] bg-white border rounded-2xl max-h-[95vh] overflow-hidden">
            <div className="px-5 py-3 border-b flex items-center justify-between"><h2 className="font-semibold text-slate-800">{editingId ? 'Editar profissional' : 'Novo profissional'}</h2><button onClick={() => setIsModalOpen(false)} className="p-1 rounded hover:bg-slate-100"><X size={16} /></button></div>
            <div className="p-5 max-h-[84vh] overflow-auto space-y-6">
              {modalError && (
                <div className="px-3 py-2 border border-rose-200 bg-rose-50 rounded-lg text-rose-700 text-sm flex items-center gap-2">
                  <AlertCircle size={14} />
                  {modalError}
                </div>
              )}

              {modalNotice && (
                <div className="px-3 py-2 border border-emerald-200 bg-emerald-50 rounded-lg text-emerald-700 text-sm">
                  {modalNotice}
                </div>
              )}

              <div className="inline-flex rounded-lg border bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setModalTab('cadastro')}
                  className={`px-3 py-1.5 rounded text-sm ${modalTab === 'cadastro' ? 'bg-white border text-slate-900' : 'text-slate-600'}`}
                >
                  Cadastro
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab('procedimentos')}
                  className={`px-3 py-1.5 rounded text-sm ${modalTab === 'procedimentos' ? 'bg-white border text-slate-900' : 'text-slate-600'}`}
                >
                  Procedimentos
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab('contratos')}
                  className={`px-3 py-1.5 rounded text-sm ${modalTab === 'contratos' ? 'bg-white border text-slate-900' : 'text-slate-600'}`}
                >
                  Contratos
                </button>
              </div>

              {modalTab === 'cadastro' && (
              <>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-8 grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div className="md:col-span-3">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Nome do profissional</label>
                    <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" />
                  </div>

                  <div className="md:col-span-3">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Especialidades</label>
                      <button
                        type="button"
                        onClick={() =>
                          setForm((p) => ({
                            ...p,
                            specialties: [...p.specialties, { name: '', isPrimary: p.specialties.length === 0 }],
                          }))
                        }
                        className="text-xs px-2 py-1 border rounded-md"
                      >
                        + Especialidade
                      </button>
                    </div>
                    <div className="space-y-2">
                      {form.specialties.map((sp, idx) => (
                        <div key={`sp-${idx}`} className="grid grid-cols-12 gap-2 items-center">
                          <select
                            value={sp.name}
                            onChange={(e) =>
                              setForm((p) => {
                                const next = [...p.specialties];
                                next[idx] = { ...next[idx], name: e.target.value };
                                return { ...p, specialties: next };
                              })
                            }
                            className="col-span-8 px-3 py-2 border rounded-lg bg-white"
                          >
                            <option value="">Selecione</option>
                            {specialtiesOptions.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>

                          <label className="col-span-3 text-xs inline-flex items-center gap-1 text-slate-700">
                            <input
                              type="radio"
                              name="primary-specialty"
                              checked={sp.isPrimary}
                              onChange={() =>
                                setForm((p) => ({
                                  ...p,
                                  specialties: p.specialties.map((x, xIdx) => ({ ...x, isPrimary: xIdx === idx })),
                                }))
                              }
                            />
                            Principal
                          </label>

                          <button
                            type="button"
                            onClick={() =>
                              setForm((p) => {
                                if (p.specialties.length <= 1) return p;
                                const next = p.specialties.filter((_, xIdx) => xIdx !== idx);
                                if (!next.some((x) => x.isPrimary)) next[0] = { ...next[0], isPrimary: true };
                                return { ...p, specialties: next };
                              })
                            }
                            className="col-span-1 text-slate-500 hover:text-rose-600"
                            title="Remover especialidade"
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Fonte: {specialtiesSource === 'feegow_api' ? 'Feegow API' : specialtiesSource === 'database' ? 'Banco local' : 'Nao carregada'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Telefone</label>
                    <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: formatPhone(e.target.value) }))} placeholder="(11) 99999-9999" className="w-full px-3 py-2 border rounded-lg" />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Email</label>
                    <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Faixa etaria de atendimento (anos)</label>
                    <div className="rounded-lg border bg-slate-50 p-3 space-y-3">
                      <div className="relative h-8">
                        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 rounded bg-slate-200" />
                        <div
                          className="absolute top-1/2 -translate-y-1/2 h-1 rounded bg-[#17407E]"
                          style={{
                            left: `${(form.ageMin / 120) * 100}%`,
                            width: `${((form.ageMax - form.ageMin) / 120) * 100}%`,
                          }}
                        />
                        <input
                          type="range"
                          min={0}
                          max={120}
                          value={form.ageMin}
                          onChange={(e) => {
                            const nextMin = Number(e.target.value);
                            setForm((p) => ({ ...p, ageMin: Math.min(nextMin, p.ageMax) }));
                          }}
                          className="dual-range-input absolute inset-0 w-full h-8"
                          aria-label="Idade minima"
                        />
                        <input
                          type="range"
                          min={0}
                          max={120}
                          value={form.ageMax}
                          onChange={(e) => {
                            const nextMax = Number(e.target.value);
                            setForm((p) => ({ ...p, ageMax: Math.max(nextMax, p.ageMin) }));
                          }}
                          className="dual-range-input absolute inset-0 w-full h-8"
                          aria-label="Idade maxima"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-1">Min</label>
                          <input
                            type="number"
                            min={0}
                            max={120}
                            value={form.ageMin}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => {
                              const raw = Number.parseInt(e.target.value, 10);
                              const nextMin = Number.isFinite(raw) ? Math.max(0, Math.min(120, raw)) : 0;
                              setForm((p) => ({ ...p, ageMin: Math.min(nextMin, p.ageMax) }));
                            }}
                            className="w-full px-3 py-2 border rounded-lg bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-1">Max</label>
                          <input
                            type="number"
                            min={0}
                            max={120}
                            value={form.ageMax}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => {
                              const raw = Number.parseInt(e.target.value, 10);
                              const nextMax = Number.isFinite(raw) ? Math.max(0, Math.min(120, raw)) : 120;
                              setForm((p) => ({ ...p, ageMax: Math.max(nextMax, p.ageMin) }));
                            }}
                            className="w-full px-3 py-2 border rounded-lg bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Tipo de contrato</label>
                    <select
                      value={form.contractType}
                      onChange={(e) =>
                        setForm((p) => {
                          const nextType = e.target.value;
                          const matches = activeContractTemplates.filter((tpl) => {
                            const tplType = normalizeContractTypeCode(tpl.contractType);
                            const nextTypeNormalized = normalizeContractTypeCode(nextType);
                            return Boolean(tplType && nextTypeNormalized && tplType === nextTypeNormalized);
                          });
                          const keepCurrent = matches.some((tpl) => tpl.id === p.contractTemplateId);
                          return {
                            ...p,
                            contractType: nextType,
                            contractTemplateId: keepCurrent ? p.contractTemplateId : (matches[0]?.id || ''),
                          };
                        })
                      }
                      className="w-full px-3 py-2 border rounded-lg bg-white"
                    >
                      {CONTRACT_TYPES.filter((t) => t.isActive).map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Modelo de contrato (ativo)</label>
                    <select
                      value={form.contractTemplateId}
                      onChange={(e) => setForm((p) => ({ ...p, contractTemplateId: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg bg-white"
                    >
                      <option value="">Selecione</option>
                      {contractTemplateOptions.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name} (v{tpl.version})
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Opcoes vindas da pagina Modelos de Contrato.
                    </p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Pagamento minimo (texto livre)</label>
                    <input
                      value={form.paymentMinimumText}
                      onChange={(e) => setForm((p) => ({ ...p, paymentMinimumText: e.target.value }))}
                      placeholder="Ex.: PAGAMENTO NO VALOR MINIMO DE R$ 900,00 PELO PERIODO DE 4/H"
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Tipo de contratante</label>
                    <select value={form.contractPartyType} onChange={(e) => setForm((p) => ({ ...p, contractPartyType: e.target.value as ContractPartyType }))} className="w-full px-3 py-2 border rounded-lg bg-white">
                      <option value="PF">PF</option>
                      <option value="PJ">PJ</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">{form.contractPartyType === 'PF' ? 'CPF' : 'CNPJ'}</label>
                    <input
                      value={form.contractPartyType === 'PF' ? form.cpf : form.cnpj}
                      onChange={(e) =>
                        setForm((p) =>
                          p.contractPartyType === 'PF'
                            ? { ...p, cpf: formatCpf(e.target.value) }
                            : { ...p, cnpj: formatCnpj(e.target.value) }
                        )
                      }
                      placeholder={form.contractPartyType === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>

                  {form.contractPartyType === 'PJ' && (
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Razao social</label>
                      <input value={form.legalName} onChange={(e) => setForm((p) => ({ ...p, legalName: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Tipo de documento pessoal</label>
                    <select value={form.personalDocType} onChange={(e) => setForm((p) => ({ ...p, personalDocType: e.target.value }))} className="w-full px-3 py-2 border rounded-lg bg-white">
                      {PERSONAL_DOC_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Numero documento pessoal</label>
                    <input value={form.personalDocNumber} onChange={(e) => setForm((p) => ({ ...p, personalDocNumber: e.target.value }))} className="w-full px-3 py-2 border rounded-lg" />
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Endereco</label>
                    <textarea value={form.addressText} onChange={(e) => setForm((p) => ({ ...p, addressText: e.target.value }))} rows={2} className="w-full px-3 py-2 border rounded-lg" />
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Unidades de atendimento</label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 border rounded-lg p-3 bg-slate-50">
                      {PROFESSIONAL_SERVICE_UNITS.map((unit) => {
                        const checked = form.serviceUnits.includes(unit);
                        return (
                          <label key={unit} className="inline-flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setForm((p) => ({
                                  ...p,
                                  serviceUnits: e.target.checked
                                    ? Array.from(new Set([...p.serviceUnits, unit]))
                                    : p.serviceUnits.filter((u) => u !== unit),
                                }))
                              }
                            />
                            {unit}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Observacoes do profissional</label>
                    <textarea value={form.physicalFolderNote} onChange={(e) => setForm((p) => ({ ...p, physicalFolderNote: e.target.value }))} rows={2} className="w-full px-3 py-2 border rounded-lg" />
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700 mt-2">
                      <input type="checkbox" checked={form.hasPhysicalFolder} onChange={(e) => setForm((p) => ({ ...p, hasPhysicalFolder: e.target.checked }))} />
                      Possui pasta fisica
                    </label>
                  </div>
                </div>

                <div className="md:col-span-4">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Foto do profissional</label>
                  <div className="h-[220px] bg-slate-50 border rounded-lg overflow-hidden flex items-center justify-center">
                    {editingId && photoDoc && !photoLoadError ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/admin/profissionais/documentos/${encodeURIComponent(photoDoc.id)}/download?inline=1`}
                        alt="Foto do profissional"
                        className="w-full h-full object-cover"
                        onError={() => setPhotoLoadError(true)}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                        <User size={52} />
                        <span className="text-sm text-slate-500">Sem foto cadastrada</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Status do profissional</label>
                      <select
                        value={form.isActive ? 'active' : 'inactive'}
                        onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.value === 'active' }))}
                        className="w-full px-3 py-2 border rounded-lg bg-white"
                      >
                        <option value="active">Ativo</option>
                        <option value="inactive">Inativo</option>
                      </select>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Inicio contrato</label>
                        <input
                          type="date"
                          value={form.contractStartDate}
                          onChange={(e) => setForm((p) => ({ ...p, contractStartDate: e.target.value }))}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Fim contrato</label>
                        <input
                          type="date"
                          value={form.contractEndDate}
                          min={form.contractStartDate || undefined}
                          onChange={(e) => setForm((p) => ({ ...p, contractEndDate: e.target.value }))}
                          className="w-full px-3 py-2 border rounded-lg"
                        />
                      </div>

                    <label className="inline-flex items-center gap-2 text-sm text-slate-700 col-span-2">
                      <input
                        type="checkbox"
                        checked={form.hasFeegowPermissions}
                        onChange={(e) => setForm((p) => ({ ...p, hasFeegowPermissions: e.target.checked }))}
                      />
                      Permissoes do Feegow
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-semibold text-slate-700">Registros regionais</h3><button type="button" className="text-xs px-2 py-1 border rounded-md" onClick={() => setForm((p) => ({ ...p, registrations: [...p.registrations, { councilType: 'CRM', councilNumber: '', councilUf: 'SP', isPrimary: false }] }))}>+ Registro</button></div>
                <div className="grid grid-cols-12 gap-2 text-xs font-semibold uppercase text-slate-500 mb-1 px-1">
                  <div className="col-span-3">Conselho</div>
                  <div className="col-span-4">Numero</div>
                  <div className="col-span-2">UF</div>
                  <div className="col-span-2">Principal</div>
                  <div className="col-span-1">Remover</div>
                </div>
                <div className="space-y-2">
                  {form.registrations.map((r, i) => (
                    <div key={`${r.id || 'new'}-${i}`} className="grid grid-cols-12 gap-2 items-center">
                      <select
                        value={r.councilType}
                        onChange={(e) => setForm((p) => { const n = [...p.registrations]; n[i] = { ...n[i], councilType: e.target.value.toUpperCase() }; return { ...p, registrations: n }; })}
                        className="col-span-3 px-2 py-1.5 border rounded bg-white"
                      >
                        {COUNCIL_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <input value={r.councilNumber} onChange={(e) => setForm((p) => { const n = [...p.registrations]; n[i] = { ...n[i], councilNumber: e.target.value }; return { ...p, registrations: n }; })} className="col-span-4 px-2 py-1.5 border rounded" placeholder="Numero" />
                      <select
                        value={r.councilUf}
                        onChange={(e) => setForm((p) => { const n = [...p.registrations]; n[i] = { ...n[i], councilUf: e.target.value.toUpperCase() }; return { ...p, registrations: n }; })}
                        className="col-span-2 px-2 py-1.5 border rounded bg-white"
                      >
                        {BRAZIL_UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                      </select>
                      <label className="col-span-2 text-xs inline-flex items-center gap-1"><input type="radio" checked={r.isPrimary} onChange={() => setForm((p) => ({ ...p, registrations: p.registrations.map((x, xIdx) => ({ ...x, isPrimary: xIdx === i })) }))} />Principal</label>
                      <button type="button" onClick={() => setForm((p) => { if (p.registrations.length <= 1) return p; const n = p.registrations.filter((_, xIdx) => xIdx !== i); if (!n.some((x) => x.isPrimary)) n[0] = { ...n[0], isPrimary: true }; return { ...p, registrations: n }; })} className="col-span-1 text-slate-500 hover:text-rose-600">x</button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setIsUploadExpanded((v) => !v)}
                  className="w-full flex items-center justify-between py-2 text-sm font-semibold text-slate-700"
                >
                  <span>Upload de documentos (opcional)</span>
                  {isUploadExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {isUploadExpanded && (
                  <>
                    {!editingId ? (
                      <div className="text-xs px-3 py-2 rounded border bg-slate-50 text-slate-600">
                        Salve o cadastro primeiro para habilitar upload e download de arquivos.
                      </div>
                    ) : (
                      <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Tipo de documento</label>
                        <select
                          value={uploadDocType}
                          onChange={(e) => { setUploadDocType(e.target.value); setUploadExpiresAt(''); }}
                          className="w-full px-2 py-2 border rounded bg-white"
                        >
                          {DOCUMENT_TYPES.filter((d) => d.code !== 'CONTRATO_GERADO').map((d) => (
                            <option key={d.code} value={d.code}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Data de expiracao</label>
                        <input
                          type="date"
                          value={uploadExpiresAt}
                          onChange={(e) => setUploadExpiresAt(e.target.value)}
                          className="w-full px-2 py-2 border rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Arquivo</label>
                        <input
                          type="file"
                          onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                          className="w-full px-2 py-2 border rounded"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={uploadDocument}
                        disabled={!canEdit || uploadingDoc}
                        className="px-3 py-2 rounded bg-[#17407E] text-white text-sm disabled:opacity-60 inline-flex items-center justify-center gap-2"
                      >
                        {uploadingDoc ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
                        {uploadingDoc ? 'Enviando...' : 'Enviar arquivo'}
                      </button>
                    </div>

                    <div className="border rounded-lg overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                          <tr>
                            <th className="px-2 py-2 text-left">Tipo</th>
                            <th className="px-2 py-2 text-left">Arquivo</th>
                            <th className="px-2 py-2 text-left">Expiracao</th>
                            <th className="px-2 py-2 text-left">Upload</th>
                            <th className="px-2 py-2 text-left">Acoes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {docsLoading ? (
                            <tr>
                              <td colSpan={5} className="px-2 py-4 text-center text-slate-500">
                                <span className="inline-flex items-center gap-2">
                                  <Loader2 size={14} className="animate-spin" />
                                  Carregando arquivos...
                                </span>
                              </td>
                            </tr>
                          ) : uploadedDocs.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-2 py-4 text-center text-slate-500">
                                Nenhum arquivo enviado.
                              </td>
                            </tr>
                          ) : (
                            uploadedDocs.map((doc) => (
                              <tr key={doc.id} className="border-t">
                                <td className="px-2 py-2">{DOCUMENT_TYPES.find((x) => x.code === doc.docType)?.label || doc.docType}</td>
                                <td className="px-2 py-2">{doc.originalName}</td>
                                <td className="px-2 py-2">{doc.expiresAt || '-'}</td>
                                <td className="px-2 py-2">{doc.createdAt ? doc.createdAt.slice(0, 19).replace('T', ' ') : '-'}</td>
                                <td className="px-2 py-2">
                                  <div className="flex items-center gap-3">
                                    <a
                                      href={`/api/admin/profissionais/documentos/${encodeURIComponent(doc.id)}/download?inline=1`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-[#17407E] hover:underline"
                                    >
                                      <Eye size={13} />
                                      Visualizar
                                    </a>
                                    <a
                                      href={`/api/admin/profissionais/documentos/${encodeURIComponent(doc.id)}/download`}
                                      className="inline-flex items-center gap-1 text-[#17407E] hover:underline"
                                    >
                                      <Download size={13} />
                                      Baixar
                                    </a>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                    )}
                  </>
                )}
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setIsChecklistExpanded((v) => !v)}
                  className="w-full flex items-center justify-between py-2 text-sm font-semibold text-slate-700"
                >
                  <span>Checklist manual de documentos (transicao)</span>
                  {isChecklistExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {isChecklistExpanded && (
                  <div className="border rounded-lg overflow-hidden"><table className="w-full text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr><th className="px-2 py-2 text-left">Documento</th><th className="px-2 py-2 text-left">Fisico</th><th className="px-2 py-2 text-left">Digital</th><th className="px-2 py-2 text-left">Expiracao</th><th className="px-2 py-2 text-left">Obs</th></tr></thead><tbody>{form.checklist.map((c, i) => { const d = DOCUMENT_TYPES.find((x) => x.code === c.docType); return <tr key={c.docType} className="border-t"><td className="px-2 py-2">{d?.label || c.docType}</td><td className="px-2 py-2"><input type="checkbox" checked={c.hasPhysicalCopy} onChange={(e) => setForm((p) => { const n = [...p.checklist]; n[i] = { ...n[i], hasPhysicalCopy: e.target.checked }; return { ...p, checklist: n }; })} /></td><td className="px-2 py-2"><input type="checkbox" checked={c.hasDigitalCopy} onChange={(e) => setForm((p) => { const n = [...p.checklist]; n[i] = { ...n[i], hasDigitalCopy: e.target.checked }; return { ...p, checklist: n }; })} /></td><td className="px-2 py-2">{d?.hasExpiration ? <input type="date" value={c.expiresAt} onChange={(e) => setForm((p) => { const n = [...p.checklist]; n[i] = { ...n[i], expiresAt: e.target.value }; return { ...p, checklist: n }; })} className="px-2 py-1 border rounded" /> : <span className="text-xs text-slate-400">-</span>}</td><td className="px-2 py-2"><input value={c.notes} onChange={(e) => setForm((p) => { const n = [...p.checklist]; n[i] = { ...n[i], notes: e.target.value }; return { ...p, checklist: n }; })} className="w-full px-2 py-1 border rounded" /></td></tr>; })}</tbody></table></div>
                )}
              </div>
              </>
              )}

              {modalTab === 'procedimentos' && (
                <div className="space-y-4">
                  {!editingId ? (
                    <div className="text-sm px-3 py-2 rounded border bg-slate-50 text-slate-600">
                      Salve o profissional primeiro para vincular procedimentos e valores.
                    </div>
                  ) : (
                    <>
                      <div className="border rounded-xl p-4 bg-slate-50/70 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                          <span>
                            Worker catálogo:{' '}
                            <strong>
                              {procedureWorkerStatus
                                ? `${String(procedureWorkerStatus.status || '-').toUpperCase()}${
                                    procedureWorkerStatus.last_run
                                      ? ` | ${String(procedureWorkerStatus.last_run).slice(0, 19).replace('T', ' ')}`
                                      : ''
                                  }`
                                : 'SEM HEARTBEAT'}
                            </strong>
                          </span>
                          <button
                            type="button"
                            onClick={triggerProceduresCatalogRefresh}
                            disabled={!canRefresh || procedureWorkerRefreshing}
                            className="px-3 py-1.5 rounded border bg-white text-slate-700 text-xs inline-flex items-center gap-2 disabled:opacity-60"
                          >
                            {procedureWorkerRefreshing ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <RefreshCw size={12} />
                            )}
                            {procedureWorkerRefreshing ? 'Atualizando catálogo...' : 'Atualizar catálogo'}
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                          <div className="md:col-span-3">
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
                              Buscar procedimento no catalogo
                            </label>
                            <input
                              value={procedureSearch}
                              onChange={(e) => setProcedureSearch(e.target.value)}
                              placeholder="Digite parte do nome do procedimento"
                              className="w-full px-3 py-2 border rounded-lg"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => fetchProcedureOptions(procedureSearch)}
                            className="px-3 py-2 border rounded-lg text-sm inline-flex items-center justify-center gap-2"
                            disabled={procedureOptionsLoading}
                          >
                            {procedureOptionsLoading ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Search size={14} />
                            )}
                            Buscar
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                          <div className="md:col-span-3">
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
                              Selecionar procedimento
                            </label>
                            <select
                              value={selectedProcedureId}
                              onChange={(e) => setSelectedProcedureId(e.target.value)}
                              className="w-full px-3 py-2 border rounded-lg bg-white"
                            >
                              <option value="">Selecione</option>
                              {procedureOptions.map((procedure) => (
                                <option key={procedure.procedimentoId} value={procedure.procedimentoId}>
                                  {procedure.nome} | {formatCurrency(Number(procedure.valor || 0))}
                                </option>
                              ))}
                            </select>
                          </div>
                          <button
                            type="button"
                            onClick={addSelectedProcedure}
                            className="px-3 py-2 rounded-lg bg-[#17407E] text-white text-sm disabled:opacity-60"
                            disabled={!canEdit}
                          >
                            Adicionar
                          </button>
                        </div>

                        <p className="text-[11px] text-slate-500">
                          Fonte: {procedureSource === 'catalog_db'
                            ? 'Catalogo Feegow (MySQL)'
                            : procedureSource === 'feegow_api_fallback'
                              ? 'Feegow API (fallback)'
                              : procedureSource === 'empty'
                                ? 'Sem dados no catalogo'
                                : 'Nao carregada'}
                        </p>
                      </div>

                      <div className="border rounded-xl overflow-auto">
                        <table className="w-full text-sm min-w-[820px]">
                          <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                            <tr>
                              <th className="px-3 py-2 text-left">Procedimento</th>
                              <th className="px-3 py-2 text-left">Valor base (Feegow)</th>
                              <th className="px-3 py-2 text-left">Valor do profissional</th>
                              <th className="px-3 py-2 text-left">Acoes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {proceduresLoading ? (
                              <tr>
                                <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                                  <span className="inline-flex items-center gap-2">
                                    <Loader2 size={14} className="animate-spin" />
                                    Carregando procedimentos do profissional...
                                  </span>
                                </td>
                              </tr>
                            ) : procedureRates.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                                  Nenhum procedimento vinculado.
                                </td>
                              </tr>
                            ) : (
                              procedureRates.map((item, idx) => (
                                <tr key={`${item.procedimentoId}-${idx}`} className="border-t">
                                  <td className="px-3 py-2">
                                    {item.procedimentoNome}
                                  </td>
                                  <td className="px-3 py-2">{formatCurrency(item.valorBase)}</td>
                                  <td className="px-3 py-2">
                                    <input
                                      value={item.valorProfissional}
                                      onChange={(e) =>
                                        setProcedureRates((prev) => {
                                          const next = [...prev];
                                          next[idx] = { ...next[idx], valorProfissional: e.target.value };
                                          return next;
                                        })
                                      }
                                      className="w-40 px-2 py-1 border rounded"
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setProcedureRates((prev) =>
                                          prev.filter((_, rowIdx) => rowIdx !== idx)
                                        )
                                      }
                                      className="text-xs px-2 py-1 border rounded-md text-rose-700 border-rose-300 hover:bg-rose-50"
                                      disabled={!canEdit}
                                    >
                                      Remover
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={saveProcedureRates}
                          disabled={!canEdit || procedureSaveLoading}
                          className="px-3 py-2 rounded-lg bg-[#17407E] text-white text-sm disabled:opacity-60 inline-flex items-center gap-2"
                        >
                          {procedureSaveLoading && <Loader2 size={14} className="animate-spin" />}
                          {procedureSaveLoading ? 'Salvando...' : 'Salvar procedimentos'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {modalTab === 'contratos' && (
                <div className="space-y-4">
                  {!editingId ? (
                    <div className="text-sm px-3 py-2 rounded border bg-slate-50 text-slate-600">
                      Salve o profissional primeiro para habilitar a geração de contratos.
                    </div>
                  ) : (
                    <>
                      <div className="border rounded-xl p-4 bg-slate-50/70 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                          <div className="md:col-span-2">
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
                              Modelo selecionado
                            </label>
                            <select
                              value={form.contractTemplateId}
                              onChange={(e) => setForm((p) => ({ ...p, contractTemplateId: e.target.value }))}
                              className="w-full px-3 py-2 border rounded-lg bg-white"
                            >
                              <option value="">Selecione</option>
                              {contractTemplateOptions.map((tpl) => (
                                <option key={tpl.id} value={tpl.id}>
                                  {tpl.name} (v{tpl.version})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={generateContractNow}
                              disabled={!canEdit || generatingContract}
                              className="px-3 py-2 rounded-lg bg-[#17407E] text-white text-sm disabled:opacity-60 inline-flex items-center gap-2"
                            >
                              {generatingContract && <Loader2 size={14} className="animate-spin" />}
                              {generatingContract ? 'Gerando...' : 'Gerar contrato'}
                            </button>
                            <button
                              type="button"
                              onClick={() => editingId && fetchContracts(editingId)}
                              className="px-3 py-2 border rounded-lg text-sm inline-flex items-center gap-2"
                            >
                              <RefreshCw size={14} />
                              Atualizar
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="border rounded-xl overflow-auto">
                        <table className="w-full text-sm min-w-[980px]">
                          <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                            <tr>
                              <th className="px-3 py-2 text-left">Data</th>
                              <th className="px-3 py-2 text-left">Modelo</th>
                              <th className="px-3 py-2 text-left">Versao</th>
                              <th className="px-3 py-2 text-left">Status</th>
                              <th className="px-3 py-2 text-left">Gerado por</th>
                              <th className="px-3 py-2 text-left">Erro</th>
                              <th className="px-3 py-2 text-left">Acoes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {contractsLoading ? (
                              <tr>
                                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                                  <span className="inline-flex items-center gap-2">
                                    <Loader2 size={14} className="animate-spin" />
                                    Carregando contratos...
                                  </span>
                                </td>
                              </tr>
                            ) : contracts.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                                  Nenhum contrato gerado para este profissional.
                                </td>
                              </tr>
                            ) : (
                              contracts.map((contract) => {
                                const hasPdf = hasGeneratedPdf(contract);
                                const hasDocx = hasGeneratedDocx(contract);
                                const downloadBaseHref = `/api/admin/profissionais/${encodeURIComponent(contract.professionalId)}/contratos/${encodeURIComponent(contract.id)}/download`;
                                return (
                                  <tr key={contract.id} className="border-t">
                                    <td className="px-3 py-2">
                                      {contract.createdAt ? contract.createdAt.slice(0, 19).replace('T', ' ') : '-'}
                                    </td>
                                    <td className="px-3 py-2">{contract.templateName || '-'}</td>
                                    <td className="px-3 py-2">{contract.templateVersion || '-'}</td>
                                    <td className="px-3 py-2">
                                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                        contract.status === 'GERADO'
                                          ? 'bg-emerald-100 text-emerald-700'
                                          : contract.status === 'ERRO'
                                            ? 'bg-rose-100 text-rose-700'
                                            : 'bg-slate-100 text-slate-700'
                                      }`}>
                                        {contract.status}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2">{contract.generatedBy || '-'}</td>
                                    <td className="px-3 py-2 text-rose-700">{contract.errorMessage || '-'}</td>
                                    <td className="px-3 py-2">
                                      <div className="flex items-center gap-3">
                                        {!hasPdf && !hasDocx ? (
                                          <span className="text-xs text-slate-400">Sem arquivo</span>
                                        ) : (
                                          <>
                                            {hasPdf && (
                                              <a
                                                href={`${downloadBaseHref}?format=pdf&inline=1`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-1 text-[#17407E] hover:underline"
                                              >
                                                <Eye size={13} />
                                                Visualizar PDF
                                              </a>
                                            )}
                                            {hasPdf && (
                                              <a
                                                href={`${downloadBaseHref}?format=pdf`}
                                                className="inline-flex items-center gap-1 text-[#17407E] hover:underline"
                                              >
                                                <Download size={13} />
                                                Baixar PDF
                                              </a>
                                            )}
                                            {hasDocx && (
                                              <a
                                                href={`${downloadBaseHref}?format=docx`}
                                                className="inline-flex items-center gap-1 text-[#17407E] hover:underline"
                                              >
                                                <Download size={13} />
                                                Baixar Word
                                              </a>
                                            )}
                                          </>
                                        )}
                                        <button
                                          type="button"
                                          onClick={generateContractNow}
                                          disabled={!canEdit || generatingContract}
                                          className="text-xs px-2 py-1 border rounded-md"
                                        >
                                          Gerar novo
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => reprocessContract(contract.id)}
                                          disabled={!canEdit || contract.status !== 'ERRO' || reprocessingContractId === contract.id}
                                          className="text-xs px-2 py-1 border rounded-md disabled:opacity-50 inline-flex items-center gap-1"
                                        >
                                          {reprocessingContractId === contract.id && <Loader2 size={12} className="animate-spin" />}
                                          {reprocessingContractId === contract.id ? 'Reprocessando...' : (
                                            <>
                                              <RotateCcw size={12} />
                                              Reprocessar
                                            </>
                                          )}
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t flex justify-end gap-2">
              <button type="button" className="px-3 py-2 border rounded-lg" onClick={() => setIsModalOpen(false)}>
                {modalTab === 'cadastro' ? 'Cancelar' : 'Fechar'}
              </button>
              {modalTab === 'cadastro' && (
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || !canEdit}
                  className="px-3 py-2 rounded-lg bg-[#17407E] text-white disabled:opacity-60 inline-flex items-center gap-2"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[60] bg-black/40 p-4 flex items-center justify-center">
          <div className="w-full max-w-md bg-white border rounded-2xl p-5">
            <h3 className="text-lg font-semibold text-slate-800">Confirmar exclusao</h3>
            <p className="text-sm text-slate-600 mt-2">
              Deseja realmente excluir o profissional <strong>{deleteTarget.name}</strong>?
              Esta acao remove cadastro, registros e checklist do sistema.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-2 border rounded-lg"
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="px-3 py-2 rounded-lg bg-rose-600 text-white disabled:opacity-60 inline-flex items-center gap-2"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                {deleting ? 'Excluindo...' : 'Excluir profissional'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .dual-range-input {
          appearance: none;
          -webkit-appearance: none;
          background: transparent;
          pointer-events: none;
        }
        .dual-range-input::-webkit-slider-runnable-track {
          height: 0;
          background: transparent;
        }
        .dual-range-input::-moz-range-track {
          height: 0;
          background: transparent;
          border: 0;
        }
        .dual-range-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          pointer-events: auto;
          height: 16px;
          width: 16px;
          border-radius: 9999px;
          border: 2px solid #17407e;
          background: #ffffff;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
          cursor: pointer;
          margin-top: -8px;
        }
        .dual-range-input::-moz-range-thumb {
          pointer-events: auto;
          height: 16px;
          width: 16px;
          border-radius: 9999px;
          border: 2px solid #17407e;
          background: #ffffff;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
