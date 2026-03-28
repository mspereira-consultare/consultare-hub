import { NextResponse } from 'next/server';
import { requirePropostasPermission } from '@/lib/proposals/auth';
import { listProposalFollowupOptions } from '@/lib/proposals/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await requirePropostasPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const options = await listProposalFollowupOptions(auth.db);
    return NextResponse.json({
      status: 'success',
      data: {
        ...options,
        canEdit: auth.permissions.propostas.edit,
      },
    });
  } catch (error: any) {
    console.error('Erro API Propostas follow-up options:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao carregar opções de follow-up.' },
      { status: Number(error?.status) || 500 },
    );
  }
}
