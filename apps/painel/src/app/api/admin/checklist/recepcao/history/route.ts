import { NextResponse } from 'next/server';
import { listRecepcaoChecklistHistory, requireRecepcaoChecklistAccess } from '@/lib/checklist_recepcao';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const errorStatus = (error: unknown) =>
  typeof error === 'object' && error && 'status' in error ? Number((error as { status?: unknown }).status) || 500 : 500;

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

export async function GET(request: Request) {
  try {
    const auth = await requireRecepcaoChecklistAccess('view');
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const data = await listRecepcaoChecklistHistory(auth, {
      configId: url.searchParams.get('configId'),
      unitKey: url.searchParams.get('unitKey'),
      limit: Number(url.searchParams.get('limit')) || undefined,
    });

    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro GET historico checklist recepcao:', error);
    return NextResponse.json(
      { status: 'error', error: errorMessage(error, 'Erro ao carregar o histórico de preenchimentos.') },
      { status: errorStatus(error) },
    );
  }
}
