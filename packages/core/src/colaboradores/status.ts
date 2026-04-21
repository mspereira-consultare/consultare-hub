import {
  EMPLOYEE_DOCUMENT_TYPE_MAP,
  type AsoStatus,
  type EmployeeDocumentTypeCode,
  type MaritalStatus,
} from './constants';
import type { EmployeeDocument, EmployeeInput, EmployeeListItem } from './types';

const toIsoDate = (value: string | null | undefined): string | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const isoWithTime = raw.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (isoWithTime) return `${isoWithTime[1]}-${isoWithTime[2]}-${isoWithTime[3]}`;
  return null;
};

export const getTodayInSaoPauloIso = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const addDays = (dateIso: string, days: number) => {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const hasActiveDocument = (documents: EmployeeDocument[], docType: EmployeeDocumentTypeCode) =>
  documents.some((doc) => doc.docType === docType && doc.isActive);

export const getExpectedDocumentTypes = (
  employee: Pick<EmployeeInput | EmployeeListItem, 'employmentRegime' | 'maritalStatus' | 'hasChildren'>
): EmployeeDocumentTypeCode[] => {
  const required = new Set<EmployeeDocumentTypeCode>([
    'CURRICULO',
    'FOTO_3X4',
    'CTPS',
    'PIS_CARTAO_CIDADAO',
    'RG_E_CPF',
    'CERTIDAO_NASCIMENTO',
    'CARTEIRA_VACINACAO',
    'TITULO_ELEITOR',
    'ULTIMO_PROTOCOLO_VOTACAO',
    'RESERVISTA_OU_ALISTAMENTO',
    'COMPROVANTE_ENDERECO',
    'COMPROVANTE_ESCOLARIDADE',
    'ANTECEDENTES_CRIMINAIS',
    'VACINACAO_COVID_E_GRIPE',
    'ASO',
  ]);

  if (employee.employmentRegime === 'ESTAGIO') {
    required.add('COMPROVANTE_MATRICULA_ESTAGIO');
    required.add('RELATORIO_SEMESTRAL_ESTAGIO');
  }

  const maritalStatus = String(employee.maritalStatus || '') as MaritalStatus;
  if (maritalStatus === 'CASADO' || maritalStatus === 'UNIAO_ESTAVEL') {
    required.add('CERTIDAO_CASAMENTO_OU_UNIAO');
    required.add('RG_E_CPF_CONJUGE');
  }

  if (employee.hasChildren) {
    required.add('CERTIDAO_FILHOS');
    required.add('VACINACAO_FILHOS');
    required.add('CPF_FILHOS');
  }

  return Array.from(required);
};

export const computeAsoStatus = (
  documents: EmployeeDocument[]
): { status: AsoStatus; expiresAt: string | null } => {
  const aso = documents.find((doc) => doc.isActive && doc.docType === 'ASO') || null;
  const expiresAt = toIsoDate(aso?.expiresAt || null);
  if (!aso || !expiresAt) return { status: 'PENDENTE', expiresAt };

  const today = getTodayInSaoPauloIso();
  const warningDate = addDays(today, 30);
  if (expiresAt < today) return { status: 'VENCIDO', expiresAt };
  if (expiresAt <= warningDate) return { status: 'VENCENDO', expiresAt };
  return { status: 'OK', expiresAt };
};

export const computeMissingDocuments = (
  employee: Pick<EmployeeInput | EmployeeListItem, 'employmentRegime' | 'maritalStatus' | 'hasChildren'>,
  documents: EmployeeDocument[]
): EmployeeDocumentTypeCode[] => {
  const expected = getExpectedDocumentTypes(employee);
  return expected.filter((docType) => !hasActiveDocument(documents, docType));
};

export const computeDocumentProgress = (
  employee: Pick<EmployeeInput | EmployeeListItem, 'employmentRegime' | 'maritalStatus' | 'hasChildren'>,
  documents: EmployeeDocument[]
) => {
  const expected = getExpectedDocumentTypes(employee);
  const done = expected.filter((docType) => hasActiveDocument(documents, docType)).length;
  return { done, total: expected.length };
};

export const getDocumentTypeLabel = (docType: EmployeeDocumentTypeCode) =>
  EMPLOYEE_DOCUMENT_TYPE_MAP.get(docType)?.label || docType;
