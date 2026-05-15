import { randomUUID } from 'crypto';
import type { DbInterface } from '../db';
import {
  listIntranetProcedures,
  listIntranetProfessionals,
  listIntranetQmsDocuments,
} from './catalog';

type Row = Record<string, unknown>;

export type KnowledgeSourceType =
  | 'page'
  | 'news'
  | 'faq'
  | 'qms_document'
  | 'professional'
  | 'procedure'
  | 'asset_file'
  | 'manual_answer';

export type KnowledgeSourceStatus = 'pending' | 'indexed' | 'stale' | 'failed' | 'archived';
export type KnowledgeJobType = 'index' | 'reindex' | 'delete' | 'sync';
export type KnowledgeJobStatus = 'pending' | 'running' | 'completed' | 'failed';
export type ChatbotMessageRole = 'user' | 'assistant' | 'system';
export type UnansweredQuestionStatus =
  | 'pending'
  | 'answered'
  | 'published_to_knowledge'
  | 'published_to_faq'
  | 'rejected';

export type ChatbotViewer = {
  id: string;
  role?: string | null;
  department?: string | null;
};

export type KnowledgeSource = {
  id: string;
  sourceType: KnowledgeSourceType;
  sourceEntityId: string;
  sourceRevisionRef: string | null;
  title: string;
  canonicalUrl: string | null;
  status: KnowledgeSourceStatus;
  visibilityRefJson: string[];
  contentText: string | null;
  metaJson: Record<string, unknown>;
  lastIndexedAt: string | null;
  lastError: string | null;
  updatedAt: string;
};

export type KnowledgeChunk = {
  id: string;
  knowledgeSourceId: string;
  chunkIndex: number;
  chunkText: string;
  chunkHash: string;
  embeddingModel: string;
  embeddingJson: number[];
  tokenCount: number;
  visibilityRefJson: string[];
  createdAt: string;
};

export type KnowledgeJob = {
  id: string;
  knowledgeSourceId: string | null;
  jobType: KnowledgeJobType;
  status: KnowledgeJobStatus;
  requestedBy: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type ChatbotSession = {
  id: string;
  userId: string;
  title: string | null;
  startedAt: string;
  updatedAt: string;
};

export type ChatbotMessage = {
  id: string;
  sessionId: string;
  role: ChatbotMessageRole;
  content: string;
  sourcesJson: Array<{
    sourceId: string;
    title: string;
    url: string | null;
  }>;
  createdAt: string;
};

export type UnansweredQuestion = {
  id: string;
  question: string;
  normalizedQuestion: string;
  askedByUserId: string;
  sessionId: string | null;
  status: UnansweredQuestionStatus;
  answerDraft: string | null;
  answerReviewed: string | null;
  reviewNotes: string | null;
  assignedToUserId: string | null;
  answeredByUserId: string | null;
  approvedByUserId: string | null;
  knowledgeSourceId: string | null;
  faqId: string | null;
  createdAt: string;
  answeredAt: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
};

export type KnowledgeDashboardSummary = {
  sourcesTotal: number;
  indexedSources: number;
  pendingSources: number;
  failedSources: number;
  unansweredPending: number;
  recentJobs: KnowledgeJob[];
};

export type KnowledgeSourceListFilters = {
  search?: string;
  statuses?: KnowledgeSourceStatus[];
  sourceTypes?: KnowledgeSourceType[];
};

const KNOWLEDGE_SOURCE_TYPES = new Set<KnowledgeSourceType>([
  'page',
  'news',
  'faq',
  'qms_document',
  'professional',
  'procedure',
  'asset_file',
  'manual_answer',
]);
const KNOWLEDGE_SOURCE_STATUSES = new Set<KnowledgeSourceStatus>(['pending', 'indexed', 'stale', 'failed', 'archived']);
const KNOWLEDGE_JOB_TYPES = new Set<KnowledgeJobType>(['index', 'reindex', 'delete', 'sync']);
const KNOWLEDGE_JOB_STATUSES = new Set<KnowledgeJobStatus>(['pending', 'running', 'completed', 'failed']);
const CHATBOT_MESSAGE_ROLES = new Set<ChatbotMessageRole>(['user', 'assistant', 'system']);
const UNANSWERED_STATUSES = new Set<UnansweredQuestionStatus>([
  'pending',
  'answered',
  'published_to_knowledge',
  'published_to_faq',
  'rejected',
]);
const AUTO_SYNC_SOURCE_TYPES: KnowledgeSourceType[] = ['page', 'news', 'faq', 'qms_document', 'professional', 'procedure'];

let tablesEnsured = false;

const clean = (value: unknown) => String(value ?? '').trim();
const nullable = (value: unknown) => {
  const text = clean(value);
  return text || null;
};
const nowIso = () => new Date().toISOString();
const normalizeText = (value: unknown) =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const parseJson = <T>(value: unknown, fallback: T): T => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};
const stringifyJson = (value: unknown) => JSON.stringify(value ?? null);
const pickEnum = <T extends string>(value: unknown, allowed: Set<T>, fallback: T): T => {
  const raw = clean(value).toLowerCase() as T;
  return allowed.has(raw) ? raw : fallback;
};
const safeAddColumn = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string };
    const message = String(err?.message || '');
    const code = String(err?.code || '');
    if (code === 'ER_DUP_FIELDNAME' || /duplicate column/i.test(message)) return;
    throw error;
  }
};
const safeQuery = async (db: DbInterface, sql: string, params: unknown[] = []) => {
  try {
    return await db.query(sql, params);
  } catch (error: unknown) {
    const message = String((error as { message?: string })?.message || '');
    if (/doesn't exist|no such table|Table .* doesn't exist/i.test(message)) return [];
    throw error;
  }
};
const shaLikeHash = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return `h${Math.abs(hash)}`;
};
const approximateTokenCount = (value: string) => Math.max(1, Math.ceil(clean(value).length / 4));

