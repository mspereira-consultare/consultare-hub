import { NextResponse } from 'next/server';
import {
  createSuggestedRecepcaoChecklistConfig,
  listRecepcaoChecklistConfigsWithOptions,
  requireRecepcaoChecklistAccess,
  saveRecepcaoChecklistConfig,
} from '@/lib/checklist_recepcao';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const errorStatus = (error: unknown) =>
  typeof error === 'object' && error && 'status' in error ? Number((error as { status?: unknown }).status) || 500 : 500;

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

export async function GET() {
  try {
    const auth = await requireRecepcaoChecklistAccess('view');
    if (!auth.ok) return auth.response;

    const data = await listRecepcaoChecklistConfigsWithOptions(auth);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro GET checklist recepcao configs:', error);
    return NextResponse.json(
      { status: 'error', error: errorMessage(error, 'Erro ao carregar configuracoes da checklist.') },
      { status: errorStatus(error) },
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireRecepcaoChecklistAccess('edit');
    if (!auth.ok) return auth.response;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.useSuggestedDraft === true) {
      const created = await createSuggestedRecepcaoChecklistConfig(auth);
      return NextResponse.json({ status: 'success', data: created });
    }

    const id = await saveRecepcaoChecklistConfig(auth, {
      name: String(body.name || '').trim() || null,
      leaderUserId: String(body.leaderUserId || '').trim(),
      leaderEmployeeId: String(body.leaderEmployeeId || '').trim() || null,
      leaderName: String(body.leaderName || '').trim() || null,
      units: Array.isArray(body.units) ? body.units.map((item) => String(item || '').trim()).filter(Boolean) : [],
      teamEmployeeIds: Array.isArray(body.teamEmployeeIds)
        ? body.teamEmployeeIds.map((item) => String(item || '').trim()).filter(Boolean)
        : [],
      isActive: body.isActive === false ? false : true,
    });

    return NextResponse.json({ status: 'success', data: { id } });
  } catch (error: unknown) {
    console.error('Erro POST checklist recepcao configs:', error);
    return NextResponse.json(
      { status: 'error', error: errorMessage(error, 'Erro ao salvar configuracao da checklist.') },
      { status: errorStatus(error) },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireRecepcaoChecklistAccess('edit');
    if (!auth.ok) return auth.response;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = await saveRecepcaoChecklistConfig(auth, {
      id: String(body.id || '').trim() || null,
      name: String(body.name || '').trim() || null,
      leaderUserId: String(body.leaderUserId || '').trim(),
      leaderEmployeeId: String(body.leaderEmployeeId || '').trim() || null,
      leaderName: String(body.leaderName || '').trim() || null,
      units: Array.isArray(body.units) ? body.units.map((item) => String(item || '').trim()).filter(Boolean) : [],
      teamEmployeeIds: Array.isArray(body.teamEmployeeIds)
        ? body.teamEmployeeIds.map((item) => String(item || '').trim()).filter(Boolean)
        : [],
      isActive: body.isActive === false ? false : true,
    });

    return NextResponse.json({ status: 'success', data: { id } });
  } catch (error: unknown) {
    console.error('Erro PATCH checklist recepcao configs:', error);
    return NextResponse.json(
      { status: 'error', error: errorMessage(error, 'Erro ao atualizar configuracao da checklist.') },
      { status: errorStatus(error) },
    );
  }
}
