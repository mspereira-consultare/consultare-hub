import { NextResponse } from 'next/server';
import { requireIntranetPermission } from '@/lib/intranet/auth';
import { listAudienceUserOptions } from '@/lib/intranet/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await requireIntranetPermission('intranet_audiencias', 'view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const data = await listAudienceUserOptions(auth.db);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao listar usuarios para audiencias:', error);
    const message = error instanceof Error ? error.message : 'Erro interno ao listar usuarios.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
