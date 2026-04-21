import { randomUUID } from 'crypto';
import type { DbInterface } from '@/lib/db';
import { getContractTemplateById } from '@/lib/contract_templates/repository';
import { renderDocxTemplate } from '@/lib/contract_templates/render';
import { normalizeContractTypeCode } from '@/lib/profissionais/constants';
import {
  ensureProfessionalsTables,
  getProfessionalById,
  getProfessionalProcedureRates,
  getProfessionalDocumentById,
  ProfessionalValidationError,
} from '@/lib/profissionais/repository';
import type { ProfessionalContract } from '@/lib/profissionais/types';
import { getStorageProvider, getStorageProviderByName } from '@/lib/storage';

type GenerateContractOptions = {
  templateId?: string | null;
  source?: 'manual' | 'reprocess';
  reprocessFromContractId?: string | null;
};

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const clean = (value: unknown) => String(value ?? '').trim();

const toDateBr = (isoDate: string | null | undefined) => {
  const raw = clean(isoDate);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
};

const formatCpf = (value: string | null | undefined) => {
  const digits = clean(value).replace(/\D/g, '').slice(0, 11);
  if (digits.length !== 11) return clean(value);
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
};

const formatCnpj = (value: string | null | undefined) => {
  const digits = clean(value).replace(/\D/g, '').slice(0, 14);
  if (digits.length !== 14) return clean(value);
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
};

const formatCurrencyBr = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const joinWithAndPtBr = (values: string[]) => {
  const items = Array.from(
    new Set(
      (values || [])
        .map((value) => clean(value))
        .filter(Boolean)
    )
  );
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} e ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
};

const nowPartsSaoPaulo = () => {
  const date = new Date();
  const datePart = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
  const timePart = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
  return {
    date: datePart,
    datetime: `${datePart} ${timePart}`,
  };
};

const streamToBuffer = async (stream: NodeJS.ReadableStream): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array | string>) {
    chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    );
  }
  return Buffer.concat(chunks);
};

const sanitizePart = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

