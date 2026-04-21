import { NextResponse } from 'next/server';
import { requireColaboradoresPermission } from '@/lib/colaboradores/auth';
import {
  getEmployeePortalErrorMessage,
  getEmployeePortalErrorStatus,
} from '@consultare/core/employee-portal/errors';
import {
  getEmployeePortalOverview,
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

export async function GET(request: Request, context: ParamsContext) {
  try {
    const auth = await requireColaboradoresPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const data = await getEmployeePortalOverview(auth.db, String(id || ''), resolvePortalBaseUrl(request));
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao carregar portal do colaborador no painel:', error);
    return NextResponse.json(
      { error: getEmployeePortalErrorMessage(error, 'Erro interno ao carregar portal do colaborador.') },
      { status: getEmployeePortalErrorStatus(error) }
    );
  }
}
