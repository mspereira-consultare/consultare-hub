import { NextResponse } from 'next/server';
import { requireColaboradoresPermission } from '@/lib/colaboradores/auth';
import {
  getEmployeePortalErrorMessage,
  getEmployeePortalErrorStatus,
} from '@consultare/core/employee-portal/errors';
import {
  rejectPortalDocument,
} from '@consultare/core/employee-portal/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ documentId: string }>;
};

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requireColaboradoresPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json().catch(() => ({}));
    const { documentId } = await context.params;
    const data = await rejectPortalDocument(
      auth.db,
      String(documentId || ''),
      auth.userId,
      String(body?.reason || '')
    );
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao rejeitar documento do portal:', error);
    return NextResponse.json(
      { error: getEmployeePortalErrorMessage(error, 'Erro interno ao rejeitar documento.') },
      { status: getEmployeePortalErrorStatus(error) }
    );
  }
}
