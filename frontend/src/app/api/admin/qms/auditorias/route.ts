import { NextResponse } from 'next/server';
import { requireQmsPermission } from '@/lib/qms/auth';
import {
  createQmsAudit,
  listQmsAudits,
  listQmsAuditOptions,
  QmsValidationError,
} from '@/lib/qms/audits_repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const auth = await requireQmsPermission('qualidade_auditorias', 'view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const includeOptions = String(searchParams.get('includeOptions') || '').toLowerCase() === '1';
    const search = String(searchParams.get('search') || '').trim();
    const status = String(searchParams.get('status') || 'all').trim().toLowerCase();
    const criticality = String(searchParams.get('criticality') || 'all').trim().toLowerCase();

    const [data, options] = await Promise.all([
      listQmsAudits(auth.db, { search, status, criticality }),
      includeOptions ? listQmsAuditOptions(auth.db) : Promise.resolve(null),
    ]);

    return NextResponse.json({ status: 'success', data, options });
  } catch (error: any) {
    console.error('Erro ao listar auditorias:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao listar auditorias.' },
      { status }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireQmsPermission('qualidade_auditorias', 'edit');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const body = await request.json();
    const data = await createQmsAudit(auth.db, body, auth.userId);
    return NextResponse.json({ status: 'success', data });
  } catch (error: any) {
    console.error('Erro ao criar auditoria:', error);
    const status =
      error instanceof QmsValidationError ? error.status : Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao criar auditoria.' },
      { status }
    );
  }
}
