import { randomUUID } from 'crypto';
import type { DbInterface } from '@/lib/db';
import { EMPLOYEE_UNITS, type EmploymentRegime } from '@/lib/colaboradores/constants';
import { createEmployee } from '@/lib/colaboradores/repository';
import type {
  RecruitmentCandidate,
  RecruitmentCandidateFile,
  RecruitmentCandidateHistory,
  RecruitmentCandidateInput,
  RecruitmentCandidateStage,
  RecruitmentDashboard,
  RecruitmentJob,
  RecruitmentJobStatus,
} from '@/lib/recrutamento/types';

type DbRow = Record<string, unknown>;
type Payload = Record<string, unknown>;

export class RecruitmentValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const NOW = () => new Date().toISOString();
const TODAY_SAO_PAULO = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const clean = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => clean(value).toUpperCase();
const normalizeCpf = (value: unknown) => {
  const digits = clean(value).replace(/\D/g, '').slice(0, 11);
  return digits || null;
};

const normalizePhone = (value: unknown) => {
  const digits = clean(value).replace(/\D/g, '').slice(0, 11);
  return digits || null;
};

const normalizeEmail = (value: unknown) => {
  const email = clean(value).toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new RecruitmentValidationError('E-mail inválido.');
  }
  return email;
};

const parseDate = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

const jobStatuses = new Set<RecruitmentJobStatus>(['OPEN', 'PAUSED', 'CLOSED']);
const stages = new Set<RecruitmentCandidateStage>(['RECEBIDO', 'TRIAGEM', 'ENTREVISTA', 'BANCO', 'APROVADO', 'RECUSADO', 'CONTRATADO']);
const regimes = new Set<EmploymentRegime>(['CLT', 'PJ', 'ESTAGIO']);
const allowedUnits = new Set<string>(EMPLOYEE_UNITS as unknown as string[]);

const normalizeJobStatus = (value: unknown): RecruitmentJobStatus => {
  const normalized = upper(value || 'OPEN') as RecruitmentJobStatus;
  if (!jobStatuses.has(normalized)) throw new RecruitmentValidationError('Status da vaga inválido.');
  return normalized;
};

const normalizeStage = (value: unknown): RecruitmentCandidateStage => {
  const normalized = upper(value || 'RECEBIDO') as RecruitmentCandidateStage;
  if (!stages.has(normalized)) throw new RecruitmentValidationError('Etapa do candidato inválida.');
  return normalized;
};

const normalizeRegime = (value: unknown): EmploymentRegime => {
  const normalized = upper(value || 'CLT') as EmploymentRegime;
  if (!regimes.has(normalized)) throw new RecruitmentValidationError('Regime da vaga inválido.');
  return normalized;
};

const normalizeUnit = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return null;
  const normalized = upper(raw);
  const found = Array.from(allowedUnits).find((unit) => upper(unit) === normalized);
  if (!found) throw new RecruitmentValidationError('Unidade da vaga inválida.');
  return found;
};

const hasField = (payload: Payload | null | undefined, camelKey: string, snakeKey?: string) =>
  Object.prototype.hasOwnProperty.call(payload || {}, camelKey) ||
  Boolean(snakeKey && Object.prototype.hasOwnProperty.call(payload || {}, snakeKey));

let tablesEnsured = false;

const safeCreateIndex = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: unknown) {
    const details = error as { message?: unknown; code?: unknown };
    const msg = String(details?.message || '');
    const code = String(details?.code || '');
    if (code === 'ER_DUP_KEYNAME' || /already exists|Duplicate key name/i.test(msg)) return;
    throw error;
  }
};

