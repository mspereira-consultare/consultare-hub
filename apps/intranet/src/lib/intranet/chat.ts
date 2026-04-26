import 'server-only';

import { randomUUID } from 'crypto';
import type { DbInterface } from '@consultare/core/db';
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
const CHAT_TABLES = [
  'intranet_chat_conversations',
  'intranet_chat_conversation_members',
  'intranet_chat_messages',
  'intranet_chat_message_attachments',
  'intranet_chat_moderation_log',
];

const clean = (value: unknown) => String(value ?? '').trim();
const nowIso = () => new Date().toISOString();
const bool = (value: unknown) => value === true || value === 1 || value === '1';
const toDbBool = (value: unknown) => (bool(value) ? 1 : 0);
const nullable = (value: unknown) => clean(value) || null;

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

const safeExecute = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: unknown) {
    const code = String((error as { code?: string })?.code || '');
    const message = String((error as { message?: string })?.message || '');
    if (
      code === 'ER_NO_SUCH_TABLE' ||
      /doesn't exist|no such table|Table .* doesn't exist/i.test(message) ||
      /syntax error|near "CONVERT"|near "CHARACTER"/i.test(message)
    ) {
      return;
    }
    throw error;
  }
};

const normalizeChatTableCollations = async (db: DbInterface) => {
  for (const table of CHAT_TABLES) {
    await safeExecute(db, `ALTER TABLE ${table} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  }
};

let chatTablesEnsured = false;

export const ensureChatTables = async (db: DbInterface) => {
  if (chatTablesEnsured) return;

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
  await normalizeChatTableCollations(db);
  await syncDepartmentChannels(db);
  chatTablesEnsured = true;
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
    const existing = await db.query(`SELECT id FROM intranet_chat_conversations WHERE slug = ? LIMIT 1`, [slug]);
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

    const currentMembers = await db.query(`SELECT user_id FROM intranet_chat_conversation_members WHERE conversation_id = ?`, [conversationId]);
    const currentIds = new Set((currentMembers as Row[]).map((row) => clean(row.user_id)).filter(Boolean));
    const activeIds = new Set(departmentUsers.map((user) => clean(user.id)).filter(Boolean));

    for (const user of departmentUsers) {
      const userId = clean(user.id);
      if (!userId || currentIds.has(userId)) continue;
      await addConversationMember(db, conversationId, userId, 'member');
    }

    for (const userId of currentIds) {
      if (activeIds.has(userId)) continue;
      await db.execute(`DELETE FROM intranet_chat_conversation_members WHERE conversation_id = ? AND user_id = ?`, [conversationId, userId]);
    }
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
  await ensureChatTables(db);
  const users = (await listActiveUsersRows(db) as Row[]).map(mapUser);
  return currentUserId ? users.filter((user) => user.id !== currentUserId) : users;
};

const getUserById = async (db: DbInterface, userId: string) => {
  const rows = await db.query(
    `SELECT id, name, email, role, department, status FROM users WHERE id = ? AND UPPER(COALESCE(status, 'ATIVO')) = 'ATIVO' LIMIT 1`,
    [userId]
  );
  return rows[0] ? mapUser(rows[0] as Row) : null;
};

const addConversationMember = async (db: DbInterface, conversationId: string, userId: string, roleRaw: unknown = 'member') => {
  const existing = await db.query(
    `SELECT id FROM intranet_chat_conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1`,
    [conversationId, userId]
  );
  const memberRole = pickMemberRole(roleRaw);
  if (existing.length) {
    await db.execute(
      `UPDATE intranet_chat_conversation_members SET member_role = ? WHERE conversation_id = ? AND user_id = ?`,
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
    INNER JOIN intranet_chat_conversations c ON c.id = m.conversation_id
    WHERE m.conversation_id = ? AND m.user_id = ? AND COALESCE(c.is_active, 1) = 1
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
    INNER JOIN users u ON u.id = m.user_id
    WHERE m.conversation_id = ?
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

const loadLastMessage = async (db: DbInterface, conversationId: string) => {
  const rows = await db.query(
    `
    SELECT m.*, u.name AS sender_name
    FROM intranet_chat_messages m
    LEFT JOIN users u ON u.id = m.sender_user_id
    WHERE m.conversation_id = ?
    ORDER BY m.created_at DESC
    LIMIT 1
    `,
    [conversationId]
  );
  return rows[0] ? mapMessageRow(rows[0] as Row, [], []) : null;
};

const unreadCountFor = async (db: DbInterface, conversationId: string, userId: string, lastReadAt: unknown) => {
  const readAt = clean(lastReadAt);
  const rows = await db.query(
    `
    SELECT COUNT(*) AS total
    FROM intranet_chat_messages
    WHERE conversation_id = ? AND sender_user_id <> ? AND COALESCE(is_deleted, 0) = 0
      AND (? = '' OR created_at > ?)
    `,
    [conversationId, userId, readAt, readAt]
  );
  return Number((rows[0] as Row | undefined)?.total || 0);
};

const mapConversationRow = async (db: DbInterface, row: Row, currentUserId: string) => {
  const id = clean(row.id);
  const members = await loadMembers(db, id);
  const currentMember = members.find((member) => member.userId === currentUserId);
  const lastMessage = await loadLastMessage(db, id);
  const unreadCount = await unreadCountFor(db, id, currentUserId, currentMember?.lastReadAt || '');
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
    lastMessage,
    unreadCount,
    updatedAt: clean(row.updated_at),
  };
};

export const listChatConversations = async (db: DbInterface, user: ChatUserContext) => {
  await ensureChatTables(db);
  const rows = await db.query(
    `
    SELECT c.*
    FROM intranet_chat_conversations c
    INNER JOIN intranet_chat_conversation_members m ON m.conversation_id = c.id
    WHERE m.user_id = ? AND COALESCE(c.is_active, 1) = 1
    ORDER BY c.updated_at DESC, c.name ASC
    `,
    [user.id]
  );
  return Promise.all((rows as Row[]).map((row) => mapConversationRow(db, row, user.id)));
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
    INNER JOIN intranet_chat_conversation_members a ON a.conversation_id = c.id AND a.user_id = ?
    INNER JOIN intranet_chat_conversation_members b ON b.conversation_id = c.id AND b.user_id = ?
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
    INNER JOIN intranet_assets a ON a.id = ma.asset_id
    WHERE ma.message_id IN (${placeholders})
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
  const where = ['m.conversation_id = ?'];
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
    LEFT JOIN users u ON u.id = m.sender_user_id
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
  await db.execute(`UPDATE intranet_chat_conversations SET updated_at = ? WHERE id = ?`, [now, conversationId]);
  await markConversationRead(db, user, conversationId, id);
  return (await listChatMessages(db, user, conversationId, { after: '', limit: 1 })).find((message) => message.id === id) || null;
};

export const markConversationRead = async (db: DbInterface, user: ChatUserContext, conversationId: string, messageIdRaw?: unknown) => {
  await ensureChatTables(db);
  await assertMember(db, conversationId, user.id);
  let messageId = clean(messageIdRaw);
  if (!messageId) {
    const rows = await db.query(`SELECT id FROM intranet_chat_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1`, [conversationId]);
    messageId = clean((rows[0] as Row | undefined)?.id);
  }
  await db.execute(
    `UPDATE intranet_chat_conversation_members SET last_read_message_id = ?, last_read_at = ? WHERE conversation_id = ? AND user_id = ?`,
    [messageId || null, nowIso(), conversationId, user.id]
  );
  return { conversationId, messageId: messageId || null };
};

const getMessageWithMembership = async (db: DbInterface, messageId: string, userId: string) => {
  const rows = await db.query(
    `
    SELECT m.*, cm.member_role
    FROM intranet_chat_messages m
    INNER JOIN intranet_chat_conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
    WHERE m.id = ?
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
  await db.execute(`UPDATE intranet_chat_messages SET body = ?, is_edited = 1, edited_at = ? WHERE id = ?`, [body, nowIso(), messageId]);
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
  await db.execute(`UPDATE intranet_chat_messages SET body = '', is_deleted = 1, deleted_at = ? WHERE id = ?`, [now, messageId]);
  await db.execute(
    `INSERT INTO intranet_chat_moderation_log (id, conversation_id, message_id, action, actor_user_id, payload_json, created_at) VALUES (?, ?, ?, 'delete_message', ?, ?, ?)`,
    [randomUUID(), clean(message.conversation_id), messageId, user.id, JSON.stringify({ ownMessage: isOwner }), now]
  );
  return { id: messageId };
};

export const listAdminChatConversations = async (db: DbInterface) => {
  await ensureChatTables(db);
  const rows = await db.query(`SELECT * FROM intranet_chat_conversations ORDER BY is_active DESC, updated_at DESC`);
  return Promise.all((rows as Row[]).map((row) => mapConversationRow(db, row, '')));
};

export const updateAdminChatConversation = async (db: DbInterface, conversationId: string, input: Row, actorUserId: string) => {
  await ensureChatTables(db);
  const current = await db.query(`SELECT * FROM intranet_chat_conversations WHERE id = ? LIMIT 1`, [conversationId]);
  if (!current.length) throw new ChatValidationError('Conversa não encontrada.', 404);
  const row = current[0] as Row;
  const now = nowIso();
  await db.execute(
    `
    UPDATE intranet_chat_conversations
    SET name = ?, description = ?, is_active = ?, is_announcement_only = ?, updated_at = ?
    WHERE id = ?
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
  await db.execute(`DELETE FROM intranet_chat_conversation_members WHERE conversation_id = ?`, [conversationId]);
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
