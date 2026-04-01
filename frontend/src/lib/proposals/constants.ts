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
    { value: 'REALIZOU_OUTRO_LOCAL', label: 'Realizou em outro local' },
    { value: 'PROBLEMAS_FINANCEIROS', label: 'Problemas financeiros' },
    { value: 'REALIZOU_SUS', label: 'Realizou no SUS' },
    { value: 'REALIZOU_CONVENIO', label: 'Realizou pelo conv\u00eanio' },
    { value: 'RETORNAR_DEPOIS', label: 'Retornar depois (fluxo do follow up)' },
    { value: 'TELEFONE_INVALIDO', label: 'Telefone inv\u00e1lido' },
    { value: 'OUTROS', label: 'Outros' },
  ],
  NAO_CONVERTIDO: [
    { value: 'REALIZOU_OUTRO_LOCAL', label: 'Realizou em outro local' },
    { value: 'PROBLEMAS_FINANCEIROS', label: 'Problemas financeiros' },
    { value: 'REALIZOU_SUS', label: 'Realizou no SUS' },
    { value: 'REALIZOU_CONVENIO', label: 'Realizou pelo conv\u00eanio' },
    { value: 'RETORNAR_DEPOIS', label: 'Retornar depois (fluxo do follow up)' },
    { value: 'TELEFONE_INVALIDO', label: 'Telefone inv\u00e1lido' },
    { value: 'OUTROS', label: 'Outros' },
  ],
} as const;

export type ProposalConversionReason =
  | (typeof PROPOSAL_CONVERSION_REASONS_BY_STATUS.EM_CONTATO)[number]['value']
  | (typeof PROPOSAL_CONVERSION_REASONS_BY_STATUS.NAO_CONVERTIDO)[number]['value'];
