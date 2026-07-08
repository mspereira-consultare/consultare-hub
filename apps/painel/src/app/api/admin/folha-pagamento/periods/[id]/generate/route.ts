import { NextResponse } from 'next/server';
import { requirePayrollPermission } from '@/lib/payroll/auth';
import { generatePayrollPeriod, PayrollPendingGenerationConfirmationError } from '@/lib/payroll/repository';

type ParamsContext = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requirePayrollPermission('edit');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const payload = await request
      .json()
      .catch(() => ({} as { allowPendingEmployees?: boolean }));
    const data = await generatePayrollPeriod(auth.db, String(id || ''), {
      allowPendingEmployees: Boolean(payload?.allowPendingEmployees),
    });
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao gerar folha:', error);
    if (error instanceof PayrollPendingGenerationConfirmationError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          data: error.data,
        },
        { status: error.status || 409 },
      );
    }
    return NextResponse.json({ error: error?.message || 'Erro interno ao gerar folha.' }, { status: Number(error?.status) || 500 });
  }
}
