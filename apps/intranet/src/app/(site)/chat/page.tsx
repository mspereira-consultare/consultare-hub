import { MessageCircle, Send } from 'lucide-react';

export const dynamic = 'force-dynamic';

const previewMessages = [
  {
    author: 'Sistema',
    body: 'O chat interno será habilitado em uma fase posterior do projeto.',
  },
  {
    author: 'Consultare',
    body: 'A estrutura da rota já está pronta para receber conversas e mensagens.',
  },
];

export default function IntranetChatPage() {
  return (
    <div className="px-4 py-6 lg:px-8">
      <header className="mb-6 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3 text-[#17407E]">
          <MessageCircle size={24} />
          <p className="text-xs font-semibold uppercase tracking-wide text-[#229A8A]">Chat interno</p>
        </div>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Conversas internas</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Área reservada para comunicação interna entre colaboradores e equipes.
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Canal inicial</h2>
          <p className="text-sm text-slate-500">Aguardando integração de conversas.</p>
        </div>

        <div className="space-y-3 p-5">
          {previewMessages.map((message) => (
            <article key={message.body} className="max-w-2xl rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-[#229A8A]">{message.author}</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{message.body}</p>
            </article>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-200 p-4">
          <input
            disabled
            placeholder="Mensagens serão habilitadas em fase futura"
            className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm text-slate-500 outline-none"
          />
          <button
            disabled
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-200 text-slate-500"
            aria-label="Enviar mensagem"
          >
            <Send size={16} />
          </button>
        </div>
      </section>
    </div>
  );
}
