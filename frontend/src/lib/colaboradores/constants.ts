export type EmploymentRegime = 'CLT' | 'PJ' | 'ESTAGIO';
export type EmployeeStatus = 'ATIVO' | 'DESLIGADO';
export type AsoStatus = 'PENDENTE' | 'OK' | 'VENCENDO' | 'VENCIDO';
export type EducationLevel = 'MEDIO' | 'TECNICO' | 'SUPERIOR';
export type MaritalStatus = 'SOLTEIRO' | 'CASADO' | 'UNIAO_ESTAVEL' | 'DIVORCIADO' | 'VIUVO';
export type LifeInsuranceStatus = 'ATIVO' | 'INATIVO';
export type UniformDeliveryType = 'PRIMEIRA_ENTREGA' | 'REPOSICAO' | 'TROCA';
export type UniformItemStatus = 'ATIVO' | 'DEVOLVIDO' | 'PENDENTE';
export type LockerKeyStatus = 'COLABORADOR' | 'RH_DP' | 'PERDIDA';
export type RecessSituation = 'QUITADAS' | 'VENCIDAS' | 'EM_ABERTO';
export type EmployeeTransportVoucherMode = 'PER_DAY' | 'MONTHLY_FIXED' | 'NONE';

export type EmployeeDocumentTypeCode =
  | 'CURRICULO'
  | 'FOTO_3X4'
  | 'CTPS'
  | 'PIS_CARTAO_CIDADAO'
  | 'RG_E_CPF'
  | 'CNH'
  | 'CERTIDAO_NASCIMENTO'
  | 'CARTEIRA_VACINACAO'
  | 'TITULO_ELEITOR'
  | 'ULTIMO_PROTOCOLO_VOTACAO'
  | 'RESERVISTA_OU_ALISTAMENTO'
  | 'COMPROVANTE_ENDERECO'
  | 'COMPROVANTE_ESCOLARIDADE'
  | 'CERTIFICADOS_CURSOS_TREINAMENTOS'
  | 'ANTECEDENTES_CRIMINAIS'
  | 'VACINACAO_COVID_E_GRIPE'
  | 'ASO'
  | 'CERTIDAO_CASAMENTO_OU_UNIAO'
  | 'RG_E_CPF_CONJUGE'
  | 'CERTIDAO_FILHOS'
  | 'VACINACAO_FILHOS'
  | 'CPF_FILHOS'
  | 'COMPROVANTE_MATRICULA_ESTAGIO'
  | 'RELATORIO_SEMESTRAL_ESTAGIO'
  | 'OUTRO';

export type EmployeeDocumentTypeDef = {
  code: EmployeeDocumentTypeCode;
  label: string;
  hasIssueDate: boolean;
  hasExpiration: boolean;
  optional: boolean;
};

export const EMPLOYMENT_REGIMES: Array<{ value: EmploymentRegime; label: string }> = [
  { value: 'CLT', label: 'CLT' },
  { value: 'PJ', label: 'PJ' },
  { value: 'ESTAGIO', label: 'Estágio' },
];

export const EMPLOYEE_STATUSES: Array<{ value: EmployeeStatus; label: string }> = [
  { value: 'ATIVO', label: 'Ativo' },
  { value: 'DESLIGADO', label: 'Desligado' },
];

export const EMPLOYEE_UNITS = [
  'SHOPPING CAMPINAS',
  'CENTRO CAMBUI',
  'OURO VERDE',
  'RESOLVECARD GESTAO DE BENEFICOS E MEIOS DE PAGAMENTOS',
] as const;

export const EMPLOYEE_UNIT_LABELS: Record<(typeof EMPLOYEE_UNITS)[number], string> = {
  'SHOPPING CAMPINAS': 'Shopping Campinas',
  'CENTRO CAMBUI': 'Cambuí Centro',
  'OURO VERDE': 'Ouro Verde',
  'RESOLVECARD GESTAO DE BENEFICOS E MEIOS DE PAGAMENTOS': 'Resolvecard',
};

export const EDUCATION_LEVELS: Array<{ value: EducationLevel; label: string }> = [
  { value: 'MEDIO', label: 'Médio' },
  { value: 'TECNICO', label: 'Técnico' },
  { value: 'SUPERIOR', label: 'Superior' },
];

export const MARITAL_STATUSES: Array<{ value: MaritalStatus; label: string }> = [
  { value: 'SOLTEIRO', label: 'Solteiro(a)' },
  { value: 'CASADO', label: 'Casado(a)' },
  { value: 'UNIAO_ESTAVEL', label: 'União estável' },
  { value: 'DIVORCIADO', label: 'Divorciado(a)' },
  { value: 'VIUVO', label: 'Viúvo(a)' },
];

