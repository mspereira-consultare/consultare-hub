import { getServerSession } from 'next-auth';
import { CircleHelp } from 'lucide-react';
import { getDbConnection } from '@consultare/core/db';
import { listPublishedFaqCategoriesWithItems } from '@consultare/core/intranet/repository';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { FaqClient } from './faq-client';

export const dynamic = 'force-dynamic';

export default async function FaqPage({ searchParams }: { searchParams: Promise<{ q?: string; categoryId?: string }> }) {
  const session = await getServerSession(authOptions);
  const { q = '', categoryId = 'all' } = await searchParams;
  const user = {
    id: String(session?.user?.id || ''),
    role: String(session?.user?.role || 'OPERADOR'),
    department: String(session?.user?.department || ''),
  };
  const db = getDbConnection();
  const categories = await listPublishedFaqCategoriesWithItems(db, user);

  return (
    <div className="px-4 py-6 lg:px-8">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 p-5">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-[#17407E]">
            <CircleHelp size={24} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#229A8A]">Central de ajuda</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">FAQ</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Encontre respostas oficiais para dúvidas frequentes sobre rotinas, processos e ferramentas internas.
          </p>
        </header>

        <FaqClient categories={categories} initialQuery={q} initialCategoryId={categoryId || 'all'} />
      </section>
    </div>
  );
}
