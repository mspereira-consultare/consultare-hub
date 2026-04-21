import { NextResponse } from 'next/server';
import { requireQmsPermission, type QmsPageKey } from '@/lib/qms/auth';
import { getQmsOverviewMetrics } from '@/lib/qms/metrics_repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const normalizePageKey = (raw: string | null): QmsPageKey => {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'qualidade_treinamentos') return 'qualidade_treinamentos';
  if (value === 'qualidade_auditorias') return 'qualidade_auditorias';
  return 'qualidade_documentos';
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pageKey = normalizePageKey(searchParams.get('page'));
    const auth = await requireQmsPermission(pageKey, 'view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const data = await getQmsOverviewMetrics(auth.db);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao carregar indicadores QMS:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao carregar indicadores QMS.' },
      { status }
    );
  }
}
