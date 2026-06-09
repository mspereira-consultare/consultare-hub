import type { ReactNode } from 'react';

import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { buildHelpDocLinkMap, listHelpDocs } from '@/lib/help_docs';
import { getDefaultLandingPath, hasPermission } from '@/lib/permissions';

import HelpShell from './components/HelpShell';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type SessionUserLike = {
  role?: string;
  permissions?: unknown;
};

export default async function AjudaLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  const sessionUser = session.user as SessionUserLike;
  const role = String(sessionUser?.role || 'OPERADOR');
  const permissions = sessionUser?.permissions;

  const allowed = hasPermission(permissions, 'ajuda', 'view', role);
  if (!allowed) redirect(getDefaultLandingPath(permissions, role));

  const isAdmin = role === 'ADMIN';
  const navItems = await listHelpDocs(isAdmin);
  const linkMap = buildHelpDocLinkMap(navItems);

  return (
    <HelpShell navItems={navItems} isAdmin={isAdmin} linkMap={linkMap}>
      {children}
    </HelpShell>
  );
}
