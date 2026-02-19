import { randomUUID } from 'crypto';
import type { DbInterface } from '@/lib/db';
import { CONTRACT_TYPES, type ContractTypeCode } from '@/lib/profissionais/constants';
import {
  PLACEHOLDER_SOURCE_OPTIONS,
  type PlaceholderSourceOption,
} from '@/lib/contract_templates/constants';
import type {
  ContractTemplate,
  ContractTemplateMappingItem,
  ContractTemplateStatus,
  ContractTemplateUploadInput,
} from '@/lib/contract_templates/types';

export class ContractTemplateValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

let tablesEnsured = false;

const allowedContractTypes = new Set<ContractTypeCode>(CONTRACT_TYPES.map((item) => item.code));
const allowedStatuses = new Set<ContractTemplateStatus>(['draft', 'active', 'archived']);
const knownPlaceholderSources = new Set<string>(
  PLACEHOLDER_SOURCE_OPTIONS.map((item) => item.value)
);

const clean = (value: any) => String(value ?? '').trim();
const nowIso = () => new Date().toISOString();

const safeJsonParse = <T>(value: any, fallback: T): T => {
  const raw = clean(value);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const normalizeContractType = (value: any): ContractTypeCode => {
  const normalized = clean(value).toUpperCase() as ContractTypeCode;
  if (!allowedContractTypes.has(normalized)) {
    throw new ContractTemplateValidationError('Tipo de contrato invalido para modelo.');
  }
  return normalized;
};

const normalizeStatus = (value: any): ContractTemplateStatus => {
  const normalized = clean(value).toLowerCase() as ContractTemplateStatus;
  return allowedStatuses.has(normalized) ? normalized : 'draft';
};

const normalizePlaceholders = (value: any): string[] => {
  const arr = Array.isArray(value) ? value : [];
  const dedup = new Set<string>();
  for (const item of arr) {
    const token = clean(item);
    if (!token) continue;
    dedup.add(token);
  }
  return Array.from(dedup).sort((a, b) => a.localeCompare(b, 'pt-BR'));
};

const buildDefaultMapping = (placeholders: string[]): ContractTemplateMappingItem[] =>
  placeholders.map((placeholder) => {
    const source = knownPlaceholderSources.has(placeholder) ? placeholder : null;
    return {
      placeholder,
      source,
      required: true,
      confirmed: Boolean(source),
    };
  });

const normalizeMapping = (
  placeholders: string[],
  raw: unknown
): ContractTemplateMappingItem[] => {
  const fallback = buildDefaultMapping(placeholders);
  if (!raw || !Array.isArray(raw)) return fallback;

  const byPlaceholder = new Map<string, ContractTemplateMappingItem>();
  for (const item of raw as any[]) {
    const placeholder = clean(item?.placeholder);
    if (!placeholder || !placeholders.includes(placeholder)) continue;
    const sourceRaw = clean(item?.source);
    const source = sourceRaw && knownPlaceholderSources.has(sourceRaw) ? sourceRaw : null;
    const required = item?.required !== false;
    byPlaceholder.set(placeholder, {
      placeholder,
      source,
      required,
      confirmed: required ? Boolean(source) : true,
    });
  }

  return placeholders.map((placeholder) => {
    const mapped = byPlaceholder.get(placeholder);
    if (mapped) return mapped;
    return fallback.find((item) => item.placeholder === placeholder)!;
  });
};

const mappingStats = (mapping: ContractTemplateMappingItem[]) => {
  const total = mapping.filter((item) => item.required).length;
  const done = mapping.filter((item) => item.required && item.confirmed && item.source).length;
  return {
    done,
    total,
    complete: total === done,
  };
};

const mapTemplate = (row: any): ContractTemplate => {
  const placeholders = normalizePlaceholders(safeJsonParse<any[]>(row.placeholders_json, []));
  const mapping = normalizeMapping(placeholders, safeJsonParse<any[]>(row.mapping_json, []));
  const stats = mappingStats(mapping);

  return {
    id: clean(row.id),
    name: clean(row.name),
    contractType: normalizeContractType(row.contract_type),
    version: Number(row.version || 1),
    status: normalizeStatus(row.status),
    storageProvider: clean(row.storage_provider),
    storageBucket: clean(row.storage_bucket) || null,
    storageKey: clean(row.storage_key),
    originalName: clean(row.original_name),
    mimeType: clean(row.mime_type),
    sizeBytes: Number(row.size_bytes || 0),
    placeholders,
    mapping,
    mappingDone: stats.done,
    mappingTotal: stats.total,
    mappingComplete: stats.complete,
    notes: clean(row.notes) || null,
    uploadedBy: clean(row.uploaded_by),
    uploadedAt: clean(row.uploaded_at),
    activatedBy: clean(row.activated_by) || null,
    activatedAt: clean(row.activated_at) || null,
    archivedAt: clean(row.archived_at) || null,
  };
};

const insertAudit = async (
  db: DbInterface,
  templateId: string,
  action: string,
  actorUserId: string,
  payload: Record<string, unknown> | null
) => {
  await db.execute(
    `
    INSERT INTO contract_template_audit_log (
      id, template_id, action, actor_user_id, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    [randomUUID(), templateId, action, actorUserId, payload ? JSON.stringify(payload) : null, nowIso()]
  );
};

const safeAddColumn = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: any) {
    const msg = String(error?.message || '');
    const code = String(error?.code || '');
    if (code === 'ER_DUP_FIELDNAME' || /Duplicate column name/i.test(msg)) return;
    throw error;
  }
};

export const ensureContractTemplatesTables = async (db: DbInterface) => {
  if (tablesEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS contract_templates (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      contract_type VARCHAR(40) NOT NULL,
      version INTEGER NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      storage_provider VARCHAR(30) NOT NULL,
      storage_bucket VARCHAR(120),
      storage_key VARCHAR(255) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      size_bytes BIGINT NOT NULL,
      placeholders_json LONGTEXT NOT NULL,
      mapping_json LONGTEXT,
      notes TEXT,
      uploaded_by VARCHAR(64) NOT NULL,
      uploaded_at TEXT NOT NULL,
      activated_by VARCHAR(64),
      activated_at TEXT,
      archived_at TEXT
    )
  `);

  await safeAddColumn(
    db,
    `ALTER TABLE contract_templates ADD COLUMN mapping_json LONGTEXT NULL`
  );
  await safeAddColumn(db, `ALTER TABLE contract_templates ADD COLUMN notes TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE contract_templates ADD COLUMN activated_by VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE contract_templates ADD COLUMN activated_at TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE contract_templates ADD COLUMN archived_at TEXT NULL`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS contract_template_audit_log (
      id VARCHAR(64) PRIMARY KEY,
      template_id VARCHAR(64) NOT NULL,
      action VARCHAR(60) NOT NULL,
      actor_user_id VARCHAR(64) NOT NULL,
      payload_json LONGTEXT,
      created_at TEXT NOT NULL
    )
  `);

  tablesEnsured = true;
};

export const getContractTemplateById = async (
  db: DbInterface,
  templateId: string
): Promise<ContractTemplate | null> => {
  await ensureContractTemplatesTables(db);
  const rows = await db.query(
    `SELECT * FROM contract_templates WHERE id = ? LIMIT 1`,
    [templateId]
  );
  if (!rows[0]) return null;
  return mapTemplate(rows[0]);
};

export const listContractTemplates = async (
  db: DbInterface,
  filters?: {
    status?: ContractTemplateStatus | 'all';
    contractType?: ContractTypeCode | '';
  }
): Promise<ContractTemplate[]> => {
  await ensureContractTemplatesTables(db);

  const where: string[] = ['1=1'];
  const params: any[] = [];

  const status = filters?.status || 'all';
  if (status !== 'all') {
    where.push('status = ?');
    params.push(status);
  }

  const contractType = clean(filters?.contractType || '').toUpperCase();
  if (contractType) {
    where.push('contract_type = ?');
    params.push(contractType);
  }

  const rows = await db.query(
    `
    SELECT *
    FROM contract_templates
    WHERE ${where.join(' AND ')}
    ORDER BY contract_type ASC, version DESC, uploaded_at DESC
    `,
    params
  );

  return rows.map((row) => mapTemplate(row));
};

const getNextTemplateVersion = async (
  db: DbInterface,
  contractType: ContractTypeCode
): Promise<number> => {
  const rows = await db.query(
    `
    SELECT MAX(version) AS max_version
    FROM contract_templates
    WHERE contract_type = ?
    `,
    [contractType]
  );
  const maxVersion = Number(rows?.[0]?.max_version || 0);
  return Number.isFinite(maxVersion) ? maxVersion + 1 : 1;
};

export const createContractTemplate = async (
  db: DbInterface,
  inputRaw: ContractTemplateUploadInput,
  actorUserId: string
): Promise<ContractTemplate> => {
  await ensureContractTemplatesTables(db);

  const name = clean(inputRaw?.name);
  const contractType = normalizeContractType(inputRaw?.contractType);
  const originalName = clean(inputRaw?.originalName);
  const mimeType = clean(inputRaw?.mimeType);
  const storageProvider = clean(inputRaw?.storageProvider);
  const storageBucket = clean(inputRaw?.storageBucket) || null;
  const storageKey = clean(inputRaw?.storageKey);
  const sizeBytes = Number(inputRaw?.sizeBytes || 0);
  const placeholders = normalizePlaceholders(inputRaw?.placeholders || []);
  const notes = clean(inputRaw?.notes) || null;

  if (!name) throw new ContractTemplateValidationError('Nome do modelo e obrigatorio.');
  if (!originalName) throw new ContractTemplateValidationError('Nome do arquivo e obrigatorio.');
  if (!mimeType) throw new ContractTemplateValidationError('Tipo do arquivo invalido.');
  if (!storageProvider) throw new ContractTemplateValidationError('Storage provider invalido.');
  if (!storageKey) throw new ContractTemplateValidationError('Storage key invalida.');
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new ContractTemplateValidationError('Tamanho de arquivo invalido.');
  }

  const version = await getNextTemplateVersion(db, contractType);
  const mapping = normalizeMapping(placeholders, []);
  const now = nowIso();
  const id = randomUUID();

  await db.execute(
    `
    INSERT INTO contract_templates (
      id, name, contract_type, version, status, storage_provider, storage_bucket, storage_key,
      original_name, mime_type, size_bytes, placeholders_json, mapping_json, notes,
      uploaded_by, uploaded_at, activated_by, activated_at, archived_at
    ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
    `,
    [
      id,
      name,
      contractType,
      version,
      storageProvider,
      storageBucket,
      storageKey,
      originalName,
      mimeType,
      sizeBytes,
      JSON.stringify(placeholders),
      JSON.stringify(mapping),
      notes,
      actorUserId,
      now,
    ]
  );

  await insertAudit(db, id, 'TEMPLATE_UPLOADED', actorUserId, {
    contractType,
    version,
    placeholders: placeholders.length,
  });

  const created = await getContractTemplateById(db, id);
  if (!created) throw new ContractTemplateValidationError('Falha ao carregar modelo criado.', 500);
  return created;
};

export const updateContractTemplateMapping = async (
  db: DbInterface,
  templateId: string,
  mappingRaw: unknown,
  actorUserId: string
): Promise<ContractTemplate> => {
  await ensureContractTemplatesTables(db);
  const existing = await getContractTemplateById(db, templateId);
  if (!existing) throw new ContractTemplateValidationError('Modelo nao encontrado.', 404);

  const mapping = normalizeMapping(existing.placeholders, mappingRaw);
  const stats = mappingStats(mapping);

  await db.execute(
    `
    UPDATE contract_templates
    SET mapping_json = ?
    WHERE id = ?
    `,
    [JSON.stringify(mapping), templateId]
  );

  await insertAudit(db, templateId, 'TEMPLATE_MAPPING_UPDATED', actorUserId, {
    mappingDone: stats.done,
    mappingTotal: stats.total,
  });

  const updated = await getContractTemplateById(db, templateId);
  if (!updated) throw new ContractTemplateValidationError('Falha ao carregar modelo atualizado.', 500);
  return updated;
};

export const activateContractTemplate = async (
  db: DbInterface,
  templateId: string,
  actorUserId: string
): Promise<ContractTemplate> => {
  await ensureContractTemplatesTables(db);
  const existing = await getContractTemplateById(db, templateId);
  if (!existing) throw new ContractTemplateValidationError('Modelo nao encontrado.', 404);
  if (!existing.mappingComplete && existing.mappingTotal > 0) {
    throw new ContractTemplateValidationError(
      'Mapeie e confirme todos os placeholders obrigatorios antes de ativar.'
    );
  }

  const now = nowIso();
  await db.execute(
    `
    UPDATE contract_templates
    SET status = 'active', activated_by = ?, activated_at = ?, archived_at = NULL
    WHERE id = ?
    `,
    [actorUserId, now, templateId]
  );

  await insertAudit(db, templateId, 'TEMPLATE_ACTIVATED', actorUserId, {
    contractType: existing.contractType,
    version: existing.version,
  });

  const updated = await getContractTemplateById(db, templateId);
  if (!updated) throw new ContractTemplateValidationError('Falha ao carregar modelo atualizado.', 500);
  return updated;
};

export const archiveContractTemplate = async (
  db: DbInterface,
  templateId: string,
  actorUserId: string
): Promise<ContractTemplate> => {
  await ensureContractTemplatesTables(db);
  const existing = await getContractTemplateById(db, templateId);
  if (!existing) throw new ContractTemplateValidationError('Modelo nao encontrado.', 404);

  const now = nowIso();
  await db.execute(
    `
    UPDATE contract_templates
    SET status = 'archived', archived_at = ?
    WHERE id = ?
    `,
    [now, templateId]
  );

  await insertAudit(db, templateId, 'TEMPLATE_ARCHIVED', actorUserId, {
    contractType: existing.contractType,
    version: existing.version,
  });

  const updated = await getContractTemplateById(db, templateId);
  if (!updated) throw new ContractTemplateValidationError('Falha ao carregar modelo atualizado.', 500);
  return updated;
};

export const listActiveContractTemplateOptions = async (
  db: DbInterface,
  contractType?: ContractTypeCode | ''
): Promise<Array<{ id: string; name: string; contractType: ContractTypeCode; version: number }>> => {
  const items = await listContractTemplates(db, {
    status: 'active',
    contractType: contractType || '',
  });
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    contractType: item.contractType,
    version: item.version,
  }));
};

export const getTemplatePlaceholderSourceOptions = (): PlaceholderSourceOption[] =>
  PLACEHOLDER_SOURCE_OPTIONS;

