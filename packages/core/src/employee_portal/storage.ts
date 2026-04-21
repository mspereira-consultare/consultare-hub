import 'server-only';

import {
  EMPLOYEE_PORTAL_ALLOWED_EXTENSIONS,
  EMPLOYEE_PORTAL_ALLOWED_MIME_TYPES,
  EMPLOYEE_PORTAL_MAX_FILE_SIZE_BYTES,
} from './constants';
import { EmployeePortalError } from './repository';

const clean = (value: unknown) => String(value ?? '').trim();

export const sanitizePortalStoragePart = (value: string) =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

export const validatePortalUploadFile = (file: File) => {
  const originalName = clean(file.name) || 'arquivo.bin';
  const lowerName = originalName.toLowerCase();
  const mimeType = clean(file.type || 'application/octet-stream').toLowerCase();
  const sizeBytes = Number(file.size || 0);

  if (sizeBytes <= 0) throw new EmployeePortalError('Arquivo vazio.');
  if (sizeBytes > EMPLOYEE_PORTAL_MAX_FILE_SIZE_BYTES) {
    throw new EmployeePortalError('Arquivo acima do limite de 15 MB.');
  }
  if (!EMPLOYEE_PORTAL_ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new EmployeePortalError('Formato de arquivo não permitido.');
  }
  if (!EMPLOYEE_PORTAL_ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
    throw new EmployeePortalError('Extensão de arquivo não permitida.');
  }

  return { originalName, mimeType, sizeBytes };
};

export const buildPortalStorageKey = (
  employeeId: string,
  submissionId: string,
  docType: string,
  originalName: string
) => {
  const prefix = clean(process.env.AWS_S3_PORTAL_PREFIX || 'colaboradores-portal/').replace(/^\/+|\/+$/g, '');
  const fileName = sanitizePortalStoragePart(originalName) || 'arquivo.bin';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}/${sanitizePortalStoragePart(employeeId)}/${sanitizePortalStoragePart(submissionId)}/${sanitizePortalStoragePart(docType)}/${stamp}-${fileName}`;
};
