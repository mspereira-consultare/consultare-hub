import { NextResponse } from 'next/server';
import { requireDashboardPermission } from '@/lib/dashboard_executive/auth';
import { getOrCreateExecutiveSnapshot } from '@/lib/dashboard_executive/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await requireDashboardPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const snapshot = await getOrCreateExecutiveSnapshot(auth.db, auth.userId);
    return NextResponse.json({ status: 'success', data: snapshot });
  } catch (error: any) {
    console.error('Erro ao carregar dashboard executivo:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao carregar dashboard executivo.' },
      { status: Number(error?.status) || 500 }
    );
  }
}
