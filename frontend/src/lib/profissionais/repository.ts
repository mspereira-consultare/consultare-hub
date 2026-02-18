import { randomUUID } from 'crypto';
import type { DbInterface } from '@/lib/db';
import {
  CERTIDAO_DOC_TYPE,
  CONTRACT_TYPES,
  DOCUMENT_TYPES,
  PERSONAL_DOC_TYPES,
  type ContractPartyType,
  type ContractTypeCode,
  type DocumentTypeCode,
} from '@/lib/profissionais/constants';
import {
  computeCertidaoStatus,
  computeDocProgress,
  computeMissingDocs,
  computeMissingFields,
} from '@/lib/profissionais/status';
import type {
  Professional,
  ProfessionalChecklistItem,
  ProfessionalDocument,
  ProfessionalFilters,
  ProfessionalInput,
  ProfessionalListItem,
  ProfessionalRegistration,
} from '@/lib/profissionais/types';

export class ProfessionalValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

let tablesEnsured = false;

const NOW = () => new Date().toISOString();

const clean = (value: any) => String(value ?? '').trim();
const upper = (value: any) => clean(value).toUpperCase();
const bool = (value: any) => value === true || value === 1 || String(value) === '1';

const allowedContractTypes = new Set(
  CONTRACT_TYPES.filter((item) => item.isActive).map((item) => item.code)
);
const allowedDocTypes = new Set(DOCUMENT_TYPES.map((item) => item.code));
const allowedPersonalDocTypes = new Set(PERSONAL_DOC_TYPES);

const parseDate = (value: any): string | null => {
  const raw = clean(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!iso) return null;
  return `${iso[1]}-${iso[2]}-${iso[3]}`;
};

const normalizeContractPartyType = (value: any): ContractPartyType => {
  const normalized = upper(value);
  if (normalized !== 'PF' && normalized !== 'PJ') {
    throw new ProfessionalValidationError('Tipo de contratante invalido. Use PF ou PJ.');
  }
  return normalized as ContractPartyType;
};

const normalizeContractType = (value: any): ContractTypeCode => {
  const normalized = upper(value);
  if (!allowedContractTypes.has(normalized as ContractTypeCode)) {
    throw new ProfessionalValidationError('Tipo de contrato invalido ou inativo.');
  }
  return normalized as ContractTypeCode;
};

const normalizePersonalDocType = (value: any): string => {
  const normalized = upper(value);
  if (!allowedPersonalDocTypes.has(normalized as any)) {
    throw new ProfessionalValidationError('Tipo de documento pessoal invalido.');
  }
  return normalized;
};

const normalizeRegistration = (registration: any): ProfessionalRegistration => {
  const councilType = upper(registration?.councilType);
  const councilNumber = clean(registration?.councilNumber);
  const councilUf = upper(registration?.councilUf);
  const isPrimary = bool(registration?.isPrimary);

  if (!councilType) throw new ProfessionalValidationError('Conselho do registro regional e obrigatorio.');
  if (!councilNumber) throw new ProfessionalValidationError('Numero do registro regional e obrigatorio.');
  if (!/^[A-Z]{2}$/.test(councilUf)) throw new ProfessionalValidationError('UF do registro regional invalida.');

  return {
    id: clean(registration?.id) || undefined,
    councilType,
    councilNumber,
    councilUf,
    isPrimary,
  };
};

const normalizeChecklistItem = (item: any): ProfessionalChecklistItem => {
  const docType = upper(item?.docType) as DocumentTypeCode;
  if (!allowedDocTypes.has(docType)) {
    throw new ProfessionalValidationError(`Tipo de documento invalido: ${String(item?.docType || '')}`);
  }

  const hasPhysicalCopy = bool(item?.hasPhysicalCopy);
  const hasDigitalCopy = bool(item?.hasDigitalCopy);
  const expiresAt = parseDate(item?.expiresAt);
  const notes = clean(item?.notes);

  if (docType === CERTIDAO_DOC_TYPE && (hasPhysicalCopy || hasDigitalCopy) && !expiresAt) {
    throw new ProfessionalValidationError(
      'A certidao etica exige data de expiracao manual quando marcada como existente.'
    );
  }

  return {
    docType,
    hasPhysicalCopy,
    hasDigitalCopy,
    expiresAt,
    notes,
  };
};

