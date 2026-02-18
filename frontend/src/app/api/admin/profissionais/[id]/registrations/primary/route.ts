import { NextResponse } from 'next/server';
import { requireProfissionaisPermission } from '@/lib/profissionais/auth';
import { setProfessionalPrimaryRegistration } from '@/lib/profissionais/repository';

export const dynamic = 'force-dynamic';

type ParamsContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: Request, context: ParamsContext) {
  try {
    const auth = await requireProfissionaisPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const body = (await request.json()) as { registrationId?: string };
    const registrationId = String(body?.registrationId || '').trim();
    if (!registrationId) {
      return NextResponse.json({ error: 'registrationId e obrigatorio.' }, { status: 400 });
    }

    const data = await setProfessionalPrimaryRegistration(
      auth.db,
      String(id || ''),
      registrationId,
      auth.userId
    );
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao definir registro principal:', error);
    const message = error instanceof Error ? error.message : 'Erro interno.';
    const status = Number((error as { status?: number })?.status) || 500;
    return NextResponse.json({ error: message }, { status });
  }
}

