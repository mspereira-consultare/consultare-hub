import { notFound } from 'next/navigation';
import { LayoutGrid } from 'lucide-react';
import { requireTaskGovernanceAccess } from '@/lib/tasks/auth';

export const dynamic = 'force-dynamic';

export default async function ExecutiveTasksPage() {
  const auth = await requireTaskGovernanceAccess('view');
  if (!auth.ok) notFound();

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 text-[#17407E]">
            <LayoutGrid size={24} />
            <span className="text-xs font-semibold uppercase tracking-wide">Governança</span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-slate-900">Tarefas globais</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            O acesso gerencial global e os endpoints administrativos desta área já estão habilitados. A visão completa em kanban e lista entra na fase visual do módulo.
          </p>
        </section>
      </div>
    </main>
  );
}
