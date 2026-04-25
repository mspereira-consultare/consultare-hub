'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { IntranetFaqCategoryWithItems } from '@consultare/core/intranet/repository';

type FaqClientProps = {
  categories: IntranetFaqCategoryWithItems[];
  initialQuery: string;
  initialCategoryId: string;
};

const clean = (value: unknown) => String(value ?? '').trim();
const answerText = (answer: Record<string, unknown>) => clean(answer.text || answer.body || answer);

export function FaqClient({ categories, initialQuery, initialCategoryId }: FaqClientProps) {
  const [query, setQuery] = useState(initialQuery);
  const [categoryId, setCategoryId] = useState(initialCategoryId || 'all');

  const visibleCategories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return categories
      .filter((category) => categoryId === 'all' || category.id === categoryId)
      .map((category) => ({
        ...category,
        items: category.items.filter((item) => {
          if (!normalizedQuery) return true;
          return `${item.question} ${answerText(item.answer)}`.toLowerCase().includes(normalizedQuery);
        }),
      }))
      .filter((category) => category.items.length > 0 || (!normalizedQuery && categoryId === 'all'));
  }, [categories, categoryId, query]);

  const totalItems = visibleCategories.reduce((total, category) => total + category.items.length, 0);

  return (
    <>
      <div className="grid gap-3 border-b border-slate-200 p-5 xl:grid-cols-[minmax(280px,1fr)_280px]">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por pergunta ou resposta"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 pl-9 text-sm text-slate-700 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <select
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100"
        >
          <option value="all">Todas as categorias</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
      </div>

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
    </>
  );
}