export const ensureRecruitmentTables = async (db: DbInterface) => {
  if (tablesEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS recruitment_jobs (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(180) NOT NULL,
      department VARCHAR(180) NULL,
      unit_name VARCHAR(180) NULL,
      employment_regime VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL,
      owner_name VARCHAR(180) NULL,
      opened_at DATE NULL,
      closed_at DATE NULL,
      notes TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS recruitment_candidates (
      id VARCHAR(64) PRIMARY KEY,
      job_id VARCHAR(64) NOT NULL,
      full_name VARCHAR(220) NOT NULL,
      cpf VARCHAR(20) NULL,
      email VARCHAR(220) NULL,
      phone VARCHAR(40) NULL,
      stage VARCHAR(30) NOT NULL,
      source VARCHAR(120) NULL,
      notes TEXT NULL,
      converted_employee_id VARCHAR(64) NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS recruitment_candidate_files (
      id VARCHAR(64) PRIMARY KEY,
      candidate_id VARCHAR(64) NOT NULL,
      storage_provider VARCHAR(30) NOT NULL,
      storage_bucket VARCHAR(255) NULL,
      storage_key TEXT NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      size_bytes INTEGER NOT NULL,
      uploaded_by VARCHAR(64) NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS recruitment_candidate_history (
      id VARCHAR(64) PRIMARY KEY,
      candidate_id VARCHAR(64) NOT NULL,
      action VARCHAR(60) NOT NULL,
      from_stage VARCHAR(30) NULL,
      to_stage VARCHAR(30) NULL,
      notes TEXT NULL,
      actor_user_id VARCHAR(64) NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_jobs_status ON recruitment_jobs (status)`);
  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_candidates_job ON recruitment_candidates (job_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_candidates_stage ON recruitment_candidates (stage)`);
  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_files_candidate ON recruitment_candidate_files (candidate_id)`);
  await safeCreateIndex(db, `CREATE INDEX idx_recruitment_history_candidate ON recruitment_candidate_history (candidate_id)`);

  tablesEnsured = true;
};

const mapJob = (row: DbRow, counts = new Map<string, { total: number; active: number }>()): RecruitmentJob => {
  const id = clean(row.id);
  const count = counts.get(id) || { total: 0, active: 0 };
  return {
    id,
    title: clean(row.title),
    department: clean(row.department) || null,
    unitName: clean(row.unit_name) || null,
    employmentRegime: upper(row.employment_regime || 'CLT') as EmploymentRegime,
    status: upper(row.status || 'OPEN') as RecruitmentJobStatus,
    ownerName: clean(row.owner_name) || null,
    openedAt: parseDate(row.opened_at),
    closedAt: parseDate(row.closed_at),
    notes: clean(row.notes) || null,
    totalCandidates: count.total,
    activeCandidates: count.active,
    createdAt: clean(row.created_at),
    updatedAt: clean(row.updated_at),
  };
};

const mapFile = (row: DbRow): RecruitmentCandidateFile => ({
  id: clean(row.id),
  candidateId: clean(row.candidate_id),
  storageProvider: clean(row.storage_provider),
  storageBucket: clean(row.storage_bucket) || null,
  storageKey: clean(row.storage_key),
  originalName: clean(row.original_name),
  mimeType: clean(row.mime_type) || 'application/octet-stream',
  sizeBytes: Number(row.size_bytes || 0),
  uploadedBy: clean(row.uploaded_by),
  createdAt: clean(row.created_at),
});

const mapHistory = (row: DbRow): RecruitmentCandidateHistory => ({
  id: clean(row.id),
  candidateId: clean(row.candidate_id),
  action: clean(row.action),
  fromStage: clean(row.from_stage) ? (upper(row.from_stage) as RecruitmentCandidateStage) : null,
  toStage: clean(row.to_stage) ? (upper(row.to_stage) as RecruitmentCandidateStage) : null,
  notes: clean(row.notes) || null,
  actorUserId: clean(row.actor_user_id),
  createdAt: clean(row.created_at),
});

const mapCandidate = (
  row: DbRow,
  filesByCandidate = new Map<string, RecruitmentCandidateFile[]>(),
  historyByCandidate = new Map<string, RecruitmentCandidateHistory[]>(),
): RecruitmentCandidate => {
  const id = clean(row.id);
  return {
    id,
    jobId: clean(row.job_id),
    jobTitle: clean(row.job_title),
    fullName: clean(row.full_name),
    cpf: clean(row.cpf) || null,
    email: clean(row.email) || null,
    phone: clean(row.phone) || null,
    stage: upper(row.stage || 'RECEBIDO') as RecruitmentCandidateStage,
    source: clean(row.source) || null,
    notes: clean(row.notes) || null,
    convertedEmployeeId: clean(row.converted_employee_id) || null,
    files: filesByCandidate.get(id) || [],
    history: historyByCandidate.get(id) || [],
    createdAt: clean(row.created_at),
    updatedAt: clean(row.updated_at),
  };
};

const insertHistory = async (
  db: DbInterface,
  candidateId: string,
  action: string,
  actorUserId: string,
  fromStage: RecruitmentCandidateStage | null,
  toStage: RecruitmentCandidateStage | null,
  notes?: string | null,
) => {
  await db.execute(
    `
    INSERT INTO recruitment_candidate_history (
      id, candidate_id, action, from_stage, to_stage, notes, actor_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [randomUUID(), candidateId, action, fromStage, toStage, clean(notes) || null, actorUserId, NOW()],
  );
};

const ensureJobExists = async (db: DbInterface, jobId: string) => {
  const rows = await db.query(`SELECT id FROM recruitment_jobs WHERE id = ? LIMIT 1`, [jobId]);
  if (!rows[0]) throw new RecruitmentValidationError('Vaga não encontrada.', 404);
};

const ensureNoDuplicatePerson = async (db: DbInterface, cpf: string | null, email: string | null, ignoredCandidateId?: string) => {
  if (!cpf && !email) return;

  if (cpf) {
    const employees = await db.query(`SELECT id FROM employees WHERE cpf = ? LIMIT 1`, [cpf]);
    if (employees[0]) throw new RecruitmentValidationError('Já existe colaborador cadastrado com este CPF.');
  }

  if (email) {
    const employees = await db.query(`SELECT id FROM employees WHERE LOWER(COALESCE(email, '')) = ? LIMIT 1`, [email.toLowerCase()]);
    if (employees[0]) throw new RecruitmentValidationError('Já existe colaborador cadastrado com este e-mail.');
  }

  const where: string[] = [];
  const params: unknown[] = [];
  if (cpf) {
    where.push(`cpf = ?`);
    params.push(cpf);
  }
  if (email) {
    where.push(`LOWER(COALESCE(email, '')) = ?`);
    params.push(email.toLowerCase());
  }
  if (!where.length) return;
  if (ignoredCandidateId) params.push(ignoredCandidateId);

  const rows = await db.query(
    `
    SELECT id FROM recruitment_candidates
    WHERE (${where.join(' OR ')})
      ${ignoredCandidateId ? 'AND id <> ?' : ''}
    LIMIT 1
    `,
    params,
  );
  if (rows[0]) throw new RecruitmentValidationError('Já existe candidato cadastrado com este CPF ou e-mail.');
};

export const listRecruitmentDashboard = async (db: DbInterface): Promise<RecruitmentDashboard> => {
  await ensureRecruitmentTables(db);
  const [jobRows, candidateRows, fileRows, historyRows] = await Promise.all([
    db.query(`SELECT * FROM recruitment_jobs ORDER BY status ASC, opened_at DESC, created_at DESC`),
    db.query(`
      SELECT c.*, j.title AS job_title
      FROM recruitment_candidates c
      INNER JOIN recruitment_jobs j ON j.id = c.job_id
      ORDER BY c.updated_at DESC
    `),
    db.query(`SELECT * FROM recruitment_candidate_files ORDER BY created_at DESC`),
    db.query(`SELECT * FROM recruitment_candidate_history ORDER BY created_at DESC`),
  ]);

  const filesByCandidate = new Map<string, RecruitmentCandidateFile[]>();
  for (const row of fileRows) {
    const file = mapFile(row);
    filesByCandidate.set(file.candidateId, [...(filesByCandidate.get(file.candidateId) || []), file]);
  }

  const historyByCandidate = new Map<string, RecruitmentCandidateHistory[]>();
  for (const row of historyRows) {
    const history = mapHistory(row);
    historyByCandidate.set(history.candidateId, [...(historyByCandidate.get(history.candidateId) || []), history]);
  }

  const candidates = candidateRows.map((row: DbRow) => mapCandidate(row, filesByCandidate, historyByCandidate));
  const counts = new Map<string, { total: number; active: number }>();
  for (const candidate of candidates) {
    const current = counts.get(candidate.jobId) || { total: 0, active: 0 };
    current.total += 1;
    if (candidate.stage !== 'RECUSADO' && candidate.stage !== 'CONTRATADO') current.active += 1;
    counts.set(candidate.jobId, current);
  }

  const jobs = jobRows.map((row: DbRow) => mapJob(row, counts));
  return {
    jobs,
    candidates,
    summary: {
      openJobs: jobs.filter((job) => job.status === 'OPEN').length,
      totalCandidates: candidates.length,
      activeCandidates: candidates.filter((candidate) => candidate.stage !== 'RECUSADO' && candidate.stage !== 'CONTRATADO').length,
      approvedCandidates: candidates.filter((candidate) => candidate.stage === 'APROVADO').length,
      convertedCandidates: candidates.filter((candidate) => candidate.convertedEmployeeId).length,
    },
  };
};

export const createRecruitmentJob = async (db: DbInterface, payload: Payload) => {
  await ensureRecruitmentTables(db);
  const title = clean(payload?.title);
  if (!title) throw new RecruitmentValidationError('Informe o título da vaga.');
  const now = NOW();
  await db.execute(
    `
    INSERT INTO recruitment_jobs (
      id, title, department, unit_name, employment_regime, status, owner_name, opened_at, closed_at, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      randomUUID(),
      title,
      clean(payload?.department) || null,
      normalizeUnit(payload?.unitName || payload?.unit_name),
      normalizeRegime(payload?.employmentRegime || payload?.employment_regime),
      normalizeJobStatus(payload?.status),
      clean(payload?.ownerName || payload?.owner_name) || null,
      parseDate(payload?.openedAt || payload?.opened_at) || TODAY_SAO_PAULO(),
      parseDate(payload?.closedAt || payload?.closed_at),
      clean(payload?.notes) || null,
      now,
      now,
    ],
  );
  return listRecruitmentDashboard(db);
};

export const updateRecruitmentJob = async (db: DbInterface, jobId: string, payload: Payload) => {
  await ensureRecruitmentTables(db);
  const rows = await db.query(`SELECT * FROM recruitment_jobs WHERE id = ? LIMIT 1`, [jobId]);
  const existing = rows[0];
  if (!existing) throw new RecruitmentValidationError('Vaga não encontrada.', 404);
  const now = NOW();
  const title = hasField(payload, 'title') ? clean(payload?.title) : clean(existing.title);
  if (!title) throw new RecruitmentValidationError('Informe o título da vaga.');
  await db.execute(
    `
    UPDATE recruitment_jobs
    SET title = ?, department = ?, unit_name = ?, employment_regime = ?, status = ?, owner_name = ?, opened_at = ?, closed_at = ?, notes = ?, updated_at = ?
    WHERE id = ?
    `,
    [
      title,
      hasField(payload, 'department') ? clean(payload?.department) || null : clean(existing.department) || null,
      hasField(payload, 'unitName', 'unit_name') ? normalizeUnit(payload?.unitName ?? payload?.unit_name) : clean(existing.unit_name) || null,
      normalizeRegime(payload?.employmentRegime || payload?.employment_regime || existing.employment_regime),
      normalizeJobStatus(payload?.status || existing.status),
      hasField(payload, 'ownerName', 'owner_name') ? clean(payload?.ownerName ?? payload?.owner_name) || null : clean(existing.owner_name) || null,
      hasField(payload, 'openedAt', 'opened_at') ? parseDate(payload?.openedAt ?? payload?.opened_at) : parseDate(existing.opened_at),
      hasField(payload, 'closedAt', 'closed_at') ? parseDate(payload?.closedAt ?? payload?.closed_at) : parseDate(existing.closed_at),
      hasField(payload, 'notes') ? clean(payload?.notes) || null : clean(existing.notes) || null,
      now,
      jobId,
    ],
  );
  return listRecruitmentDashboard(db);
};

export const createRecruitmentCandidate = async (db: DbInterface, payload: Payload, actorUserId: string) => {
  await ensureRecruitmentTables(db);
  const input: RecruitmentCandidateInput = {
    jobId: clean(payload?.jobId || payload?.job_id),
    fullName: clean(payload?.fullName || payload?.full_name),
    cpf: normalizeCpf(payload?.cpf),
    email: normalizeEmail(payload?.email),
    phone: normalizePhone(payload?.phone),
    stage: normalizeStage(payload?.stage),
    source: clean(payload?.source) || null,
    notes: clean(payload?.notes) || null,
  };
  if (!input.jobId) throw new RecruitmentValidationError('Selecione uma vaga.');
  if (!input.fullName) throw new RecruitmentValidationError('Informe o nome do candidato.');
  await ensureJobExists(db, input.jobId);
  await ensureNoDuplicatePerson(db, input.cpf || null, input.email || null);
  const candidateId = randomUUID();
  const now = NOW();

  await db.execute(
    `
    INSERT INTO recruitment_candidates (
      id, job_id, full_name, cpf, email, phone, stage, source, notes, converted_employee_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [candidateId, input.jobId, input.fullName, input.cpf, input.email, input.phone, input.stage, input.source, input.notes, null, now, now],
  );
  await insertHistory(db, candidateId, 'CANDIDATE_CREATED', actorUserId, null, input.stage || 'RECEBIDO', 'Candidato cadastrado.');
  const dashboard = await listRecruitmentDashboard(db);
  return { ...dashboard, createdCandidateId: candidateId };
};

export const updateRecruitmentCandidate = async (db: DbInterface, candidateId: string, payload: Payload, actorUserId: string) => {
  await ensureRecruitmentTables(db);
  const rows = await db.query(`SELECT * FROM recruitment_candidates WHERE id = ? LIMIT 1`, [candidateId]);
  const existing = rows[0];
  if (!existing) throw new RecruitmentValidationError('Candidato não encontrado.', 404);

  const cpf = payload?.cpf !== undefined ? normalizeCpf(payload.cpf) : clean(existing.cpf) || null;
  const email = payload?.email !== undefined ? normalizeEmail(payload.email) : clean(existing.email) || null;
  await ensureNoDuplicatePerson(db, cpf, email, candidateId);
  const nextStage = payload?.stage !== undefined ? normalizeStage(payload.stage) : (upper(existing.stage) as RecruitmentCandidateStage);
  const previousStage = upper(existing.stage || 'RECEBIDO') as RecruitmentCandidateStage;
  const nextJobId = clean(payload?.jobId || payload?.job_id) || clean(existing.job_id);
  if (nextJobId !== clean(existing.job_id)) await ensureJobExists(db, nextJobId);
  const now = NOW();

  await db.execute(
    `
    UPDATE recruitment_candidates
    SET job_id = ?, full_name = ?, cpf = ?, email = ?, phone = ?, stage = ?, source = ?, notes = ?, updated_at = ?
    WHERE id = ?
    `,
    [
      nextJobId,
      clean(payload?.fullName || payload?.full_name) || clean(existing.full_name),
      cpf,
      email,
      payload?.phone !== undefined ? normalizePhone(payload.phone) : clean(existing.phone) || null,
      nextStage,
      payload?.source !== undefined ? clean(payload.source) || null : clean(existing.source) || null,
      payload?.notes !== undefined ? clean(payload.notes) || null : clean(existing.notes) || null,
      now,
      candidateId,
    ],
  );

  if (nextStage !== previousStage) {
    await insertHistory(db, candidateId, 'STAGE_CHANGED', actorUserId, previousStage, nextStage, clean(payload?.historyNotes) || null);
  } else {
    await insertHistory(db, candidateId, 'CANDIDATE_UPDATED', actorUserId, previousStage, nextStage, clean(payload?.historyNotes) || null);
  }

  return listRecruitmentDashboard(db);
};

export const createRecruitmentCandidateFileRecord = async (
  db: DbInterface,
  candidateId: string,
  payload: {
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    storageProvider: string;
    storageBucket: string | null;
    storageKey: string;
    uploadedBy: string;
  },
  actorUserId: string,
) => {
  await ensureRecruitmentTables(db);
  const rows = await db.query(`SELECT stage FROM recruitment_candidates WHERE id = ? LIMIT 1`, [candidateId]);
  const existing = rows[0];
  if (!existing) throw new RecruitmentValidationError('Candidato não encontrado.', 404);
  const fileId = randomUUID();
  await db.execute(
    `
    INSERT INTO recruitment_candidate_files (
      id, candidate_id, storage_provider, storage_bucket, storage_key, original_name, mime_type, size_bytes, uploaded_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      fileId,
      candidateId,
      payload.storageProvider,
      payload.storageBucket,
      payload.storageKey,
      payload.originalName,
      payload.mimeType,
      payload.sizeBytes,
      payload.uploadedBy,
      NOW(),
    ],
  );
  await insertHistory(db, candidateId, 'FILE_UPLOADED', actorUserId, upper(existing.stage) as RecruitmentCandidateStage, upper(existing.stage) as RecruitmentCandidateStage, payload.originalName);
  return listRecruitmentDashboard(db);
};

export const getRecruitmentCandidateFileById = async (db: DbInterface, fileId: string) => {
  await ensureRecruitmentTables(db);
  const rows = await db.query(`SELECT * FROM recruitment_candidate_files WHERE id = ? LIMIT 1`, [fileId]);
  return rows[0] ? mapFile(rows[0]) : null;
};

export const convertRecruitmentCandidateToEmployee = async (db: DbInterface, candidateId: string, payload: Payload, actorUserId: string) => {
  await ensureRecruitmentTables(db);
  const rows = await db.query(
    `
    SELECT c.*, j.title AS job_title, j.department, j.unit_name, j.employment_regime
    FROM recruitment_candidates c
    INNER JOIN recruitment_jobs j ON j.id = c.job_id
    WHERE c.id = ?
    LIMIT 1
    `,
    [candidateId],
  );
  const candidate = rows[0];
  if (!candidate) throw new RecruitmentValidationError('Candidato não encontrado.', 404);
  if (clean(candidate.converted_employee_id)) throw new RecruitmentValidationError('Candidato já convertido em colaborador.');
  const cpf = normalizeCpf(candidate.cpf);
  if (!cpf) throw new RecruitmentValidationError('Informe o CPF do candidato antes de converter.');
  const email = normalizeEmail(candidate.email);
  await ensureNoDuplicatePerson(db, cpf, email, candidateId);

  const employee = await createEmployee(
    db,
    {
      fullName: clean(candidate.full_name),
      employmentRegime: normalizeRegime(candidate.employment_regime),
      status: 'PRE_ADMISSAO',
      cpf,
      email,
      phone: normalizePhone(candidate.phone),
      admissionDate: parseDate(payload?.admissionDate || payload?.admission_date) || TODAY_SAO_PAULO(),
      units: clean(candidate.unit_name) ? [clean(candidate.unit_name)] : [],
      jobTitle: clean(candidate.job_title) || null,
      department: clean(candidate.department) || null,
      notes: clean(payload?.notes) || `Convertido do recrutamento em ${TODAY_SAO_PAULO()}.`,
    },
    actorUserId,
  );

  await db.execute(
    `
    UPDATE recruitment_candidates
    SET stage = 'CONTRATADO', converted_employee_id = ?, updated_at = ?
    WHERE id = ?
    `,
    [employee.id, NOW(), candidateId],
  );
  await insertHistory(db, candidateId, 'CONVERTED_TO_EMPLOYEE', actorUserId, upper(candidate.stage) as RecruitmentCandidateStage, 'CONTRATADO', employee.id);
  return listRecruitmentDashboard(db);
};
