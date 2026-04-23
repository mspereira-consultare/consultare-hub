import Link from 'next/link';
import {
  Bot,
  CircleHelp,
  FileText,
  LayoutDashboard,
  MessageCircle,
  Navigation,
  Newspaper,
  ShieldCheck,
  Stethoscope,
  Users,
} from 'lucide-react';

const modules = [
  { href: '/intranet/navegacao', label: 'Navegação', description: 'Estrutura do menu lateral da intranet.', icon: Navigation },
  { href: '/intranet/paginas', label: 'Páginas', description: 'CMS de páginas, blocos, versões e publicação.', icon: FileText },
  { href: '/intranet/noticias', label: 'Notícias e Avisos', description: 'Comunicados publicados na home e listas.', icon: Newspaper },
  { href: '/intranet/faq', label: 'FAQ', description: 'Perguntas frequentes por categoria e audiência.', icon: CircleHelp },
  { href: '/intranet/catalogo', label: 'Catálogo', description: 'Profissionais, procedimentos, exames e valores publicados.', icon: Stethoscope },
  { href: '/intranet/audiencias', label: 'Audiências', description: 'Grupos de visibilidade para páginas, arquivos e canais.', icon: Users },
  { href: '/intranet/escopos', label: 'Escopos Editoriais', description: 'Permissões de edição por área e gestor.', icon: ShieldCheck },
  { href: '/intranet/chat', label: 'Chat Interno', description: 'Canais, mensagens diretas e moderação.', icon: MessageCircle },
  { href: '/intranet/chatbot', label: 'Chatbot e Conhecimento', description: 'Fontes, indexação, auditoria e perguntas pendentes.', icon: Bot },
];

export default function IntranetAdminDashboardPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-2 border-b border-slate-200 pb-6">
          <div className="flex items-center gap-3 text-[#17407E]">
            <LayoutDashboard size={26} />
            <span className="text-xs font-semibold uppercase tracking-wide">Backoffice</span>
          </div>
          <h1 className="text-3xl font-semibold text-slate-900">Intranet Consultare</h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            Fundação administrativa criada para receber os módulos do CMS, governança, conhecimento,
            chatbot e chat interno nas próximas fases do projeto.
          </p>
        </div>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#17407E] hover:shadow-md"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-[#17407E]">
                  <Icon size={20} />
                </div>
                <h2 className="text-base font-semibold text-slate-900">{item.label}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}
