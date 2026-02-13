"use client";

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';

import { Search, Shield, FileText, Clock } from 'lucide-react';
import type { HelpDocNavItem } from '@/lib/help_docs';

import { HelpProvider, useHelpContext } from './HelpContext';

const cn = (...classes: Array<string | false | undefined | null>) =>
  classes.filter(Boolean).join(' ');

type Props = {
  navItems: HelpDocNavItem[];
  isAdmin: boolean;
  linkMap: Record<string, string>; // reservado (futuro)
  children: React.ReactNode;
};

function AccessBadge({ category }: { category?: HelpDocNavItem['category'] }) {
  if (!category) return null;
  const isTech = category === 'tecnico';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold',
        isTech
          ? 'bg-consultare-navy/10 text-consultare-navy border border-consultare-navy/20'
          : 'bg-consultare-teal/10 text-consultare-teal border border-consultare-teal/20'
      )}
    >
      {isTech ? <Shield size={14} /> : <FileText size={14} />}
      {isTech ? 'Técnico' : 'Operacional'}
    </span>
  );
}

function HelpHeader({ activeDoc }: { activeDoc?: HelpDocNavItem }) {
  const { searchQuery, setSearchQuery } = useHelpContext();

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-base font-semibold text-slate-900 truncate max-w-[44ch]">
              {activeDoc?.title || 'Ajuda do Sistema'}
            </h1>
            <AccessBadge category={activeDoc?.category} />
          </div>

          {activeDoc?.description && (
            <p className="mt-1 text-sm text-slate-600">{activeDoc.description}</p>
          )}

          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            <Clock size={14} />
            <span>
              Última atualização: {activeDoc?.lastModified || '—'}
              {activeDoc?.exists === false ? ' (arquivo não encontrado)' : ''}
            </span>
          </div>
        </div>

        <div className="w-full sm:w-[360px]">
          <label className="sr-only" htmlFor="help-search">Buscar</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              id="help-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar documento (título, assunto...)"
              className="w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-consultare-teal/40"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function HelpSidebar({ navItems, isAdmin }: { navItems: HelpDocNavItem[]; isAdmin: boolean }) {
  const segment = useSelectedLayoutSegment();
  const { searchQuery } = useHelpContext();

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return navItems;
    return navItems.filter((doc) => {
      const hay = `${doc.title} ${doc.description} ${doc.id} ${doc.fileName}`.toLowerCase();
      return hay.includes(q);
    });
  }, [navItems, searchQuery]);

  const operacional = filtered.filter((d) => d.category === 'operacional');
  const tecnico = filtered.filter((d) => d.category === 'tecnico');

  const Item = ({ doc }: { doc: HelpDocNavItem }) => {
    const isActive = segment === doc.id;
    return (
      <Link
        href={`/ajuda/${doc.id}`}
        className={cn(
          'group flex flex-col gap-1 rounded-lg border px-3 py-2 transition',
          isActive
            ? 'border-consultare-teal/40 bg-consultare-teal/10'
            : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <span className={cn('text-sm font-medium', isActive ? 'text-consultare-navy' : 'text-slate-900')}>
            {doc.title}
          </span>
          {doc.category === 'tecnico'
            ? <Shield size={16} className="text-consultare-navy/70" />
            : <FileText size={16} className="text-consultare-teal/70" />
          }
        </div>
        <span className="text-xs text-slate-600 line-clamp-2">{doc.description}</span>
      </Link>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Índice</h2>
          <p className="mt-1 text-xs text-slate-500">Clique para abrir um documento.</p>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-700">Operacional</h3>
            <div className="space-y-1">
              {operacional.length
                ? operacional.map((doc) => <Item key={doc.id} doc={doc} />)
                : <p className="text-xs text-slate-500">Nenhum documento operacional encontrado.</p>
              }
            </div>
          </div>

          {isAdmin && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-700">Técnico (Admin)</h3>
              <div className="space-y-1">
                {tecnico.length
                  ? tecnico.map((doc) => <Item key={doc.id} doc={doc} />)
                  : <p className="text-xs text-slate-500">Nenhum documento técnico encontrado.</p>
                }
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 shadow-sm">
        <p>
          Dica: atualize qualquer arquivo em <code className="rounded bg-slate-100 px-1 py-0.5">/docs</code> e o conteúdo
          será refletido automaticamente na página.
        </p>
      </div>
    </div>
  );
}

function HelpShellInner({ navItems, isAdmin, children }: Omit<Props, 'linkMap'>) {
  const segment = useSelectedLayoutSegment();

  const activeDoc = useMemo(() => {
    if (!segment) return undefined;
    return navItems.find((d) => d.id === segment);
  }, [navItems, segment]);

  return (
    <div className="space-y-6">
      <HelpHeader activeDoc={activeDoc} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <HelpSidebar navItems={navItems} isAdmin={isAdmin} />
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

export default function HelpShell(props: Props) {
  const { navItems, isAdmin, children } = props;

  return (
    <HelpProvider>
      <HelpShellInner navItems={navItems} isAdmin={isAdmin}>
        {children}
      </HelpShellInner>
    </HelpProvider>
  );
}
