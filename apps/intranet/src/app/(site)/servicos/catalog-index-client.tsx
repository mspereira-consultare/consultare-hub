'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

type CatalogCard = {
  id: string;
  title: string;
  href: string;
  summary: string | null;
  category: string | null;
  badge?: string | null;
};

type CatalogIndexClientProps = {
  items: CatalogCard[];
  categoryLabel?: string;
};

export function CatalogIndexClient({ items, categoryLabel = 'Todas as categorias' }: CatalogIndexClientProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const categories = useMemo(
    () => Array.from(new Set(items.map((item) => item.category).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [items]
  );
  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesCategory = category === 'all' || item.category === category;
      const matchesQuery = !normalizedQuery || `${item.title} ${item.summary || ''} ${item.badge || ''}`.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [category, items, query]);

  return (
    <>
      <div className="grid gap-3 border-b border-slate-200 p-5 xl:grid-cols-[minmax(280px,1fr)_280px]">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 pl-9 text-sm text-slate-700 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100"
        >
          <option value="all">{categoryLabel}</option>
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      <div className="p-5">
        <p className="mb-4 text-sm text-slate-500">{visibleItems.length} item(ns) encontrados</p>
        {visibleItems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <p className="font-semibold text-slate-800">Nenhum item encontrado</p>
            <p className="mt-1 text-sm text-slate-500">Tente buscar outro termo ou trocar o filtro.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleItems.map((item) => (
              <Link key={item.id} href={item.href} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#17407E]">
                {item.badge ? <p className="text-xs font-semibold uppercase tracking-wide text-[#229A8A]">{item.badge}</p> : null}
                <h2 className="mt-1 font-semibold text-slate-900">{item.title}</h2>
                {item.summary ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{item.summary}</p> : null}
                {item.category ? <p className="mt-4 text-xs text-slate-500">{item.category}</p> : null}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
