import type { ReactNode } from 'react';

import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { buildHelpDocLinkMap, listHelpDocs } from '@/lib/help_docs';
import { PAGE_DEFS, hasPermission } from '@/lib/permissions';

import HelpShell from './components/HelpShell';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const getFirstAllowedPage = (permissions: unknown, roleRaw: string) => {
  for (const page of PAGE_DEFS) {
    if (hasPermission(permissions, page.key, 'view', roleRaw)) return page.path;
  }
  return '/dashboard';
};

export default async function AjudaLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  const role = String((session.user as any)?.role || 'OPERADOR');
  const permissions = (session.user as any)?.permissions;

  const allowed = hasPermission(permissions, 'ajuda', 'view', role);
  if (!allowed) redirect(getFirstAllowedPage(permissions, role));

  const isAdmin = role === 'ADMIN';
  const navItems = await listHelpDocs(isAdmin);
  const linkMap = buildHelpDocLinkMap(navItems);

  return (
    <HelpShell navItems={navItems} isAdmin={isAdmin} linkMap={linkMap}>
      {children}
    </HelpShell>
  );
}
