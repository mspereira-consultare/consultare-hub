import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@consultare/core/db';
import type { ChatbotViewer } from '@consultare/core/intranet/chatbot';

export const requireIntranetChatbotSession = async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, status: 401, error: 'Nao autenticado.' };
  }

  const user = {
    id: String(session.user.id),
    role: String((session.user as { role?: string }).role || 'OPERADOR').toUpperCase(),
    department: String((session.user as { department?: string }).department || ''),
  } satisfies ChatbotViewer;

  return {
    ok: true as const,
    db: getDbConnection(),
    user,
  };
};

