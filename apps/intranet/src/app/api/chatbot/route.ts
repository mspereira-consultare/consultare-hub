import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  }

  return NextResponse.json(
    {
      error: 'Chatbot ainda nao implementado',
      status: 'pending_knowledge_base',
    },
    { status: 501 }
  );
}
