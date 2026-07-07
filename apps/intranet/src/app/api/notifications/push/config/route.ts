import { NextResponse } from 'next/server';
import { getIntranetPushPublicConfig } from '@consultare/core/intranet/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json({ status: 'success', data: getIntranetPushPublicConfig() });
  } catch (error: unknown) {
    console.error('Erro ao carregar configuração de push da intranet:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno ao carregar configuração de push.' },
      { status: 500 }
    );
  }
}
