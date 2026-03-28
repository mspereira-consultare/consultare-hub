import { NextResponse } from 'next/server';
import { requirePropostasPermission } from '@/lib/proposals/auth';
import { upsertProposalFollowup } from '@/lib/proposals/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(request: Request, context: { params: Promise<{ proposalId: string }> }) {
  try {
    const auth = await requirePropostasPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const params = await context.params;
    const proposalId = Number(params.proposalId);
    const body = await request.json().catch(() => ({}));

    const row = await upsertProposalFollowup(
      {
        proposalId,
        conversionStatus: body?.conversionStatus,
        conversionReason: body?.conversionReason,
        responsibleUserId: body?.responsibleUserId,
        updatedByUserId: auth.userId,
        updatedByUserName: auth.userName,
      },
      auth.db,
    );

    return NextResponse.json({
      status: 'success',
      data: row,
    });
  } catch (error: any) {
    console.error('Erro API Propostas follow-up update:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao salvar follow-up da proposta.' },
      { status: Number(error?.status) || 500 },
    );
  }
}