const flattenText = (value: unknown): string[] => {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') return [value];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap((item) => flattenText(item));
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap((item) => flattenText(item));
  return [];
};

const uniqueStrings = (values: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values.map(clean).filter(Boolean)) {
    const normalized = normalizeText(value);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(value);
  }
  return out;
};

const extractContentText = (...parts: unknown[]) =>
  uniqueStrings(parts.flatMap((part) => flattenText(part)).map((value) => value.replace(/\s+/g, ' ').trim()).filter(Boolean)).join('\n\n');

const pageUrl = (fullPathRaw: unknown) => {
  const fullPath = clean(fullPathRaw).replace(/^\/+|\/+$/g, '');
  return fullPath ? `/${fullPath}` : '/';
};

const chunkText = (
  textRaw: string,
  targetTokens = Number(process.env.KNOWLEDGE_CHUNK_TARGET_TOKENS || '1000'),
  overlapTokens = Number(process.env.KNOWLEDGE_CHUNK_OVERLAP_TOKENS || '160')
) => {
  const text = clean(textRaw);
  if (!text) return [];
  const approxCharsPerToken = 4;
  const targetChars = Math.max(1200, Math.trunc(targetTokens * approxCharsPerToken));
  const overlapChars = Math.max(200, Math.trunc(overlapTokens * approxCharsPerToken));
  if (text.length <= targetChars) return [text];

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    let end = Math.min(text.length, cursor + targetChars);
    if (end < text.length) {
      const slice = text.slice(cursor, end);
      const lastBreak = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
      if (lastBreak > Math.floor(slice.length * 0.55)) {
        end = cursor + lastBreak + 1;
      }
    }
    const chunk = text.slice(cursor, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    cursor = Math.max(end - overlapChars, cursor + 1);
  }

  return chunks;
};

const cosineSimilarity = (left: number[], right: number[]) => {
  if (!left.length || !right.length || left.length !== right.length) return -1;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (!leftNorm || !rightNorm) return -1;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
};

const userMatchesAudience = async (db: DbInterface, audienceGroupId: string, user: ChatbotViewer) => {
  const assignments = await safeQuery(
    db,
    `SELECT id FROM intranet_user_audience_assignments WHERE audience_group_id = ? AND user_id = ? LIMIT 1`,
    [audienceGroupId, user.id]
  );
  if (assignments.length > 0) return true;

  const rules = await safeQuery(
    db,
    `
    SELECT rule_type, rule_value
    FROM intranet_audience_group_rules
    WHERE audience_group_id = ? AND is_active = 1
    `,
    [audienceGroupId]
  );

  for (const rule of rules as Row[]) {
    const ruleType = clean(rule.rule_type).toLowerCase();
    const ruleValue = clean(rule.rule_value).toLowerCase();
    if (ruleType === 'role' && clean(user.role).toLowerCase() === ruleValue) return true;
    if (ruleType === 'department' && clean(user.department).toLowerCase() === ruleValue) return true;
  }

  return false;
};

const userMatchesAudienceRefs = async (db: DbInterface, visibilityRefs: string[], user: ChatbotViewer) => {
  if (!visibilityRefs.length) return true;
  for (const ref of visibilityRefs) {
    if (await userMatchesAudience(db, ref, user)) return true;
  }
  return false;
};

const mapKnowledgeSource = (row: Row): KnowledgeSource => ({
  id: clean(row.id),
  sourceType: pickEnum(clean(row.source_type), KNOWLEDGE_SOURCE_TYPES, 'page'),
  sourceEntityId: clean(row.source_entity_id),
  sourceRevisionRef: nullable(row.source_revision_ref),
  title: clean(row.title),
  canonicalUrl: nullable(row.canonical_url),
  status: pickEnum(clean(row.status), KNOWLEDGE_SOURCE_STATUSES, 'pending'),
  visibilityRefJson: parseJson<string[]>(row.visibility_ref_json, []).map(clean).filter(Boolean),
  contentText: nullable(row.content_text),
  metaJson: parseJson<Record<string, unknown>>(row.meta_json, {}),
  lastIndexedAt: nullable(row.last_indexed_at),
  lastError: nullable(row.last_error),
  updatedAt: clean(row.updated_at),
});

const mapKnowledgeJob = (row: Row): KnowledgeJob => ({
  id: clean(row.id),
  knowledgeSourceId: nullable(row.knowledge_source_id),
  jobType: pickEnum(clean(row.job_type), KNOWLEDGE_JOB_TYPES, 'index'),
  status: pickEnum(clean(row.status), KNOWLEDGE_JOB_STATUSES, 'pending'),
  requestedBy: nullable(row.requested_by),
  startedAt: nullable(row.started_at),
  finishedAt: nullable(row.finished_at),
  errorMessage: nullable(row.error_message),
  createdAt: clean(row.created_at),
});

const mapSession = (row: Row): ChatbotSession => ({
  id: clean(row.id),
  userId: clean(row.user_id),
  title: nullable(row.title),
  startedAt: clean(row.started_at),
  updatedAt: clean(row.updated_at),
});

const mapMessage = (row: Row): ChatbotMessage => ({
  id: clean(row.id),
  sessionId: clean(row.session_id),
  role: pickEnum(clean(row.role), CHATBOT_MESSAGE_ROLES, 'user'),
  content: clean(row.content),
  sourcesJson: parseJson<Array<{ sourceId: string; title: string; url: string | null }>>(row.sources_json, []),
  createdAt: clean(row.created_at),
});

