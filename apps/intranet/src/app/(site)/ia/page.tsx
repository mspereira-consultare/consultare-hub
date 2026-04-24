import Link from 'next/link';
import { Bot, Search, Sparkles } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function IntranetAiPage() {
  return (
    <div className="px-4 py-6 lg:px-8">
      <header className="mb-6 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3 text-[#17407E]">
          <Bot size={24} />
          <p className="text-xs font-semibold uppercase tracking-wide text-[#229A8A]">IA Consultare</p>
        </div>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Assistente institucional</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          O assistente será conectado aos conteúdos oficiais publicados na intranet na fase de chatbot.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-blue-50 text-[#17407E]">
            <Sparkles size={21} />
          </div>
          <h2 className="mt-5 text-xl font-semibold text-slate-900">Preparado para a próxima fase</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Esta tela já faz parte da navegação da intranet. A conversa com IA, fontes citadas e registro de perguntas
            sem resposta entram quando a base de conhecimento for conectada.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Enquanto isso</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Use a busca para encontrar páginas, notícias e perguntas frequentes já publicadas.
          </p>
          <Link
            href="/busca"
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-[#17407E] px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Search size={16} />
            Buscar na intranet
          </Link>
        </div>
      </section>
    </div>
  );
}
