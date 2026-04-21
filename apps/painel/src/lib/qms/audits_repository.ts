import { randomUUID } from 'crypto';
import type { DbInterface } from '@/lib/db';
import { ensureQmsTables, QmsValidationError } from '@/lib/qms/repository';
import type {
  QmsAudit,
  QmsAuditAction,
  QmsAuditActionInput,
  QmsAuditActionStatus,
  QmsAuditCriticality,
  QmsAuditDetail,
  QmsAuditInput,
  QmsAuditStatus,
} from '@/lib/qms/types';

let auditTablesEnsured = false;

export { QmsValidationError };

const clean = (value: unknown) => String(value ?? '').trim();
const nowIso = () => new Date().toISOString();
const bool = (value: unknown) => value === true || value === 1 || String(value || '') === '1';

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || clean(value) === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
};

const parseDate = (value: unknown): string | null => {
  const raw = clean(value);
  if (!raw) return null;
  const isoWithTime = raw.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (isoWithTime) return `${isoWithTime[1]}-${isoWithTime[2]}-${isoWithTime[3]}`;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
};

const parseDateOrThrow = (value: unknown, fieldLabel: string): string | null => {
  const raw = clean(value);
  if (!raw) return null;
  const parsed = parseDate(raw);
  if (!parsed) {
    throw new QmsValidationError(`Data invalida para "${fieldLabel}". Use YYYY-MM-DD ou DD/MM/YYYY.`);
  }
  return parsed;
};

const todayIsoSp = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = new Map(parts.map((p) => [p.type, p.value]));
  const y = map.get('year') || '1970';
  const m = map.get('month') || '01';
  const d = map.get('day') || '01';
  return `${y}-${m}-${d}`;
};

const ALLOWED_CRITICALITY = new Set<QmsAuditCriticality>(['baixa', 'media', 'alta']);
const ALLOWED_STATUS = new Set<QmsAuditStatus>(['aberta', 'em_tratativa', 'encerrada']);
const ALLOWED_ACTION_STATUS = new Set<QmsAuditActionStatus>([
  'aberta',
  'em_andamento',
  'concluida',
  'atrasada',
]);

const normalizeCriticality = (
  value: unknown,
  fallback: QmsAuditCriticality = 'media'
): QmsAuditCriticality => {
  const normalized = clean(value).toLowerCase() as QmsAuditCriticality;
  return ALLOWED_CRITICALITY.has(normalized) ? normalized : fallback;
};

const normalizeStatus = (
  value: unknown,
  fallback: QmsAuditStatus = 'aberta'
): QmsAuditStatus => {
  const normalized = clean(value).toLowerCase() as QmsAuditStatus;
  return ALLOWED_STATUS.has(normalized) ? normalized : fallback;
};

const normalizeActionStatus = (
  value: unknown,
  fallback: QmsAuditActionStatus = 'aberta'
): QmsAuditActionStatus => {
  const normalized = clean(value).toLowerCase() as QmsAuditActionStatus;
  return ALLOWED_ACTION_STATUS.has(normalized) ? normalized : fallback;
};

const validateCompliancePercent = (value: number | null) => {
  if (value === null) return;
  if (value < 0 || value > 100) {
    throw new QmsValidationError('Conformidade deve estar entre 0 e 100.');
  }
};

const validateAuditConsistency = (params: {
  status: QmsAuditStatus;
  reassessed: boolean;
  auditDate: string | null;
  correctionDeadline: string | null;
  effectivenessCheckDate: string | null;
}) => {
  if (params.status === 'encerrada' && !params.reassessed) {
    throw new QmsValidationError('Para encerrar auditoria, marque o campo "Reavaliado".');
  }
  if (params.effectivenessCheckDate && params.auditDate && params.effectivenessCheckDate < params.auditDate) {
    throw new QmsValidationError(
      'Data de checagem de eficacia nao pode ser anterior a data da auditoria.'
    );
  }
  if (params.correctionDeadline && params.auditDate && params.correctionDeadline < params.auditDate) {
    throw new QmsValidationError('Prazo de correcao nao pode ser anterior a data da auditoria.');
  }
};

