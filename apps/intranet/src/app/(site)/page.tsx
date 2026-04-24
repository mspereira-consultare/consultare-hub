import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { Bot, FileText, MessageCircle, Navigation, Search, ShieldCheck } from 'lucide-react';
import { getDbConnection } from '@consultare/core/db';
import { listPublishedNavigationNodes, listRecentNewsPosts } from '@consultare/core/intranet/repository';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

const cards = [
  { label: 'Buscar informações', href: '/busca', icon: Search },
  { label: 'IA Consultare', href: '/ia', icon: Bot },
  { label: 'Chat interno', href: '/chat', icon: MessageCircle },
  { label: 'POPs e documentos', href: '/qualidade', icon: FileText },
  { label: 'Areas internas', href: '/', icon: Navigation },
  { label: 'Acesso seguro', href: '/', icon: ShieldCheck },
];

export default async function IntranetHomePage() {
  const session = await getServerSession(authOptions);
  const user = {
    id: String(session?.user?.id || ''),
    role: String(session?.user?.role || 'OPERADOR'),
    department: String(session?.user?.department || ''),
  };
  const db = getDbConnection();
  const [navItems, newsPosts] = await Promise.all([
    listPublishedNavigationNodes(db, user),
    listRecentNewsPosts(db, 4),
  ]);

  return (
    <div className="px-4 py-6 lg:px-8">
      <section className="rounded-lg bg-[#053F74] p-6 text-white shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">Intranet Consultare</p>
        <h1 className="mt-3 text-3xl font-semibold">Referencia interna para o dia a dia</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-50">
          Acesse paginas, comunicados, documentos e ferramentas internas publicadas pela Consultare.
        </p>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.label} href={card.href} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#17407E]">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-[#17407E]">
                <Icon size={20} />
              </div>
              <h2 className="font-semibold text-slate-900">{card.label}</h2>
            </Link>
          );
        })}
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Navegação publicada</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {navItems.length === 0 ? <p className="text-sm text-slate-500">Nenhum item publicado ainda.</p> : null}
            {navItems.filter((item) => item.href).slice(0, 8).map((item) => (
              <Link key={item.id} href={item.href || '#'} className="rounded-md border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-blue-50 hover:text-[#17407E]">
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Notícias e avisos</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {newsPosts.length === 0 ? <p className="text-sm text-slate-500">Nenhum aviso publicado ainda.</p> : null}
            {newsPosts.map((post) => (
              <article key={post.id} className="py-3 first:pt-0 last:pb-0">
                <p className="text-xs font-semibold uppercase text-[#229A8A]">{post.postType}</p>
                <h3 className="mt-1 font-semibold text-slate-900">{post.title}</h3>
                {post.summary ? <p className="mt-1 text-sm leading-6 text-slate-600">{post.summary}</p> : null}
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
