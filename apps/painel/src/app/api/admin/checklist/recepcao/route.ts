import { NextResponse } from 'next/server';
import {
  buildRecepcaoChecklistPayload,
  requireRecepcaoChecklistAccess,
  saveRecepcaoChecklistFill,
} from '@/lib/checklist_recepcao';
import { buildCacheKey, withCache } from '@/lib/api_cache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_TTL_MS = 15000;

const errorStatus = (error: unknown) =>
  typeof error === 'object' && error && 'status' in error ? Number((error as { status?: unknown }).status) || 500 : 500;

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

export async function GET(request: Request) {
  try {
    const auth = await requireRecepcaoChecklistAccess('view');
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const cacheKey = buildCacheKey('admin', `${request.url}::${auth.userId}`);
    const data = await withCache(cacheKey, CACHE_TTL_MS, () =>
      buildRecepcaoChecklistPayload(auth, {
        configId: url.searchParams.get('configId'),
        leaderUserId: url.searchParams.get('leaderUserId'),
        unitKey: url.searchParams.get('unitKey'),
        viewMode: url.searchParams.get('viewMode'),
        referenceDate: url.searchParams.get('referenceDate'),
      }),
    );

    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro GET checklist recepcao:', error);
    return NextResponse.json(
      { status: 'error', error: errorMessage(error, 'Erro ao carregar checklist da recepcao.') },
      { status: errorStatus(error) },
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireRecepcaoChecklistAccess('edit');
    if (!auth.ok) return auth.response;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const saved = await saveRecepcaoChecklistFill(auth, {
      configId: String(body.configId || '').trim(),
      unitKey: String(body.unitKey || '').trim(),
      // A data de negócio vem do recorte da página: dias passados podem ser
      // corrigidos; a validação de data futura fica na camada de domínio.
      referenceDate: String(body.referenceDate || '').trim() || null,
      manual: (body.manual || {}) as Record<string, unknown>,
    });

    return NextResponse.json({ status: 'success', data: saved });
  } catch (error: unknown) {
    console.error('Erro POST checklist recepcao:', error);
    return NextResponse.json(
      { status: 'error', error: errorMessage(error, 'Erro ao salvar checklist da recepcao.') },
      { status: errorStatus(error) },
    );
  }
}