const validateActionConsistency = (params: {
  status: QmsAuditActionStatus;
  completionNote: string | null;
}) => {
  if (params.status === 'concluida' && !clean(params.completionNote)) {
    throw new QmsValidationError('Informe a nota de conclusao ao concluir a acao corretiva.');
  }
};

const safeAddColumn = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: any) {
    const msg = String(error?.message || '');
    const code = String(error?.code || '');
    if (
      code === 'ER_DUP_FIELDNAME' ||
      /duplicate column/i.test(msg) ||
      /already exists/i.test(msg)
    ) {
      return;
    }
    throw error;
  }
};

const nextAuditCode = async (db: DbInterface) => {
  const year = new Date().getFullYear();
  const rows = await db.query(
    `
    SELECT code
    FROM qms_audits
    WHERE code LIKE ?
    ORDER BY code DESC
    LIMIT 1
    `,
    [`AUD-${year}-%`]
  );
  const last = clean(rows?.[0]?.code);
  const match = last.match(/^AUD-\d{4}-(\d{4})$/);
  const next = match ? Number(match[1]) + 1 : 1;
  return `AUD-${year}-${String(next).padStart(4, '0')}`;
};

const insertAuditLog = async (
  db: DbInterface,
  entityType: string,
  entityId: string,
  action: string,
  actorUserId: string,
  before: unknown,
  after: unknown
) => {
  await db.execute(
    `
    INSERT INTO qms_audit_log (
      id, entity_type, entity_id, action, before_json, after_json, actor_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      randomUUID(),
      entityType,
      entityId,
      action,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      actorUserId,
      nowIso(),
    ]
  );
};

const mapAudit = (row: any): QmsAudit => ({
  id: clean(row.id),
  code: clean(row.code),
  documentId: clean(row.document_id),
  documentVersionId: clean(row.document_version_id),
  documentCode: clean(row.document_code),
  documentName: clean(row.document_name),
  documentVersionLabel: clean(row.document_version_label),
  responsible: clean(row.responsible) || null,
  auditDate: parseDate(row.audit_date),
  compliancePercent: toNumberOrNull(row.compliance_percent),
  nonConformity: clean(row.non_conformity) || null,
  actionPlan: clean(row.action_plan) || null,
  correctionDeadline: parseDate(row.correction_deadline),
  reassessed: bool(row.reassessed),
  effectivenessCheckDate: parseDate(row.effectiveness_check_date),
  criticality: normalizeCriticality(row.criticality, 'media'),
  status: normalizeStatus(row.status, 'aberta'),
  actionsTotal: Number(row.actions_total || 0),
  actionsOpen: Number(row.actions_open || 0),
  createdBy: clean(row.created_by),
  createdAt: clean(row.created_at),
  updatedBy: clean(row.updated_by),
  updatedAt: clean(row.updated_at),
});

const mapAction = (row: any): QmsAuditAction => ({
  id: clean(row.id),
  auditId: clean(row.audit_id),
  description: clean(row.description),
  owner: clean(row.owner) || null,
  deadline: parseDate(row.deadline),
  status: normalizeActionStatus(row.status, 'aberta'),
  completionNote: clean(row.completion_note) || null,
  createdBy: clean(row.created_by),
  createdAt: clean(row.created_at),
  updatedBy: clean(row.updated_by),
  updatedAt: clean(row.updated_at),
});

const loadActionsByAudit = async (db: DbInterface, auditId: string): Promise<QmsAuditAction[]> => {
  const rows = await db.query(
    `
    SELECT *
    FROM qms_audit_actions
    WHERE audit_id = ?
    ORDER BY created_at DESC
    `,
    [auditId]
  );
  return rows.map(mapAction);
};

const loadAuditBaseById = async (db: DbInterface, auditId: string): Promise<QmsAudit | null> => {
  const rows = await db.query(
    `
    SELECT
      a.*,
      d.code AS document_code,
      d.name AS document_name,
      v.version_label AS document_version_label,
      (
        SELECT COUNT(1) FROM qms_audit_actions aa WHERE aa.audit_id = a.id
      ) AS actions_total,
      (
        SELECT COUNT(1) FROM qms_audit_actions aa
        WHERE aa.audit_id = a.id
          AND LOWER(aa.status) IN ('aberta', 'em_andamento', 'atrasada')
      ) AS actions_open
    FROM qms_audits a
    INNER JOIN qms_documents d ON d.id = a.document_id
    INNER JOIN qms_document_versions v ON v.id = a.document_version_id
    WHERE a.id = ?
    LIMIT 1
    `,
    [auditId]
  );
  if (!rows?.[0]) return null;
  return mapAudit(rows[0]);
};

const validateDocumentVersionLink = async (
  db: DbInterface,
  documentId: string,
  versionId: string
) => {
  const rows = await db.query(
    `
    SELECT id
    FROM qms_document_versions
    WHERE id = ? AND document_id = ?
    LIMIT 1
    `,
    [versionId, documentId]
  );
  if (!rows?.[0]) {
    throw new QmsValidationError('Versao selecionada nao pertence ao POP informado.');
  }
};

const reconcileAuditStatus = async (db: DbInterface, auditId: string, actorUserId: string) => {
  const base = await loadAuditBaseById(db, auditId);
  if (!base) return;

  let target = base.status;
  if (base.actionsOpen === 0 && base.reassessed) {
    target = 'encerrada';
  } else if (base.actionsOpen > 0 && base.status === 'encerrada') {
    target = 'em_tratativa';
  } else if (base.actionsOpen > 0 && base.status === 'aberta') {
    target = 'em_tratativa';
  }

  if (target !== base.status) {
    await db.execute(
      `
      UPDATE qms_audits
      SET status = ?, updated_by = ?, updated_at = ?
      WHERE id = ?
      `,
      [target, actorUserId, nowIso(), auditId]
    );
  }
};

export const ensureQmsAuditTables = async (db: DbInterface) => {
  if (auditTablesEnsured) return;
  await ensureQmsTables(db);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS qms_audits (
      id VARCHAR(64) PRIMARY KEY,
      code VARCHAR(40) NOT NULL UNIQUE,
      document_id VARCHAR(64) NOT NULL,
      document_version_id VARCHAR(64) NOT NULL,
      responsible VARCHAR(140),
      audit_date TEXT,
      compliance_percent DECIMAL(10,2),
      non_conformity TEXT,
      action_plan TEXT,
      correction_deadline TEXT,
      reassessed INTEGER NOT NULL DEFAULT 0,
      effectiveness_check_date TEXT,
      criticality VARCHAR(20) NOT NULL DEFAULT 'media',
      status VARCHAR(30) NOT NULL DEFAULT 'aberta',
      created_by VARCHAR(64) NOT NULL,
      created_at TEXT NOT NULL,
      updated_by VARCHAR(64) NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS qms_audit_actions (
      id VARCHAR(64) PRIMARY KEY,
      audit_id VARCHAR(64) NOT NULL,
      description TEXT NOT NULL,
      owner VARCHAR(140),
      deadline TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'aberta',
      completion_note TEXT,
      created_by VARCHAR(64) NOT NULL,
      created_at TEXT NOT NULL,
      updated_by VARCHAR(64) NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await safeAddColumn(db, `ALTER TABLE qms_audits ADD COLUMN criticality VARCHAR(20) NOT NULL DEFAULT 'media'`);
  await safeAddColumn(db, `ALTER TABLE qms_audits ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'aberta'`);
  await safeAddColumn(db, `ALTER TABLE qms_audits ADD COLUMN reassessed INTEGER NOT NULL DEFAULT 0`);
  await safeAddColumn(db, `ALTER TABLE qms_audit_actions ADD COLUMN completion_note TEXT NULL`);

  auditTablesEnsured = true;
};

export const listQmsAuditOptions = async (
  db: DbInterface
): Promise<
  Array<{
    documentId: string;
    code: string;
    name: string;
    versions: Array<{ id: string; label: string }>;
  }>
> => {
  await ensureQmsAuditTables(db);
  const rows = await db.query(
    `
    SELECT
      d.id AS document_id,
      d.code AS document_code,
      d.name AS document_name,
      v.id AS version_id,
      v.version_label
    FROM qms_documents d
    LEFT JOIN qms_document_versions v ON v.document_id = d.id
    WHERE LOWER(d.status) <> 'arquivado'
    ORDER BY d.code ASC, v.created_at DESC
    `,
    []
  );

  const byDoc = new Map<
    string,
    {
      documentId: string;
      code: string;
      name: string;
      versions: Array<{ id: string; label: string }>;
    }
  >();

  for (const row of rows) {
    const documentId = clean(row.document_id);
    if (!documentId) continue;
    if (!byDoc.has(documentId)) {
      byDoc.set(documentId, {
        documentId,
        code: clean(row.document_code),
        name: clean(row.document_name),
        versions: [],
      });
    }
    const versionId = clean(row.version_id);
    if (versionId) {
      byDoc.get(documentId)!.versions.push({
        id: versionId,
        label: clean(row.version_label) || '-',
      });
    }
  }

  return Array.from(byDoc.values());
};

export const listQmsAudits = async (
  db: DbInterface,
  filters?: { search?: string; status?: string; criticality?: string }
): Promise<QmsAudit[]> => {
  await ensureQmsAuditTables(db);
  const where: string[] = ['1=1'];
  const params: any[] = [];

  const search = clean(filters?.search);
  if (search) {
    const like = `%${search.toLowerCase()}%`;
    where.push(
      '(LOWER(a.code) LIKE ? OR LOWER(d.code) LIKE ? OR LOWER(d.name) LIKE ? OR LOWER(COALESCE(a.responsible, \'\')) LIKE ?)'
    );
    params.push(like, like, like, like);
  }

  const status = clean(filters?.status).toLowerCase();
  if (status && status !== 'all') {
    where.push('LOWER(a.status) = ?');
    params.push(status);
  }

  const criticality = clean(filters?.criticality).toLowerCase();
  if (criticality && criticality !== 'all') {
    where.push('LOWER(a.criticality) = ?');
    params.push(criticality);
  }

  const rows = await db.query(
    `
    SELECT
      a.*,
      d.code AS document_code,
      d.name AS document_name,
      v.version_label AS document_version_label,
      (
        SELECT COUNT(1) FROM qms_audit_actions aa WHERE aa.audit_id = a.id
      ) AS actions_total,
      (
        SELECT COUNT(1) FROM qms_audit_actions aa
        WHERE aa.audit_id = a.id
          AND LOWER(aa.status) IN ('aberta', 'em_andamento', 'atrasada')
      ) AS actions_open
    FROM qms_audits a
    INNER JOIN qms_documents d ON d.id = a.document_id
    INNER JOIN qms_document_versions v ON v.id = a.document_version_id
    WHERE ${where.join(' AND ')}
    ORDER BY a.audit_date DESC, a.updated_at DESC
    `,
    params
  );

  return rows.map(mapAudit);
};

export const getQmsAuditById = async (
  db: DbInterface,
  auditId: string
): Promise<QmsAuditDetail | null> => {
  await ensureQmsAuditTables(db);
  const audit = await loadAuditBaseById(db, auditId);
  if (!audit) return null;
  const actions = await loadActionsByAudit(db, auditId);
  return { audit, actions };
};

export const createQmsAudit = async (
  db: DbInterface,
  input: QmsAuditInput,
  actorUserId: string
): Promise<QmsAuditDetail> => {
  await ensureQmsAuditTables(db);
  const documentId = clean(input.documentId);
  const versionId = clean(input.documentVersionId);
  if (!documentId || !versionId) {
    throw new QmsValidationError('POP e versao auditada sao obrigatorios.');
  }

  await validateDocumentVersionLink(db, documentId, versionId);
  const id = randomUUID();
  const createdAt = nowIso();
  const code = clean(input.code) || (await nextAuditCode(db));
  const auditDate = parseDateOrThrow(input.auditDate, 'Data auditoria');
  const compliancePercent = toNumberOrNull(input.compliancePercent);
  const correctionDeadline = parseDateOrThrow(input.correctionDeadline, 'Prazo correcao');
  const reassessed = Boolean(input.reassessed);
  const effectivenessCheckDate = parseDateOrThrow(
    input.effectivenessCheckDate,
    'Data checagem eficacia'
  );
  const criticality = normalizeCriticality(input.criticality, 'media');
  const status = normalizeStatus(input.status, 'aberta');

  validateCompliancePercent(compliancePercent);
  validateAuditConsistency({
    status,
    reassessed,
    auditDate,
    correctionDeadline,
    effectivenessCheckDate,
  });

  await db.execute(
    `
    INSERT INTO qms_audits (
      id, code, document_id, document_version_id, responsible, audit_date, compliance_percent,
      non_conformity, action_plan, correction_deadline, reassessed, effectiveness_check_date,
      criticality, status, created_by, created_at, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      code,
      documentId,
      versionId,
      clean(input.responsible) || null,
      auditDate,
      compliancePercent,
      clean(input.nonConformity) || null,
      clean(input.actionPlan) || null,
      correctionDeadline,
      reassessed ? 1 : 0,
      effectivenessCheckDate,
      criticality,
      status,
      actorUserId,
      createdAt,
      actorUserId,
      createdAt,
    ]
  );

  const detail = await getQmsAuditById(db, id);
  if (!detail) throw new Error('Falha ao carregar auditoria criada.');
  await reconcileAuditStatus(db, id, actorUserId);
  const finalDetail = await getQmsAuditById(db, id);
  if (!finalDetail) throw new Error('Falha ao carregar auditoria criada.');
  await insertAuditLog(db, 'audit', id, 'create', actorUserId, null, finalDetail);
  return finalDetail;
};

