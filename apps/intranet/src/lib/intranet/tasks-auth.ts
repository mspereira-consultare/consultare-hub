import { requireIntranetPermission } from './auth';
import type { TaskViewerContext } from '@consultare/core/tasks/types';

export const requireIntranetTasksPermission = async (action: 'view' | 'edit') => {
  const auth = await requireIntranetPermission('intranet_tarefas', action);
  if (!auth.ok) return auth;

  return {
    ...auth,
    viewer: {
      userId: auth.userId,
      canViewAll: false,
    } satisfies TaskViewerContext,
  };
};
