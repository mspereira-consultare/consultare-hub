import { notFound } from 'next/navigation';
import { ListChecks } from 'lucide-react';
import { requireIntranetTasksPermission } from '@/lib/intranet/tasks-auth';

export const dynamic = 'force-dynamic';

export default async function IntranetTasksPage() {
  const auth = await requireIntranetTasksPermission('view');
  if (!auth.ok) notFound();

  return (
    <main className="px-4 py-6 lg:px-8">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 text-[#17407E]">
          <ListChecks size={24} />
          <span className="text-xs font-semibold uppercase tracking-wide">Tarefas</span>
        </div>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Módulo de tarefas em preparação</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          As permissões e APIs do módulo já estão ativas nesta fase. A experiência kanban da intranet entra na próxima etapa.
        </p>
      </section>
    </main>
  );
}
