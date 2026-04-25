export const EQUIPMENT_UNITS = [
  'SHOPPING CAMPINAS',
  'CENTRO CAMBUI',
  'OURO VERDE',
  'RESOLVECARD GESTAO DE BENEFICOS E MEIOS DE PAGAMENTOS',
] as const;

export const EQUIPMENT_UNIT_LABELS: Record<(typeof EQUIPMENT_UNITS)[number], string> = {
  'SHOPPING CAMPINAS': 'Shopping Campinas',
  'CENTRO CAMBUI': 'Cambuí Centro',
  'OURO VERDE': 'Ouro Verde',
  'RESOLVECARD GESTAO DE BENEFICOS E MEIOS DE PAGAMENTOS': 'Resolvecard',
};

export type EquipmentUnit = (typeof EQUIPMENT_UNITS)[number];

export const EQUIPMENT_TYPES = [
  { value: 'ADMINISTRATIVO', label: 'Administrativo' },
  { value: 'OPERACIONAL', label: 'Operacional' },
  { value: 'TI', label: 'TI' },
] as const;

export type EquipmentType = (typeof EQUIPMENT_TYPES)[number]['value'];

export const EQUIPMENT_OPERATIONAL_STATUSES = [
  { value: 'ATIVO', label: 'Ativo' },
  { value: 'EM_MANUTENCAO', label: 'Em manutenção' },
  { value: 'INATIVO', label: 'Inativo' },
  { value: 'DESCARTADO', label: 'Descartado' },
] as const;

export type EquipmentOperationalStatus = (typeof EQUIPMENT_OPERATIONAL_STATUSES)[number]['value'];

export const EQUIPMENT_CALIBRATION_STATUSES = [
  { value: 'EM_DIA', label: 'Em dia' },
  { value: 'VENCENDO', label: 'Vencendo' },
  { value: 'VENCIDO', label: 'Vencido' },
  { value: 'SEM_PROGRAMACAO', label: 'Sem programação' },
  { value: 'NAO_APLICAVEL', label: 'Não aplicável' },
] as const;

export type EquipmentCalibrationStatus = (typeof EQUIPMENT_CALIBRATION_STATUSES)[number]['value'];

export const EQUIPMENT_EVENT_TYPES = [
  { value: 'MANUTENCAO_PREVENTIVA', label: 'Manutenção preventiva' },
  { value: 'MANUTENCAO_CORRETIVA', label: 'Manutenção corretiva' },
  { value: 'OCORRENCIA', label: 'Ocorrência' },
  { value: 'CALIBRACAO', label: 'Calibração' },
] as const;

export type EquipmentEventType = (typeof EQUIPMENT_EVENT_TYPES)[number]['value'];

export const EQUIPMENT_EVENT_STATUSES = [
  { value: 'ABERTO', label: 'Aberto' },
  { value: 'EM_ANDAMENTO', label: 'Em andamento' },
  { value: 'CONCLUIDO', label: 'Concluído' },
  { value: 'CANCELADO', label: 'Cancelado' },
] as const;

export type EquipmentEventStatus = (typeof EQUIPMENT_EVENT_STATUSES)[number]['value'];

export const EQUIPMENT_FILE_TYPES = [
  { value: 'FOTO', label: 'Foto' },
  { value: 'CERTIFICADO', label: 'Certificado' },
  { value: 'MANUAL', label: 'Manual' },
  { value: 'OUTRO', label: 'Outro' },
] as const;

export type EquipmentFileType = (typeof EQUIPMENT_FILE_TYPES)[number]['value'];

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const CALIBRATION_WARNING_DAYS = 30;