export const updateQmsAudit = async (
  db: DbInterface,
  auditId: string,
  input: Partial<QmsAuditInput>,
  actorUserId: string
): Promise<QmsAuditDetail> => {
  await ensureQmsAuditTables(db);
  const current = await getQmsAuditById(db, auditId);
  if (!current) throw new QmsValidationError('Auditoria nao encontrada.', 404);

  const documentId = input.documentId !== undefined ? clean(input.documentId) : current.audit.documentId;
  const versionId =
    input.documentVersionId !== undefined
      ? clean(input.documentVersionId)
      : current.audit.documentVersionId;

  await validateDocumentVersionLink(db, documentId, versionId);
  const nextAuditDate =
    input.auditDate !== undefined
      ? parseDateOrThrow(input.auditDate, 'Data auditoria')
      : current.audit.auditDate;
  const nextCompliancePercent =
    input.compliancePercent !== undefined
      ? toNumberOrNull(input.compliancePercent)
      : current.audit.compliancePercent;
  const nextCorrectionDeadline =
    input.correctionDeadline !== undefined
      ? parseDateOrThrow(input.correctionDeadline, 'Prazo correcao')
      : current.audit.correctionDeadline;
  const nextReassessed =
    input.reassessed !== undefined ? Boolean(input.reassessed) : current.audit.reassessed;
  const nextEffectivenessCheckDate =
    input.effectivenessCheckDate !== undefined
      ? parseDateOrThrow(input.effectivenessCheckDate, 'Data checagem eficacia')
      : current.audit.effectivenessCheckDate;
  const nextCriticality =
    input.criticality !== undefined
      ? normalizeCriticality(input.criticality, current.audit.criticality)
      : current.audit.criticality;
  const nextStatus =
    input.status !== undefined
      ? normalizeStatus(input.status, current.audit.status)
      : current.audit.status;

  validateCompliancePercent(nextCompliancePercent);
  validateAuditConsistency({
    status: nextStatus,
    reassessed: nextReassessed,
    auditDate: nextAuditDate,
    correctionDeadline: nextCorrectionDeadline,
    effectivenessCheckDate: nextEffectivenessCheckDate,
  });

  await db.execute(
    `
    UPDATE qms_audits
    SET document_id = ?, document_version_id = ?, responsible = ?, audit_date = ?,
        compliance_percent = ?, non_conformity = ?, action_plan = ?, correction_deadline = ?,
        reassessed = ?, effectiveness_check_date = ?, criticality = ?, status = ?,
        updated_by = ?, updated_at = ?
    WHERE id = ?
    `,
    [
      documentId,
      versionId,
      input.responsible !== undefined ? clean(input.responsible) || null : current.audit.responsible,
      nextAuditDate,
      nextCompliancePercent,
      input.nonConformity !== undefined
        ? clean(input.nonConformity) || null
        : current.audit.nonConformity,
      input.actionPlan !== undefined ? clean(input.actionPlan) || null : current.audit.actionPlan,
      nextCorrectionDeadline,
      nextReassessed ? 1 : 0,
      nextEffectivenessCheckDate,
      nextCriticality,
      nextStatus,
      actorUserId,
      nowIso(),
      auditId,
    ]
  );

  await reconcileAuditStatus(db, auditId, actorUserId);
  const updated = await getQmsAuditById(db, auditId);
  if (!updated) throw new Error('Falha ao carregar auditoria atualizada.');
  await insertAuditLog(db, 'audit', auditId, 'update', actorUserId, current, updated);
  return updated;
};