const withChecklistDefaults = (
  checklist: ProfessionalChecklistItem[]
): ProfessionalChecklistItem[] => {
  const map = new Map<DocumentTypeCode, ProfessionalChecklistItem>();
  for (const item of checklist) {
    map.set(item.docType, item);
  }

  for (const def of DOCUMENT_TYPES) {
    if (!map.has(def.code)) {
      map.set(def.code, {
        docType: def.code,
        hasPhysicalCopy: false,
        hasDigitalCopy: false,
        expiresAt: null,
        notes: '',
      });
    }
  }

  return Array.from(map.values());
};

const normalizeInput = (payload: any): ProfessionalInput => {
  const name = clean(payload?.name);
  const specialty = clean(payload?.specialty);
  const personalDocNumber = clean(payload?.personalDocNumber);
  const addressText = clean(payload?.addressText);

  if (!name) throw new ProfessionalValidationError('Nome do profissional e obrigatorio.');
  if (!specialty) throw new ProfessionalValidationError('Especialidade e obrigatoria.');
  if (!personalDocNumber) {
    throw new ProfessionalValidationError('Numero do documento pessoal e obrigatorio.');
  }
  if (!addressText) throw new ProfessionalValidationError('Endereco e obrigatorio.');

  const contractPartyType = normalizeContractPartyType(payload?.contractPartyType);
  const contractType = normalizeContractType(payload?.contractType);
  const personalDocType = normalizePersonalDocType(payload?.personalDocType);

  const cpf = clean(payload?.cpf) || null;
  const cnpj = clean(payload?.cnpj) || null;
  const legalName = clean(payload?.legalName) || null;

  if (contractPartyType === 'PF' && !cpf) {
    throw new ProfessionalValidationError('CPF e obrigatorio para contratacao PF.');
  }
  if (contractPartyType === 'PJ') {
    if (!cnpj) throw new ProfessionalValidationError('CNPJ e obrigatorio para contratacao PJ.');
    if (!legalName) throw new ProfessionalValidationError('Razao social e obrigatoria para contratacao PJ.');
  }

  const registrationsRaw: unknown[] = Array.isArray(payload?.registrations)
    ? payload.registrations
    : [];
  const registrations = registrationsRaw.map((row) => normalizeRegistration(row));
  const primaryCount = registrations.filter((item) => item.isPrimary).length;
  if (registrations.length === 0) {
    throw new ProfessionalValidationError('Informe ao menos um registro regional.');
  }
  if (primaryCount !== 1) {
    throw new ProfessionalValidationError('Selecione exatamente um registro regional principal.');
  }

  const checklistRaw: unknown[] = Array.isArray(payload?.checklist)
    ? payload.checklist
    : [];
  const checklist = withChecklistDefaults(
    checklistRaw.map((row) => normalizeChecklistItem(row))
  );

  const result: ProfessionalInput = {
    name,
    contractPartyType,
    contractType,
    cpf,
    cnpj,
    legalName,
    specialty,
    personalDocType,
    personalDocNumber,
    addressText,
    isActive: bool(payload?.isActive ?? true),
    hasPhysicalFolder: bool(payload?.hasPhysicalFolder),
    physicalFolderNote: clean(payload?.physicalFolderNote) || null,
    registrations,
    checklist,
  };

  const missingFields = computeMissingFields(result, registrations);
  if (missingFields.length > 0) {
    throw new ProfessionalValidationError(
      `Campos obrigatorios ausentes: ${missingFields.join(', ')}`
    );
  }

  return result;
};

