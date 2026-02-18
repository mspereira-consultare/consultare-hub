export type ContractPartyType = 'PF' | 'PJ';
export type DocumentValidationMode = 'hybrid' | 'upload_required';

export type DocumentTypeCode =
  | 'FOTO'
  | 'DIPLOMA'
  | 'DIPLOMA_ESPECIALIDADE'
  | 'CERTIDAO_ETICA'
  | 'CONTRATO_ASSINADO';

export type CertidaoStatus = 'OK' | 'VENCENDO' | 'VENCIDA' | 'PENDENTE';

export type ContractTypeCode =
  | 'PADRAO_CLT'
  | 'PJ_PADRAO'
  | 'PLANTONISTA';

export type ContractTypeDef = {
  code: ContractTypeCode;
  label: string;
  templateKey: string;
  templateVersion: string;
  isActive: boolean;
};

export type DocumentTypeDef = {
  code: DocumentTypeCode;
  label: string;
  required: boolean;
  hasExpiration: boolean;
  warningDays: number;
};

export const DOCUMENT_VALIDATION_MODE: DocumentValidationMode = 'hybrid';

export const DOCUMENT_TYPES: DocumentTypeDef[] = [
  {
    code: 'FOTO',
    label: 'Foto',
    required: true,
    hasExpiration: false,
    warningDays: 0,
  },
  {
    code: 'DIPLOMA',
    label: 'Diploma',
    required: true,
    hasExpiration: false,
    warningDays: 0,
  },
  {
    code: 'DIPLOMA_ESPECIALIDADE',
    label: 'Diploma de Especialidade',
    required: true,
    hasExpiration: false,
    warningDays: 0,
  },
  {
    code: 'CERTIDAO_ETICA',
    label: 'Certidao Etica Profissional',
    required: true,
    hasExpiration: true,
    warningDays: 30,
  },
  {
    code: 'CONTRATO_ASSINADO',
    label: 'Contrato Assinado',
    required: false,
    hasExpiration: false,
    warningDays: 0,
  },
];

export const REQUIRED_DOCUMENT_TYPES = DOCUMENT_TYPES.filter((item) => item.required);

export const CONTRACT_TYPES: ContractTypeDef[] = [
  {
    code: 'PADRAO_CLT',
    label: 'Padrao CLT',
    templateKey: 'contrato_padrao_clt',
    templateVersion: 'v1',
    isActive: true,
  },
  {
    code: 'PJ_PADRAO',
    label: 'PJ Padrao',
    templateKey: 'contrato_pj_padrao',
    templateVersion: 'v1',
    isActive: true,
  },
  {
    code: 'PLANTONISTA',
    label: 'Plantonista',
    templateKey: 'contrato_plantonista',
    templateVersion: 'v1',
    isActive: true,
  },
];

export const PERSONAL_DOC_TYPES = ['RG', 'CPF', 'CNH'] as const;

export const COUNCIL_TYPES = [
  'CRM',
  'CRO',
  'CRP',
  'CRN',
  'CREFITO',
  'COREN',
  'CREF',
  'OUTRO',
] as const;

export const CERTIDAO_DOC_TYPE: DocumentTypeCode = 'CERTIDAO_ETICA';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

