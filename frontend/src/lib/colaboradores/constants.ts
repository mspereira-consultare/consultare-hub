export type EmploymentRegime = 'CLT' | 'PJ' | 'ESTAGIO';
export type EmployeeStatus = 'ATIVO' | 'DESLIGADO';
export type AsoStatus = 'PENDENTE' | 'OK' | 'VENCENDO' | 'VENCIDO';
export type EducationLevel = 'MEDIO' | 'TECNICO' | 'SUPERIOR';
export type MaritalStatus = 'SOLTEIRO' | 'CASADO' | 'UNIAO_ESTAVEL' | 'DIVORCIADO' | 'VIUVO';
export type LifeInsuranceStatus = 'ATIVO' | 'INATIVO';
export type UniformDeliveryType = 'PRIMEIRA_ENTREGA' | 'REPOSICAO' | 'TROCA';
export type UniformItemStatus = 'ATIVO' | 'DEVOLVIDO' | 'PENDENTE';
export type RecessSituation = 'QUITADAS' | 'VENCIDAS' | 'EM_ABERTO';

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
  | 'RELATORIO_SEMESTRAL_ESTAGIO';

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
  { value: 'ESTAGIO', label: 'Estagio' },
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
  'CENTRO CAMBUI': 'Cambui Centro',
  'OURO VERDE': 'Ouro Verde',
  'RESOLVECARD GESTAO DE BENEFICOS E MEIOS DE PAGAMENTOS': 'Resolvecard',
};

export const EDUCATION_LEVELS: Array<{ value: EducationLevel; label: string }> = [
  { value: 'MEDIO', label: 'Medio' },
  { value: 'TECNICO', label: 'Tecnico' },
  { value: 'SUPERIOR', label: 'Superior' },
];

export const MARITAL_STATUSES: Array<{ value: MaritalStatus; label: string }> = [
  { value: 'SOLTEIRO', label: 'Solteiro(a)' },
  { value: 'CASADO', label: 'Casado(a)' },
  { value: 'UNIAO_ESTAVEL', label: 'Uniao estavel' },
  { value: 'DIVORCIADO', label: 'Divorciado(a)' },
  { value: 'VIUVO', label: 'Viuvo(a)' },
];

export const LIFE_INSURANCE_STATUSES: Array<{ value: LifeInsuranceStatus; label: string }> = [
  { value: 'ATIVO', label: 'Ativo' },
  { value: 'INATIVO', label: 'Inativo' },
];

export const UNIFORM_DELIVERY_TYPES: Array<{ value: UniformDeliveryType; label: string }> = [
  { value: 'PRIMEIRA_ENTREGA', label: 'Primeira entrega' },
  { value: 'REPOSICAO', label: 'Reposicao' },
  { value: 'TROCA', label: 'Troca' },
];

export const UNIFORM_ITEM_STATUSES: Array<{ value: UniformItemStatus; label: string }> = [
  { value: 'ATIVO', label: 'Ativo' },
  { value: 'DEVOLVIDO', label: 'Devolvido' },
  { value: 'PENDENTE', label: 'Pendente' },
];

export const ASO_STATUSES: Array<{ value: AsoStatus; label: string }> = [
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'OK', label: 'OK' },
  { value: 'VENCENDO', label: 'Vencendo' },
  { value: 'VENCIDO', label: 'Vencido' },
];

export const EMPLOYEE_DOCUMENT_TYPES: EmployeeDocumentTypeDef[] = [
  { code: 'CURRICULO', label: 'Curriculo', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'FOTO_3X4', label: 'Foto 3x4', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'CTPS', label: 'Carteira de Trabalho e Previdencia Social', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'PIS_CARTAO_CIDADAO', label: 'Cartao PIS / Cartao cidadao', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'RG_E_CPF', label: 'RG e CPF', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'CNH', label: 'CNH', hasIssueDate: false, hasExpiration: false, optional: true },
  { code: 'CERTIDAO_NASCIMENTO', label: 'Certidao de nascimento', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'CARTEIRA_VACINACAO', label: 'Carteira de vacinacao', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'TITULO_ELEITOR', label: 'Titulo de eleitor', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'ULTIMO_PROTOCOLO_VOTACAO', label: 'Ultimo protocolo de votacao', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'RESERVISTA_OU_ALISTAMENTO', label: 'Reservista ou alistamento militar', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'COMPROVANTE_ENDERECO', label: 'Comprovante de endereco', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'COMPROVANTE_ESCOLARIDADE', label: 'Comprovante de escolaridade', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'CERTIFICADOS_CURSOS_TREINAMENTOS', label: 'Certificados de cursos e treinamentos', hasIssueDate: false, hasExpiration: false, optional: true },
  { code: 'ANTECEDENTES_CRIMINAIS', label: 'Antecedentes criminais', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'VACINACAO_COVID_E_GRIPE', label: 'Vacinacao Covid-19 e gripe', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'ASO', label: 'ASO', hasIssueDate: true, hasExpiration: true, optional: false },
  { code: 'CERTIDAO_CASAMENTO_OU_UNIAO', label: 'Certidao de casamento / uniao', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'RG_E_CPF_CONJUGE', label: 'RG e CPF do conjuge', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'CERTIDAO_FILHOS', label: 'Certidao de nascimento dos filhos', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'VACINACAO_FILHOS', label: 'Carteira de vacinacao dos filhos', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'CPF_FILHOS', label: 'CPF dos filhos', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'COMPROVANTE_MATRICULA_ESTAGIO', label: 'Comprovante de matricula (estagio)', hasIssueDate: false, hasExpiration: false, optional: false },
  { code: 'RELATORIO_SEMESTRAL_ESTAGIO', label: 'Relatorio semestral (estagio)', hasIssueDate: false, hasExpiration: false, optional: false },
];

export const EMPLOYEE_DOCUMENT_TYPE_MAP = new Map(
  EMPLOYEE_DOCUMENT_TYPES.map((item) => [item.code, item])
);

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
