import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import {
  Bot,
  BookOpen,
  CircleHelp,
  ClipboardList,
  ExternalLink,
  FileText,
  Home,
  LayoutGrid,
  ListChecks,
  Megaphone,
  MessageCircle,
  Microscope,
  Search,
  ShieldCheck,
  Stethoscope,
  Users,
} from 'lucide-react';
import { getDbConnection } from '@consultare/core/db';
import { listPublishedNavigationNodes } from '@consultare/core/intranet/repository';
import { hasPermission } from '@consultare/core/permissions';
import { loadUserPermissionMatrix } from '@consultare/core/permissions-server';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import SignOutButton from './sign-out-button';

export const dynamic = 'force-dynamic';

const getUser = async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');
  return {
    id: String(session.user.id),
    name: String(session.user.name || session.user.email || 'Usuário'),
    email: String(session.user.email || ''),
    role: String(session.user.role || 'OPERADOR'),
    department: String(session.user.department || ''),
  };
};

type SidebarNavItem = {
  id: string;
  parentNodeId: string | null;
  nodeType: string;
  label: string;
  href: string | null;
  iconName: string | null;
};

type SidebarNavTreeNode = SidebarNavItem & {
  children: SidebarNavTreeNode[];
};

const FIXED_SERVICES_SECTION_ID = '__fixed_services__';
const FIXED_SYSTEM_SECTION_ID = '__fixed_system__';

const iconMap = {
  'file-text': FileText,
  home: Home,
  'book-open': BookOpen,
  megaphone: Megaphone,
  'list-checks': ListChecks,
  'layout-grid': LayoutGrid,
  users: Users,
  bot: Bot,
  'external-link': ExternalLink,
};

const buildSidebarTree = (items: SidebarNavItem[]) => {
  const byId = new Map<string, SidebarNavTreeNode>();
  const roots: SidebarNavTreeNode[] = [];

  for (const item of items) {
    byId.set(item.id, { ...item, children: [] });
  }

  for (const item of byId.values()) {
    if (item.parentNodeId && byId.has(item.parentNodeId)) {
      byId.get(item.parentNodeId)!.children.push(item);
    } else {
      roots.push(item);
    }
  }

  return roots;
};

const splitNavByFixedSections = (items: SidebarNavItem[]) => {
  const serviceIds = new Set([FIXED_SERVICES_SECTION_ID]);
  const systemIds = new Set([FIXED_SYSTEM_SECTION_ID]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const item of items) {
      if (item.parentNodeId && serviceIds.has(item.parentNodeId) && !serviceIds.has(item.id)) {
        serviceIds.add(item.id);
        changed = true;
      }
      if (item.parentNodeId && systemIds.has(item.parentNodeId) && !systemIds.has(item.id)) {
        systemIds.add(item.id);
        changed = true;
      }
    }
  }

  return {
    services: items.filter((item) => serviceIds.has(item.id)),
    system: items.filter((item) => systemIds.has(item.id)),
    regular: items.filter((item) => !serviceIds.has(item.id) && !systemIds.has(item.id)),
  };
};

const renderSidebarChildren = (nodes: SidebarNavTreeNode[]) => {
  if (!nodes.length) return null;
  return (
    <div className="ml-3 border-l border-slate-100 pl-2">
      {nodes.map((item) => <SidebarNavNode key={item.id} node={item} depth={1} />)}
    </div>
  );
};

const isExternalHref = (href: string) => /^https?:\/\//i.test(href) || href.startsWith('mailto:') || href.startsWith('tel:');

function SidebarNavNode({ node, depth = 0 }: { node: SidebarNavTreeNode; depth?: number }) {
  if (node.nodeType === 'label') {
    return (
      <div className={depth ? 'pt-2' : ''}>
        <div className="px-3 pb-1 pt-4 text-xs font-semibold uppercase text-slate-400">
          {node.label}
        </div>
        <div className={depth ? 'ml-3 border-l border-slate-100 pl-2' : ''}>
          {node.children.map((child) => <SidebarNavNode key={child.id} node={child} depth={depth + 1} />)}
        </div>
      </div>
    );
  }

  const href = node.href || '#';
  const Icon = iconMap[node.iconName as keyof typeof iconMap] || (node.nodeType === 'external_link' ? ExternalLink : FileText);
  const className = 'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-blue-50 hover:text-[#17407E]';

  if (isExternalHref(href)) {
    return (
      <a key={node.id} href={href} target="_blank" rel="noreferrer" className={className}>
        <Icon size={16} className="text-[#229A8A]" />
        <span className="truncate">{node.label}</span>
      </a>
    );
  }

  return (
    <Link key={node.id} href={href} className={className}>
      <Icon size={16} className="text-[#229A8A]" />
      <span className="truncate">{node.label}</span>
    </Link>
  );
}

