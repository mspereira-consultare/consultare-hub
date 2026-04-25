import { notFound } from 'next/navigation';
import type { ElementType } from 'react';
import type { PageKey } from '@consultare/core/permissions';
import {
  Bot,
  CircleHelp,
  FileText,
  MessageCircle,
  Navigation,
  Newspaper,
  ShieldCheck,
  Stethoscope,
  Users,
} from 'lucide-react';
import { requireIntranetPermission } from '@/lib/intranet/auth';
import { AdminModuleShell } from '../admin-module-shell';
import { CatalogAdmin } from '../catalog-admin';
import { FaqAdmin } from '../faq-admin';
import { NavigationAdmin } from '../navigation-admin';
import { NewsAdmin } from '../news-admin';
import { PagesAdmin } from '../pages-admin';

const modules = {
  navegacao: {
    title: 'Navegação',
    description: 'Estrutura do menu, hierarquia, links externos e visibilidade.',
    icon: Navigation,
    pageKey: 'intranet_navegacao',
    endpoints: ['GET/POST /api/admin/intranet/navigation', 'PUT/DELETE /api/admin/intranet/navigation/[id]'],
  },
  paginas: {
    title: 'Páginas',
    description: 'CMS de páginas dinâmicas, blocos, revisões e publicação.',
    icon: FileText,
    pageKey: 'intranet_paginas',
    endpoints: ['GET/POST /api/admin/intranet/pages', 'GET/PUT/DELETE /api/admin/intranet/pages/[id]', 'GET/POST /api/admin/intranet/assets'],
  },
  noticias: {
    title: 'Notícias e Avisos',
    description: 'Conteúdos de comunicação interna exibidos na intranet.',
    icon: Newspaper,
    pageKey: 'intranet_noticias',
    endpoints: ['GET/POST /api/admin/intranet/news', 'GET/PUT/DELETE /api/admin/intranet/news/[id]'],
  },
  faq: {
    title: 'FAQ',
    description: 'Perguntas frequentes, categorias, ordem e audiências.',
    icon: CircleHelp,
    pageKey: 'intranet_faq',
    endpoints: [
      'GET /api/admin/intranet/faq',
      'GET/POST /api/admin/intranet/faq/categories',
      'PUT/DELETE /api/admin/intranet/faq/categories/[id]',
      'GET/POST /api/admin/intranet/faq/items',
      'GET/PUT/DELETE /api/admin/intranet/faq/items/[id]',
    ],
  },
  catalogo: {
    title: 'Catálogo',
    description: 'Curadoria editorial de profissionais, procedimentos, exames e valores publicados.',
    icon: Stethoscope,
    pageKey: 'intranet_catalogo',
    endpoints: [
      'GET/POST /api/admin/intranet/catalog/qms',
      'GET/POST /api/admin/intranet/catalog/professionals',
      'GET/POST /api/admin/intranet/catalog/procedures',
      'GET/POST /api/admin/intranet/catalog/professional-procedures',
    ],
  },
  audiencias: {
    title: 'Audiências',
    description: 'Grupos usados para controlar quem enxerga páginas, documentos e canais.',
    icon: Users,
    pageKey: 'intranet_audiencias',
    endpoints: ['GET/POST /api/admin/intranet/audiences', 'PUT/DELETE /api/admin/intranet/audiences/[id]'],
  },
  escopos: {
    title: 'Escopos Editoriais',
    description: 'Governança de quem pode editar cada área da intranet.',
    icon: ShieldCheck,
    pageKey: 'intranet_escopos',
    endpoints: ['GET/POST /api/admin/intranet/editorial-scopes', 'PUT/DELETE /api/admin/intranet/editorial-scopes/[id]'],
  },
  chat: {
    title: 'Chat Interno',
    description: 'Administração de canais, moderação e comunicação interna.',
    icon: MessageCircle,
    pageKey: 'intranet_chat',
    endpoints: ['Fase posterior: chat interno'],
  },
  chatbot: {
    title: 'Chatbot e Conhecimento',
    description: 'Fontes, indexação, perguntas sem resposta e auditoria de conversas.',
    icon: Bot,
    pageKey: 'intranet_chatbot',
    endpoints: ['Fase posterior: chatbot e base de conhecimento'],
  },
} as const satisfies Record<string, { title: string; description: string; icon: ElementType; pageKey: PageKey; endpoints: readonly string[] }>;

type Params = {
  module: keyof typeof modules;
};

export default async function IntranetAdminModulePage({ params }: { params: Promise<Params> }) {
  const { module } = await params;
  const moduleConfig = modules[module];
  if (!moduleConfig) notFound();

  const auth = await requireIntranetPermission(moduleConfig.pageKey, 'view');
  if (!auth.ok) notFound();
  const editAuth = await requireIntranetPermission(moduleConfig.pageKey, 'edit');

  if (module === 'paginas') {
    return <PagesAdmin canEdit={editAuth.ok} />;
  }

  if (module === 'navegacao') {
    return <NavigationAdmin canEdit={editAuth.ok} />;
  }

  if (module === 'noticias') {
    return <NewsAdmin canEdit={editAuth.ok} />;
  }

  if (module === 'faq') {
    return <FaqAdmin canEdit={editAuth.ok} />;
  }

  if (module === 'catalogo') {
    return <CatalogAdmin canEdit={editAuth.ok} />;
  }

  return (
    <AdminModuleShell
      icon={moduleConfig.icon}
      eyebrow="Módulo em preparação"
      title={moduleConfig.title}
      description={moduleConfig.description}
    >
      <section className="p-5">
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
          Este espaço foi criado na fundação técnica para receber as telas administrativas das próximas fases.
        </div>
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-slate-900">Base administrativa disponível</h2>
          <div className="mt-3 grid gap-2">
            {moduleConfig.endpoints.map((endpoint) => (
              <code
                key={endpoint}
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
              >
                {endpoint}
              </code>
            ))}
          </div>
        </div>
      </section>
    </AdminModuleShell>
  );
}
