import { NextResponse } from 'next/server';
import { requireProfissionaisPermission } from '@/lib/profissionais/auth';
import { reprocessProfessionalContract } from '@/lib/profissionais/contracts';
import { ProfessionalValidationError } from '@/lib/profissionais/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ id: string; contractId: string }>;
};

export async function POST(_: Request, context: ParamsContext) {
  try {
    const auth = await requireProfissionaisPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id, contractId } = await context.params;
    const data = await reprocessProfessionalContract(
      auth.db,
      String(id || ''),
      String(contractId || ''),
      auth.userId
    );

    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao reprocessar contrato do profissional:', error);
    const status =
      error instanceof ProfessionalValidationError
        ? error.status
        : Number((error as { status?: number })?.status) || 500;
    const message = error instanceof Error ? error.message : 'Erro interno ao reprocessar contrato.';
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