const mapUnansweredQuestion = (row: Row): UnansweredQuestion => ({
  id: clean(row.id),
  question: clean(row.question),
  normalizedQuestion: clean(row.normalized_question),
  askedByUserId: clean(row.asked_by_user_id),
  sessionId: nullable(row.session_id),
  status: pickEnum(clean(row.status), UNANSWERED_STATUSES, 'pending'),
  answerDraft: nullable(row.answer_draft),
  answerReviewed: nullable(row.answer_reviewed),
  reviewNotes: nullable(row.review_notes),
  assignedToUserId: nullable(row.assigned_to_user_id),
  answeredByUserId: nullable(row.answered_by_user_id),
  approvedByUserId: nullable(row.approved_by_user_id),
  knowledgeSourceId: nullable(row.knowledge_source_id),
  faqId: nullable(row.faq_id),
  createdAt: clean(row.created_at),
  answeredAt: nullable(row.answered_at),
  approvedAt: nullable(row.approved_at),
  publishedAt: nullable(row.published_at),
});

const queryById = async (db: DbInterface, table: string, id: string) => {
  const rows = await db.query(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`, [id]);
  return (rows[0] as Row | undefined) || null;
};

export const ensureIntranetChatbotTables = async (db: DbInterface) => {
  if (tablesEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_knowledge_sources (
      id VARCHAR(64) PRIMARY KEY,
      source_type VARCHAR(40) NOT NULL,
      source_entity_id VARCHAR(64) NOT NULL,
      source_revision_ref VARCHAR(120) NULL,
      title VARCHAR(255) NOT NULL,
      canonical_url VARCHAR(500) NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'pending',
      visibility_ref_json LONGTEXT NOT NULL,
      content_text LONGTEXT NULL,
      meta_json LONGTEXT NULL,
      last_indexed_at TEXT NULL,
      last_error TEXT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_intranet_knowledge_sources_status ON intranet_knowledge_sources (status)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_intranet_knowledge_sources_type ON intranet_knowledge_sources (source_type)`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_knowledge_chunks (
      id VARCHAR(64) PRIMARY KEY,
      knowledge_source_id VARCHAR(64) NOT NULL,
      chunk_index INTEGER NOT NULL,
      chunk_text LONGTEXT NOT NULL,
      chunk_hash VARCHAR(120) NOT NULL,
      embedding_model VARCHAR(120) NOT NULL,
      embedding_json LONGTEXT NOT NULL,
      token_count INTEGER NOT NULL DEFAULT 0,
      visibility_ref_json LONGTEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_intranet_knowledge_chunks_source ON intranet_knowledge_chunks (knowledge_source_id, chunk_index)`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_knowledge_jobs (
      id VARCHAR(64) PRIMARY KEY,
      knowledge_source_id VARCHAR(64) NULL,
      job_type VARCHAR(30) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      requested_by VARCHAR(64) NULL,
      started_at TEXT NULL,
      finished_at TEXT NULL,
      error_message TEXT NULL,
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_intranet_knowledge_jobs_status ON intranet_knowledge_jobs (status, created_at)`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_chatbot_sessions (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      title VARCHAR(220) NULL,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_intranet_chatbot_sessions_user ON intranet_chatbot_sessions (user_id, updated_at)`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_chatbot_messages (
      id VARCHAR(64) PRIMARY KEY,
      session_id VARCHAR(64) NOT NULL,
      role VARCHAR(20) NOT NULL,
      content LONGTEXT NOT NULL,
      sources_json LONGTEXT NULL,
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_intranet_chatbot_messages_session ON intranet_chatbot_messages (session_id, created_at)`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_chatbot_unanswered_questions (
      id VARCHAR(64) PRIMARY KEY,
      question LONGTEXT NOT NULL,
      normalized_question TEXT NOT NULL,
      asked_by_user_id VARCHAR(64) NOT NULL,
      session_id VARCHAR(64) NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'pending',
      answer_draft LONGTEXT NULL,
      answer_reviewed LONGTEXT NULL,
      review_notes LONGTEXT NULL,
      assigned_to_user_id VARCHAR(64) NULL,
      answered_by_user_id VARCHAR(64) NULL,
      approved_by_user_id VARCHAR(64) NULL,
      knowledge_source_id VARCHAR(64) NULL,
      faq_id VARCHAR(64) NULL,
      created_at TEXT NOT NULL,
      answered_at TEXT NULL,
      approved_at TEXT NULL,
      published_at TEXT NULL
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_intranet_chatbot_unanswered_status ON intranet_chatbot_unanswered_questions (status, created_at)`);

  await safeAddColumn(db, `ALTER TABLE intranet_knowledge_sources ADD COLUMN content_text LONGTEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE intranet_knowledge_sources ADD COLUMN meta_json LONGTEXT NULL`);

  tablesEnsured = true;
};

const upsertKnowledgeSource = async (
  db: DbInterface,
  input: Omit<KnowledgeSource, 'id' | 'lastIndexedAt' | 'lastError' | 'updatedAt'> & {
    id?: string | null;
    lastIndexedAt?: string | null;
    lastError?: string | null;
    updatedAt?: string | null;
  }
) => {
  await ensureIntranetChatbotTables(db);
  const rows = await db.query(
    `SELECT * FROM intranet_knowledge_sources WHERE source_type = ? AND source_entity_id = ? LIMIT 1`,
    [input.sourceType, input.sourceEntityId]
  );
  const current = rows[0] ? mapKnowledgeSource(rows[0] as Row) : null;
  const id = current?.id || clean(input.id) || randomUUID();
  const nextUpdatedAt = input.updatedAt || nowIso();
  const nextStatus: KnowledgeSourceStatus =
    current?.status === 'archived'
      ? 'archived'
      : current &&
          current.sourceRevisionRef === input.sourceRevisionRef &&
          current.contentText === (input.contentText || null) &&
          stringifyJson(current.visibilityRefJson) === stringifyJson(input.visibilityRefJson)
        ? current.status
        : 'pending';

  if (current) {
    await db.execute(
      `
      UPDATE intranet_knowledge_sources
      SET source_revision_ref = ?, title = ?, canonical_url = ?, status = ?, visibility_ref_json = ?,
          content_text = ?, meta_json = ?, updated_at = ?
      WHERE id = ?
      `,
      [
        nullable(input.sourceRevisionRef),
        input.title,
        nullable(input.canonicalUrl),
        nextStatus,
        stringifyJson(input.visibilityRefJson),
        nullable(input.contentText),
        stringifyJson(input.metaJson),
        nextUpdatedAt,
        id,
      ]
    );
  } else {
    await db.execute(
      `
      INSERT INTO intranet_knowledge_sources (
        id, source_type, source_entity_id, source_revision_ref, title, canonical_url, status,
        visibility_ref_json, content_text, meta_json, last_indexed_at, last_error, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        input.sourceType,
        input.sourceEntityId,
        nullable(input.sourceRevisionRef),
        input.title,
        nullable(input.canonicalUrl),
        nextStatus,
        stringifyJson(input.visibilityRefJson),
        nullable(input.contentText),
        stringifyJson(input.metaJson),
        nullable(input.lastIndexedAt),
        nullable(input.lastError),
        nextUpdatedAt,
      ]
    );
  }

  return mapKnowledgeSource((await queryById(db, 'intranet_knowledge_sources', id)) as Row);
};

const loadAudienceIdsByEntity = async (db: DbInterface, table: string, column: string, id: string) => {
  const rows = await safeQuery(db, `SELECT audience_group_id FROM ${table} WHERE ${column} = ?`, [id]);
  return rows.map((row) => clean((row as Row).audience_group_id)).filter(Boolean);
};

export const syncPublishedKnowledgeSources = async (db: DbInterface) => {
  await ensureIntranetChatbotTables(db);
  const seenKeys = new Set<string>();

  const pages = await safeQuery(
    db,
    `
    SELECT p.id, p.title, p.full_path, p.current_revision_id, p.meta_description, r.content_json
    FROM intranet_pages p
    LEFT JOIN intranet_page_revisions r ON r.id = p.current_revision_id
    WHERE LOWER(p.status) = 'published'
    `
  );

  for (const row of pages as Row[]) {
    const sourceEntityId = clean(row.id);
    seenKeys.add(`page:${sourceEntityId}`);
    await upsertKnowledgeSource(db, {
      sourceType: 'page',
      sourceEntityId,
      sourceRevisionRef: clean(row.current_revision_id) || clean(row.full_path),
      title: clean(row.title),
      canonicalUrl: pageUrl(row.full_path),
      status: 'pending',
      visibilityRefJson: await loadAudienceIdsByEntity(db, 'intranet_page_audiences', 'page_id', sourceEntityId),
      contentText: extractContentText(row.title, row.meta_description, parseJson(row.content_json, {})),
      metaJson: { fullPath: pageUrl(row.full_path) },
    });
  }

  const news = await safeQuery(
    db,
    `
    SELECT id, title, slug, summary, body_json, updated_at, published_at
    FROM intranet_news_posts
    WHERE LOWER(status) = 'published'
    `
  );

  for (const row of news as Row[]) {
    const sourceEntityId = clean(row.id);
    seenKeys.add(`news:${sourceEntityId}`);
    await upsertKnowledgeSource(db, {
      sourceType: 'news',
      sourceEntityId,
      sourceRevisionRef: clean(row.updated_at) || clean(row.published_at) || sourceEntityId,
      title: clean(row.title),
      canonicalUrl: `/noticias/${clean(row.slug) || sourceEntityId}`,
      status: 'pending',
      visibilityRefJson: await loadAudienceIdsByEntity(db, 'intranet_news_post_audiences', 'post_id', sourceEntityId),
      contentText: extractContentText(row.title, row.summary, parseJson(row.body_json, {})),
      metaJson: { slug: clean(row.slug) || null },
    });
  }

  const faq = await safeQuery(
    db,
    `
    SELECT id, question, answer_json, updated_at, approved_at
    FROM intranet_faq_items
    WHERE is_active = 1
    `
  );

  for (const row of faq as Row[]) {
    const sourceEntityId = clean(row.id);
    seenKeys.add(`faq:${sourceEntityId}`);
    await upsertKnowledgeSource(db, {
      sourceType: 'faq',
      sourceEntityId,
      sourceRevisionRef: clean(row.updated_at) || clean(row.approved_at) || sourceEntityId,
      title: clean(row.question),
      canonicalUrl: `/faq`,
      status: 'pending',
      visibilityRefJson: await loadAudienceIdsByEntity(db, 'intranet_faq_item_audiences', 'faq_item_id', sourceEntityId),
      contentText: extractContentText(row.question, parseJson(row.answer_json, {})),
      metaJson: {},
    });
  }

  const [qmsDocuments, professionals, procedures] = await Promise.all([
    listIntranetQmsDocuments(db, { limit: 500 }),
    listIntranetProfessionals(db, { limit: 500 }),
    listIntranetProcedures(db, { limit: 500 }),
  ]);

  for (const item of qmsDocuments) {
    seenKeys.add(`qms_document:${item.id}`);
    await upsertKnowledgeSource(db, {
      sourceType: 'qms_document',
      sourceEntityId: item.id,
      sourceRevisionRef: item.updatedAt || item.fileId || item.id,
      title: item.name,
      canonicalUrl: item.fileUrl || '/busca',
      status: 'pending',
      visibilityRefJson: [],
      contentText: extractContentText(item.name, item.code, item.sector, item.objective),
      metaJson: { code: item.code, sector: item.sector, fileId: item.fileId },
    });
  }

  for (const item of professionals) {
    seenKeys.add(`professional:${item.professionalId}`);
    await upsertKnowledgeSource(db, {
      sourceType: 'professional',
      sourceEntityId: item.professionalId,
      sourceRevisionRef: item.updatedAt || item.publishedAt || item.professionalId,
      title: item.displayName,
      canonicalUrl: `/servicos/consultas?q=${encodeURIComponent(item.displayName)}`,
      status: 'pending',
      visibilityRefJson: [],
      contentText: extractContentText(
        item.displayName,
        item.shortBio,
        item.longBio,
        item.cardHighlight,
        item.specialties,
        item.serviceUnits,
        item.attendanceModes,
        item.serviceLocations,
        item.intranetNotesText,
        item.contactNotes
      ),
      metaJson: {},
    });
  }

  for (const item of procedures) {
    seenKeys.add(`procedure:${item.id}`);
    const basePath = item.catalogType === 'exam' ? '/servicos/exames' : '/servicos/procedimentos';
    await upsertKnowledgeSource(db, {
      sourceType: 'procedure',
      sourceEntityId: item.id,
      sourceRevisionRef: item.updatedAt || item.id,
      title: item.displayName,
      canonicalUrl: `${basePath}/${item.slug}`,
      status: 'pending',
      visibilityRefJson: [],
      contentText: extractContentText(
        item.displayName,
        item.summary,
        item.description,
        item.category,
        item.subcategory,
        item.whoPerforms,
        item.howItWorks,
        item.patientInstructions,
        item.preparationInstructions,
        item.contraindications,
        item.recoveryNotes
      ),
      metaJson: { catalogType: item.catalogType },
    });
  }

  const existing = await safeQuery(
    db,
    `SELECT id, source_type, source_entity_id, status FROM intranet_knowledge_sources WHERE source_type IN (${AUTO_SYNC_SOURCE_TYPES.map(() => '?').join(',')})`,
    AUTO_SYNC_SOURCE_TYPES
  );

  for (const row of existing as Row[]) {
    const key = `${clean(row.source_type)}:${clean(row.source_entity_id)}`;
    if (seenKeys.has(key)) continue;
    await db.execute(
      `UPDATE intranet_knowledge_sources SET status = 'archived', updated_at = ? WHERE id = ?`,
      [nowIso(), clean(row.id)]
    );
  }
};

export const listKnowledgeSources = async (db: DbInterface, filters: KnowledgeSourceListFilters = {}) => {
  await ensureIntranetChatbotTables(db);
  const where = ['1=1'];
  const params: unknown[] = [];
  if (clean(filters.search)) {
    where.push('(LOWER(title) LIKE ? OR LOWER(COALESCE(content_text, \'\')) LIKE ?)');
    const like = `%${normalizeText(filters.search)}%`;
    params.push(like, like);
  }
  if (Array.isArray(filters.statuses) && filters.statuses.length) {
    where.push(`status IN (${filters.statuses.map(() => '?').join(', ')})`);
    params.push(...filters.statuses);
  }
  if (Array.isArray(filters.sourceTypes) && filters.sourceTypes.length) {
    where.push(`source_type IN (${filters.sourceTypes.map(() => '?').join(', ')})`);
    params.push(...filters.sourceTypes);
  }
  const rows = await db.query(
    `SELECT * FROM intranet_knowledge_sources WHERE ${where.join(' AND ')} ORDER BY updated_at DESC, title ASC`,
    params
  );
  return rows.map((row) => mapKnowledgeSource(row as Row));
};

export const getKnowledgeSourceById = async (db: DbInterface, id: string) => {
  await ensureIntranetChatbotTables(db);
  const row = await queryById(db, 'intranet_knowledge_sources', clean(id));
  return row ? mapKnowledgeSource(row) : null;
};

export const canUserAccessKnowledgeSource = async (
  db: DbInterface,
  sourceId: string,
  user: ChatbotViewer
) => {
  const source = await getKnowledgeSourceById(db, sourceId);
  if (!source) return false;
  return userMatchesAudienceRefs(db, source.visibilityRefJson, user);
};

export const createKnowledgeAssetSource = async (
  db: DbInterface,
  input: {
    assetId: string;
    title: string;
    storageProvider: string;
    storageBucket: string | null;
    storageKey: string;
    mimeType: string;
    audienceGroupIds?: string[];
  }
) => {
  const source = await upsertKnowledgeSource(db, {
    sourceType: 'asset_file',
    sourceEntityId: clean(input.assetId),
    sourceRevisionRef: `${clean(input.assetId)}:${clean(input.storageKey)}`,
    title: clean(input.title) || 'Documento manual',
    canonicalUrl: null,
    status: 'pending',
    visibilityRefJson: (input.audienceGroupIds || []).map(clean).filter(Boolean),
    contentText: null,
    metaJson: {
      storageProvider: clean(input.storageProvider),
      storageBucket: nullable(input.storageBucket),
      storageKey: clean(input.storageKey),
      mimeType: clean(input.mimeType),
    },
  });
  await queueKnowledgeJob(db, {
    knowledgeSourceId: source.id,
    jobType: 'index',
    requestedBy: null,
  });
  return source;
};

export const updateKnowledgeSource = async (
  db: DbInterface,
  id: string,
  patch: {
    title?: string | null;
    status?: KnowledgeSourceStatus | null;
    audienceGroupIds?: string[];
  }
) => {
  const current = await getKnowledgeSourceById(db, id);
  if (!current) return null;
  await db.execute(
    `
    UPDATE intranet_knowledge_sources
    SET title = ?, status = ?, visibility_ref_json = ?, updated_at = ?
    WHERE id = ?
    `,
    [
      patch.title ? clean(patch.title) : current.title,
      patch.status && KNOWLEDGE_SOURCE_STATUSES.has(patch.status) ? patch.status : current.status,
      stringifyJson(Array.isArray(patch.audienceGroupIds) ? patch.audienceGroupIds.map(clean).filter(Boolean) : current.visibilityRefJson),
      nowIso(),
      current.id,
    ]
  );
  return getKnowledgeSourceById(db, current.id);
};

export const queueKnowledgeJob = async (
  db: DbInterface,
  input: {
    knowledgeSourceId?: string | null;
    jobType: KnowledgeJobType;
    requestedBy?: string | null;
  }
) => {
  await ensureIntranetChatbotTables(db);
  const id = randomUUID();
  const createdAt = nowIso();
  await db.execute(
    `
    INSERT INTO intranet_knowledge_jobs (
      id, knowledge_source_id, job_type, status, requested_by, started_at, finished_at, error_message, created_at
    ) VALUES (?, ?, ?, 'pending', ?, NULL, NULL, NULL, ?)
    `,
    [id, nullable(input.knowledgeSourceId), input.jobType, nullable(input.requestedBy), createdAt]
  );
  return mapKnowledgeJob((await queryById(db, 'intranet_knowledge_jobs', id)) as Row);
};

export const listKnowledgeJobs = async (db: DbInterface, limitRaw = 20) => {
  await ensureIntranetChatbotTables(db);
  const limit = Math.max(1, Math.min(100, Number(limitRaw || 20)));
  const rows = await db.query(`SELECT * FROM intranet_knowledge_jobs ORDER BY created_at DESC LIMIT ${limit}`);
  return rows.map((row) => mapKnowledgeJob(row as Row));
};

export const updateKnowledgeJob = async (
  db: DbInterface,
  id: string,
  patch: Partial<Pick<KnowledgeJob, 'status' | 'startedAt' | 'finishedAt' | 'errorMessage'>>
) => {
  await db.execute(
    `
    UPDATE intranet_knowledge_jobs
    SET status = ?, started_at = ?, finished_at = ?, error_message = ?
    WHERE id = ?
    `,
    [
      patch.status && KNOWLEDGE_JOB_STATUSES.has(patch.status) ? patch.status : 'pending',
      nullable(patch.startedAt),
      nullable(patch.finishedAt),
      nullable(patch.errorMessage),
      clean(id),
    ]
  );
};

export const replaceKnowledgeSourceChunks = async (
  db: DbInterface,
  sourceId: string,
  input: Array<{
    chunkIndex: number;
    chunkText: string;
    embeddingModel: string;
    embedding: number[];
    tokenCount: number;
    visibilityRefJson: string[];
  }>
) => {
  await ensureIntranetChatbotTables(db);
  await db.execute(`DELETE FROM intranet_knowledge_chunks WHERE knowledge_source_id = ?`, [clean(sourceId)]);
  const createdAt = nowIso();
  for (const item of input) {
    await db.execute(
      `
      INSERT INTO intranet_knowledge_chunks (
        id, knowledge_source_id, chunk_index, chunk_text, chunk_hash, embedding_model, embedding_json, token_count, visibility_ref_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        randomUUID(),
        clean(sourceId),
        Number(item.chunkIndex || 0),
        clean(item.chunkText),
        shaLikeHash(clean(item.chunkText)),
        clean(item.embeddingModel),
        stringifyJson(item.embedding),
        Number(item.tokenCount || approximateTokenCount(item.chunkText)),
        stringifyJson(item.visibilityRefJson),
        createdAt,
      ]
    );
  }
  await db.execute(
    `UPDATE intranet_knowledge_sources SET status = 'indexed', last_indexed_at = ?, last_error = NULL, updated_at = ? WHERE id = ?`,
    [createdAt, createdAt, clean(sourceId)]
  );
};

export const markKnowledgeSourceFailed = async (db: DbInterface, sourceId: string, errorMessage: string) => {
  const now = nowIso();
  await db.execute(
    `UPDATE intranet_knowledge_sources SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?`,
    [clean(errorMessage), now, clean(sourceId)]
  );
};

export const listPendingKnowledgeSources = async (db: DbInterface, limitRaw = 20) => {
  await ensureIntranetChatbotTables(db);
  const limit = Math.max(1, Math.min(100, Number(limitRaw || 20)));
  const rows = await db.query(
    `SELECT * FROM intranet_knowledge_sources WHERE status IN ('pending', 'stale', 'failed') ORDER BY updated_at ASC LIMIT ${limit}`
  );
  return rows.map((row) => mapKnowledgeSource(row as Row));
};

export const buildKnowledgeChunksForSource = (source: KnowledgeSource) =>
  chunkText(source.contentText || '').map((chunkTextValue, index) => ({
    chunkIndex: index,
    chunkText: chunkTextValue,
    tokenCount: approximateTokenCount(chunkTextValue),
    visibilityRefJson: source.visibilityRefJson,
  }));

export const listKnowledgeChunksForUser = async (db: DbInterface, user: ChatbotViewer) => {
  await ensureIntranetChatbotTables(db);
  const rows = await db.query(
    `
    SELECT c.*, s.title, s.canonical_url, s.source_type, s.status
    FROM intranet_knowledge_chunks c
    INNER JOIN intranet_knowledge_sources s ON s.id = c.knowledge_source_id
    WHERE s.status = 'indexed'
    ORDER BY s.updated_at DESC, c.chunk_index ASC
    `
  );

  const out: Array<
    KnowledgeChunk & {
      sourceTitle: string;
      canonicalUrl: string | null;
      sourceType: KnowledgeSourceType;
    }
  > = [];

  for (const row of rows as Row[]) {
    const visibility = parseJson<string[]>(row.visibility_ref_json, []).map(clean).filter(Boolean);
    if (!(await userMatchesAudienceRefs(db, visibility, user))) continue;
    out.push({
      id: clean(row.id),
      knowledgeSourceId: clean(row.knowledge_source_id),
      chunkIndex: Number(row.chunk_index || 0),
      chunkText: clean(row.chunk_text),
      chunkHash: clean(row.chunk_hash),
      embeddingModel: clean(row.embedding_model),
      embeddingJson: parseJson<number[]>(row.embedding_json, []),
      tokenCount: Number(row.token_count || 0),
      visibilityRefJson: visibility,
      createdAt: clean(row.created_at),
      sourceTitle: clean(row.title),
      canonicalUrl: nullable(row.canonical_url),
      sourceType: pickEnum(clean(row.source_type), KNOWLEDGE_SOURCE_TYPES, 'page'),
    });
  }

  return out;
};

export const rankKnowledgeChunks = async (
  db: DbInterface,
  user: ChatbotViewer,
  questionEmbedding: number[],
  limitRaw = 6
) => {
  const chunks = await listKnowledgeChunksForUser(db, user);
  const limit = Math.max(1, Math.min(12, Number(limitRaw || 6)));
  return chunks
    .map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(questionEmbedding, chunk.embeddingJson),
    }))
    .filter((chunk) => chunk.score > 0.1)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
};

export const listChatbotSessions = async (db: DbInterface, userId: string) => {
  await ensureIntranetChatbotTables(db);
  const rows = await db.query(
    `SELECT * FROM intranet_chatbot_sessions WHERE user_id = ? ORDER BY updated_at DESC, started_at DESC`,
    [clean(userId)]
  );
  return rows.map((row) => mapSession(row as Row));
};

export const listChatbotSessionsAudit = async (db: DbInterface, limitRaw = 50) => {
  await ensureIntranetChatbotTables(db);
  const limit = Math.max(1, Math.min(200, Number(limitRaw || 50)));
  const rows = await db.query(
    `SELECT * FROM intranet_chatbot_sessions ORDER BY updated_at DESC, started_at DESC LIMIT ${limit}`
  );
  return rows.map((row) => mapSession(row as Row));
};

export const getChatbotSession = async (db: DbInterface, sessionId: string, userId: string) => {
  await ensureIntranetChatbotTables(db);
  const rows = await db.query(
    `SELECT * FROM intranet_chatbot_sessions WHERE id = ? AND user_id = ? LIMIT 1`,
    [clean(sessionId), clean(userId)]
  );
  return rows[0] ? mapSession(rows[0] as Row) : null;
};

export const createChatbotSession = async (db: DbInterface, userId: string, title?: string | null) => {
  await ensureIntranetChatbotTables(db);
  const id = randomUUID();
  const stamp = nowIso();
  await db.execute(
    `INSERT INTO intranet_chatbot_sessions (id, user_id, title, started_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [id, clean(userId), nullable(title), stamp, stamp]
  );
  return mapSession((await queryById(db, 'intranet_chatbot_sessions', id)) as Row);
};

export const listChatbotMessages = async (db: DbInterface, sessionId: string, userId: string) => {
  const session = await getChatbotSession(db, sessionId, userId);
  if (!session) return [];
  const rows = await db.query(
    `SELECT * FROM intranet_chatbot_messages WHERE session_id = ? ORDER BY created_at ASC`,
    [session.id]
  );
  return rows.map((row) => mapMessage(row as Row));
};

export const listChatbotMessagesAudit = async (db: DbInterface, sessionId: string) => {
  await ensureIntranetChatbotTables(db);
  const rows = await db.query(
    `SELECT * FROM intranet_chatbot_messages WHERE session_id = ? ORDER BY created_at ASC`,
    [clean(sessionId)]
  );
  return rows.map((row) => mapMessage(row as Row));
};

export const appendChatbotMessage = async (
  db: DbInterface,
  sessionId: string,
  userId: string,
  input: {
    role: ChatbotMessageRole;
    content: string;
    sourcesJson?: Array<{ sourceId: string; title: string; url: string | null }>;
  }
) => {
  const session = await getChatbotSession(db, sessionId, userId);
  if (!session) {
    throw new Error('Sessao de chatbot nao encontrada.');
  }
  const id = randomUUID();
  const stamp = nowIso();
  await db.execute(
    `
    INSERT INTO intranet_chatbot_messages (id, session_id, role, content, sources_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      session.id,
      input.role,
      clean(input.content),
      stringifyJson(input.sourcesJson || []),
      stamp,
    ]
  );
  await db.execute(`UPDATE intranet_chatbot_sessions SET updated_at = ? WHERE id = ?`, [stamp, session.id]);
  return mapMessage((await queryById(db, 'intranet_chatbot_messages', id)) as Row);
};

export const createUnansweredQuestion = async (
  db: DbInterface,
  input: {
    question: string;
    askedByUserId: string;
    sessionId?: string | null;
  }
) => {
  await ensureIntranetChatbotTables(db);
  const id = randomUUID();
  const createdAt = nowIso();
  await db.execute(
    `
    INSERT INTO intranet_chatbot_unanswered_questions (
      id, question, normalized_question, asked_by_user_id, session_id, status,
      answer_draft, answer_reviewed, review_notes, assigned_to_user_id, answered_by_user_id,
      approved_by_user_id, knowledge_source_id, faq_id, created_at, answered_at, approved_at, published_at
    ) VALUES (?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, NULL, NULL, NULL)
    `,
    [id, clean(input.question), normalizeText(input.question), clean(input.askedByUserId), nullable(input.sessionId), createdAt]
  );
  return mapUnansweredQuestion((await queryById(db, 'intranet_chatbot_unanswered_questions', id)) as Row);
};

export const listUnansweredQuestions = async (db: DbInterface) => {
  await ensureIntranetChatbotTables(db);
  const rows = await db.query(
    `SELECT * FROM intranet_chatbot_unanswered_questions ORDER BY created_at DESC`
  );
  return rows.map((row) => mapUnansweredQuestion(row as Row));
};

export const updateUnansweredQuestion = async (
  db: DbInterface,
  id: string,
  patch: {
    status?: UnansweredQuestionStatus;
    answerDraft?: string | null;
    answerReviewed?: string | null;
    reviewNotes?: string | null;
    assignedToUserId?: string | null;
    answeredByUserId?: string | null;
    approvedByUserId?: string | null;
  }
) => {
  const current = await queryById(db, 'intranet_chatbot_unanswered_questions', clean(id));
  if (!current) return null;
  const currentItem = mapUnansweredQuestion(current);
  const status = patch.status && UNANSWERED_STATUSES.has(patch.status) ? patch.status : currentItem.status;
  const answeredAt = patch.answerReviewed || patch.answerDraft ? nowIso() : currentItem.answeredAt;
  const approvedAt = patch.approvedByUserId ? nowIso() : currentItem.approvedAt;
  await db.execute(
    `
    UPDATE intranet_chatbot_unanswered_questions
    SET status = ?, answer_draft = ?, answer_reviewed = ?, review_notes = ?, assigned_to_user_id = ?,
        answered_by_user_id = ?, approved_by_user_id = ?, answered_at = ?, approved_at = ?
    WHERE id = ?
    `,
    [
      status,
      patch.answerDraft !== undefined ? nullable(patch.answerDraft) : currentItem.answerDraft,
      patch.answerReviewed !== undefined ? nullable(patch.answerReviewed) : currentItem.answerReviewed,
      patch.reviewNotes !== undefined ? nullable(patch.reviewNotes) : currentItem.reviewNotes,
      patch.assignedToUserId !== undefined ? nullable(patch.assignedToUserId) : currentItem.assignedToUserId,
      patch.answeredByUserId !== undefined ? nullable(patch.answeredByUserId) : currentItem.answeredByUserId,
      patch.approvedByUserId !== undefined ? nullable(patch.approvedByUserId) : currentItem.approvedByUserId,
      nullable(answeredAt),
      nullable(approvedAt),
      currentItem.id,
    ]
  );
  return mapUnansweredQuestion((await queryById(db, 'intranet_chatbot_unanswered_questions', currentItem.id)) as Row);
};

export const publishUnansweredQuestionToKnowledge = async (
  db: DbInterface,
  id: string,
  actorUserId: string
) => {
  await ensureIntranetChatbotTables(db);
  const currentRow = await queryById(db, 'intranet_chatbot_unanswered_questions', clean(id));
  if (!currentRow) return null;
  const current = mapUnansweredQuestion(currentRow);
  const answer = clean(current.answerReviewed || current.answerDraft);
  if (!answer) {
    throw new Error('A pergunta precisa de uma resposta revisada antes da publicacao.');
  }

  const source = await upsertKnowledgeSource(db, {
    sourceType: 'manual_answer',
    sourceEntityId: current.id,
    sourceRevisionRef: nowIso(),
    title: current.question,
    canonicalUrl: null,
    status: 'pending',
    visibilityRefJson: [],
    contentText: extractContentText(current.question, answer),
    metaJson: {
      question: current.question,
      answer,
      publishedBy: actorUserId,
    },
  });

  const stamp = nowIso();
  await db.execute(
    `
    UPDATE intranet_chatbot_unanswered_questions
    SET status = 'published_to_knowledge', knowledge_source_id = ?, approved_by_user_id = ?, approved_at = ?, published_at = ?
    WHERE id = ?
    `,
    [source.id, clean(actorUserId), stamp, stamp, current.id]
  );
  await queueKnowledgeJob(db, {
    knowledgeSourceId: source.id,
    jobType: 'index',
    requestedBy: actorUserId,
  });
  return {
    source,
    question: mapUnansweredQuestion((await queryById(db, 'intranet_chatbot_unanswered_questions', current.id)) as Row),
  };
};

export const getKnowledgeDashboardSummary = async (db: DbInterface): Promise<KnowledgeDashboardSummary> => {
  await ensureIntranetChatbotTables(db);
  const [sourceRows, unansweredRows, recentJobs] = await Promise.all([
    db.query(`SELECT status, COUNT(*) as total FROM intranet_knowledge_sources GROUP BY status`),
    db.query(`SELECT status, COUNT(*) as total FROM intranet_chatbot_unanswered_questions GROUP BY status`),
    listKnowledgeJobs(db, 10),
  ]);

  let sourcesTotal = 0;
  let indexedSources = 0;
  let pendingSources = 0;
  let failedSources = 0;

  for (const row of sourceRows as Row[]) {
    const total = Number(row.total || 0);
    sourcesTotal += total;
    const status = clean(row.status).toLowerCase();
    if (status === 'indexed') indexedSources += total;
    if (status === 'pending' || status === 'stale') pendingSources += total;
    if (status === 'failed') failedSources += total;
  }

  let unansweredPending = 0;
  for (const row of unansweredRows as Row[]) {
    if (clean(row.status) === 'pending') unansweredPending += Number(row.total || 0);
  }

  return {
    sourcesTotal,
    indexedSources,
    pendingSources,
    failedSources,
    unansweredPending,
    recentJobs,
  };
};

export const getKnowledgeSourceDownloadAsset = async (db: DbInterface, sourceId: string) => {
  const source = await getKnowledgeSourceById(db, sourceId);
  if (!source || source.sourceType !== 'asset_file') return null;
  const meta = source.metaJson || {};
  return {
    source,
    storageProvider: clean(meta.storageProvider),
    storageBucket: nullable(meta.storageBucket),
    storageKey: clean(meta.storageKey),
    mimeType: clean(meta.mimeType) || 'application/octet-stream',
  };
};
