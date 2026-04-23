import { Bot, FileText, MessageCircle, Navigation, Search, ShieldCheck } from 'lucide-react';

const foundations = [
  { label: 'CMS e navegação', icon: Navigation },
  { label: 'Controle de acesso', icon: ShieldCheck },
  { label: 'Busca global', icon: Search },
  { label: 'Documentos e FAQ', icon: FileText },
  { label: 'Chatbot institucional', icon: Bot },
  { label: 'Chat interno', icon: MessageCircle },
];

export default function IntranetHomePage() {
  return (
    <main className="min-h-screen bg-[#f4f7fb] px-6 py-10">
      <section className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="border-b border-slate-200 pb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#229A8A]">Fundação técnica</p>
          <h1 className="mt-3 text-4xl font-semibold text-[#053F74]">Intranet Consultare</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
            Workspace inicial criado para receber o shell, autenticação, páginas dinâmicas,
            busca, chatbot e chat interno nas próximas fases do planejamento.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {foundations.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-[#17407E]">
                  <Icon size={20} />
                </div>
                <h2 className="text-base font-semibold text-slate-900">{item.label}</h2>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
