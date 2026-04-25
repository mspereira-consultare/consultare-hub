/* eslint-disable @next/next/no-img-element -- Home cards render authenticated intranet asset URLs. */
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { Bot, FileText, Megaphone, MessageCircle, Navigation, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { getDbConnection } from '@consultare/core/db';
import { listPublishedNavigationNodes, listRecentNewsPosts } from '@consultare/core/intranet/repository';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

const cards = [
  { label: 'Buscar informações', href: '/busca', icon: Search },
  { label: 'IA Consultare', href: '/ia', icon: Bot },
  { label: 'Chat interno', href: '/chat', icon: MessageCircle },
  { label: 'POPs e documentos', href: '/qualidade', icon: FileText },
  { label: 'Áreas internas', href: '/', icon: Navigation },
  { label: 'Acesso seguro', href: '/', icon: ShieldCheck },
];

const newsCategoryLabels: Record<string, string> = {
  geral: 'Geral',
  rh: 'RH',
  operacional: 'Operacional',
  comunicado: 'Comunicado',
  qualidade: 'Qualidade',
  ti: 'TI',
  eventos: 'Eventos',
};

const newsTypeLabels: Record<string, string> = {
  news: 'Notícia',
  notice: 'Aviso',
  banner: 'Banner',
};

const highlightStyles: Record<string, { card: string; badge: string; visual: string; label: string }> = {
  info: {
    card: 'border-blue-100',
    badge: 'bg-blue-50 text-[#17407E] ring-blue-100',
    visual: 'bg-blue-50 text-[#17407E]',
    label: 'Informativo',
  },
  attention: {
    card: 'border-amber-200',
    badge: 'bg-amber-50 text-amber-700 ring-amber-100',
    visual: 'bg-amber-50 text-amber-700',
    label: 'Atenção',
  },
  important: {
    card: 'border-indigo-200',
    badge: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
    visual: 'bg-indigo-50 text-indigo-700',
    label: 'Importante',
  },
  urgent: {
    card: 'border-rose-200',
    badge: 'bg-rose-50 text-rose-700 ring-rose-100',
    visual: 'bg-rose-50 text-rose-700',
    label: 'Urgente',
  },
};

const coverUrl = (assetId: string | null | undefined) => assetId ? `/api/intranet/assets/${encodeURIComponent(assetId)}/download` : '';

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
        <h1 className="mt-3 text-3xl font-semibold">Referência interna para o dia a dia</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-50">
          Acesse páginas, comunicados, documentos e ferramentas internas publicadas pela Consultare.
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
          <div className="mt-4 grid gap-3">
            {newsPosts.length === 0 ? <p className="text-sm text-slate-500">Nenhum aviso publicado ainda.</p> : null}
            {newsPosts.map((post) => {
              const style = highlightStyles[post.highlightLevel] || highlightStyles.info;
              const imageUrl = coverUrl(post.coverAssetId);
              return (
                <article key={post.id} className={`overflow-hidden rounded-lg border bg-white shadow-sm ${style.card}`}>
                  <div className="grid gap-0 sm:grid-cols-[112px_minmax(0,1fr)]">
                    {imageUrl ? (
                      <img src={imageUrl} alt="" className="h-28 w-full object-cover sm:h-full" />
                    ) : (
                      <div className={`flex min-h-24 items-center justify-center ${style.visual}`}>
                        {post.isFeatured ? <Sparkles size={24} /> : <Megaphone size={24} />}
                      </div>
                    )}
                    <div className="p-4">
                      <div className="mb-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-slate-100">
                          {newsCategoryLabels[post.category] || 'Geral'}
                        </span>
                        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ${style.badge}`}>
                          {style.label}
                        </span>
                      </div>
                      <p className="text-xs font-semibold uppercase text-[#229A8A]">{newsTypeLabels[post.postType] || post.postType}</p>
                      <h3 className="mt-1 font-semibold text-slate-900">{post.title}</h3>
                      {post.summary ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{post.summary}</p> : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
