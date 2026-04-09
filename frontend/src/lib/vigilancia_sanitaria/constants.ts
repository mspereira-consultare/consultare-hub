export const SURVEILLANCE_UNITS = [
  'SHOPPING CAMPINAS',
  'CENTRO CAMBUI',
  'OURO VERDE',
  'RESOLVECARD GESTAO DE BENEFICOS E MEIOS DE PAGAMENTOS',
] as const;

export type SurveillanceUnit = (typeof SURVEILLANCE_UNITS)[number];

export const SURVEILLANCE_UNIT_LABELS: Record<SurveillanceUnit, string> = {
  'SHOPPING CAMPINAS': 'Shopping Campinas',
  'CENTRO CAMBUI': 'Cambuí Centro',
  'OURO VERDE': 'Ouro Verde',
  'RESOLVECARD GESTAO DE BENEFICOS E MEIOS DE PAGAMENTOS': 'Resolvecard',
};

export const SURVEILLANCE_EXPIRATION_STATUSES = [
  { value: 'VENCIDO', label: 'Vencido' },
  { value: 'VENCE_HOJE', label: 'Vence hoje' },
  { value: 'VENCENDO', label: 'Vencendo' },
  { value: 'EM_DIA', label: 'Em dia' },
  { value: 'SEM_VALIDADE', label: 'Sem validade' },
] as const;

export type SurveillanceExpirationStatus = (typeof SURVEILLANCE_EXPIRATION_STATUSES)[number]['value'];

export const SURVEILLANCE_RENEWAL_STATUSES = [
  { value: 'NAO_INICIADO', label: 'Não iniciado' },
  { value: 'EM_ANDAMENTO', label: 'Em andamento' },
  { value: 'PROTOCOLADO', label: 'Protocolado' },
  { value: 'RENOVADO', label: 'Renovado' },
  { value: 'NAO_APLICAVEL', label: 'Não aplicável' },
] as const;

export type SurveillanceRenewalStatus = (typeof SURVEILLANCE_RENEWAL_STATUSES)[number]['value'];

export const SURVEILLANCE_DOCUMENT_TYPES = [
  { value: 'CERTIFICADO', label: 'Certificado' },
  { value: 'LAUDO', label: 'Laudo' },
  { value: 'DECLARACAO', label: 'Declaração' },
  { value: 'COMPROVANTE', label: 'Comprovante' },
  { value: 'RELATORIO', label: 'Relatório' },
  { value: 'OUTRO', label: 'Outro' },
] as const;

export type SurveillanceDocumentType = (typeof SURVEILLANCE_DOCUMENT_TYPES)[number]['value'];

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const EXPIRATION_WARNING_DAYS = 60;