const mapProfessional = (row: any): Professional => ({
  id: clean(row.id),
  name: clean(row.name),
  contractPartyType: normalizeContractPartyType(row.contract_party_type),
  contractType: normalizeContractType(row.contract_type),
  cpf: clean(row.cpf) || null,
  cnpj: clean(row.cnpj) || null,
  legalName: clean(row.legal_name) || null,
  specialty: clean(row.specialty),
  personalDocType: clean(row.personal_doc_type),
  personalDocNumber: clean(row.personal_doc_number),
  addressText: clean(row.address_text),
  isActive: bool(row.is_active),
  hasPhysicalFolder: bool(row.has_physical_folder),
  physicalFolderNote: clean(row.physical_folder_note) || null,
  createdAt: clean(row.created_at),
  updatedAt: clean(row.updated_at),
});

const mapRegistration = (row: any): ProfessionalRegistration => ({
  id: clean(row.id),
  professionalId: clean(row.professional_id),
  councilType: upper(row.council_type),
  councilNumber: clean(row.council_number),
  councilUf: upper(row.council_uf),
  isPrimary: bool(row.is_primary),
});

const mapChecklist = (row: any): ProfessionalChecklistItem => ({
  id: clean(row.id),
  professionalId: clean(row.professional_id),
  docType: upper(row.doc_type) as DocumentTypeCode,
  hasPhysicalCopy: bool(row.has_physical_copy),
  hasDigitalCopy: bool(row.has_digital_copy),
  expiresAt: parseDate(row.expires_at),
  notes: clean(row.notes),
  verifiedBy: clean(row.verified_by),
  verifiedAt: clean(row.verified_at),
  updatedAt: clean(row.updated_at),
});

const mapDocument = (row: any): ProfessionalDocument => ({
  id: clean(row.id),
  professionalId: clean(row.professional_id),
  docType: upper(row.doc_type) as DocumentTypeCode,
  storageProvider: clean(row.storage_provider),
  storageBucket: clean(row.storage_bucket) || null,
  storageKey: clean(row.storage_key),
  originalName: clean(row.original_name),
  mimeType: clean(row.mime_type),
  sizeBytes: Number(row.size_bytes || 0),
  expiresAt: parseDate(row.expires_at),
  isActive: bool(row.is_active),
  notes: clean(row.notes) || null,
  uploadedBy: clean(row.uploaded_by),
  createdAt: clean(row.created_at),
});

const buildIn = (values: string[]) => {
  if (values.length === 0) return { clause: '(NULL)', params: [] as string[] };
  return {
    clause: `(${values.map(() => '?').join(',')})`,
    params: values,
  };
};

const upsertRegistrations = async (
  db: DbInterface,
  professionalId: string,
  registrations: ProfessionalRegistration[],
  now: string
) => {
  await db.execute(`DELETE FROM professional_registrations WHERE professional_id = ?`, [
    professionalId,
  ]);

  for (const reg of registrations) {
    await db.execute(
      `
      INSERT INTO professional_registrations (
        id, professional_id, council_type, council_number, council_uf, is_primary, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        reg.id || randomUUID(),
        professionalId,
        reg.councilType,
        reg.councilNumber,
        reg.councilUf,
        reg.isPrimary ? 1 : 0,
        now,
        now,
      ]
    );
  }
};

const upsertChecklist = async (
  db: DbInterface,
  professionalId: string,
  checklist: ProfessionalChecklistItem[],
  actorUserId: string,
  now: string
) => {
  await db.execute(
    `DELETE FROM professional_document_checklist WHERE professional_id = ?`,
    [professionalId]
  );

  for (const item of checklist) {
    await db.execute(
      `
      INSERT INTO professional_document_checklist (
        id, professional_id, doc_type, has_physical_copy, has_digital_copy, expires_at, notes,
        verified_by, verified_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        item.id || randomUUID(),
        professionalId,
        item.docType,
        item.hasPhysicalCopy ? 1 : 0,
        item.hasDigitalCopy ? 1 : 0,
        item.expiresAt,
        item.notes || null,
        actorUserId,
        now,
        now,
      ]
    );
  }
};

