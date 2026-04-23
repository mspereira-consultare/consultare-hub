import { getServerSession } from 'next-auth';
import { notFound } from 'next/navigation';
import { getDbConnection } from '@consultare/core/db';
import { getPublishedPageByPath } from '@consultare/core/intranet/repository';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { BlockRenderer } from '../blocks';

export const dynamic = 'force-dynamic';

type Params = {
  slug: string[];
};

export default async function DynamicIntranetPage({ params }: { params: Promise<Params> }) {
  const session = await getServerSession(authOptions);
  const { slug } = await params;
  const fullPath = slug.join('/');
  const db = getDbConnection();
  const page = await getPublishedPageByPath(db, fullPath, {
    id: String(session?.user?.id || ''),
    role: String(session?.user?.role || 'OPERADOR'),
    department: String(session?.user?.department || ''),
  });

  if (!page) notFound();

  return (
    <article className="px-4 py-6 lg:px-8">
      <header className="mb-6 border-b border-slate-200 pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#229A8A]">{page.pageType}</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">{page.title}</h1>
        {page.metaDescription ? <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{page.metaDescription}</p> : null}
      </header>
      <BlockRenderer blocks={page.content.blocks || []} />
    </article>
  );
}