const buildGeneratedContractStorageKey = (
  professionalId: string,
  professionalName: string,
  extension: 'docx'
) => {
  const prefix = String(
    process.env.PROFESSIONAL_CONTRACTS_S3_PREFIX || 'profissionais/contratos-gerados/'
  ).replace(/^\/+|\/+$/g, '');
  const safeName = sanitizePart(professionalName) || 'profissional';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}/${professionalId}/${stamp}-${safeName}.${extension}`;
};

const parseMetaJson = (raw: unknown): Record<string, unknown> => {
  const text = clean(raw);
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
};

const mapProfessionalContract = (row: Record<string, unknown>): ProfessionalContract => {
  const meta = parseMetaJson(row.meta_json);
  return {
    id: clean(row.id),
    professionalId: clean(row.professional_id),
    templateId: clean(row.template_key) || clean(meta.templateId as string) || null,
    templateName: clean(meta.templateName as string) || null,
    templateVersion: clean(row.template_version) || clean(meta.templateVersion as string),
    status: clean(row.status).toUpperCase() as ProfessionalContract['status'],
    storageProvider: clean(row.storage_provider) || null,
    storageBucket: clean(row.storage_bucket) || null,
    storageKey: clean(row.storage_key) || null,
    generatedBy: clean(row.generated_by),
    generatedAt: clean(row.generated_at) || null,
    errorMessage: clean(row.error_message) || null,
    documentId: clean(meta.documentId as string) || null,
    originalName: clean(meta.originalName as string) || null,
    createdAt: clean(row.created_at),
    meta,
  };
};

const resolveSourceValue = (
  source: string,
  ctx: {
    professional: Awaited<ReturnType<typeof getProfessionalById>>;
    proceduresBlock: string;
  }
): string => {
  const professional = ctx.professional;
  if (!professional) return '';

  const registration = professional.primaryRegistration;
  const now = nowPartsSaoPaulo();

  switch (source) {
    case 'professional.name':
      return professional.name || '';
    case 'professional.contract_type':
      return professional.contractType || '';
    case 'professional.contract_start_date':
      return toDateBr(professional.contractStartDate);
    case 'professional.contract_end_date':
      return toDateBr(professional.contractEndDate);
    case 'professional.cpf':
      return formatCpf(professional.cpf || '');
    case 'professional.cnpj':
      return formatCnpj(professional.cnpj || '');
    case 'professional.legal_name':
      return professional.legalName || '';
    case 'professional.phone':
      return professional.phone || '';
    case 'professional.email':
      return professional.email || '';
    case 'professional.address_text':
      return professional.addressText || '';
    case 'professional.personal_doc_type':
      return professional.personalDocType || '';
    case 'professional.personal_doc_number':
      return professional.personalDocNumber || '';
    case 'professional.payment_minimum_text':
      return professional.paymentMinimumText || '';
    case 'professional.age_range':
      return professional.ageRange || '';
    case 'professional.service_units':
      return Array.isArray(professional.serviceUnits) ? professional.serviceUnits.join(', ') : '';
    case 'professional.primary_specialty':
      return professional.primarySpecialty || professional.specialty || '';
    case 'professional.specialties':
      return joinWithAndPtBr(Array.isArray(professional.specialties) ? professional.specialties : []);
    case 'professional.procedures_block':
      return ctx.proceduresBlock;
    case 'registration.primary.council_type':
      return registration?.councilType || '';
    case 'registration.primary.council_number':
      return registration?.councilNumber || '';
    case 'registration.primary.council_uf':
      return registration?.councilUf || '';
    case 'system.current_date':
      return now.date;
    case 'system.current_datetime':
      return now.datetime;
    default:
      return '';
  }
};

const logProfessionalAudit = async (
  db: DbInterface,
  action: string,
  actorUserId: string,
  professionalId: string,
  payload: Record<string, unknown>
) => {
  await db.execute(
    `
    INSERT INTO professional_audit_log (
      id, professional_id, action, actor_user_id, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, NOW())
    `,
    [randomUUID(), professionalId, action, actorUserId, JSON.stringify(payload)]
  );
};

const updateContractRow = async (
  db: DbInterface,
  contractId: string,
  updates: {
    status: string;
    storageProvider?: string | null;
    storageBucket?: string | null;
    storageKey?: string | null;
    generatedAt?: string | null;
    errorMessage?: string | null;
    metaJson?: Record<string, unknown>;
  }
) => {
  await db.execute(
    `
    UPDATE professional_contracts
    SET
      status = ?,
      storage_provider = ?,
      storage_bucket = ?,
      storage_key = ?,
      generated_at = ?,
      error_message = ?,
      meta_json = ?
    WHERE id = ?
    `,
    [
      updates.status,
      updates.storageProvider || null,
      updates.storageBucket || null,
      updates.storageKey || null,
      updates.generatedAt || null,
      updates.errorMessage || null,
      updates.metaJson ? JSON.stringify(updates.metaJson) : null,
      contractId,
    ]
  );
};

const getProfessionalContractRow = async (
  db: DbInterface,
  professionalId: string,
  contractId: string
): Promise<ProfessionalContract | null> => {
  const rows = await db.query(
    `
    SELECT *
    FROM professional_contracts
    WHERE id = ? AND professional_id = ?
    LIMIT 1
    `,
    [contractId, professionalId]
  );
  if (!rows[0]) return null;
  return mapProfessionalContract(rows[0]);
};

export const getProfessionalContractById = async (
  db: DbInterface,
  professionalId: string,
  contractId: string
): Promise<ProfessionalContract | null> => {
  await ensureProfessionalsTables(db);
  return getProfessionalContractRow(db, professionalId, contractId);
};

type ContractFilePayload = {
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

const parseFileFromMeta = (
  contract: ProfessionalContract,
  format: 'docx'
): ContractFilePayload | null => {
  const files = contract.meta?.files;
  if (!files || typeof files !== 'object' || Array.isArray(files)) return null;
  const maybe = (files as Record<string, unknown>)[format];
  if (!maybe || typeof maybe !== 'object' || Array.isArray(maybe)) return null;
  const item = maybe as Record<string, unknown>;
  const storageProvider = clean(item.storageProvider);
  const storageKey = clean(item.storageKey);
  if (!storageProvider || !storageKey) return null;
  return {
    storageProvider,
    storageBucket: clean(item.storageBucket) || null,
    storageKey,
    originalName: clean(item.originalName),
    mimeType: clean(item.mimeType),
    sizeBytes: Number(item.sizeBytes || 0),
  };
};

const fallbackDocxFileFromLegacyContract = async (
  db: DbInterface,
  contract: ProfessionalContract
): Promise<ContractFilePayload | null> => {
  if (contract.storageProvider && contract.storageKey) {
    return {
      storageProvider: contract.storageProvider,
      storageBucket: contract.storageBucket || null,
      storageKey: contract.storageKey,
      originalName:
        contract.originalName || `contrato-${sanitizePart(contract.professionalId)}.docx`,
      mimeType: DOCX_MIME,
      sizeBytes: 0,
    };
  }

  if (contract.documentId) {
    const linked = await getProfessionalDocumentById(db, contract.documentId);
    if (linked) {
      return {
        storageProvider: linked.storageProvider,
        storageBucket: linked.storageBucket || null,
        storageKey: linked.storageKey,
        originalName: linked.originalName,
        mimeType: linked.mimeType || DOCX_MIME,
        sizeBytes: Number(linked.sizeBytes || 0),
      };
    }
  }

  return null;
};

export const resolveProfessionalContractFile = async (
  db: DbInterface,
  contract: ProfessionalContract,
  format: 'docx'
): Promise<ContractFilePayload | null> => {
  const fromMeta = parseFileFromMeta(contract, format);
  if (fromMeta) return fromMeta;
  return fallbackDocxFileFromLegacyContract(db, contract);
};

export const listProfessionalContractHistory = async (
  db: DbInterface,
  professionalId: string
): Promise<ProfessionalContract[]> => {
  await ensureProfessionalsTables(db);

  const rows = await db.query(
    `
    SELECT *
    FROM professional_contracts
    WHERE professional_id = ?
    ORDER BY created_at DESC
    `,
    [professionalId]
  );
  return rows.map((row) => mapProfessionalContract(row as Record<string, unknown>));
};

export const generateProfessionalContract = async (
  db: DbInterface,
  professionalId: string,
  actorUserId: string,
  options?: GenerateContractOptions
): Promise<ProfessionalContract> => {
  await ensureProfessionalsTables(db);

  const professional = await getProfessionalById(db, professionalId);
  if (!professional) {
    throw new ProfessionalValidationError('Profissional nao encontrado.', 404);
  }
  const procedures = await getProfessionalProcedureRates(db, professionalId);
  const proceduresBlock =
    procedures.length > 0
      ? [
          'PROCEDIMENTO | VALOR',
          ...procedures.map(
            (item) => `${clean(item.procedimentoNome)} | ${formatCurrencyBr(Number(item.valorProfissional || 0))}`
          ),
        ].join('\n')
      : 'Sem procedimentos vinculados.';

  const templateId = clean(options?.templateId || professional.contractTemplateId);
  if (!templateId) {
    throw new ProfessionalValidationError(
      'Selecione um modelo de contrato ativo antes de gerar.'
    );
  }

  const template = await getContractTemplateById(db, templateId);
  if (!template) {
    throw new ProfessionalValidationError('Modelo de contrato nao encontrado.', 404);
  }
  if (template.status !== 'active') {
    throw new ProfessionalValidationError('O modelo selecionado nao esta ativo.');
  }
  if (!template.mappingComplete) {
    throw new ProfessionalValidationError(
      'Mapeie os placeholders obrigatorios antes de gerar o contrato.'
    );
  }
  const templateType = normalizeContractTypeCode(template.contractType);
  const professionalType = normalizeContractTypeCode(professional.contractType);
  if (!templateType || !professionalType || templateType !== professionalType) {
    throw new ProfessionalValidationError(
      'O modelo selecionado nao pertence ao tipo de contrato deste profissional.'
    );
  }

  const resolvedValues: Record<string, string> = {};
  const missingRequired: string[] = [];

  for (const mapItem of template.mapping) {
    const token = clean(mapItem.placeholder);
    if (!token) continue;
    const source = clean(mapItem.source);
    if (!source) {
      if (mapItem.required) missingRequired.push(token);
      resolvedValues[token] = '';
      continue;
    }
    const value = resolveSourceValue(source, { professional, proceduresBlock });
    if (mapItem.required && !clean(value)) {
      missingRequired.push(token);
    }
    resolvedValues[token] = value;
  }

  if (missingRequired.length > 0) {
    throw new ProfessionalValidationError(
      `Nao foi possivel gerar contrato. Placeholders obrigatorios sem valor: ${missingRequired.join(', ')}`
    );
  }

  const contractId = randomUUID();
  const createdAt = new Date().toISOString();

  await db.execute(
    `
    INSERT INTO professional_contracts (
      id, professional_id, template_key, template_version, status,
      storage_provider, storage_bucket, storage_key,
      generated_by, generated_at, error_message, meta_json, created_at
    ) VALUES (?, ?, ?, ?, 'PROCESSANDO', NULL, NULL, NULL, ?, NULL, NULL, ?, ?)
    `,
    [
      contractId,
      professionalId,
      template.id,
      String(template.version),
      actorUserId,
      JSON.stringify({
        source: options?.source || 'manual',
        reprocessFromContractId: options?.reprocessFromContractId || null,
        templateId: template.id,
        templateName: template.name,
        templateVersion: template.version,
      }),
      createdAt,
    ]
  );

  await logProfessionalAudit(db, 'CONTRACT_GENERATION_STARTED', actorUserId, professionalId, {
    contractId,
    templateId: template.id,
    templateVersion: template.version,
    source: options?.source || 'manual',
    reprocessFromContractId: options?.reprocessFromContractId || null,
  });

  let uploadedKey: { bucket: string | null; key: string } | null = null;
  try {
    const templateProvider = getStorageProviderByName(template.storageProvider);
    const templateStream = await templateProvider.getFileStream({
      bucket: template.storageBucket,
      key: template.storageKey,
    });
    const templateBuffer = await streamToBuffer(templateStream);
    const outputDocxBuffer = await renderDocxTemplate(templateBuffer, resolvedValues);

    const uploadProvider = getStorageProvider();
    const docxStorageKey = buildGeneratedContractStorageKey(professionalId, professional.name, 'docx');
    const uploadedDocx = await uploadProvider.uploadFile({
      key: docxStorageKey,
      body: outputDocxBuffer,
      contentType: DOCX_MIME,
      metadata: {
        professionalId,
        contractId,
        templateId: template.id,
        fileFormat: 'docx',
      },
    });
    uploadedKey = { bucket: uploadedDocx.bucket, key: uploadedDocx.key };

    const baseName = `contrato-${sanitizePart(professional.name) || professionalId}-v${template.version}`;
    const docxName = `${baseName}.docx`;

    const generatedAt = new Date().toISOString();
    await updateContractRow(db, contractId, {
      status: 'GERADO',
      storageProvider: uploadedDocx.provider,
      storageBucket: uploadedDocx.bucket,
      storageKey: uploadedDocx.key,
      generatedAt,
      errorMessage: null,
      metaJson: {
        source: options?.source || 'manual',
        reprocessFromContractId: options?.reprocessFromContractId || null,
        templateId: template.id,
        templateName: template.name,
        templateVersion: template.version,
        documentId: null,
        originalName: docxName,
        files: {
          docx: {
            storageProvider: uploadedDocx.provider,
            storageBucket: uploadedDocx.bucket,
            storageKey: uploadedDocx.key,
            originalName: docxName,
            mimeType: DOCX_MIME,
            sizeBytes: outputDocxBuffer.length,
          },
        },
      },
    });

    await logProfessionalAudit(db, 'CONTRACT_GENERATED', actorUserId, professionalId, {
      contractId,
      templateId: template.id,
      templateVersion: template.version,
      storageDocxKey: uploadedDocx.key,
      generatedFormats: ['docx'],
    });

    const finalRow = await getProfessionalContractRow(db, professionalId, contractId);
    if (!finalRow) {
      throw new ProfessionalValidationError('Falha ao carregar contrato gerado.', 500);
    }
    return finalRow;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (uploadedKey?.key) {
      try {
        const provider = getStorageProvider();
        await provider.deleteFile({ bucket: uploadedKey.bucket, key: uploadedKey.key });
      } catch (cleanupError) {
        console.error('Falha ao remover arquivo gerado apos erro:', cleanupError);
      }
    }

    await updateContractRow(db, contractId, {
      status: 'ERRO',
      generatedAt: null,
      errorMessage: clean(errorMessage || 'Erro ao gerar contrato'),
      metaJson: {
        source: options?.source || 'manual',
        reprocessFromContractId: options?.reprocessFromContractId || null,
        templateId: template.id,
        templateName: template.name,
        templateVersion: template.version,
      },
    });

    await logProfessionalAudit(db, 'CONTRACT_GENERATION_FAILED', actorUserId, professionalId, {
      contractId,
      templateId: template.id,
      error: clean(errorMessage),
    });

    throw error;
  }
};

export const reprocessProfessionalContract = async (
  db: DbInterface,
  professionalId: string,
  contractId: string,
  actorUserId: string
): Promise<ProfessionalContract> => {
  const existing = await getProfessionalContractRow(db, professionalId, contractId);
  if (!existing) {
    throw new ProfessionalValidationError('Contrato nao encontrado.', 404);
  }
  if (existing.status !== 'ERRO') {
    throw new ProfessionalValidationError(
      'Reprocessamento disponivel apenas para contratos com status ERRO.'
    );
  }

  return generateProfessionalContract(db, professionalId, actorUserId, {
    templateId: existing.templateId,
    source: 'reprocess',
    reprocessFromContractId: existing.id,
  });
};
