import { NextResponse } from 'next/server';
import { requireIntranetPermission } from '@/lib/intranet/auth';
import { createEditorialScope, IntranetValidationError, listEditorialScopes } from '@/lib/intranet/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const errorResponse = (error: unknown, fallback: string) => {
  const status =
    error instanceof IntranetValidationError
      ? error.status
      : Number((error as { status?: number })?.status) || 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
};

export async function GET() {
  try {
    const auth = await requireIntranetPermission('intranet_escopos', 'view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const data = await listEditorialScopes(auth.db);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao listar escopos editoriais:', error);
    return errorResponse(error, 'Erro interno ao listar escopos editoriais.');
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireIntranetPermission('intranet_escopos', 'edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json();
    const data = await createEditorialScope(auth.db, body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao criar escopo editorial:', error);
    return errorResponse(error, 'Erro interno ao criar escopo editorial.');
  }
}