export const LIFE_INSURANCE_STATUSES: Array<{ value: LifeInsuranceStatus; label: string }> = [
  { value: 'ATIVO', label: 'Ativo' },
  { value: 'INATIVO', label: 'Inativo' },
];

export const EMPLOYEE_TRANSPORT_VOUCHER_MODES: Array<{ value: EmployeeTransportVoucherMode; label: string }> = [
  { value: 'PER_DAY', label: 'Por dia trabalhado' },
  { value: 'MONTHLY_FIXED', label: 'Valor mensal fixo' },
  { value: 'NONE', label: 'Não aplicável' },
];

export const UNIFORM_DELIVERY_TYPES: Array<{ value: UniformDeliveryType; label: string }> = [
  { value: 'PRIMEIRA_ENTREGA', label: 'Primeira entrega' },
  { value: 'REPOSICAO', label: 'Reposição' },
  { value: 'TROCA', label: 'Troca' },
];

export const UNIFORM_ITEM_STATUSES: Array<{ value: UniformItemStatus; label: string }> = [
  { value: 'ATIVO', label: 'Ativo' },
  { value: 'DEVOLVIDO', label: 'Devolvido' },
  { value: 'PENDENTE', label: 'Pendente' },
];

export const LOCKER_KEY_STATUSES: Array<{ value: LockerKeyStatus; label: string }> = [
  { value: 'COLABORADOR', label: 'Em posse do colaborador' },
  { value: 'RH_DP', label: 'No RH/DP' },
  { value: 'PERDIDA', label: 'Perdida' },
];

export const ASO_STATUSES: Array<{ value: AsoStatus; label: string }> = [
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'OK', label: 'OK' },
  { value: 'VENCENDO', label: 'Vencendo' },
  { value: 'VENCIDO', label: 'Vencido' },
];

export const EMPLOYEE_DOCUMENT_TYPES: EmployeeDocumentTypeDef[] = [
  { code: 'CURRICULO', label: 'Currículo', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'FOTO_3X4', label: 'Foto 3x4', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'CTPS', label: 'Carteira de Trabalho e Previdência Social', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'PIS_CARTAO_CIDADAO', label: 'Cartão PIS / Cartão cidadão', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'RG_E_CPF', label: 'RG e CPF', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'CNH', label: 'CNH', hasIssueDate: false, hasExpiration: false, optional: true },
  { code: 'CERTIDAO_NASCIMENTO', label: 'Certidão de nascimento', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'CARTEIRA_VACINACAO', label: 'Carteira de vacinação', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'TITULO_ELEITOR', label: 'Título de eleitor', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'ULTIMO_PROTOCOLO_VOTACAO', label: 'Último protocolo de votação', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'RESERVISTA_OU_ALISTAMENTO', label: 'Reservista ou alistamento militar', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'COMPROVANTE_ENDERECO', label: 'Comprovante de endereço', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'COMPROVANTE_ESCOLARIDADE', label: 'Comprovante de escolaridade', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'CERTIFICADOS_CURSOS_TREINAMENTOS', label: 'Certificados de cursos e treinamentos', hasIssueDate: false, hasExpiration: false, optional: true },
  { code: 'ANTECEDENTES_CRIMINAIS', label: 'Antecedentes criminais', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'VACINACAO_COVID_E_GRIPE', label: 'Vacinação Covid-19 e gripe', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'ASO', label: 'ASO', hasIssueDate: true, hasExpiration: true, optional: false },
  { code: 'CERTIDAO_CASAMENTO_OU_UNIAO', label: 'Certidão de casamento / união', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'RG_E_CPF_CONJUGE', label: 'RG e CPF do cônjuge', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'CERTIDAO_FILHOS', label: 'Certidão de nascimento dos filhos', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'VACINACAO_FILHOS', label: 'Carteira de vacinação dos filhos', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'CPF_FILHOS', label: 'CPF dos filhos', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'COMPROVANTE_MATRICULA_ESTAGIO', label: 'Comprovante de matrícula (estágio)', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'RELATORIO_SEMESTRAL_ESTAGIO', label: 'Relatório semestral (estágio)', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'OUTRO', label: 'Documento diverso', hasIssueDate: false, hasExpiration: false, optional: true },
];

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

export const EMPLOYEE_DOCUMENT_TYPE_MAP = new Map(
  EMPLOYEE_DOCUMENT_TYPES.map((item) => [item.code, item])
);

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
