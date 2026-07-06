import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { processRepasseSendPulseWebhookEvent } from '@/lib/repasses/repository';
import {
  processTaskWeeklyReportSendPulseWebhook,
  TaskWeeklyReportValidationError,
} from '@/lib/tasks/weekly-report';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const clean = (value: unknown) => String(value ?? '').trim();

const configuredWebhookSecrets = () =>
  [
    process.env.SENDPULSE_WEBHOOK_SECRET,
    process.env.REPASSE_EMAIL_WEBHOOK_SECRET,
    process.env.TASKS_WEEKLY_REPORT_CRON_SECRET,
  ]
    .map(clean)
    .filter(Boolean);

const hasValidWebhookSecret = (request: Request) => {
  const secrets = configuredWebhookSecrets();
  if (!secrets.length) return false;

  const authorization = clean(request.headers.get('authorization'));
  const bearer = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
  const headerSecret = clean(request.headers.get('x-webhook-secret') || request.headers.get('x-cron-secret'));
  const url = new URL(request.url);
  const querySecret = clean(url.searchParams.get('secret'));

  return [bearer, headerSecret, querySecret].some((value) => value && secrets.includes(value));
};

const normalizeEmail = (value: unknown) => clean(value).toLowerCase();

const getEventItems = (payload: any) => (Array.isArray(payload) ? payload : Array.isArray(payload?.events) ? payload.events : [payload]);

const resolveSendPulseTarget = async (db: ReturnType<typeof getDbConnection>, item: any) => {
  const providerMessageId = clean(item?.message_id || item?.email_id || item?.id);
  const recipientEmail = normalizeEmail(item?.recipient || item?.email || item?.email_to);
  const subject = clean(item?.subject);

  if (providerMessageId || recipientEmail) {
    const repasseRows = await db
      .query(
        `
        SELECT id
        FROM repasse_email_messages
        WHERE provider = 'sendpulse'
          AND (
            (? <> '' AND (provider_message_id = ? OR message_id = ?))
            OR (
              ? <> ''
              AND LOWER(TRIM(to_email)) = LOWER(TRIM(?))
              AND (? = '' OR subject = ?)
            )
          )
        LIMIT 1
        `,
        [providerMessageId, providerMessageId, providerMessageId, recipientEmail, recipientEmail, subject, subject]
      )
      .catch(() => []);
    if (repasseRows[0]) return 'repasses' as const;

    const taskRows = await db
      .query(
        `
        SELECT id
        FROM task_weekly_report_recipients
        WHERE (? <> '' AND provider_message_id = ?)
           OR (
             ? <> ''
             AND LOWER(TRIM(corporate_email)) = LOWER(TRIM(?))
             AND (? = '' OR subject = ?)
           )
        LIMIT 1
        `,
        [providerMessageId, providerMessageId, recipientEmail, recipientEmail, subject, subject]
      )
      .catch(() => []);
    if (taskRows[0]) return 'tasks' as const;
  }

  return 'unknown' as const;
};

export async function POST(request: Request) {
  try {
    if (!hasValidWebhookSecret(request)) {
      return NextResponse.json({ error: 'Webhook não autorizado.' }, { status: 403 });
    }

    const payload = await request.json().catch(() => ({}));
    const items = getEventItems(payload);
    const db = getDbConnection();
    const repasseItems = [];
    const taskItems = [];
    let ignoredCount = 0;

    for (const item of items) {
      const target = await resolveSendPulseTarget(db, item);
      if (target === 'repasses') repasseItems.push(item);
      else if (target === 'tasks') taskItems.push(item);
      else ignoredCount += 1;
    }

    const [repasses, tasks] = await Promise.all([
      repasseItems.length ? processRepasseSendPulseWebhookEvent(db, repasseItems) : Promise.resolve([]),
      taskItems.length ? processTaskWeeklyReportSendPulseWebhook(db, taskItems) : Promise.resolve([]),
    ]);

    return NextResponse.json({
      status: 'success',
      data: {
        repasses,
        tasks,
        ignoredCount,
      },
    });
  } catch (error: any) {
    console.error('Erro no webhook SendPulse unificado:', error);
    const status = error instanceof TaskWeeklyReportValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json({ error: error?.message || 'Erro interno no webhook SendPulse.' }, { status });
  }
}
