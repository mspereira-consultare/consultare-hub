import { Bot } from 'lucide-react';
import { ChatbotClient } from './chatbot-client';

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
          Tire dúvidas com base nos conteúdos oficiais publicados da intranet. Quando a resposta não for confiável,
          a pergunta entra para revisão da equipe responsável.
        </p>
      </header>

      <ChatbotClient />
    </div>
  );
}

