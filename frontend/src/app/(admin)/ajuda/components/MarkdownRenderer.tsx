import React from 'react';
import Link from 'next/link';

import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { normalizeHelpHref } from '@/lib/help_docs';

type Props = {
  content: string;
  linkMap: Record<string, string>;
};

const cn = (...classes: Array<string | false | undefined | null>) =>
  classes.filter(Boolean).join(' ');

export default function MarkdownRenderer({ content, linkMap }: Props) {
  const components: Components = {
    h1({ className, ...props }) {
      return (
        <h1
          {...props}
          className={cn('mt-2 scroll-mt-24 text-2xl font-bold tracking-tight text-slate-900', className)}
        />
      );
    },
    h2({ className, ...props }) {
      return (
        <h2
          {...props}
          className={cn('mt-8 scroll-mt-24 text-xl font-semibold tracking-tight text-slate-900', className)}
        />
      );
    },
    h3({ className, ...props }) {
      return (
        <h3 {...props} className={cn('mt-6 scroll-mt-24 text-lg font-semibold text-slate-900', className)} />
      );
    },
    p({ className, ...props }) {
      return <p {...props} className={cn('mt-4 leading-7 text-slate-700', className)} />;
    },
    ul({ className, ...props }) {
      return <ul {...props} className={cn('mt-4 list-disc pl-6 text-slate-700 space-y-1', className)} />;
    },
    ol({ className, ...props }) {
      return <ol {...props} className={cn('mt-4 list-decimal pl-6 text-slate-700 space-y-1', className)} />;
    },
    blockquote({ className, ...props }) {
      return (
        <blockquote
          {...props}
          className={cn(
            'mt-4 rounded-r-lg border-l-4 border-consultare-teal bg-consultare-teal/5 px-4 py-3 text-slate-700',
            className
          )}
        />
      );
    },
    a({ href = '', className, children, ...props }) {
      const normalized = normalizeHelpHref(String(href), linkMap);

      // ✅ classes aqui continuam, mas o “forcer” do container garante contraste mesmo se houver CSS global
      const linkClass = cn(
        '!text-consultare-navy underline decoration-consultare-teal/40 hover:!text-consultare-teal hover:decoration-consultare-teal',
        className
      );

      if (normalized.startsWith('#')) {
        return (
          <a {...props} href={normalized} className={linkClass}>
            {children}
          </a>
        );
      }

      if (normalized.startsWith('/')) {
        return (
          <Link href={normalized} className={linkClass}>
            {children}
          </Link>
        );
      }

      return (
        <a
          {...props}
          href={normalized}
          target="_blank"
          rel="noreferrer noopener"
          className={linkClass}
        >
          {children}
        </a>
      );
    },
    code({ inline, className, children, ...props }) {
      const raw = String(children ?? '');

      if (inline) {
        return (
          <code
            {...props}
            className={cn(
              // ✅ força contraste no inline code
              '!text-slate-950 rounded-md border border-slate-200 !bg-slate-50 px-1.5 py-0.5 font-mono text-[0.85em]',
              className
            )}
          >
            {raw}
          </code>
        );
      }

      return (
        <code {...props} className={cn('block whitespace-pre overflow-x-auto font-mono text-sm !text-slate-100', className)}>
          {raw.replace(/\n$/, '')}
        </code>
      );
    },
    pre({ className, children, ...props }) {
      return (
        <pre
          {...props}
          className={cn('mt-4 overflow-x-auto rounded-lg !bg-slate-950 p-4 !text-slate-100 shadow-inner', className)}
        >
          {children}
        </pre>
      );
    },
    table({ className, ...props }) {
      return (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table {...props} className={cn('w-full border-collapse text-sm', className)} />
        </div>
      );
    },
    thead({ className, ...props }) {
      return <thead {...props} className={cn('bg-slate-50', className)} />;
    },
    th({ className, ...props }) {
      return (
        <th
          {...props}
          className={cn('border-b border-slate-200 px-3 py-2 text-left font-semibold !text-slate-900', className)}
        />
      );
    },
    td({ className, ...props }) {
      return (
        <td
          {...props}
          className={cn('border-b border-slate-200 px-3 py-2 align-top !text-slate-800', className)}
        />
      );
    },
  };

  return (
    <div
      className={cn(
        // ✅ “forcer” de contraste: vence CSS global do app
        'text-slate-900',

        // Links (inclui os autolinks tipo docs/arquivo.md)
        '[&_a]:!text-consultare-navy [&_a]:underline [&_a:hover]:!text-consultare-teal',

        // Inline code (inclui `YYYY-MM-DD`, `America/Sao_Paulo`, `system_status`, etc.)
        '[&_code]:!text-slate-950 [&_code]:border [&_code]:border-slate-200 [&_code]:rounded-md [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:!bg-slate-50',

        // Code dentro de PRE (não pode herdar bg/borda do inline)
        '[&_pre]:!bg-slate-950 [&_pre]:!text-slate-100 [&_pre_code]:!bg-transparent [&_pre_code]:border-0 [&_pre_code]:p-0 [&_pre_code]:!text-slate-100'
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
