import Link from 'next/link';
import type { ElementType, ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

type AdminModuleShellProps = {
  icon: ElementType;
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  filters?: ReactNode;
  children: ReactNode;
};

export function AdminModuleShell({
  icon: Icon,
  eyebrow = 'Gestão da intranet',
  title,
  description,
  actions,
  filters,
  children,
}: AdminModuleShellProps) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-5 border-b border-slate-200 p-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-2xl">
              <Link href="/gestao" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-[#17407E]">
                <ArrowLeft size={16} />
                Voltar para Gestão
              </Link>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-[#17407E]">
                <Icon size={24} />
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#229A8A]">{eyebrow}</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-900">{title}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
            </div>
            {actions ? (
              <div className="flex flex-wrap items-center gap-2 xl:max-w-[760px] xl:justify-end xl:pt-20">
                {actions}
              </div>
            ) : null}
          </div>

          {filters ? <div className="border-b border-slate-200 p-5">{filters}</div> : null}

          {children}
        </div>
      </div>
    </main>
  );
}