export const deleteQmsAudit = async (
  db: DbInterface,
  auditId: string,
  actorUserId: string
) => {
  await ensureQmsAuditTables(db);
  const current = await getQmsAuditById(db, auditId);
  if (!current) throw new QmsValidationError('Auditoria nao encontrada.', 404);

  await db.execute(`DELETE FROM qms_audit_actions WHERE audit_id = ?`, [auditId]);
  await db.execute(`DELETE FROM qms_audits WHERE id = ?`, [auditId]);
  await insertAuditLog(db, 'audit', auditId, 'delete', actorUserId, current, null);
};

export const createQmsAuditAction = async (
  db: DbInterface,
  auditId: string,
  input: QmsAuditActionInput,
  actorUserId: string
): Promise<QmsAuditAction> => {
  await ensureQmsAuditTables(db);
  const audit = await loadAuditBaseById(db, auditId);
  if (!audit) throw new QmsValidationError('Auditoria nao encontrada.', 404);

  const description = clean(input.description);
  if (!description) throw new QmsValidationError('Descricao da acao e obrigatoria.');
  const status = normalizeActionStatus(input.status, 'aberta');
  const deadline = parseDateOrThrow(input.deadline, 'Prazo da acao');
  const completionNote = clean(input.completionNote) || null;

  validateActionConsistency({ status, completionNote });

  const id = randomUUID();
  const createdAt = nowIso();
  await db.execute(
    `
    INSERT INTO qms_audit_actions (
      id, audit_id, description, owner, deadline, status, completion_note,
      created_by, created_at, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      auditId,
      description,
      clean(input.owner) || null,
      deadline,
      status,
      completionNote,
      actorUserId,
      createdAt,
      actorUserId,
      createdAt,
    ]
  );

  await db.execute(
    `
    UPDATE qms_audits
    SET updated_by = ?, updated_at = ?
    WHERE id = ?
    `,
    [actorUserId, createdAt, auditId]
  );

  await reconcileAuditStatus(db, auditId, actorUserId);
  const actionRows = await db.query(
    `SELECT * FROM qms_audit_actions WHERE id = ? LIMIT 1`,
    [id]
  );
  const action = mapAction(actionRows[0]);
  await insertAuditLog(db, 'audit_action', id, 'create', actorUserId, null, action);
  return action;
};

export const updateQmsAuditAction = async (
  db: DbInterface,
  auditId: string,
  actionId: string,
  input: Partial<QmsAuditActionInput>,
  actorUserId: string
): Promise<QmsAuditAction> => {
  await ensureQmsAuditTables(db);
  const rows = await db.query(
    `
    SELECT *
    FROM qms_audit_actions
    WHERE id = ? AND audit_id = ?
    LIMIT 1
    `,
    [actionId, auditId]
  );
  if (!rows?.[0]) throw new QmsValidationError('Acao corretiva nao encontrada.', 404);
  const current = mapAction(rows[0]);

  const description =
    input.description !== undefined ? clean(input.description) : current.description;
  if (!description) throw new QmsValidationError('Descricao da acao e obrigatoria.');

  const merged: QmsAuditAction = {
    ...current,
    description,
    owner: input.owner !== undefined ? clean(input.owner) || null : current.owner,
    deadline:
      input.deadline !== undefined ? parseDateOrThrow(input.deadline, 'Prazo da acao') : current.deadline,
    status:
      input.status !== undefined
        ? normalizeActionStatus(input.status, current.status)
        : current.status,
    completionNote:
      input.completionNote !== undefined
        ? clean(input.completionNote) || null
        : current.completionNote,
    updatedBy: actorUserId,
    updatedAt: nowIso(),
  };

  validateActionConsistency({
    status: merged.status,
    completionNote: merged.completionNote,
  });

  await db.execute(
    `
    UPDATE qms_audit_actions
    SET description = ?, owner = ?, deadline = ?, status = ?, completion_note = ?,
        updated_by = ?, updated_at = ?
    WHERE id = ? AND audit_id = ?
    `,
    [
      merged.description,
      merged.owner,
      merged.deadline,
      merged.status,
      merged.completionNote,
      actorUserId,
      merged.updatedAt,
      actionId,
      auditId,
    ]
  );

  await db.execute(
    `
    UPDATE qms_audits
    SET updated_by = ?, updated_at = ?
    WHERE id = ?
    `,
    [actorUserId, nowIso(), auditId]
  );

  await reconcileAuditStatus(db, auditId, actorUserId);
  const updatedRows = await db.query(
    `SELECT * FROM qms_audit_actions WHERE id = ? LIMIT 1`,
    [actionId]
  );
  const updated = mapAction(updatedRows[0]);
  await insertAuditLog(db, 'audit_action', actionId, 'update', actorUserId, current, updated);
  return updated;
};

export const refreshQmsAuditStatuses = async (
  db: DbInterface,
  actorUserId: string
): Promise<{ audits: number; actions: number; overdueActionsUpdated: number }> => {
  await ensureQmsAuditTables(db);
  const today = todayIsoSp();

  const actionRows = await db.query(
    `
    SELECT *
    FROM qms_audit_actions
    `,
    []
  );

  let overdueActionsUpdated = 0;
  for (const row of actionRows) {
    const action = mapAction(row);
    if (!action.deadline) continue;
    const shouldBeOverdue =
      action.deadline < today &&
      (action.status === 'aberta' || action.status === 'em_andamento');
    if (shouldBeOverdue) {
      await db.execute(
        `
        UPDATE qms_audit_actions
        SET status = 'atrasada', updated_by = ?, updated_at = ?
        WHERE id = ?
        `,
        [actorUserId, nowIso(), action.id]
      );
      overdueActionsUpdated += 1;
    }
  }

  const auditRows = await db.query(`SELECT id FROM qms_audits`, []);
  for (const row of auditRows) {
    const auditId = clean(row.id);
    if (!auditId) continue;
    await reconcileAuditStatus(db, auditId, actorUserId);
  }

  const auditsCountRows = await db.query(`SELECT COUNT(1) AS total FROM qms_audits`, []);
  const actionsCountRows = await db.query(`SELECT COUNT(1) AS total FROM qms_audit_actions`, []);
  const audits = Number(auditsCountRows?.[0]?.total || 0);
  const actions = Number(actionsCountRows?.[0]?.total || 0);

  const details = `refresh audits=${audits} actions=${actions} overdue=${overdueActionsUpdated}`;
  await db.execute(
    `
    INSERT INTO system_status (service_name, status, last_run, details)
    VALUES ('qms_auditorias', 'COMPLETED', datetime('now'), ?)
    ON CONFLICT(service_name) DO UPDATE SET
      status = excluded.status,
      last_run = excluded.last_run,
      details = excluded.details
    `,
    [details]
  );

  return { audits, actions, overdueActionsUpdated };
};
