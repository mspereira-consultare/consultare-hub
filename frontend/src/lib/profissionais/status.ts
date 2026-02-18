import {
  CERTIDAO_DOC_TYPE,
  DOCUMENT_TYPES,
  DOCUMENT_VALIDATION_MODE,
  REQUIRED_DOCUMENT_TYPES,
  type CertidaoStatus,
  type DocumentTypeCode,
} from '@/lib/profissionais/constants';
import type {
  ProfessionalChecklistItem,
  ProfessionalDocument,
  ProfessionalInput,
  ProfessionalRegistration,
} from '@/lib/profissionais/types';

const toIsoDate = (value: string | null | undefined): string | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
};

const todayInSaoPauloIso = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const addDays = (dateIso: string, days: number) => {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const findChecklist = (
  checklist: ProfessionalChecklistItem[],
  docType: DocumentTypeCode
) => checklist.find((row) => row.docType === docType) || null;

const hasManualEvidence = (item: ProfessionalChecklistItem | null) =>
  Boolean(item?.hasDigitalCopy || item?.hasPhysicalCopy);

const hasActiveDocument = (
  documents: ProfessionalDocument[],
  docType: DocumentTypeCode
) => documents.some((doc) => doc.docType === docType && doc.isActive);

const getCertidaoExpiration = (
  checklist: ProfessionalChecklistItem[],
  documents: ProfessionalDocument[]
) => {
  const activeDoc = documents.find(
    (doc) => doc.docType === CERTIDAO_DOC_TYPE && doc.isActive
  );
  if (activeDoc?.expiresAt) return toIsoDate(activeDoc.expiresAt);
  const manual = findChecklist(checklist, CERTIDAO_DOC_TYPE);
  return toIsoDate(manual?.expiresAt || null);
};

export const computeMissingFields = (
  input: ProfessionalInput | { [k: string]: any },
  registrations: ProfessionalRegistration[]
) => {
  const missing: string[] = [];

  if (!String(input.name || '').trim()) missing.push('name');
  if (!String(input.specialty || '').trim()) missing.push('specialty');
  if (!String(input.personalDocType || '').trim()) missing.push('personalDocType');
  if (!String(input.personalDocNumber || '').trim()) missing.push('personalDocNumber');
  if (!String(input.addressText || '').trim()) missing.push('addressText');
  if (!String(input.contractType || '').trim()) missing.push('contractType');

  const partyType = String(input.contractPartyType || '').trim().toUpperCase();
  if (partyType === 'PJ') {
    if (!String(input.cnpj || '').trim()) missing.push('cnpj');
    if (!String(input.legalName || '').trim()) missing.push('legalName');
  } else {
    if (!String(input.cpf || '').trim()) missing.push('cpf');
  }

  if (registrations.length === 0) {
    missing.push('registrations');
  } else {
    const primaryCount = registrations.filter((r) => r.isPrimary).length;
    if (primaryCount !== 1) missing.push('primaryRegistration');
  }

  return missing;
};

export const computeMissingDocs = (
  checklist: ProfessionalChecklistItem[],
  documents: ProfessionalDocument[]
) => {
  const missing: DocumentTypeCode[] = [];

  for (const item of REQUIRED_DOCUMENT_TYPES) {
    const activeDoc = hasActiveDocument(documents, item.code);
    const manual = hasManualEvidence(findChecklist(checklist, item.code));
    const done =
      DOCUMENT_VALIDATION_MODE === 'hybrid' ? activeDoc || manual : activeDoc;
    if (!done) missing.push(item.code);
  }

  return missing;
};

export const computeCertidaoStatus = (
  checklist: ProfessionalChecklistItem[],
  documents: ProfessionalDocument[]
): { status: CertidaoStatus; expiresAt: string | null } => {
  const activeDoc = hasActiveDocument(documents, CERTIDAO_DOC_TYPE);
  const manual = hasManualEvidence(findChecklist(checklist, CERTIDAO_DOC_TYPE));
  const hasEvidence =
    DOCUMENT_VALIDATION_MODE === 'hybrid' ? activeDoc || manual : activeDoc;

  const expiresAt = getCertidaoExpiration(checklist, documents);
  if (!hasEvidence || !expiresAt) {
    return { status: 'PENDENTE', expiresAt };
  }

  const today = todayInSaoPauloIso();
  const warningDate = addDays(today, 30);

  if (expiresAt < today) return { status: 'VENCIDA', expiresAt };
  if (expiresAt <= warningDate) return { status: 'VENCENDO', expiresAt };
  return { status: 'OK', expiresAt };
};

export const computeDocProgress = (
  checklist: ProfessionalChecklistItem[],
  documents: ProfessionalDocument[]
) => {
  let done = 0;
  const total = DOCUMENT_TYPES.length;

  for (const item of DOCUMENT_TYPES) {
    const activeDoc = hasActiveDocument(documents, item.code);
    const manual = hasManualEvidence(findChecklist(checklist, item.code));
    const ok = DOCUMENT_VALIDATION_MODE === 'hybrid' ? activeDoc || manual : activeDoc;
    if (ok) done += 1;
  }

  return { done, total };
};
