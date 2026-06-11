import { randomUUID } from 'crypto';
import type { DbInterface } from '../db';

type Row = Record<string, unknown>;

export type IntranetNotificationChannel = 'chat' | 'task';

export type IntranetNotificationEventType =
  | 'chat_message_received'
  | 'task_assigned_primary'
  | 'task_assigned_collaborator'
  | 'task_comment_added'
  | 'task_approval_requested'
  | 'task_approval_decided'
  | 'task_status_changed'
  | 'task_due_date_changed'
  | 'task_archived'
  | 'task_canceled'
  | 'task_restored';

export type IntranetNotification = {
  id: string;
  userId: string;
  channel: IntranetNotificationChannel;
  eventType: IntranetNotificationEventType;
  title: string;
  body: string;
  href: string;
  entityType: string;
  entityId: string;
  sourceUserId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  dedupeKey: string;
};

export type IntranetNotificationSummary = {
  unreadCount: number;
  unreadByChannel: Record<IntranetNotificationChannel, number>;
  latestCreatedAt: string | null;
  items: IntranetNotification[];
};

export type IntranetNotificationCreateInput = {
  userId: string;
  channel: IntranetNotificationChannel;
  eventType: IntranetNotificationEventType;
  title: string;
  body: string;
  href: string;
  entityType: string;
  entityId: string;
  sourceUserId?: string | null;
  dedupeKey: string;
};

type NotificationListOptions = {
  limit?: number;
  unreadOnly?: boolean;
};

const clean = (value: unknown) => String(value ?? '').trim();
const nullable = (value: unknown) => clean(value) || null;
const nowIso = () => new Date().toISOString();
const isMysql = () => {
  const provider = clean(process.env.DB_PROVIDER).toLowerCase();
  if (provider === 'mysql') return true;
  if (provider === 'turso') return false;
  return Boolean(process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL);
};
const MAX_LIMIT = 50;

const safeAddColumn = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: unknown) {
    const code = String((error as { code?: string })?.code || '');
    const message = String((error as { message?: string })?.message || '');
    if (code === 'ER_DUP_FIELDNAME' || /duplicate column/i.test(message)) return;
    throw error;
  }
};

const safeCreateIndex = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: unknown) {
    const code = String((error as { code?: string })?.code || '');
    const message = String((error as { message?: string })?.message || '');
    if (code === 'ER_DUP_KEYNAME' || /duplicate key name|already exists/i.test(message)) return;
    throw error;
  }
};

const mapNotification = (row: Row): IntranetNotification => ({
  id: clean(row.id),
  userId: clean(row.user_id),
  channel: (clean(row.channel) || 'task') as IntranetNotificationChannel,
  eventType: (clean(row.event_type) || 'task_status_changed') as IntranetNotificationEventType,
  title: clean(row.title),
  body: clean(row.body),
  href: clean(row.href),
  entityType: clean(row.entity_type),
  entityId: clean(row.entity_id),
  sourceUserId: nullable(row.source_user_id),
  isRead: row.is_read === true || row.is_read === 1 || row.is_read === '1',
  readAt: nullable(row.read_at),
  createdAt: clean(row.created_at),
  dedupeKey: clean(row.dedupe_key),
});

let notificationsEnsured = false;

export const ensureIntranetNotificationTables = async (db: DbInterface) => {
  if (notificationsEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_notifications (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      channel VARCHAR(24) NOT NULL,
      event_type VARCHAR(80) NOT NULL,
      title VARCHAR(220) NOT NULL,
      body TEXT NOT NULL,
      href VARCHAR(500) NOT NULL,
      entity_type VARCHAR(80) NOT NULL,
      entity_id VARCHAR(64) NOT NULL,
      source_user_id VARCHAR(64) NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      read_at TEXT NULL,
      created_at TEXT NOT NULL,
      dedupe_key VARCHAR(255) NOT NULL
    )
  `);

  await safeAddColumn(db, `ALTER TABLE intranet_notifications ADD COLUMN source_user_id VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE intranet_notifications ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0`);
  await safeAddColumn(db, `ALTER TABLE intranet_notifications ADD COLUMN read_at TEXT NULL`);
  await safeAddColumn(db, `ALTER TABLE intranet_notifications ADD COLUMN dedupe_key VARCHAR(255) NOT NULL`);

  await safeCreateIndex(
    db,
    isMysql()
      ? `CREATE UNIQUE INDEX idx_intranet_notifications_dedupe ON intranet_notifications (user_id, dedupe_key(191))`
      : `CREATE UNIQUE INDEX idx_intranet_notifications_dedupe ON intranet_notifications (user_id, dedupe_key)`
  );
  await safeCreateIndex(db, `CREATE INDEX idx_intranet_notifications_user_read ON intranet_notifications (user_id, is_read)`);
  await safeCreateIndex(
    db,
    `CREATE INDEX idx_intranet_notifications_user_created ON intranet_notifications (user_id, ${isMysql() ? 'created_at(32)' : 'created_at'})`
  );
  await safeCreateIndex(db, `CREATE INDEX idx_intranet_notifications_entity ON intranet_notifications (user_id, channel, entity_type, entity_id)`);

  notificationsEnsured = true;
};

export const createIntranetNotification = async (db: DbInterface, input: IntranetNotificationCreateInput) => {
  await ensureIntranetNotificationTables(db);

  const userId = clean(input.userId);
  const dedupeKey = clean(input.dedupeKey);
  if (!userId || !dedupeKey) return null;

  const existing = await db.query(
    `SELECT * FROM intranet_notifications WHERE user_id = ? AND dedupe_key = ? LIMIT 1`,
    [userId, dedupeKey]
  );
  if (existing[0]) return mapNotification(existing[0] as Row);

  const item: IntranetNotification = {
    id: randomUUID(),
    userId,
    channel: input.channel,
    eventType: input.eventType,
    title: clean(input.title),
    body: clean(input.body),
    href: clean(input.href),
    entityType: clean(input.entityType),
    entityId: clean(input.entityId),
    sourceUserId: nullable(input.sourceUserId),
    isRead: false,
    readAt: null,
    createdAt: nowIso(),
    dedupeKey,
  };

  await db.execute(
    `
    INSERT INTO intranet_notifications (
      id, user_id, channel, event_type, title, body, href, entity_type, entity_id,
      source_user_id, is_read, read_at, created_at, dedupe_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      item.id,
      item.userId,
      item.channel,
      item.eventType,
      item.title,
      item.body,
      item.href,
      item.entityType,
      item.entityId,
      item.sourceUserId,
      0,
      null,
      item.createdAt,
      item.dedupeKey,
    ]
  );

  return item;
};

