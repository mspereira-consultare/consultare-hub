import { NextResponse } from 'next/server';
import { requireContractTemplatesPermission } from '@/lib/contract_templates/auth';
import {
  ContractTemplateValidationError,
  updateContractTemplateMapping,
} from '@/lib/contract_templates/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: Request, context: ParamsContext) {
  try {
    const auth = await requireContractTemplatesPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const body = await request.json();
    const mapping = Array.isArray(body?.mapping) ? body.mapping : [];

    const updated = await updateContractTemplateMapping(
      auth.db,
      String(id || ''),
      mapping,
      auth.userId
    );

    return NextResponse.json({ status: 'success', data: updated });
  } catch (error: any) {
    console.error('Erro ao atualizar mapeamento de modelo:', error);
    const status =
      error instanceof ContractTemplateValidationError
        ? error.status
        : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao atualizar mapeamento.' },
      { status }
    );
  }
}

