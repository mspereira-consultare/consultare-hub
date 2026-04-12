export type PayrollPeriodStatus = 'ABERTA' | 'EM_REVISAO' | 'APROVADA' | 'ENVIADA';
export type PayrollImportFileType = 'POINT_PDF' | 'REFERENCE_XLSX';
export type PayrollImportStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type PayrollLineStatus = 'RASCUNHO' | 'EM_REVISAO' | 'APROVADO';
export type PayrollComparisonStatus = 'IGUAL' | 'DIVERGENTE' | 'SEM_BASE' | 'SO_NA_BASE';
export type PayrollTransportVoucherMode = 'PER_DAY' | 'MONTHLY_FIXED' | 'NONE';
export type PayrollOccurrenceType =
  | 'ATESTADO'
  | 'DECLARACAO'
  | 'AJUSTE_BATIDA'
  | 'AUSENCIA_AUTORIZADA'
  | 'FALTA_INJUSTIFICADA'
  | 'FERIAS';

export const PAYROLL_PERIOD_STATUSES: Array<{ value: PayrollPeriodStatus; label: string }> = [
  { value: 'ABERTA', label: 'Aberta' },
  { value: 'EM_REVISAO', label: 'Em revisão' },
  { value: 'APROVADA', label: 'Aprovada' },
  { value: 'ENVIADA', label: 'Enviada' },
];

export const PAYROLL_IMPORT_FILE_TYPES: Array<{ value: PayrollImportFileType; label: string }> = [
  { value: 'POINT_PDF', label: 'Relatório de ponto (PDF)' },
  { value: 'REFERENCE_XLSX', label: 'Planilha de referência (XLSX)' },
];

export const PAYROLL_IMPORT_STATUSES: Array<{ value: PayrollImportStatus; label: string }> = [
  { value: 'PENDING', label: 'Pendente' },
  { value: 'PROCESSING', label: 'Processando' },
  { value: 'COMPLETED', label: 'Concluído' },
  { value: 'FAILED', label: 'Falhou' },
];

export const PAYROLL_LINE_STATUSES: Array<{ value: PayrollLineStatus; label: string }> = [
  { value: 'RASCUNHO', label: 'Rascunho' },
  { value: 'EM_REVISAO', label: 'Em revisão' },
  { value: 'APROVADO', label: 'Aprovado' },
];

export const PAYROLL_COMPARISON_STATUSES: Array<{ value: PayrollComparisonStatus; label: string }> = [
  { value: 'IGUAL', label: 'Igual' },
  { value: 'DIVERGENTE', label: 'Divergente' },
  { value: 'SEM_BASE', label: 'Sem base' },
  { value: 'SO_NA_BASE', label: 'Só na base' },
];

export const PAYROLL_OCCURRENCE_TYPES: Array<{ value: PayrollOccurrenceType; label: string }> = [
  { value: 'ATESTADO', label: 'Atestado' },
  { value: 'DECLARACAO', label: 'Declaração' },
  { value: 'AJUSTE_BATIDA', label: 'Ajuste de batida' },
  { value: 'AUSENCIA_AUTORIZADA', label: 'Ausência autorizada' },
  { value: 'FALTA_INJUSTIFICADA', label: 'Falta injustificada' },
  { value: 'FERIAS', label: 'Férias' },
];

export const PAYROLL_TRANSPORT_VOUCHER_MODES: Array<{ value: PayrollTransportVoucherMode; label: string }> = [
  { value: 'PER_DAY', label: 'Por dia trabalhado' },
  { value: 'MONTHLY_FIXED', label: 'Valor mensal fixo' },
  { value: 'NONE', label: 'Não se aplica' },
];

export const DEFAULT_PAYROLL_RULES = {
  minWageAmount: Number(process.env.PAYROLL_DEFAULT_MIN_WAGE || '1518'),
  lateToleranceMinutes: Number(process.env.PAYROLL_DEFAULT_LATE_TOLERANCE || '15'),
  vtDiscountCapPercent: Number(process.env.PAYROLL_DEFAULT_VT_CAP_PERCENT || '6'),
};