export const createIntranetNotifications = async (db: DbInterface, items: IntranetNotificationCreateInput[]) => {
  const created: IntranetNotification[] = [];
  for (const item of items) {
    const next = await createIntranetNotification(db, item);
    if (next) created.push(next);
  }
  return created;
};

export const listIntranetNotifications = async (
  db: DbInterface,
  userIdRaw: unknown,
  options: NotificationListOptions = {}
) => {
  await ensureIntranetNotificationTables(db);
  const userId = clean(userIdRaw);
  if (!userId) return [];

  const limit = Math.max(1, Math.min(MAX_LIMIT, Number(options.limit || 12)));
  const unreadClause = options.unreadOnly ? `AND COALESCE(is_read, 0) = 0` : '';
  const rows = await db.query(
    `
    SELECT *
    FROM intranet_notifications
    WHERE user_id = ?
      ${unreadClause}
    ORDER BY created_at DESC
    LIMIT ${limit}
    `,
    [userId]
  );

  return (rows as Row[]).map(mapNotification);
};

export const getIntranetNotificationSummary = async (
  db: DbInterface,
  userIdRaw: unknown,
  limit = 8
): Promise<IntranetNotificationSummary> => {
  await ensureIntranetNotificationTables(db);
  const userId = clean(userIdRaw);
  if (!userId) {
    return {
      unreadCount: 0,
      unreadByChannel: { chat: 0, task: 0 },
      latestCreatedAt: null,
      items: [],
    };
  }

  const [countRows, channelRows, items] = await Promise.all([
    db.query(
      `
      SELECT COUNT(*) AS total
      FROM intranet_notifications
      WHERE user_id = ? AND COALESCE(is_read, 0) = 0
      `,
      [userId]
    ),
    db.query(
      `
      SELECT channel, COUNT(*) AS total
      FROM intranet_notifications
      WHERE user_id = ? AND COALESCE(is_read, 0) = 0
      GROUP BY channel
      `,
      [userId]
    ),
    listIntranetNotifications(db, userId, { limit }),
  ]);

  const unreadByChannel: Record<IntranetNotificationChannel, number> = { chat: 0, task: 0 };
  for (const row of channelRows as Row[]) {
    const channel = clean(row.channel) as IntranetNotificationChannel;
    if (channel === 'chat' || channel === 'task') {
      unreadByChannel[channel] = Number(row.total || 0);
    }
  }

  return {
    unreadCount: Number((countRows[0] as Row | undefined)?.total || 0),
    unreadByChannel,
    latestCreatedAt: items[0]?.createdAt || null,
    items,
  };
};

export const markIntranetNotificationsRead = async (db: DbInterface, userIdRaw: unknown, notificationIds: string[]) => {
  await ensureIntranetNotificationTables(db);
  const userId = clean(userIdRaw);
  const ids = Array.from(new Set(notificationIds.map(clean).filter(Boolean)));
  if (!userId || !ids.length) return { updated: 0 };

  const placeholders = ids.map(() => '?').join(', ');
  await db.execute(
    `
    UPDATE intranet_notifications
    SET is_read = 1, read_at = ?
    WHERE user_id = ? AND id IN (${placeholders}) AND COALESCE(is_read, 0) = 0
    `,
    [nowIso(), userId, ...ids]
  );
  return { updated: ids.length };
};

export const markAllIntranetNotificationsRead = async (db: DbInterface, userIdRaw: unknown) => {
  await ensureIntranetNotificationTables(db);
  const userId = clean(userIdRaw);
  if (!userId) return { updated: 0 };
  await db.execute(
    `
    UPDATE intranet_notifications
    SET is_read = 1, read_at = ?
    WHERE user_id = ? AND COALESCE(is_read, 0) = 0
    `,
    [nowIso(), userId]
  );
  return { updated: true };
};

export const markIntranetNotificationsReadByEntity = async (
  db: DbInterface,
  userIdRaw: unknown,
  channel: IntranetNotificationChannel,
  entityTypeRaw: unknown,
  entityIdRaw: unknown
) => {
  await ensureIntranetNotificationTables(db);
  const userId = clean(userIdRaw);
  const entityType = clean(entityTypeRaw);
  const entityId = clean(entityIdRaw);
  if (!userId || !entityType || !entityId) return { updated: 0 };
  await db.execute(
    `
    UPDATE intranet_notifications
    SET is_read = 1, read_at = ?
    WHERE user_id = ? AND channel = ? AND entity_type = ? AND entity_id = ? AND COALESCE(is_read, 0) = 0
    `,
    [nowIso(), userId, channel, entityType, entityId]
  );
  return { updated: true };
};
