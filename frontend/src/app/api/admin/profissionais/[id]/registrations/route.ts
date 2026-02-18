import { NextResponse } from 'next/server';
import { requireProfissionaisPermission } from '@/lib/profissionais/auth';
import { getProfessionalRegistrations } from '@/lib/profissionais/repository';

export const dynamic = 'force-dynamic';

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
    const data = await getProfessionalRegistrations(auth.db, String(id || ''));
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao listar registros regionais:', error);
    const message = error instanceof Error ? error.message : 'Erro interno.';
    const status = Number((error as { status?: number })?.status) || 500;
    return NextResponse.json({ error: message }, { status });
  }
}

