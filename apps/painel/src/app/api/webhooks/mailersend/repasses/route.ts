import { createHmac, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { processRepasseMailerSendWebhookEvent, RepasseValidationError } from '@/lib/repasses/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);
const MAILERSEND_TEST_SECRET = 'test_Am3L1GuOIc4blLUuHqAPxxwkZaJyEk8G';

const isWebhookEnabled = () => {
  const raw = String(process.env.REPASSE_EMAIL_WEBHOOK_ENABLED || '').trim().toLowerCase();
  if (!raw) return true;
  if (FALSE_VALUES.has(raw)) return false;
  if (TRUE_VALUES.has(raw)) return true;
  return true;
};

const safeEqualHex = (a: string, b: string) => {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
};

const verifySignature = (rawBody: string, signature: string, secret: string) => {
  if (!signature || !secret) return false;
  const computed = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  try {
    return safeEqualHex(signature, computed);
  } catch {
    return false;
  }
};

export async function POST(request: Request) {
  try {
    if (!isWebhookEnabled()) {
      return NextResponse.json({ error: 'Webhook de repasses desabilitado.' }, { status: 404 });
    }

    const rawBody = await request.text();
    const signature = String(request.headers.get('signature') || request.headers.get('Signature') || '').trim();
    const payload = JSON.parse(rawBody || '{}');
    const configuredSecret = String(process.env.MAILERSEND_WEBHOOK_SECRET || '').trim();
    const isTestEvent = String(payload?.type || '') === 'webhook.test';
    const validConfigured = configuredSecret ? verifySignature(rawBody, signature, configuredSecret) : false;
    const validTest = isTestEvent ? verifySignature(rawBody, signature, MAILERSEND_TEST_SECRET) : false;

    if (!validConfigured && !validTest) {
      return NextResponse.json({ error: 'Assinatura MailerSend invalida.' }, { status: 403 });
    }

    const db = getDbConnection();
    if (isTestEvent) {
      return NextResponse.json({ status: 'success', data: { test: true } });
    }

    const data = await processRepasseMailerSendWebhookEvent(db, payload);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro no webhook MailerSend de repasses:', error);
    const status =
      error instanceof RepasseValidationError
        ? error.status
        : Number((error as { status?: number }).status) || 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno no webhook MailerSend de repasses.',
      },
      { status }
    );
  }
}