export default async function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getUser();
  const db = getDbConnection();
  const [navItems, permissions] = await Promise.all([
    listPublishedNavigationNodes(db, user),
    loadUserPermissionMatrix(db, user.id, user.role),
  ]);
  const canManageIntranet = hasPermission(permissions, 'intranet_dashboard', 'view', user.role);
  const splitNav = splitNavByFixedSections(navItems);
  const serviceNavTree = buildSidebarTree(splitNav.services);
  const systemNavTree = buildSidebarTree(splitNav.system);
  const navTree = buildSidebarTree(splitNav.regular);

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
          <div className="border-b border-slate-200 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#229A8A]">Consultare</p>
            <Link href="/" className="mt-1 block text-2xl font-semibold text-[#053F74]">
              Intranet
            </Link>
          </div>

          <nav className="flex-1 overflow-y-auto p-3">
            <Link
              href="/"
              className="mb-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-blue-50 hover:text-[#17407E]"
            >
              <Home size={17} />
              Home
            </Link>
            <Link
              href="/faq"
              className="mb-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-blue-50 hover:text-[#17407E]"
            >
              <CircleHelp size={17} />
              FAQ
            </Link>
            <div className="px-3 pb-1 pt-4 text-xs font-semibold uppercase text-slate-400">
              Serviços
            </div>
            <Link
              href="/servicos/consultas"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-blue-50 hover:text-[#17407E]"
            >
              <Stethoscope size={17} className="text-[#229A8A]" />
              Consultas
            </Link>
            <Link
              href="/servicos/procedimentos"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-blue-50 hover:text-[#17407E]"
            >
              <ClipboardList size={17} className="text-[#229A8A]" />
              Procedimentos
            </Link>
            <Link
              href="/servicos/exames"
              className="mb-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-blue-50 hover:text-[#17407E]"
            >
              <Microscope size={17} className="text-[#229A8A]" />
              Exames
            </Link>
            {renderSidebarChildren(serviceNavTree)}
            {navTree.map((item) => <SidebarNavNode key={item.id} node={item} />)}
            {canManageIntranet || systemNavTree.length ? (
              <>
                <div className="px-3 pb-1 pt-4 text-xs font-semibold uppercase text-slate-400">
                  Sistema
                </div>
                {canManageIntranet ? (
                  <Link
                    href="/gestao"
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-blue-50 hover:text-[#17407E]"
                  >
                    <ShieldCheck size={17} />
                    Gestão da Intranet
                  </Link>
                ) : null}
                {renderSidebarChildren(systemNavTree)}
              </>
            ) : null}
          </nav>

          <div className="border-t border-slate-200 p-4">
            <p className="truncate text-sm font-semibold text-slate-800">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
            <SignOutButton />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:px-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="lg:hidden">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#229A8A]">Consultare</p>
                <Link href="/" className="text-xl font-semibold text-[#053F74]">
                  Intranet
                </Link>
              </div>

              <form action="/busca" className="flex w-full max-w-xl items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <Search size={17} className="text-slate-400" />
                <input
                  name="q"
                  placeholder="Buscar na intranet"
                  className="w-full bg-transparent text-sm outline-none"
                />
              </form>

              <div className="flex items-center gap-2">
                <Link
                  href="/ia"
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-[#17407E] transition hover:bg-blue-50"
                  aria-label="IA Consultare"
                >
                  <Bot size={18} />
                </Link>
                <Link
                  href="/chat"
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-[#17407E] transition hover:bg-blue-50"
                  aria-label="Chat interno"
                >
                  <MessageCircle size={18} />
                </Link>
              </div>
            </div>
          </header>

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}
