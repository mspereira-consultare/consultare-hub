import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { processRecruitmentIndeedApplication } from '@/lib/recrutamento/indeed';
import { RecruitmentValidationError } from '@/lib/recrutamento/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const db = getDbConnection();
  const signature = String(request.headers.get('X-Indeed-Signature') || '').trim() || null;

  try {
    const rawBody = await request.text();
    const result = await processRecruitmentIndeedApplication(db, rawBody, signature);
    return NextResponse.json({ status: 'success', data: result }, { status: 201 });
  } catch (error: unknown) {
    const details = error as { message?: unknown; status?: unknown };
    const status = error instanceof RecruitmentValidationError ? error.status : Number(details?.status) || 500;
    const message =
      details?.message ||
      (status === 422 ? 'Unable to save application' : 'Erro interno ao processar candidatura da Indeed.');
    console.error('Erro ao processar candidatura Indeed:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
