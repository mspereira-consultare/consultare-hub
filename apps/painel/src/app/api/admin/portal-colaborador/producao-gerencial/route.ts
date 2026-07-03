import { NextResponse } from 'next/server';
import { requireEmployeePortalProductionManagementPermission } from '@/lib/employee_portal_management/auth';
import { getEmployeePortalProductionManagementData } from '@consultare/core/employee-portal/repository';

export const dynamic = 'force-dynamic';

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const getErrorStatus = (error: unknown, fallback = 500) => {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = Number((error as { status?: unknown }).status);
    if (Number.isFinite(status) && status > 0) return status;
  }
  return fallback;
};

const normalizeEntryType = (value: string | null) =>
  value === 'RESOLVE' || value === 'CHECKUP' || value === 'ALL' ? value : undefined;

const normalizeMatchStatus = (value: string | null) =>
  value === 'MATCHED' || value === 'PENDING_MATCH' || value === 'MULTIPLE_MATCHES' || value === 'NO_MATCH' || value === 'ALL'
    ? value
    : undefined;

const normalizePositiveNumber = (value: string | null, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export async function GET(request: Request) {
  try {
    const auth = await requireEmployeePortalProductionManagementPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const data = await getEmployeePortalProductionManagementData(auth.db, {
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      employeeId: searchParams.get('employeeId') || undefined,
      team: searchParams.get('team') || undefined,
      unit: searchParams.get('unit') || undefined,
      entryType: normalizeEntryType(searchParams.get('entryType')),
      matchStatus: normalizeMatchStatus(searchParams.get('matchStatus')),
      page: normalizePositiveNumber(searchParams.get('page'), 1),
      pageSize: normalizePositiveNumber(searchParams.get('pageSize'), 50),
    });

    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao carregar produção gerencial do portal:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Erro interno ao carregar produção gerencial.') },
      { status: getErrorStatus(error) }
    );
  }
}
