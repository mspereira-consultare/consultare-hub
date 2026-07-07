import 'server-only';

import { randomUUID } from 'crypto';
import type { DbInterface } from '@consultare/core/db';
import { createIntranetNotifications, markIntranetNotificationsReadByEntity, sendIntranetPushNotifications } from '@consultare/core/intranet/notifications';
import { hasPermission } from '@consultare/core/permissions';
import { loadUserPermissionMatrix } from '@consultare/core/permissions-server';

type Row = Record<string, unknown>;

export class ChatValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type ChatUserContext = {
  id: string;
  role: string;
  department: string;
};

const CONVERSATION_TYPES = new Set(['dm', 'department_channel', 'custom_group', 'announcement_channel']);
const MEMBER_ROLES = new Set(['owner', 'moderator', 'member']);
const MAX_MESSAGE_LENGTH = 4000;
const DEPARTMENT_CHANNEL_SYNC_TTL_MS = 5 * 60 * 1000;

const clean = (value: unknown) => String(value ?? '').trim();
const nowIso = () => new Date().toISOString();
const bool = (value: unknown) => value === true || value === 1 || value === '1';
const toDbBool = (value: unknown) => (bool(value) ? 1 : 0);
const nullable = (value: unknown) => clean(value) || null;
const chatCollate = (column: string) => `${column} COLLATE utf8mb4_unicode_ci`;

const normalizeSlug = (value: unknown) =>
  clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const pickConversationType = (value: unknown) => {
  const raw = clean(value).toLowerCase();
  return CONVERSATION_TYPES.has(raw) ? raw : 'custom_group';
};

const pickMemberRole = (value: unknown) => {
  const raw = clean(value).toLowerCase();
  return MEMBER_ROLES.has(raw) ? raw : 'member';
};

const parseStringList = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(clean).filter(Boolean)));
};

const limitValue = (value: unknown, fallback = 40, max = 100) => {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(parsed)));
};

const safeAddColumn = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: unknown) {
    const code = String((error as { code?: string })?.code || '');
    const message = String((error as { message?: string })?.message || '');
    if (code === 'ER_DUP_FIELDNAME' || /Duplicate column name|duplicate column/i.test(message)) return;
    throw error;
  }
};

const safeCreateIndex = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: unknown) {
    const code = String((error as { code?: string })?.code || '');
    const message = String((error as { message?: string })?.message || '');
    if (code === 'ER_DUP_KEYNAME' || /Duplicate key name|already exists|duplicate key/i.test(message)) return;
    throw error;
  }
};

const isMysql = () => {
  const provider = clean(process.env.DB_PROVIDER).toLowerCase();
  if (provider === 'mysql') return true;
  if (provider === 'turso') return false;
  return Boolean(process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL);
};

let chatTablesEnsured = false;
let chatTablesEnsurePromise: Promise<void> | null = null;
let lastDepartmentChannelsSyncAt = 0;
let departmentChannelsSyncPromise: Promise<void> | null = null;