const insertAudit = async (
  db: DbInterface,
  action: string,
  actorUserId: string,
  professionalId: string | null,
  payload: Record<string, any> | null
) => {
  await db.execute(
    `
    INSERT INTO professional_audit_log (
      id, professional_id, action, actor_user_id, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      randomUUID(),
      professionalId,
      action,
      actorUserId,
      payload ? JSON.stringify(payload) : null,
      NOW(),
    ]
  );
};

const loadRelations = async (
  db: DbInterface,
  professionalIds: string[]
): Promise<{
  registrationsByProfessional: Map<string, ProfessionalRegistration[]>;
  checklistByProfessional: Map<string, ProfessionalChecklistItem[]>;
  documentsByProfessional: Map<string, ProfessionalDocument[]>;
}> => {
  const registrationsByProfessional = new Map<string, ProfessionalRegistration[]>();
  const checklistByProfessional = new Map<string, ProfessionalChecklistItem[]>();
  const documentsByProfessional = new Map<string, ProfessionalDocument[]>();

  if (professionalIds.length === 0) {
    return { registrationsByProfessional, checklistByProfessional, documentsByProfessional };
  }

  const idsIn = buildIn(professionalIds);

  const registrationsRows = await db.query(
    `
    SELECT *
    FROM professional_registrations
    WHERE professional_id IN ${idsIn.clause}
    ORDER BY is_primary DESC, council_type ASC, council_uf ASC, council_number ASC
    `,
    idsIn.params
  );

  for (const row of registrationsRows) {
    const mapped = mapRegistration(row);
    const list = registrationsByProfessional.get(mapped.professionalId || '') || [];
    list.push(mapped);
    registrationsByProfessional.set(mapped.professionalId || '', list);
  }

  const checklistRows = await db.query(
    `
    SELECT *
    FROM professional_document_checklist
    WHERE professional_id IN ${idsIn.clause}
    `,
    idsIn.params
  );

  for (const row of checklistRows) {
    const mapped = mapChecklist(row);
    const list = checklistByProfessional.get(mapped.professionalId || '') || [];
    list.push(mapped);
    checklistByProfessional.set(mapped.professionalId || '', list);
  }

  const documentsRows = await db.query(
    `
    SELECT *
    FROM professional_documents
    WHERE professional_id IN ${idsIn.clause} AND is_active = 1
    `,
    idsIn.params
  );

  for (const row of documentsRows) {
    const mapped = mapDocument(row);
    const list = documentsByProfessional.get(mapped.professionalId || '') || [];
    list.push(mapped);
    documentsByProfessional.set(mapped.professionalId || '', list);
  }

  return { registrationsByProfessional, checklistByProfessional, documentsByProfessional };
};

export const ensureProfessionalsTables = async (db: DbInterface) => {
  if (tablesEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS professionals (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      contract_party_type VARCHAR(2) NOT NULL,
      contract_type VARCHAR(40) NOT NULL,
      cpf VARCHAR(14) UNIQUE,
      cnpj VARCHAR(18) UNIQUE,
      legal_name VARCHAR(180),
      specialty VARCHAR(120) NOT NULL,
      personal_doc_type VARCHAR(10) NOT NULL,
      personal_doc_number VARCHAR(40) NOT NULL,
      address_text TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      has_physical_folder INTEGER NOT NULL DEFAULT 0,
      physical_folder_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS professional_registrations (
      id VARCHAR(64) PRIMARY KEY,
      professional_id VARCHAR(64) NOT NULL,
      council_type VARCHAR(10) NOT NULL,
      council_number VARCHAR(40) NOT NULL,
      council_uf VARCHAR(2) NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(council_type, council_number, council_uf)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS professional_documents (
      id VARCHAR(64) PRIMARY KEY,
      professional_id VARCHAR(64) NOT NULL,
      doc_type VARCHAR(40) NOT NULL,
      storage_provider VARCHAR(30) NOT NULL,
      storage_bucket VARCHAR(120),
      storage_key VARCHAR(255) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      size_bytes BIGINT NOT NULL,
      expires_at DATE,
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      uploaded_by VARCHAR(64) NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS professional_document_checklist (
      id VARCHAR(64) PRIMARY KEY,
      professional_id VARCHAR(64) NOT NULL,
      doc_type VARCHAR(40) NOT NULL,
      has_physical_copy INTEGER NOT NULL DEFAULT 0,
      has_digital_copy INTEGER NOT NULL DEFAULT 0,
      expires_at DATE,
      notes TEXT,
      verified_by VARCHAR(64) NOT NULL,
      verified_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(professional_id, doc_type)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS professional_contracts (
      id VARCHAR(64) PRIMARY KEY,
      professional_id VARCHAR(64) NOT NULL,
      template_key VARCHAR(80) NOT NULL,
      template_version VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL,
      storage_provider VARCHAR(30),
      storage_bucket VARCHAR(120),
      storage_key VARCHAR(255),
      generated_by VARCHAR(64) NOT NULL,
      generated_at TEXT,
      error_message TEXT,
      meta_json LONGTEXT,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS professional_audit_log (
      id VARCHAR(64) PRIMARY KEY,
      professional_id VARCHAR(64),
      action VARCHAR(60) NOT NULL,
      actor_user_id VARCHAR(64) NOT NULL,
      payload_json LONGTEXT,
      created_at TEXT NOT NULL
    )
  `);

  tablesEnsured = true;
};

