export type PayrollPeriodStatus = 'ABERTA' | 'EM_REVISAO' | 'APROVADA' | 'ENVIADA';
export type PayrollImportFileType = 'SYNC_TIMESHEET';
export type PayrollImportStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type PayrollLineStatus = 'RASCUNHO' | 'EM_REVISAO' | 'APROVADO';
export type PayrollTransportVoucherMode = 'PER_DAY' | 'MONTHLY_FIXED' | 'NONE';
export type PayrollSyncJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type PayrollSignatureStatus =
  | 'SEM_PENDENCIA'
  | 'PENDENTE'
  | 'ASSINADO'
  | 'CONTESTADO'
  | 'PROCESSANDO'
  | 'VIGENCIA_INVALIDA'
  | 'ERRO'
  | 'CANCELADO';
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
  { value: 'SYNC_TIMESHEET', label: 'Espelho sincronizado da Sólides' },
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

export const PAYROLL_SYNC_JOB_STATUSES: Array<{ value: PayrollSyncJobStatus; label: string }> = [
  { value: 'PENDING', label: 'Pendente' },
  { value: 'RUNNING', label: 'Executando' },
  { value: 'COMPLETED', label: 'Concluído' },
  { value: 'FAILED', label: 'Falhou' },
];

export const PAYROLL_SIGNATURE_STATUSES: Array<{ value: PayrollSignatureStatus; label: string }> = [
  { value: 'SEM_PENDENCIA', label: 'Sem pendência' },
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'ASSINADO', label: 'Assinado' },
  { value: 'CONTESTADO', label: 'Contestado' },
  { value: 'PROCESSANDO', label: 'Processando' },
  { value: 'VIGENCIA_INVALIDA', label: 'Vigência inválida' },
  { value: 'ERRO', label: 'Erro' },
  { value: 'CANCELADO', label: 'Cancelado' },
];

export const DEFAULT_PAYROLL_RULES = {
  minWageAmount: Number(process.env.PAYROLL_DEFAULT_MIN_WAGE || '1518'),
  lateToleranceMinutes: Number(process.env.PAYROLL_DEFAULT_LATE_TOLERANCE || '15'),
  vtDiscountCapPercent: Number(process.env.PAYROLL_DEFAULT_VT_CAP_PERCENT || '6'),
};
