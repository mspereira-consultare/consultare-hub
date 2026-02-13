import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';

import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { buildHelpDocLinkMap, getHelpDocsConfig, loadHelpDocById } from '@/lib/help_docs';

import MarkdownRenderer from '../components/MarkdownRenderer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AjudaDocPage({ params }: { params: { docId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  const role = String((session.user as any)?.role || 'OPERADOR');
  const isAdmin = role === 'ADMIN';

  // ✅ Segurança real: se não-admin tentar acessar doc técnico direto, volta 404
  const doc = await loadHelpDocById(params.docId, isAdmin);
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
