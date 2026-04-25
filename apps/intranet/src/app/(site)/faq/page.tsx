import { getServerSession } from 'next-auth';
import { CircleHelp, Search } from 'lucide-react';
import { getDbConnection } from '@consultare/core/db';
import { listPublishedFaqCategoriesWithItems } from '@consultare/core/intranet/repository';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

const clean = (value: unknown) => String(value ?? '').trim();

const answerText = (answer: Record<string, unknown>) => clean(answer.text || answer.body || answer);

export default async function FaqPage({ searchParams }: { searchParams: Promise<{ q?: string; categoryId?: string }> }) {
  const session = await getServerSession(authOptions);
  const { q = '', categoryId = 'all' } = await searchParams;
  const user = {
    id: String(session?.user?.id || ''),
    role: String(session?.user?.role || 'OPERADOR'),
    department: String(session?.user?.department || ''),
  };
  const db = getDbConnection();
  const selectedCategoryId = categoryId === 'all' ? '' : categoryId;
  const [allCategories, visibleCategories] = await Promise.all([
    listPublishedFaqCategoriesWithItems(db, user),
    listPublishedFaqCategoriesWithItems(db, user, q, selectedCategoryId),
  ]);
  const totalItems = visibleCategories.reduce((total, category) => total + category.items.length, 0);

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

        <form className="grid gap-3 border-b border-slate-200 p-5 xl:grid-cols-[minmax(280px,1fr)_280px_auto]" action="/faq">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar por pergunta ou resposta"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 pl-9 text-sm text-slate-700 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <select
            name="categoryId"
            defaultValue={categoryId || 'all'}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100"
          >
            <option value="all">Todas as categorias</option>
            {allCategories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
          <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#17407E] px-4 text-sm font-semibold text-white transition hover:bg-[#123463]">
            <Search size={16} />
            Buscar
          </button>
        </form>

        <div className="p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Perguntas frequentes</h2>
              <p className="text-sm text-slate-500">{totalItems} pergunta(s) encontradas</p>
            </div>
          </div>

          {totalItems === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <p className="font-semibold text-slate-800">Nenhuma pergunta encontrada</p>
              <p className="mt-1 text-sm text-slate-500">Tente buscar outro termo ou selecione outra categoria.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {visibleCategories.map((category) => (
                category.items.length > 0 ? (
                  <section key={category.id} className="rounded-lg border border-slate-200 bg-white">
                    <div className="border-b border-slate-200 p-4">
                      <h3 className="font-semibold text-slate-900">{category.name}</h3>
                      {category.description ? <p className="mt-1 text-sm leading-6 text-slate-600">{category.description}</p> : null}
                    </div>
                    <div className="divide-y divide-slate-100">
                      {category.items.map((item) => (
                        <details key={item.id} className="group p-4">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-slate-900">
                            <span>{item.question}</span>
                            <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-[#17407E] transition group-open:bg-slate-100 group-open:text-slate-600">
                              Abrir
                            </span>
                          </summary>
                          <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">
                            {answerText(item.answer)}
                          </p>
                        </details>
                      ))}
                    </div>
                  </section>
                ) : null
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