const mergeProfessional = (
  professional: Professional,
  registrations: ProfessionalRegistration[],
  checklist: ProfessionalChecklistItem[],
  documents: ProfessionalDocument[]
): ProfessionalListItem => {
  const missingFields = computeMissingFields(
    {
      name: professional.name,
      contractPartyType: professional.contractPartyType,
      contractType: professional.contractType,
      cpf: professional.cpf,
      cnpj: professional.cnpj,
      legalName: professional.legalName,
      specialty: professional.specialty,
      personalDocType: professional.personalDocType,
      personalDocNumber: professional.personalDocNumber,
      addressText: professional.addressText,
    },
    registrations
  );
  const missingDocs = computeMissingDocs(checklist, documents);
  const certidao = computeCertidaoStatus(checklist, documents);
  const progress = computeDocProgress(checklist, documents);
  const primaryRegistration = registrations.find((item) => item.isPrimary) || null;

  return {
    ...professional,
    registrations,
    primaryRegistration,
    checklist,
    missingFields,
    missingDocs,
    requiredDocsDone: progress.done,
    requiredDocsTotal: progress.total,
    pending: missingFields.length > 0 || missingDocs.length > 0,
    certidaoStatus: certidao.status,
    certidaoExpiresAt: certidao.expiresAt,
  };
};

