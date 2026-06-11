export const POST_CONSULT_NON_CLOSURE_REASONS = [
  { value: 'HAS_CONVENIO', label: 'Tem convênio' },
  { value: 'FALAR_COM_TERCEIROS', label: 'Falar com terceiros' },
  { value: 'SEM_DINHEIRO', label: 'Sem dinheiro' },
  { value: 'VAI_PESQUISAR_OUTRO_LOCAL', label: 'Vai pesquisar em outro local' },
  { value: 'VAI_FAZER_SUS', label: 'Vai fazer no SUS' },
  { value: 'OUTROS', label: 'Outros' },
] as const;

export type PostConsultNonClosureReason = (typeof POST_CONSULT_NON_CLOSURE_REASONS)[number]['value'];

export const POST_CONSULT_EXECUTED_PROPOSAL_STATUSES = [
  'executada',
  'aprovada pelo cliente',
  'ganho',
  'realizado',
  'concluido',
  'pago',
] as const;
