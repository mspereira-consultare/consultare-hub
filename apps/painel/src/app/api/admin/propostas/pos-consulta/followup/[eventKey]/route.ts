import { NextResponse } from 'next/server';
import { requirePropostasPosConsultaPermission } from '@/lib/proposals/auth';
import { upsertPostConsultFollowup } from '@/lib/post_consulta/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const getErrorStatus = (error: unknown) =>
  typeof error === 'object' && error && 'status' in error ? Number((error as { status?: unknown }).status) || 500 : 500;

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export async function PATCH(request: Request, context: { params: Promise<{ eventKey: string }> }) {
  try {
    const auth = await requirePropostasPosConsultaPermission('edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const params = await context.params;
    const body = await request.json().catch(() => ({}));

    const result = await upsertPostConsultFollowup(
      {
        eventKey: String(params.eventKey || ''),
        firstContactClosed: body?.firstContactClosed ?? null,
        firstContactAt: body?.firstContactAt ?? null,
        secondContactClosed: body?.secondContactClosed ?? null,
        secondContactAt: body?.secondContactAt ?? null,
        observation: body?.observation ?? null,
        updatedByUserId: auth.userId,
        updatedByUserName: auth.userName,
        sourceSnapshot: {
          patientId: body?.sourceSnapshot?.patientId ?? null,
          patientName: body?.sourceSnapshot?.patientName ?? '',
          consultDate: body?.sourceSnapshot?.consultDate ?? '',
          consultUnit: body?.sourceSnapshot?.consultUnit ?? '',
          consultProcedure: body?.sourceSnapshot?.consultProcedure ?? '',
          attendantResponsible: body?.sourceSnapshot?.attendantResponsible ?? '',
        },
      },
      auth.db,
    );

    return NextResponse.json({
      status: 'success',
      data: result,
    });
  } catch (error: unknown) {
    console.error('Erro API Pós-consulta follow-up:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Erro ao salvar o follow-up de pós-consulta.') },
      { status: getErrorStatus(error) },
    );
  }
}