export const listProfessionals = async (
  db: DbInterface,
  filters: ProfessionalFilters
) => {
  await ensureProfessionalsTables(db);

  const where: string[] = ['1=1'];
  const params: any[] = [];

  if (filters.search) {
    where.push(
      `(UPPER(name) LIKE ? OR UPPER(specialty) LIKE ? OR UPPER(COALESCE(cpf, '')) LIKE ? OR UPPER(COALESCE(cnpj, '')) LIKE ?)`
    );
    const q = `%${upper(filters.search)}%`;
    params.push(q, q, q, q);
  }

  if (filters.status === 'active') where.push(`is_active = 1`);
  if (filters.status === 'inactive') where.push(`is_active = 0`);

  const rows = await db.query(
    `
    SELECT *
    FROM professionals
    WHERE ${where.join(' AND ')}
    ORDER BY name ASC
    `,
    params
  );

  const professionals = rows.map(mapProfessional);
  const ids = professionals.map((item) => item.id);
  const relations = await loadRelations(db, ids);

  const enriched = professionals.map((professional) => {
    const registrations = relations.registrationsByProfessional.get(professional.id) || [];
    const checklist = relations.checklistByProfessional.get(professional.id) || [];
    const documents = relations.documentsByProfessional.get(professional.id) || [];
    return mergeProfessional(professional, registrations, checklist, documents);
  });

  let filtered = enriched;
  if (filters.status === 'pending') {
    filtered = filtered.filter((item) => item.pending);
  }
  if (filters.certidaoStatus !== 'all') {
    filtered = filtered.filter((item) => item.certidaoStatus === filters.certidaoStatus);
  }

  const total = filtered.length;
  const page = Math.max(1, filters.page);
  const pageSize = Math.max(1, filters.pageSize);
  const start = (page - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  return { items: paged, total };
};

export const getProfessionalById = async (
  db: DbInterface,
  professionalId: string
): Promise<ProfessionalListItem | null> => {
  await ensureProfessionalsTables(db);

  const rows = await db.query(`SELECT * FROM professionals WHERE id = ? LIMIT 1`, [professionalId]);
  const row = rows[0];
  if (!row) return null;

  const professional = mapProfessional(row);
  const relations = await loadRelations(db, [professional.id]);
  const registrations = relations.registrationsByProfessional.get(professional.id) || [];
  const checklist = relations.checklistByProfessional.get(professional.id) || [];
  const documents = relations.documentsByProfessional.get(professional.id) || [];

  return mergeProfessional(professional, registrations, checklist, documents);
};

export const createProfessional = async (
  db: DbInterface,
  payload: any,
  actorUserId: string
) => {
  await ensureProfessionalsTables(db);
  const input = normalizeInput(payload);
  const now = NOW();
  const id = randomUUID();

  await db.execute(
    `
    INSERT INTO professionals (
      id, name, contract_party_type, contract_type, cpf, cnpj, legal_name,
      specialty, personal_doc_type, personal_doc_number, address_text, is_active,
      has_physical_folder, physical_folder_note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      input.name,
      input.contractPartyType,
      input.contractType,
      input.cpf,
      input.cnpj,
      input.legalName,
      input.specialty,
      input.personalDocType,
      input.personalDocNumber,
      input.addressText,
      input.isActive ? 1 : 0,
      input.hasPhysicalFolder ? 1 : 0,
      input.physicalFolderNote,
      now,
      now,
    ]
  );

  await upsertRegistrations(db, id, input.registrations, now);
  await upsertChecklist(db, id, input.checklist, actorUserId, now);

  await insertAudit(db, 'PROFESSIONAL_CREATED', actorUserId, id, {
    contractType: input.contractType,
    contractPartyType: input.contractPartyType,
  });

  const created = await getProfessionalById(db, id);
  if (!created) throw new ProfessionalValidationError('Falha ao carregar profissional criado.', 500);
  return created;
};

export const updateProfessional = async (
  db: DbInterface,
  professionalId: string,
  payload: any,
  actorUserId: string
) => {
  await ensureProfessionalsTables(db);
  const existing = await getProfessionalById(db, professionalId);
  if (!existing) {
    throw new ProfessionalValidationError('Profissional nao encontrado.', 404);
  }

  const input = normalizeInput(payload);
  const now = NOW();

  await db.execute(
    `
    UPDATE professionals
    SET
      name = ?,
      contract_party_type = ?,
      contract_type = ?,
      cpf = ?,
      cnpj = ?,
      legal_name = ?,
      specialty = ?,
      personal_doc_type = ?,
      personal_doc_number = ?,
      address_text = ?,
      is_active = ?,
      has_physical_folder = ?,
      physical_folder_note = ?,
      updated_at = ?
    WHERE id = ?
    `,
    [
      input.name,
      input.contractPartyType,
      input.contractType,
      input.cpf,
      input.cnpj,
      input.legalName,
      input.specialty,
      input.personalDocType,
      input.personalDocNumber,
      input.addressText,
      input.isActive ? 1 : 0,
      input.hasPhysicalFolder ? 1 : 0,
      input.physicalFolderNote,
      now,
      professionalId,
    ]
  );

  await upsertRegistrations(db, professionalId, input.registrations, now);
  await upsertChecklist(db, professionalId, input.checklist, actorUserId, now);

  await insertAudit(db, 'PROFESSIONAL_UPDATED', actorUserId, professionalId, {
    contractType: input.contractType,
    contractPartyType: input.contractPartyType,
  });

  const updated = await getProfessionalById(db, professionalId);
  if (!updated) throw new ProfessionalValidationError('Falha ao carregar profissional atualizado.', 500);
  return updated;
};
