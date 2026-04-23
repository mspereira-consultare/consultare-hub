import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getDbConnection } from '@consultare/core/db';
import { searchIntranet } from '@consultare/core/intranet/repository';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';
  const db = getDbConnection();
  const results = await searchIntranet(db, query, {
    id: String(session.user.id),
    role: String(session.user.role || 'OPERADOR'),
    department: String(session.user.department || ''),
  });

  return NextResponse.json({ results });
}
