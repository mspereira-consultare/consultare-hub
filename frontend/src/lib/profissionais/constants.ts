export type ContractPartyType = 'PF' | 'PJ';
export type DocumentValidationMode = 'hybrid' | 'upload_required';

export type DocumentTypeCode =
  | 'FOTO'
  | 'CARTEIRA_IDENTIDADE_PROFISSIONAL'
  | 'DIPLOMA'
  | 'DIPLOMA_ESPECIALIDADE'
  | 'COMPROVANTE_ENDERECO'
  | 'RG_CPF_CNH'
  | 'CURRICULO'
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
    code: 'CARTEIRA_IDENTIDADE_PROFISSIONAL',
    label: 'Carteira de Identidade Profissional',
    required: false,
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
    code: 'COMPROVANTE_ENDERECO',
    label: 'Comprovante de Endereco',
    required: false,
    hasExpiration: false,
    warningDays: 0,
  },
  {
    code: 'RG_CPF_CNH',
    label: 'RG/CPF/CNH',
    required: false,
    hasExpiration: false,
    warningDays: 0,
  },
  {
    code: 'CURRICULO',
    label: 'Curriculo',
    required: false,
    hasExpiration: false,
    warningDays: 0,
  },
  {
    code: 'CERTIDAO_ETICA',
    label: 'CERTIDAO DE ETICO PROFISSIONAL',
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
    label: 'ESPECIALIDADES',
    templateKey: 'contrato_padrao_clt',
    templateVersion: 'v1',
    isActive: true,
  },
  {
    code: 'PJ_PADRAO',
    label: 'ODONTOLOGIA',
    templateKey: 'contrato_pj_padrao',
    templateVersion: 'v1',
    isActive: true,
  },
  {
    code: 'PLANTONISTA',
    label: 'ULTRASSOM',
    templateKey: 'contrato_plantonista',
    templateVersion: 'v1',
    isActive: true,
  },
];

export const PERSONAL_DOC_TYPES = ['RG', 'CPF', 'CNH'] as const;

export const COUNCIL_TYPES = [
  'COREN',
  'CRM',
  'CRO',
  'CRF',
  'CRFIS',
  'CRN',
  'CRP',
  'CRBM',
  'CRFONO',
  'CRTR',
  'CRFA',
  'CRVV',
  'CRQ',
] as const;

export const BRAZIL_UFS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;

export const PROFESSIONAL_SERVICE_UNITS = [
  'OURO VERDE',
  'CENTRO CAMBUI',
  'SHOPPING CAMPINAS',
] as const;

export const PROFESSIONAL_AGE_RANGES = [
  'Pediatrico',
  'Adulto',
  'Idoso',
  'Todas as idades',
] as const;

export const CERTIDAO_DOC_TYPE: DocumentTypeCode = 'CERTIDAO_ETICA';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
