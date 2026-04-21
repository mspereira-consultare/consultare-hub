import { NextResponse } from 'next/server';
import { requireProfissionaisPermission } from '@/lib/profissionais/auth';
import {
  generateProfessionalContract,
  listProfessionalContractHistory,
} from '@/lib/profissionais/contracts';
import { ProfessionalValidationError } from '@/lib/profissionais/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: ParamsContext) {
  try {
    const auth = await requireProfissionaisPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const data = await listProfessionalContractHistory(auth.db, String(id || ''));
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao listar contratos do profissional:', error);
    const status = Number((error as { status?: number })?.status) || 500;
    const message = error instanceof Error ? error.message : 'Erro interno ao listar contratos.';
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}

export async function POST(request: Request, context: ParamsContext) {
  try {
    const auth = await requireProfissionaisPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const templateId = String(body?.templateId || '').trim() || null;

    const data = await generateProfessionalContract(
      auth.db,
      String(id || ''),
      auth.userId,
      { templateId, source: 'manual' }
    );

    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao gerar contrato do profissional:', error);
    const status =
      error instanceof ProfessionalValidationError
        ? error.status
        : Number((error as { status?: number })?.status) || 500;
    const message = error instanceof Error ? error.message : 'Erro interno ao gerar contrato.';
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
