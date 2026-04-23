'use client';

import { signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';

export default function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
    >
      <LogOut size={16} />
      Sair
    </button>
  );
}
