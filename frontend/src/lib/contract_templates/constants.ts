import type { ContractTypeCode } from '@/lib/profissionais/constants';

export type PlaceholderSourceOption = {
  value: string;
  label: string;
  group: 'profissional' | 'registro' | 'sistema';
};

export const CONTRACT_TEMPLATE_ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const CONTRACT_TEMPLATE_ALLOWED_EXTENSIONS = ['.docx'];
export const CONTRACT_TEMPLATE_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

export const PLACEHOLDER_SOURCE_OPTIONS: PlaceholderSourceOption[] = [
  { value: 'professional.name', label: 'Profissional - Nome', group: 'profissional' },
  { value: 'professional.contract_type', label: 'Profissional - Tipo de Contrato', group: 'profissional' },
  { value: 'professional.contract_start_date', label: 'Profissional - Inicio do Contrato', group: 'profissional' },
  { value: 'professional.contract_end_date', label: 'Profissional - Fim do Contrato', group: 'profissional' },
  { value: 'professional.cpf', label: 'Profissional - CPF', group: 'profissional' },
  { value: 'professional.cnpj', label: 'Profissional - CNPJ', group: 'profissional' },
  { value: 'professional.legal_name', label: 'Profissional - Razao Social', group: 'profissional' },
  { value: 'professional.phone', label: 'Profissional - Telefone', group: 'profissional' },
  { value: 'professional.email', label: 'Profissional - E-mail', group: 'profissional' },
  { value: 'professional.address_text', label: 'Profissional - Endereco', group: 'profissional' },
  { value: 'professional.personal_doc_type', label: 'Profissional - Tipo Documento', group: 'profissional' },
  { value: 'professional.personal_doc_number', label: 'Profissional - Numero Documento', group: 'profissional' },
  { value: 'professional.age_range', label: 'Profissional - Faixa Etaria', group: 'profissional' },
  { value: 'professional.service_units', label: 'Profissional - Unidades', group: 'profissional' },
  { value: 'professional.primary_specialty', label: 'Profissional - Especialidade Principal', group: 'profissional' },
  { value: 'professional.specialties', label: 'Profissional - Todas Especialidades', group: 'profissional' },

  { value: 'registration.primary.council_type', label: 'Registro Principal - Conselho', group: 'registro' },
  { value: 'registration.primary.council_number', label: 'Registro Principal - Numero', group: 'registro' },
  { value: 'registration.primary.council_uf', label: 'Registro Principal - UF', group: 'registro' },

  { value: 'system.current_date', label: 'Sistema - Data Atual', group: 'sistema' },
  { value: 'system.current_datetime', label: 'Sistema - Data/Hora Atual', group: 'sistema' },
];

export const CONTRACT_TEMPLATE_SUPPORTED_TYPES = new Set<ContractTypeCode>([
  'PADRAO_CLT',
  'PJ_PADRAO',
  'PLANTONISTA',
]);

