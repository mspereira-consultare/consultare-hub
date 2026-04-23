import Link from 'next/link';
import { notFound } from 'next/navigation';
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

const modules = {
  navegacao: {
    title: 'Navegação',
    description: 'Estrutura do menu, hierarquia, links externos e visibilidade.',
    icon: Navigation,
  },
  paginas: {
    title: 'Páginas',
    description: 'CMS de páginas dinâmicas, blocos, revisões e publicação.',
    icon: FileText,
  },
  noticias: {
    title: 'Notícias e Avisos',
    description: 'Conteúdos de comunicação interna exibidos na intranet.',
    icon: Newspaper,
  },
  faq: {
    title: 'FAQ',
    description: 'Perguntas frequentes, categorias, ordem e audiências.',
    icon: CircleHelp,
  },
  catalogo: {
    title: 'Catálogo',
    description: 'Curadoria editorial de profissionais, procedimentos, exames e valores publicados.',
    icon: Stethoscope,
  },
  audiencias: {
    title: 'Audiências',
    description: 'Grupos usados para controlar quem enxerga páginas, documentos e canais.',
    icon: Users,
  },
  escopos: {
    title: 'Escopos Editoriais',
    description: 'Governança de quem pode editar cada área da intranet.',
    icon: ShieldCheck,
  },
  chat: {
    title: 'Chat Interno',
    description: 'Administração de canais, moderação e comunicação interna.',
    icon: MessageCircle,
  },
  chatbot: {
    title: 'Chatbot e Conhecimento',
    description: 'Fontes, indexação, perguntas sem resposta e auditoria de conversas.',
    icon: Bot,
  },
} as const;

type Params = {
  module: keyof typeof modules;
};

export default function IntranetAdminModulePage({ params }: { params: Params }) {
  const moduleConfig = modules[params.module];
  if (!moduleConfig) notFound();

  const Icon = moduleConfig.icon;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/intranet" className="text-sm font-medium text-[#17407E] hover:underline">
          Voltar para Intranet
        </Link>

        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md bg-blue-50 text-[#17407E]">
            <Icon size={24} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Módulo em preparação</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">{moduleConfig.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{moduleConfig.description}</p>
          <div className="mt-6 rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
            Este espaço foi criado na fundação técnica para receber as telas administrativas das próximas fases.
          </div>
        </section>
      </div>
    </main>
  );
}
