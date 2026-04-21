import { NextResponse } from 'next/server';
import { requireColaboradoresPermission } from '@/lib/colaboradores/auth';
import {
  getEmployeePortalErrorMessage,
  getEmployeePortalErrorStatus,
} from '@consultare/core/employee-portal/errors';
import {
  createEmployeePortalInvite,
} from '@consultare/core/employee-portal/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ id: string }>;
};

const resolvePortalBaseUrl = (request: Request) => {
  const configured = String(process.env.EMPLOYEE_PORTAL_URL || process.env.NEXT_PUBLIC_EMPLOYEE_PORTAL_URL || '').trim();
  if (configured) return configured.replace(/\/+$/g, '');
  const origin = new URL(request.url).origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    return origin.replace(/:\d+$/, ':3001');
  }
  return `${origin}/portal-colaborador`;
};

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requireColaboradoresPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const data = await createEmployeePortalInvite(
      auth.db,
      String(id || ''),
      auth.userId,
      resolvePortalBaseUrl(request)
    );
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao gerar convite do portal do colaborador:', error);
    return NextResponse.json(
      { error: getEmployeePortalErrorMessage(error, 'Erro interno ao gerar convite.') },
      { status: getEmployeePortalErrorStatus(error) }
    );
  }
}
