import type { EmployeeDocumentTypeCode } from '../colaboradores/constants';

export const EMPLOYEE_PORTAL_COOKIE_NAME = 'consultare_employee_portal_session';

export const EMPLOYEE_PORTAL_INVITE_TTL_DAYS = 14;
export const EMPLOYEE_PORTAL_SESSION_TTL_HOURS = 2;
export const EMPLOYEE_PORTAL_MAX_ATTEMPTS = 5;
export const EMPLOYEE_PORTAL_LOCK_MINUTES = 15;
export const EMPLOYEE_PORTAL_MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

export const EMPLOYEE_PORTAL_ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export const EMPLOYEE_PORTAL_ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];

export const EMPLOYEE_PORTAL_EXCLUDED_DOCUMENT_TYPES = new Set<EmployeeDocumentTypeCode>([
  'ASO',
]);

export const EMPLOYEE_PORTAL_PERSONAL_FIELDS = [
  'fullName',
  'rg',
  'email',
  'phone',
  'street',
  'streetNumber',
  'addressComplement',
  'district',
  'city',
  'stateUf',
  'zipCode',
  'educationInstitution',
  'educationLevel',
  'courseName',
  'currentSemester',
  'maritalStatus',
  'hasChildren',
  'childrenCount',
  'bankName',
  'bankAgency',
  'bankAccount',
  'pixKey',
] as const;

