import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';

import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { buildHelpDocLinkMap, getHelpDocsConfig, loadHelpDocById } from '@/lib/help_docs';

import MarkdownRenderer from '../components/MarkdownRenderer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type PageProps =
  | { params: { docId: string } }
  | { params: Promise<{ docId: string }> };

export default async function AjudaDocPage(props: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  const role = String((session.user as any)?.role || 'OPERADOR');
  const isAdmin = role === 'ADMIN';

  // ✅ compatível com Next 14 (object) e Next 15 (Promise)
  const resolvedParams = await Promise.resolve((props as any).params);
  const raw = resolvedParams?.docId ?? resolvedParams?.docid ?? resolvedParams?.slug;
  const docId = Array.isArray(raw) ? raw[0] : String(raw || '').trim();

  if (!docId) notFound();

  const doc = await loadHelpDocById(decodeURIComponent(docId), isAdmin);

  // ✅ se docId não existe na whitelist OU é técnico e usuário não é admin
  if (!doc) notFound();

  const linkMap = buildHelpDocLinkMap(getHelpDocsConfig(isAdmin));

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="px-6 py-6">
        <MarkdownRenderer content={doc.content} linkMap={linkMap} />
      </div>
    </div>
  );
}