export const ensureChatTables = async (db: DbInterface) => {
  if (chatTablesEnsured) return;
  if (chatTablesEnsurePromise) {
    await chatTablesEnsurePromise;
    return;
  }

  chatTablesEnsurePromise = (async () => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS intranet_chat_conversations (
        id VARCHAR(64) PRIMARY KEY,
        conversation_type VARCHAR(40) NOT NULL,
        name VARCHAR(180),
        slug VARCHAR(180),
        description TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_announcement_only INTEGER NOT NULL DEFAULT 0,
        created_by VARCHAR(64),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS intranet_chat_conversation_members (
        id VARCHAR(64) PRIMARY KEY,
        conversation_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        member_role VARCHAR(40) NOT NULL DEFAULT 'member',
        last_read_message_id VARCHAR(64),
        last_read_at TEXT,
        is_muted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS intranet_chat_messages (
        id VARCHAR(64) PRIMARY KEY,
        conversation_id VARCHAR(64) NOT NULL,
        sender_user_id VARCHAR(64) NOT NULL,
        body LONGTEXT,
        message_type VARCHAR(40) NOT NULL DEFAULT 'text',
        is_edited INTEGER NOT NULL DEFAULT 0,
        edited_at TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        created_at TEXT NOT NULL
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS intranet_chat_message_attachments (
        id VARCHAR(64) PRIMARY KEY,
        message_id VARCHAR(64) NOT NULL,
        asset_id VARCHAR(64) NOT NULL,
        uploaded_by VARCHAR(64),
        created_at TEXT NOT NULL
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS intranet_chat_moderation_log (
        id VARCHAR(64) PRIMARY KEY,
        conversation_id VARCHAR(64),
        message_id VARCHAR(64),
        action VARCHAR(80) NOT NULL,
        actor_user_id VARCHAR(64) NOT NULL,
        payload_json LONGTEXT,
        created_at TEXT NOT NULL
      )
    `);

    await safeAddColumn(db, `ALTER TABLE intranet_chat_messages ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0`);
    await safeCreateIndex(
      db,
      isMysql()
        ? `CREATE INDEX idx_intranet_chat_conversations_slug ON intranet_chat_conversations (slug)`
        : `CREATE INDEX idx_intranet_chat_conversations_slug ON intranet_chat_conversations (slug)`
    );
    await safeCreateIndex(
      db,
      `CREATE INDEX idx_intranet_chat_conversations_updated ON intranet_chat_conversations (${isMysql() ? 'updated_at(32)' : 'updated_at'})`
    );
    await safeCreateIndex(
      db,
      `CREATE INDEX idx_intranet_chat_members_conversation_user ON intranet_chat_conversation_members (conversation_id, user_id)`
    );
    await safeCreateIndex(
      db,
      `CREATE INDEX idx_intranet_chat_members_user_conversation ON intranet_chat_conversation_members (user_id, conversation_id)`
    );
    await safeCreateIndex(
      db,
      `CREATE INDEX idx_intranet_chat_messages_conversation_created ON intranet_chat_messages (conversation_id, ${isMysql() ? 'created_at(32)' : 'created_at'})`
    );
    await safeCreateIndex(
      db,
      `CREATE INDEX idx_intranet_chat_messages_conversation_sender_created ON intranet_chat_messages (conversation_id, sender_user_id, ${isMysql() ? 'created_at(32)' : 'created_at'})`
    );
    await safeCreateIndex(
      db,
      `CREATE INDEX idx_intranet_chat_attachments_message ON intranet_chat_message_attachments (message_id)`
    );
    chatTablesEnsured = true;
  })();

  try {
    await chatTablesEnsurePromise;
  } finally {
    chatTablesEnsurePromise = null;
  }
};

const listActiveUsersRows = async (db: DbInterface) =>
  db.query(
    `
    SELECT id, name, email, role, department, status
    FROM users
    WHERE UPPER(COALESCE(status, 'ATIVO')) = 'ATIVO'
    ORDER BY name ASC
    `
  );

const syncDepartmentChannels = async (db: DbInterface) => {
  const users = (await listActiveUsersRows(db)) as Row[];
  const byDepartment = new Map<string, Row[]>();
  for (const user of users) {
    const department = clean(user.department);
    if (!department) continue;
    byDepartment.set(department, [...(byDepartment.get(department) || []), user]);
  }

  for (const [department, departmentUsers] of byDepartment) {
    const slug = `setor-${normalizeSlug(department)}`;
    const existing = await db.query(`SELECT id FROM intranet_chat_conversations WHERE ${chatCollate('slug')} = ? LIMIT 1`, [slug]);
    const createdAt = nowIso();
    const conversationId = clean((existing[0] as Row | undefined)?.id) || randomUUID();
    if (!existing.length) {
      await db.execute(
        `
        INSERT INTO intranet_chat_conversations (
          id, conversation_type, name, slug, description, is_active, is_announcement_only, created_by, created_at, updated_at
        ) VALUES (?, 'department_channel', ?, ?, ?, 1, 0, 'system', ?, ?)
        `,
        [conversationId, department, slug, `Canal automático do setor ${department}.`, createdAt, createdAt]
      );
    }

    const currentMembers = await db.query(
      `SELECT user_id FROM intranet_chat_conversation_members WHERE ${chatCollate('conversation_id')} = ?`,
      [conversationId]
    );
    const currentIds = new Set((currentMembers as Row[]).map((row) => clean(row.user_id)).filter(Boolean));
    const activeIds = new Set(departmentUsers.map((user) => clean(user.id)).filter(Boolean));

    for (const user of departmentUsers) {
      const userId = clean(user.id);
      if (!userId || currentIds.has(userId)) continue;
      await addConversationMember(db, conversationId, userId, 'member');
    }

    for (const userId of currentIds) {
      if (activeIds.has(userId)) continue;
      await db.execute(
        `DELETE FROM intranet_chat_conversation_members WHERE ${chatCollate('conversation_id')} = ? AND ${chatCollate('user_id')} = ?`,
        [conversationId, userId]
      );
    }
  }
};

const ensureDepartmentChannelsFresh = async (db: DbInterface) => {
  const now = Date.now();
  if (now - lastDepartmentChannelsSyncAt < DEPARTMENT_CHANNEL_SYNC_TTL_MS) return;
  if (departmentChannelsSyncPromise) {
    await departmentChannelsSyncPromise;
    return;
  }
  departmentChannelsSyncPromise = (async () => {
    await syncDepartmentChannels(db);
    lastDepartmentChannelsSyncAt = Date.now();
  })();
  try {
    await departmentChannelsSyncPromise;
  } finally {
    departmentChannelsSyncPromise = null;
  }
};

const mapUser = (row: Row) => ({
  id: clean(row.id),
  name: clean(row.name) || clean(row.email),
  email: clean(row.email),
  role: clean(row.role),
  department: clean(row.department),
  status: clean(row.status) || 'ATIVO',
});

export const listChatUsers = async (db: DbInterface, currentUserId?: string) => {
  const users = (await listActiveUsersRows(db) as Row[]).map(mapUser);
  return currentUserId ? users.filter((user) => user.id !== currentUserId) : users;
};

const getUserById = async (db: DbInterface, userId: string) => {
  const rows = await db.query(
    `SELECT id, name, email, role, department, status FROM users WHERE ${chatCollate('id')} = ? AND UPPER(COALESCE(status, 'ATIVO')) = 'ATIVO' LIMIT 1`,
    [userId]
  );
  return rows[0] ? mapUser(rows[0] as Row) : null;
};

const addConversationMember = async (db: DbInterface, conversationId: string, userId: string, roleRaw: unknown = 'member') => {
  const existing = await db.query(
    `SELECT id FROM intranet_chat_conversation_members WHERE ${chatCollate('conversation_id')} = ? AND ${chatCollate('user_id')} = ? LIMIT 1`,
    [conversationId, userId]
  );
  const memberRole = pickMemberRole(roleRaw);
  if (existing.length) {
    await db.execute(
      `UPDATE intranet_chat_conversation_members SET member_role = ? WHERE ${chatCollate('conversation_id')} = ? AND ${chatCollate('user_id')} = ?`,
      [memberRole, conversationId, userId]
    );
    return;
  }
  await db.execute(
    `
    INSERT INTO intranet_chat_conversation_members (
      id, conversation_id, user_id, member_role, last_read_message_id, last_read_at, is_muted, created_at
    ) VALUES (?, ?, ?, ?, NULL, NULL, 0, ?)
    `,
    [randomUUID(), conversationId, userId, memberRole, nowIso()]
  );
};

const getMembership = async (db: DbInterface, conversationId: string, userId: string) => {
  const rows = await db.query(
    `
    SELECT m.*, c.conversation_type, c.name, c.is_active, c.is_announcement_only
    FROM intranet_chat_conversation_members m
    INNER JOIN intranet_chat_conversations c ON ${chatCollate('c.id')} = ${chatCollate('m.conversation_id')}
    WHERE ${chatCollate('m.conversation_id')} = ? AND ${chatCollate('m.user_id')} = ? AND COALESCE(c.is_active, 1) = 1
    LIMIT 1
    `,
    [conversationId, userId]
  );
  return rows[0] as Row | undefined;
};

const assertMember = async (db: DbInterface, conversationId: string, userId: string) => {
  const membership = await getMembership(db, conversationId, userId);
  if (!membership) throw new ChatValidationError('Conversa não encontrada ou sem acesso.', 404);
  return membership;
};

const loadMembers = async (db: DbInterface, conversationId: string) => {
  const rows = await db.query(
    `
    SELECT m.user_id, m.member_role, m.last_read_message_id, m.last_read_at, u.name, u.email, u.role, u.department
    FROM intranet_chat_conversation_members m
    INNER JOIN users u ON ${chatCollate('u.id')} = ${chatCollate('m.user_id')}
    WHERE ${chatCollate('m.conversation_id')} = ?
    ORDER BY CASE m.member_role WHEN 'owner' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END, u.name ASC
    `,
    [conversationId]
  );
  return (rows as Row[]).map((row) => ({
    userId: clean(row.user_id),
    name: clean(row.name) || clean(row.email),
    email: clean(row.email),
    role: clean(row.member_role),
    userRole: clean(row.role),
    department: clean(row.department),
    lastReadMessageId: clean(row.last_read_message_id) || null,
    lastReadAt: clean(row.last_read_at) || null,
  }));
};

const loadMembersByConversationIds = async (db: DbInterface, conversationIds: string[]) => {
  if (!conversationIds.length) return new Map<string, Awaited<ReturnType<typeof loadMembers>>>();
  const placeholders = conversationIds.map(() => '?').join(',');
  const rows = await db.query(
    `
    SELECT m.conversation_id, m.user_id, m.member_role, m.last_read_message_id, m.last_read_at, u.name, u.email, u.role, u.department
    FROM intranet_chat_conversation_members m
    INNER JOIN users u ON ${chatCollate('u.id')} = ${chatCollate('m.user_id')}
    WHERE ${chatCollate('m.conversation_id')} IN (${placeholders})
    ORDER BY CASE m.member_role WHEN 'owner' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END, u.name ASC
    `,
    conversationIds
  );
  const byConversation = new Map<string, Awaited<ReturnType<typeof loadMembers>>>();
  const seenKeys = new Set<string>();
  for (const row of rows as Row[]) {
    const conversationId = clean(row.conversation_id);
    const userId = clean(row.user_id);
    const dedupeKey = `${conversationId}:${userId}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);
    byConversation.set(conversationId, [
      ...(byConversation.get(conversationId) || []),
      {
        userId,
        name: clean(row.name) || clean(row.email),
        email: clean(row.email),
        role: clean(row.member_role),
        userRole: clean(row.role),
        department: clean(row.department),
        lastReadMessageId: clean(row.last_read_message_id) || null,
        lastReadAt: clean(row.last_read_at) || null,
      },
    ]);
  }
  return byConversation;
};

const loadLastMessagesByConversationIds = async (db: DbInterface, conversationIds: string[]) => {
  if (!conversationIds.length) return new Map<string, ReturnType<typeof mapMessageRow>>();
  const placeholders = conversationIds.map(() => '?').join(',');
  const rows = await db.query(
    `
    SELECT m.*, u.name AS sender_name
    FROM intranet_chat_messages m
    INNER JOIN (
      SELECT conversation_id, MAX(created_at) AS latest_created_at
      FROM intranet_chat_messages
      WHERE ${chatCollate('conversation_id')} IN (${placeholders})
      GROUP BY conversation_id
    ) latest
      ON ${chatCollate('latest.conversation_id')} = ${chatCollate('m.conversation_id')}
      AND latest.latest_created_at = m.created_at
    LEFT JOIN users u ON ${chatCollate('u.id')} = ${chatCollate('m.sender_user_id')}
    ORDER BY m.created_at DESC
    `,
    conversationIds
  );
  const byConversation = new Map<string, ReturnType<typeof mapMessageRow>>();
  for (const row of rows as Row[]) {
    const conversationId = clean(row.conversation_id);
    if (byConversation.has(conversationId)) continue;
    byConversation.set(conversationId, mapMessageRow(row, [], []));
  }
  return byConversation;
};

const loadUnreadCountsByConversationIds = async (db: DbInterface, conversationIds: string[], userId: string) => {
  if (!conversationIds.length || !userId) return new Map<string, number>();
  const placeholders = conversationIds.map(() => '?').join(',');
  const rows = await db.query(
    `
    SELECT cm.conversation_id, COUNT(m.id) AS total
    FROM intranet_chat_conversation_members cm
    LEFT JOIN intranet_chat_messages m
      ON ${chatCollate('m.conversation_id')} = ${chatCollate('cm.conversation_id')}
      AND ${chatCollate('m.sender_user_id')} <> ${chatCollate('cm.user_id')}
      AND COALESCE(m.is_deleted, 0) = 0
      AND (COALESCE(cm.last_read_at, '') = '' OR m.created_at > cm.last_read_at)
    WHERE ${chatCollate('cm.user_id')} = ? AND ${chatCollate('cm.conversation_id')} IN (${placeholders})
    GROUP BY cm.conversation_id
    `,
    [userId, ...conversationIds]
  );
  const counts = new Map<string, number>();
  for (const row of rows as Row[]) {
    counts.set(clean(row.conversation_id), Number(row.total || 0));
  }
  return counts;
};

const mapConversationRows = async (db: DbInterface, rows: Row[], currentUserId: string) => {
  if (!rows.length) return [];
  const conversationIds = rows.map((row) => clean(row.id)).filter(Boolean);
  const [membersByConversation, lastMessagesByConversation, unreadCountsByConversation] = await Promise.all([
    loadMembersByConversationIds(db, conversationIds),
    loadLastMessagesByConversationIds(db, conversationIds),
    currentUserId ? loadUnreadCountsByConversationIds(db, conversationIds, currentUserId) : Promise.resolve(new Map<string, number>()),
  ]);

  return rows.map((row) => {
    const id = clean(row.id);
    const members = membersByConversation.get(id) || [];
    const currentMember = members.find((member) => member.userId === currentUserId);
    const type = clean(row.conversation_type);
    const dmOther = type === 'dm' ? members.find((member) => member.userId !== currentUserId) : null;
    return {
      id,
      conversationType: type,
      name: type === 'dm' ? dmOther?.name || 'Conversa privada' : clean(row.name) || 'Conversa',
      slug: clean(row.slug) || null,
      description: clean(row.description) || null,
      isActive: bool(row.is_active),
      isAnnouncementOnly: bool(row.is_announcement_only),
      currentMemberRole: currentMember?.role || 'member',
      memberCount: members.length,
      members,
      lastMessage: lastMessagesByConversation.get(id) || null,
      unreadCount: unreadCountsByConversation.get(id) || 0,
      updatedAt: clean(row.updated_at),
    };
  });
};

export const listChatConversations = async (db: DbInterface, user: ChatUserContext) => {
  await ensureChatTables(db);
  void ensureDepartmentChannelsFresh(db).catch((error) => {
    console.error('Erro ao sincronizar canais de setor do chat:', error);
  });
  const rows = await db.query(
    `
    SELECT DISTINCT c.*
    FROM intranet_chat_conversations c
    INNER JOIN intranet_chat_conversation_members m ON ${chatCollate('m.conversation_id')} = ${chatCollate('c.id')}
    WHERE ${chatCollate('m.user_id')} = ? AND COALESCE(c.is_active, 1) = 1
    ORDER BY c.updated_at DESC, c.name ASC
    `,
    [user.id]
  );
  return mapConversationRows(db, rows as Row[], user.id);
};

export const getChatUnreadCount = async (db: DbInterface, user: ChatUserContext) => {
  const conversations = await listChatConversations(db, user);
  return conversations.reduce((sum, item) => sum + Number(item.unreadCount || 0), 0);
};

export const getChatCapabilities = async (db: DbInterface, user: ChatUserContext) => {
  const permissions = await loadUserPermissionMatrix(db, user.id, user.role);
  return {
    canCreateGroups: hasPermission(permissions, 'intranet_chat', 'edit', user.role),
    canManageChat: hasPermission(permissions, 'intranet_chat', 'edit', user.role),
  };
};

export const createDmConversation = async (db: DbInterface, currentUserId: string, otherUserIdRaw: unknown) => {
  await ensureChatTables(db);
  const otherUserId = clean(otherUserIdRaw);
  if (!otherUserId || otherUserId === currentUserId) throw new ChatValidationError('Selecione outro usuário para iniciar a conversa.');
  const otherUser = await getUserById(db, otherUserId);
  if (!otherUser) throw new ChatValidationError('Usuário não encontrado ou inativo.', 404);

  const existing = await db.query(
    `
    SELECT c.id
    FROM intranet_chat_conversations c
    INNER JOIN intranet_chat_conversation_members a ON ${chatCollate('a.conversation_id')} = ${chatCollate('c.id')} AND ${chatCollate('a.user_id')} = ?
    INNER JOIN intranet_chat_conversation_members b ON ${chatCollate('b.conversation_id')} = ${chatCollate('c.id')} AND ${chatCollate('b.user_id')} = ?
    WHERE c.conversation_type = 'dm'
    LIMIT 1
    `,
    [currentUserId, otherUserId]
  );
  const existingId = clean((existing[0] as Row | undefined)?.id);
  if (existingId) return (await listChatConversations(db, { id: currentUserId, role: '', department: '' })).find((item) => item.id === existingId) || null;

  const now = nowIso();
  const id = randomUUID();
  await db.execute(
    `
    INSERT INTO intranet_chat_conversations (
      id, conversation_type, name, slug, description, is_active, is_announcement_only, created_by, created_at, updated_at
    ) VALUES (?, 'dm', NULL, NULL, NULL, 1, 0, ?, ?, ?)
    `,
    [id, currentUserId, now, now]
  );
  await addConversationMember(db, id, currentUserId, 'member');
  await addConversationMember(db, id, otherUserId, 'member');
  return (await listChatConversations(db, { id: currentUserId, role: '', department: '' })).find((item) => item.id === id) || null;
};

export const createChatGroupConversation = async (db: DbInterface, input: Row, actorUserId: string) => {
  await ensureChatTables(db);
  const name = clean(input.name);
  if (!name) throw new ChatValidationError('Nome do grupo é obrigatório.');
  const conversationType = pickConversationType(input.conversationType || input.conversation_type || 'custom_group');
  if (!['custom_group', 'announcement_channel'].includes(conversationType)) {
    throw new ChatValidationError('Tipo de grupo inválido.');
  }
  const memberIds = parseStringList(input.memberIds || input.member_ids).filter((id) => id !== actorUserId);
  const now = nowIso();
  const id = randomUUID();
  await db.execute(
    `
    INSERT INTO intranet_chat_conversations (
      id, conversation_type, name, slug, description, is_active, is_announcement_only, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `,
    [
      id,
      conversationType,
      name,
      normalizeSlug(`${name}-${id.slice(0, 8)}`),
      nullable(input.description),
      conversationType === 'announcement_channel' || input.isAnnouncementOnly ? 1 : 0,
      actorUserId,
      now,
      now,
    ]
  );
  await addConversationMember(db, id, actorUserId, 'owner');
  for (const userId of memberIds) {
    if (await getUserById(db, userId)) await addConversationMember(db, id, userId, 'member');
  }
  return id;
};

const loadAttachments = async (db: DbInterface, messageIds: string[]) => {
  if (!messageIds.length) return new Map<string, ReturnType<typeof mapAttachmentRow>[]>();
  const placeholders = messageIds.map(() => '?').join(',');
  const rows = await db.query(
    `
    SELECT ma.message_id, a.id AS asset_id, a.original_name, a.mime_type, a.size_bytes
    FROM intranet_chat_message_attachments ma
    INNER JOIN intranet_assets a ON ${chatCollate('a.id')} = ${chatCollate('ma.asset_id')}
    WHERE ${chatCollate('ma.message_id')} IN (${placeholders})
    ORDER BY ma.created_at ASC
    `,
    messageIds
  );
  const byMessage = new Map<string, ReturnType<typeof mapAttachmentRow>[]>();
  for (const row of rows as Row[]) {
    const messageId = clean(row.message_id);
    byMessage.set(messageId, [...(byMessage.get(messageId) || []), mapAttachmentRow(row)]);
  }
  return byMessage;
};

const mapAttachmentRow = (row: Row) => ({
  assetId: clean(row.asset_id),
  originalName: clean(row.original_name),
  mimeType: clean(row.mime_type) || 'application/octet-stream',
  sizeBytes: Number(row.size_bytes || 0),
  downloadUrl: `/api/intranet/assets/${encodeURIComponent(clean(row.asset_id))}/download`,
  isImage: clean(row.mime_type).startsWith('image/'),
});

const mapMessageRow = (row: Row, attachments: ReturnType<typeof mapAttachmentRow>[], readBy: Array<{ userId: string; name: string }>) => ({
  id: clean(row.id),
  conversationId: clean(row.conversation_id),
  senderUserId: clean(row.sender_user_id),
  senderName: clean(row.sender_name) || 'Usuário',
  body: clean(row.body),
  messageType: clean(row.message_type) || 'text',
  isEdited: bool(row.is_edited),
  editedAt: clean(row.edited_at) || null,
  isDeleted: bool(row.is_deleted),
  deletedAt: clean(row.deleted_at) || null,
  createdAt: clean(row.created_at),
  attachments,
  readBy,
});

export const listChatMessages = async (
  db: DbInterface,
  user: ChatUserContext,
  conversationId: string,
  options: { before?: string; after?: string; limit?: unknown } = {}
) => {
  await ensureChatTables(db);
  await assertMember(db, conversationId, user.id);
  const limit = limitValue(options.limit, 40, 100);
  const params: unknown[] = [conversationId];
  const where = [`${chatCollate('m.conversation_id')} = ?`];
  const after = clean(options.after);
  const before = clean(options.before);
  let order = 'm.created_at DESC';
  if (after) {
    where.push('m.created_at > ?');
    params.push(after);
    order = 'm.created_at ASC';
  } else if (before) {
    where.push('m.created_at < ?');
    params.push(before);
  }

  const rows = await db.query(
    `
    SELECT m.*, u.name AS sender_name
    FROM intranet_chat_messages m
    LEFT JOIN users u ON ${chatCollate('u.id')} = ${chatCollate('m.sender_user_id')}
    WHERE ${where.join(' AND ')}
    ORDER BY ${order}
    LIMIT ${limit}
    `,
    params
  );
  const orderedRows = after ? rows as Row[] : [...(rows as Row[])].reverse();
  const messageIds = orderedRows.map((row) => clean(row.id));
  const attachments = await loadAttachments(db, messageIds);
  const members = await loadMembers(db, conversationId);
  return orderedRows.map((row) => {
    const createdAt = clean(row.created_at);
    const readBy = members
      .filter((member) => member.lastReadAt && member.lastReadAt >= createdAt)
      .map((member) => ({ userId: member.userId, name: member.name }));
    return mapMessageRow(row, attachments.get(clean(row.id)) || [], readBy);
  });
};

export const sendChatMessage = async (db: DbInterface, user: ChatUserContext, conversationId: string, input: Row) => {
  await ensureChatTables(db);
  const membership = await assertMember(db, conversationId, user.id);
  if (bool(membership.is_announcement_only) && !['owner', 'moderator'].includes(clean(membership.member_role))) {
    throw new ChatValidationError('Apenas moderadores podem enviar neste canal.', 403);
  }
  const body = clean(input.body);
  const attachmentIds = parseStringList(input.attachmentIds || input.attachment_ids);
  if (!body && !attachmentIds.length) throw new ChatValidationError('Digite uma mensagem ou anexe um arquivo.');
  if (body.length > MAX_MESSAGE_LENGTH) throw new ChatValidationError('Mensagem acima do limite de caracteres.');
  const id = randomUUID();
  const now = nowIso();
  await db.execute(
    `
    INSERT INTO intranet_chat_messages (
      id, conversation_id, sender_user_id, body, message_type, is_edited, edited_at, is_deleted, deleted_at, created_at
    ) VALUES (?, ?, ?, ?, 'text', 0, NULL, 0, NULL, ?)
    `,
    [id, conversationId, user.id, body, now]
  );
  for (const assetId of attachmentIds) {
    await db.execute(
      `INSERT INTO intranet_chat_message_attachments (id, message_id, asset_id, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?)`,
      [randomUUID(), id, assetId, user.id, now]
    );
  }
  await db.execute(`UPDATE intranet_chat_conversations SET updated_at = ? WHERE ${chatCollate('id')} = ?`, [now, conversationId]);
  const members = await loadMembers(db, conversationId);
  const conversationRows = await db.query(
    `SELECT name, conversation_type FROM intranet_chat_conversations WHERE ${chatCollate('id')} = ? LIMIT 1`,
    [conversationId]
  );
  const conversationRow = conversationRows[0] as Row | undefined;
  const conversationType = clean(conversationRow?.conversation_type);
  const senderName = members.find((member) => member.userId === user.id)?.name || 'um colaborador';
  const conversationName =
    conversationType === 'dm'
      ? members.find((member) => member.userId !== user.id)?.name || 'Conversa privada'
      : clean(conversationRow?.name) || 'Conversa';

  try {
    const createdNotifications = await createIntranetNotifications(
      db,
      members
        .filter((member) => member.userId !== user.id)
        .map((member) => ({
          userId: member.userId,
          channel: 'chat',
          eventType: 'chat_message_received',
          title: conversationType === 'dm' ? `Nova mensagem de ${senderName}` : `Nova mensagem em ${conversationName}`,
          body: clean(input.body) || 'Nova mensagem com anexo.',
          href: `/chat?conversation=${encodeURIComponent(conversationId)}`,
          entityType: 'chat_conversation',
          entityId: conversationId,
          sourceUserId: user.id,
          dedupeKey: `chat-message:${id}:${member.userId}`,
        }))
    );
    if (createdNotifications.length) {
      await sendIntranetPushNotifications(
        db,
        createdNotifications.filter((item) => item.eventType === 'chat_message_received')
      );
    }
  } catch (error) {
    console.error('Erro ao criar notificações do chat:', error);
  }
  await markConversationRead(db, user, conversationId, id);
  return (await listChatMessages(db, user, conversationId, { after: '', limit: 1 })).find((message) => message.id === id) || null;
};

export const markConversationRead = async (db: DbInterface, user: ChatUserContext, conversationId: string, messageIdRaw?: unknown) => {
  await ensureChatTables(db);
  await assertMember(db, conversationId, user.id);
  let messageId = clean(messageIdRaw);
  if (!messageId) {
    const rows = await db.query(
      `SELECT id FROM intranet_chat_messages WHERE ${chatCollate('conversation_id')} = ? ORDER BY created_at DESC LIMIT 1`,
      [conversationId]
    );
    messageId = clean((rows[0] as Row | undefined)?.id);
  }
  await db.execute(
    `UPDATE intranet_chat_conversation_members SET last_read_message_id = ?, last_read_at = ? WHERE ${chatCollate('conversation_id')} = ? AND ${chatCollate('user_id')} = ?`,
    [messageId || null, nowIso(), conversationId, user.id]
  );
  try {
    await markIntranetNotificationsReadByEntity(db, user.id, 'chat', 'chat_conversation', conversationId);
  } catch (error) {
    console.error('Erro ao marcar notificações do chat como lidas:', error);
  }
  return { conversationId, messageId: messageId || null };
};

const getMessageWithMembership = async (db: DbInterface, messageId: string, userId: string) => {
  const rows = await db.query(
    `
    SELECT m.*, cm.member_role
    FROM intranet_chat_messages m
    INNER JOIN intranet_chat_conversation_members cm ON ${chatCollate('cm.conversation_id')} = ${chatCollate('m.conversation_id')} AND ${chatCollate('cm.user_id')} = ?
    WHERE ${chatCollate('m.id')} = ?
    LIMIT 1
    `,
    [userId, messageId]
  );
  return rows[0] as Row | undefined;
};

export const updateChatMessage = async (db: DbInterface, user: ChatUserContext, messageIdRaw: unknown, input: Row) => {
  await ensureChatTables(db);
  const messageId = clean(messageIdRaw);
  const message = await getMessageWithMembership(db, messageId, user.id);
  if (!message) throw new ChatValidationError('Mensagem não encontrada.', 404);
  if (clean(message.sender_user_id) !== user.id) throw new ChatValidationError('Você só pode editar suas próprias mensagens.', 403);
  if (bool(message.is_deleted)) throw new ChatValidationError('Mensagem apagada não pode ser editada.');
  const body = clean(input.body);
  if (!body) throw new ChatValidationError('Mensagem não pode ficar vazia.');
  if (body.length > MAX_MESSAGE_LENGTH) throw new ChatValidationError('Mensagem acima do limite de caracteres.');
  await db.execute(`UPDATE intranet_chat_messages SET body = ?, is_edited = 1, edited_at = ? WHERE ${chatCollate('id')} = ?`, [body, nowIso(), messageId]);
  return { id: messageId };
};

export const deleteChatMessage = async (db: DbInterface, user: ChatUserContext, messageIdRaw: unknown) => {
  await ensureChatTables(db);
  const messageId = clean(messageIdRaw);
  const message = await getMessageWithMembership(db, messageId, user.id);
  if (!message) throw new ChatValidationError('Mensagem não encontrada.', 404);
  const isOwner = clean(message.sender_user_id) === user.id;
  const isModerator = ['owner', 'moderator'].includes(clean(message.member_role));
  if (!isOwner && !isModerator) throw new ChatValidationError('Sem permissão para apagar esta mensagem.', 403);
  const now = nowIso();
  await db.execute(`UPDATE intranet_chat_messages SET body = '', is_deleted = 1, deleted_at = ? WHERE ${chatCollate('id')} = ?`, [now, messageId]);
  await db.execute(
    `INSERT INTO intranet_chat_moderation_log (id, conversation_id, message_id, action, actor_user_id, payload_json, created_at) VALUES (?, ?, ?, 'delete_message', ?, ?, ?)`,
    [randomUUID(), clean(message.conversation_id), messageId, user.id, JSON.stringify({ ownMessage: isOwner }), now]
  );
  return { id: messageId };
};

export const listAdminChatConversations = async (db: DbInterface) => {
  await ensureChatTables(db);
  await ensureDepartmentChannelsFresh(db);
  const rows = await db.query(`SELECT * FROM intranet_chat_conversations ORDER BY is_active DESC, updated_at DESC`);
  return mapConversationRows(db, rows as Row[], '');
};

export const updateAdminChatConversation = async (db: DbInterface, conversationId: string, input: Row, actorUserId: string) => {
  await ensureChatTables(db);
  const current = await db.query(`SELECT * FROM intranet_chat_conversations WHERE ${chatCollate('id')} = ? LIMIT 1`, [conversationId]);
  if (!current.length) throw new ChatValidationError('Conversa não encontrada.', 404);
  const row = current[0] as Row;
  const now = nowIso();
  await db.execute(
    `
    UPDATE intranet_chat_conversations
    SET name = ?, description = ?, is_active = ?, is_announcement_only = ?, updated_at = ?
    WHERE ${chatCollate('id')} = ?
    `,
    [
      input.name === undefined ? nullable(row.name) : nullable(input.name),
      input.description === undefined ? nullable(row.description) : nullable(input.description),
      input.isActive === undefined ? toDbBool(row.is_active) : toDbBool(input.isActive),
      input.isAnnouncementOnly === undefined ? toDbBool(row.is_announcement_only) : toDbBool(input.isAnnouncementOnly),
      now,
      conversationId,
    ]
  );
  await db.execute(
    `INSERT INTO intranet_chat_moderation_log (id, conversation_id, message_id, action, actor_user_id, payload_json, created_at) VALUES (?, ?, NULL, 'update_conversation', ?, ?, ?)`,
    [randomUUID(), conversationId, actorUserId, JSON.stringify(input), now]
  );
  return { id: conversationId };
};

export const replaceAdminConversationMembers = async (db: DbInterface, conversationId: string, input: Row, actorUserId: string) => {
  await ensureChatTables(db);
  const memberIds = parseStringList(input.memberIds || input.member_ids);
  const ownerIds = parseStringList(input.ownerIds || input.owner_ids);
  const moderatorIds = parseStringList(input.moderatorIds || input.moderator_ids);
  const finalIds = Array.from(new Set([...memberIds, ...ownerIds, ...moderatorIds]));
  await db.execute(`DELETE FROM intranet_chat_conversation_members WHERE ${chatCollate('conversation_id')} = ?`, [conversationId]);
  for (const userId of finalIds) {
    if (!(await getUserById(db, userId))) continue;
    const role = ownerIds.includes(userId) ? 'owner' : moderatorIds.includes(userId) ? 'moderator' : 'member';
    await addConversationMember(db, conversationId, userId, role);
  }
  await db.execute(
    `INSERT INTO intranet_chat_moderation_log (id, conversation_id, message_id, action, actor_user_id, payload_json, created_at) VALUES (?, ?, NULL, 'replace_members', ?, ?, ?)`,
    [randomUUID(), conversationId, actorUserId, JSON.stringify({ count: finalIds.length }), nowIso()]
  );
  return { id: conversationId };
};
