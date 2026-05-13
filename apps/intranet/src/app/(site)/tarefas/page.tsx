import { getServerSession } from 'next-auth';
import { notFound } from 'next/navigation';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { requireIntranetTasksPermission } from '@/lib/intranet/tasks-auth';
import { TasksClient } from './tasks-client';

export const dynamic = 'force-dynamic';

export default async function IntranetTasksPage() {
  const auth = await requireIntranetTasksPermission('view');
  if (!auth.ok) notFound();

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) notFound();

  return (
    <TasksClient
      currentUser={{
        id: String(session.user.id),
        name: String(session.user.name || session.user.email || 'Usuário'),
        email: String(session.user.email || ''),
        department: String((session.user as { department?: string }).department || ''),
      }}
    />
  );
}
