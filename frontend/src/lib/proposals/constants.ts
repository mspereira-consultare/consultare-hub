export const AWAITING_CLIENT_APPROVAL_STATUS = 'Aguardando aprova\u00e7\u00e3o do cliente';

export const PROPOSAL_CONVERSION_STATUSES = [
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'EM_CONTATO', label: 'Em contato' },
  { value: 'CONVERTIDO', label: 'Convertido' },
  { value: 'NAO_CONVERTIDO', label: 'N\u00e3o convertido' },
] as const;

export type ProposalConversionStatus = (typeof PROPOSAL_CONVERSION_STATUSES)[number]['value'];

export const PROPOSAL_CONVERSION_REASONS_BY_STATUS = {
  EM_CONTATO: [
    { value: 'SEM_RETORNO', label: 'Sem retorno' },
    { value: 'RETORNAR_DEPOIS', label: 'Retornar depois' },
    { value: 'AGUARDANDO_RESPOSTA', label: 'Aguardando resposta' },
  ],
  NAO_CONVERTIDO: [
    { value: 'SEM_INTERESSE', label: 'Sem interesse' },
    { value: 'PRECO', label: 'Pre\u00e7o' },
    { value: 'SEM_DISPONIBILIDADE', label: 'Sem disponibilidade' },
    { value: 'CONTATO_INVALIDO', label: 'Contato inv\u00e1lido' },
    { value: 'DUPLICADO', label: 'Duplicado' },
    { value: 'JA_REALIZOU', label: 'J\u00e1 realizou' },
    { value: 'OUTRO', label: 'Outro' },
  ],
} as const;

export type ProposalConversionReason =
  | (typeof PROPOSAL_CONVERSION_REASONS_BY_STATUS.EM_CONTATO)[number]['value']
  | (typeof PROPOSAL_CONVERSION_REASONS_BY_STATUS.NAO_CONVERTIDO)[number]['value'];
