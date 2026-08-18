import { NextResponse } from 'next/server';
import {
  buildRecepcaoChecklistPayload,
  requireRecepcaoChecklistAccess,
  saveRecepcaoChecklistVersion,
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
        unitKey: url.searchParams.get('unitKey'),
        viewMode: url.searchParams.get('viewMode'),
        referenceDate: url.searchParams.get('referenceDate'),
        versionId: url.searchParams.get('versionId'),
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
    const viewMode = String(body.viewMode || 'current').trim().toLowerCase();
    if (viewMode !== 'current') {
      return NextResponse.json(
        { status: 'error', error: 'Apenas a visao de Hoje pode gerar novas versoes do checklist.' },
        { status: 400 },
      );
    }

    const saved = await saveRecepcaoChecklistVersion(auth, {
      configId: String(body.configId || '').trim(),
      unitKey: String(body.unitKey || '').trim(),
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
