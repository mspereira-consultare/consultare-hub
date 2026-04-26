import 'server-only';

import { getServerSession } from 'next-auth';
import { getDbConnection } from '@consultare/core/db';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const requireChatSession = async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, status: 401, error: 'Não autenticado.' };
  }
  const db = getDbConnection();
  return {
    ok: true as const,
    db,
    user: {
      id: String(session.user.id),
      role: String((session.user as { role?: string }).role || 'OPERADOR'),
      department: String((session.user as { department?: string }).department || ''),
    },
  };
};
