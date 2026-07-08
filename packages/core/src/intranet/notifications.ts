import { createHash, randomUUID } from 'crypto';
import { ensureServerEnv, type DbInterface } from '../db';

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

export type IntranetPushSubscriptionInput = {
  endpoint: string;
  expirationTime?: number | null;
  keys?: {
    p256dh?: string;
    auth?: string;
  } | null;
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
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const isMysql = () => {
  ensureServerEnv();
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
let pushSubscriptionsEnsured = false;

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

const getPushConfig = () => {
  ensureServerEnv();
  const publicKey = clean(process.env.WEB_PUSH_VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY);
  const privateKey = clean(process.env.WEB_PUSH_VAPID_PRIVATE_KEY);
  const subject = clean(process.env.WEB_PUSH_VAPID_SUBJECT || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'mailto:suporte@consultare.com.br');

  return {
    publicKey,
    privateKey,
    subject,
    isConfigured: Boolean(publicKey && privateKey),
    isClientReady: Boolean(publicKey),
  };
};

const mapSubscriptionRow = (row: Row) => ({
  id: clean(row.id),
  userId: clean(row.user_id),
  endpoint: clean(row.endpoint),
  endpointHash: clean(row.endpoint_hash),
  p256dh: clean(row.p256dh),
  auth: clean(row.auth),
  expirationTime: nullable(row.expiration_time),
  userAgent: nullable(row.user_agent),
});

const ensureIntranetPushSubscriptionTable = async (db: DbInterface) => {
  if (pushSubscriptionsEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS intranet_push_subscriptions (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      endpoint TEXT NOT NULL,
      endpoint_hash VARCHAR(64) NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      expiration_time VARCHAR(64) NULL,
      user_agent VARCHAR(255) NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await safeAddColumn(db, `ALTER TABLE intranet_push_subscriptions ADD COLUMN endpoint_hash VARCHAR(64) NOT NULL`);
  await safeAddColumn(db, `ALTER TABLE intranet_push_subscriptions ADD COLUMN p256dh TEXT NOT NULL`);
  await safeAddColumn(db, `ALTER TABLE intranet_push_subscriptions ADD COLUMN auth TEXT NOT NULL`);
  await safeAddColumn(db, `ALTER TABLE intranet_push_subscriptions ADD COLUMN expiration_time VARCHAR(64) NULL`);
  await safeAddColumn(db, `ALTER TABLE intranet_push_subscriptions ADD COLUMN user_agent VARCHAR(255) NULL`);
  await safeAddColumn(db, `ALTER TABLE intranet_push_subscriptions ADD COLUMN created_at TEXT NOT NULL`);
  await safeAddColumn(db, `ALTER TABLE intranet_push_subscriptions ADD COLUMN updated_at TEXT NOT NULL`);

  await safeCreateIndex(
    db,
    `CREATE UNIQUE INDEX idx_intranet_push_subscriptions_user_endpoint ON intranet_push_subscriptions (user_id, endpoint_hash)`
  );
  await safeCreateIndex(db, `CREATE INDEX idx_intranet_push_subscriptions_user ON intranet_push_subscriptions (user_id)`);

  pushSubscriptionsEnsured = true;
};

export const getIntranetPushPublicConfig = () => {
  const config = getPushConfig();
  return {
    supported: config.isClientReady,
    publicKey: config.publicKey || null,
  };
};

export const upsertIntranetPushSubscription = async (
  db: DbInterface,
  userIdRaw: unknown,
  subscription: IntranetPushSubscriptionInput,
  userAgentRaw?: unknown
) => {
  await ensureIntranetPushSubscriptionTable(db);
  const userId = clean(userIdRaw);
  const endpoint = clean(subscription?.endpoint);
  const p256dh = clean(subscription?.keys?.p256dh);
  const auth = clean(subscription?.keys?.auth);
  if (!userId || !endpoint || !p256dh || !auth) {
    throw new Error('Assinatura push inválida.');
  }

  const endpointHash = sha256(endpoint);
  const expirationTime =
    subscription.expirationTime === null || typeof subscription.expirationTime === 'undefined'
      ? null
      : String(subscription.expirationTime);
  const userAgent = nullable(userAgentRaw);
  const now = nowIso();

  const existingRows = await db.query(
    `SELECT * FROM intranet_push_subscriptions WHERE user_id = ? AND endpoint_hash = ? LIMIT 1`,
    [userId, endpointHash]
  );
  const existing = existingRows[0] as Row | undefined;

  if (existing) {
    await db.execute(
      `
      UPDATE intranet_push_subscriptions
      SET endpoint = ?, p256dh = ?, auth = ?, expiration_time = ?, user_agent = ?, updated_at = ?
      WHERE user_id = ? AND endpoint_hash = ?
      `,
      [endpoint, p256dh, auth, expirationTime, userAgent, now, userId, endpointHash]
    );
    return {
      ...mapSubscriptionRow(existing),
      endpoint,
      endpointHash,
      p256dh,
      auth,
      expirationTime,
      userAgent,
    };
  }

  const item = {
    id: randomUUID(),
    userId,
    endpoint,
    endpointHash,
    p256dh,
    auth,
    expirationTime,
    userAgent,
    createdAt: now,
    updatedAt: now,
  };

  await db.execute(
    `
    INSERT INTO intranet_push_subscriptions (
      id, user_id, endpoint, endpoint_hash, p256dh, auth, expiration_time, user_agent, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [item.id, item.userId, item.endpoint, item.endpointHash, item.p256dh, item.auth, item.expirationTime, item.userAgent, item.createdAt, item.updatedAt]
  );

  return item;
};

export const removeIntranetPushSubscription = async (db: DbInterface, userIdRaw: unknown, endpointRaw: unknown) => {
  await ensureIntranetPushSubscriptionTable(db);
  const userId = clean(userIdRaw);
  const endpoint = clean(endpointRaw);
  if (!userId || !endpoint) return { removed: 0 };
  const result = await db.execute(
    `DELETE FROM intranet_push_subscriptions WHERE user_id = ? AND endpoint_hash = ?`,
    [userId, sha256(endpoint)]
  );
  return { removed: Number((result as { affectedRows?: number })?.affectedRows || 0) };
};

const removeIntranetPushSubscriptionByHash = async (db: DbInterface, endpointHashRaw: unknown) => {
  await ensureIntranetPushSubscriptionTable(db);
  const endpointHash = clean(endpointHashRaw);
  if (!endpointHash) return;
  await db.execute(`DELETE FROM intranet_push_subscriptions WHERE endpoint_hash = ?`, [endpointHash]);
};

export const sendIntranetPushNotifications = async (db: DbInterface, items: IntranetNotification[]) => {
  await ensureIntranetPushSubscriptionTable(db);
  const config = getPushConfig();
  if (!config.isConfigured || !items.length) {
    return { attempted: 0, sent: 0, removed: 0, skipped: items.length };
  }

  const userIds = Array.from(new Set(items.map((item) => clean(item.userId)).filter(Boolean)));
  if (!userIds.length) return { attempted: 0, sent: 0, removed: 0, skipped: items.length };

  const placeholders = userIds.map(() => '?').join(', ');
  const rows = await db.query(
    `SELECT * FROM intranet_push_subscriptions WHERE user_id IN (${placeholders})`,
    userIds
  );
  const subscriptionsByUser = new Map<string, ReturnType<typeof mapSubscriptionRow>[]>();
  for (const row of rows as Row[]) {
    const mapped = mapSubscriptionRow(row);
    const current = subscriptionsByUser.get(mapped.userId) || [];
    current.push(mapped);
    subscriptionsByUser.set(mapped.userId, current);
  }

  const webPushModule = await import('web-push');
  const webPush = (webPushModule.default || webPushModule) as typeof import('web-push');
  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  let attempted = 0;
  let sent = 0;
  let removed = 0;

  for (const item of items) {
    const subscriptions = subscriptionsByUser.get(item.userId) || [];
    for (const subscription of subscriptions) {
      attempted += 1;
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            expirationTime: subscription.expirationTime ? Number(subscription.expirationTime) : null,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify({
            title: item.title,
            body: item.body,
            tag: item.id,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            data: {
              href: item.href,
              notificationId: item.id,
              channel: item.channel,
              entityType: item.entityType,
              entityId: item.entityId,
            },
          })
        );
        sent += 1;
      } catch (error: unknown) {
        const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
        if (statusCode === 404 || statusCode === 410) {
          await removeIntranetPushSubscriptionByHash(db, subscription.endpointHash);
          removed += 1;
          continue;
        }
        console.error('Erro ao enviar web push da intranet:', error);
      }
    }
  }

  return { attempted, sent, removed, skipped: 0 };
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
    listIntranetNotifications(db, userId, { limit, unreadOnly: true }),
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
