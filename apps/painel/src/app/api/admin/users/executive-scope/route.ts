import { NextResponse } from 'next/server';
import { requireAnyPagePermission } from '@/lib/authz';
import { getExecutiveScope } from '@/lib/dashboard_executive/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Erro interno';

export async function GET(request: Request) {
  try {
    const auth = await requireAnyPagePermission([
      { pageKey: 'dashboard_executive_governance', action: 'view' },
      { pageKey: 'users', action: 'view' },
    ]);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const userId = clean(searchParams.get('userId'));
    if (!userId) {
      return NextResponse.json({ error: 'userId obrigatorio' }, { status: 400 });
    }

    const scope = await getExecutiveScope(auth.db, userId);
    return NextResponse.json({ status: 'success', data: scope });
  } catch (error: unknown) {
    console.error('Erro GET executive scope:', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAnyPagePermission([
      { pageKey: 'dashboard_executive_governance', action: 'edit' },
      { pageKey: 'users', action: 'edit' },
    ]);
    if (!auth.ok) return auth.response;

    await request.text();
    return NextResponse.json(
      {
        error:
          'Este endpoint legou leitura apenas. Ajuste perfis, grupos, cargos e exceções em /dashboard-executivo.',
      },
      { status: 410 }
    );
  } catch (error: unknown) {
    console.error('Erro PATCH executive scope:', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

function clean(value: unknown) {
  return String(value ?? '').trim();
}
