import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { processRepasseSendPulseWebhookEvent, RepasseValidationError } from '@/lib/repasses/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

const isWebhookEnabled = () => {
  const raw = String(process.env.REPASSE_EMAIL_WEBHOOK_ENABLED || '').trim().toLowerCase();
  if (!raw) return true;
  if (FALSE_VALUES.has(raw)) return false;
  if (TRUE_VALUES.has(raw)) return true;
  return true;
};

const hasValidWebhookSecret = (request: Request) => {
  const configuredSecret = String(process.env.REPASSE_EMAIL_WEBHOOK_SECRET || '').trim();
  if (!configuredSecret) return false;

  const authorization = String(request.headers.get('authorization') || '').trim();
  const bearer = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
  const headerSecret = String(request.headers.get('x-webhook-secret') || request.headers.get('x-cron-secret') || '').trim();
  const url = new URL(request.url);
  const querySecret = String(url.searchParams.get('secret') || '').trim();

  return bearer === configuredSecret || headerSecret === configuredSecret || querySecret === configuredSecret;
};

export async function POST(request: Request) {
  try {
    if (!isWebhookEnabled()) {
      return NextResponse.json({ error: 'Webhook de repasses desabilitado.' }, { status: 404 });
    }

    if (!hasValidWebhookSecret(request)) {
      return NextResponse.json({ error: 'Webhook não autorizado.' }, { status: 403 });
    }

    const payload = await request.json().catch(() => ({}));
    const db = getDbConnection();
    const data = await processRepasseSendPulseWebhookEvent(db, payload);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro no webhook SendPulse de repasses:', error);
    const status =
      error instanceof RepasseValidationError
        ? error.status
        : Number((error as { status?: number }).status) || 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno no webhook SendPulse de repasses.',
      },
      { status }
    );
  }
}
