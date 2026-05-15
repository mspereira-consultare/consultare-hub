import { notFound } from 'next/navigation';
import { Bot } from 'lucide-react';
import { requireIntranetChatbotAdminAccess } from '@/lib/intranet/chatbot-auth';
import { ChatbotAdminClient } from './chatbot-admin-client';

export const dynamic = 'force-dynamic';

export default async function IntranetChatbotAdminPage() {
  const auth = await requireIntranetChatbotAdminAccess('view');
  if (!auth.ok) notFound();

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 border-b border-slate-200 pb-6">
          <div className="flex items-center gap-3 text-[#17407E]">
            <Bot size={24} />
            <span className="text-xs font-semibold uppercase tracking-wide">Intranet</span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Chatbot e base de conhecimento</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
            Gerencie fontes indexáveis, documentos manuais, reindexação e perguntas sem resposta do assistente
            institucional da intranet.
          </p>
        </header>

        <ChatbotAdminClient />
      </div>
    </main>
  );
}

