import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Bot, Home, MessageCircle, Search } from 'lucide-react';
import { getDbConnection } from '@consultare/core/db';
import { listPublishedNavigationNodes } from '@consultare/core/intranet/repository';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import SignOutButton from './sign-out-button';

export const dynamic = 'force-dynamic';

const getUser = async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');
  return {
    id: String(session.user.id),
    name: String(session.user.name || session.user.email || 'Usuario'),
    email: String(session.user.email || ''),
    role: String(session.user.role || 'OPERADOR'),
    department: String(session.user.department || ''),
  };
};

export default async function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getUser();
  const db = getDbConnection();
  const navItems = await listPublishedNavigationNodes(db, user);

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
            {navItems.map((item) => {
              if (!item.href) {
                return (
                  <div key={item.id} className="px-3 pb-1 pt-4 text-xs font-semibold uppercase text-slate-400">
                    {item.label}
                  </div>
                );
              }
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-blue-50 hover:text-[#17407E]"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#229A8A]" />
                  {item.label}
                </Link>
              );
            })}
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
