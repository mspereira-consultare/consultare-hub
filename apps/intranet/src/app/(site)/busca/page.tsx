import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { Search } from 'lucide-react';
import { getDbConnection } from '@consultare/core/db';
import { searchIntranet } from '@consultare/core/intranet/repository';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await getServerSession(authOptions);
  const { q = '' } = await searchParams;
  const db = getDbConnection();
  const results = await searchIntranet(db, q, {
    id: String(session?.user?.id || ''),
    role: String(session?.user?.role || 'OPERADOR'),
    department: String(session?.user?.department || ''),
  });

  return (
    <div className="px-4 py-6 lg:px-8">
      <header className="mb-6 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3 text-[#17407E]">
          <Search size={22} />
          <p className="text-xs font-semibold uppercase tracking-wide text-[#229A8A]">Busca</p>
        </div>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Buscar na intranet</h1>
      </header>

      <form className="mb-6 flex max-w-2xl gap-2" action="/busca">
        <input
          name="q"
          defaultValue={q}
          placeholder="Digite pelo menos 2 caracteres"
          className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100"
        />
        <button className="rounded-md bg-[#17407E] px-4 py-2.5 text-sm font-semibold text-white" type="submit">
          Buscar
        </button>
      </form>

      <section className="space-y-3">
        {q && results.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
            Nenhum resultado encontrado.
          </div>
        ) : null}

        {!q ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
            Use a busca para encontrar páginas, notícias e perguntas frequentes.
          </div>
        ) : null}

        {results.map((result) => (
          <Link key={`${result.entityType}-${result.id}`} href={result.url} className="block rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#17407E]">
            <p className="text-xs font-semibold uppercase text-[#229A8A]">{result.entityType}</p>
            <h2 className="mt-1 font-semibold text-slate-900">{result.title}</h2>
            {result.summary ? <p className="mt-1 text-sm leading-6 text-slate-600">{result.summary}</p> : null}
          </Link>
        ))}
      </section>
    </div>
  );
}
