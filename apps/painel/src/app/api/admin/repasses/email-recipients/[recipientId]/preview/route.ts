import { NextResponse } from 'next/server';
import { requireRepassesPermission } from '@/lib/repasses/auth';
import { isRepassesModuleEnabledServer } from '@/lib/repasses/feature';
import {
  getRepasseEmailRecipientPreview,
  RepasseValidationError,
} from '@/lib/repasses/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ParamsContext = {
  params: Promise<{ recipientId: string }>;
};

export async function GET(_request: Request, context: ParamsContext) {
  try {
    if (!isRepassesModuleEnabledServer()) {
      return NextResponse.json({ error: 'Modulo de repasses desabilitado.' }, { status: 404 });
    }
    const auth = await requireRepassesPermission('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { recipientId } = await context.params;
    const data = await getRepasseEmailRecipientPreview(auth.db, recipientId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro ao gerar previa de e-mail de repasse:', error);
    const status =
      error instanceof RepasseValidationError
        ? error.status
        : Number((error as { status?: number }).status) || 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao gerar previa de e-mail de repasse.',
      },
      { status }
    );
  }
}
