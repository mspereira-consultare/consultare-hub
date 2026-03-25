import { NextResponse } from 'next/server';
import { requireMarketingFunilPermission } from '@/lib/marketing_funil/auth';
import { getMarketingFunilSourceStatus } from '@/lib/marketing_funil/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await requireMarketingFunilPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const data = await getMarketingFunilSourceStatus(auth.db);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro API marketing/funil source-status:', error);
    const message = error instanceof Error ? error.message : 'Erro interno.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
