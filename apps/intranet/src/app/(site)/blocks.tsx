import Link from 'next/link';
import { AlertCircle, Bot, ExternalLink, FileText, Link as LinkIcon, Phone } from 'lucide-react';
import { getDbConnection } from '@consultare/core/db';
import {
  listFaqItemsByCategoryIds,
  listRecentNewsPosts,
  type IntranetBlock,
  type IntranetFaqItem,
  type IntranetNewsPost,
} from '@consultare/core/intranet/repository';

const clean = (value: unknown) => String(value ?? '').trim();
const asObject = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const asArray = (value: unknown) => (Array.isArray(value) ? value : []);

const blockData = (block: IntranetBlock) => asObject(block.data || block);

function RichTextBlock({ data }: { data: Record<string, unknown> }) {
  const title = clean(data.title);
  const html = clean(data.body_html);
  const body = clean(data.body || data.body_text);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      {title ? <h2 className="mb-3 text-xl font-semibold text-slate-900">{title}</h2> : null}
      {html ? (
        <div
          className="prose prose-slate max-w-none text-sm leading-7"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <p className="whitespace-pre-line text-sm leading-7 text-slate-700">{body}</p>
      )}
    </section>
  );
}

function CalloutBlock({ data }: { data: Record<string, unknown> }) {
  const title = clean(data.title);
  const body = clean(data.body);
  return (
    <section className="rounded-lg border border-[#229A8A]/30 bg-emerald-50 p-5 text-slate-800">
      <div className="flex gap-3">
        <AlertCircle className="mt-0.5 text-[#229A8A]" size={20} />
        <div>
          {title ? <h2 className="font-semibold">{title}</h2> : null}
          {body ? <p className="mt-1 text-sm leading-6">{body}</p> : null}
        </div>
      </div>
    </section>
  );
}

function QuickLinksBlock({ data }: { data: Record<string, unknown> }) {
  const title = clean(data.title);
  const items = asArray(data.items);
  return (
    <section>
      {title ? <h2 className="mb-3 text-lg font-semibold text-slate-900">{title}</h2> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item, index) => {
          const link = asObject(item);
          const href = clean(link.url) || '#';
          return (
            <Link key={`${href}-${index}`} href={href} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#17407E]">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-[#17407E]">
                <LinkIcon size={17} />
              </div>
              <h3 className="font-semibold text-slate-900">{clean(link.label) || href}</h3>
              {clean(link.description) ? <p className="mt-1 text-sm leading-6 text-slate-600">{clean(link.description)}</p> : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

async function NewsFeedBlock({ data }: { data: Record<string, unknown> }) {
  const db = getDbConnection();
  const title = clean(data.title) || 'Noticias e avisos';
  const posts: IntranetNewsPost[] = await listRecentNewsPosts(db, Number(data.limit || 5));
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-4 divide-y divide-slate-100">
        {posts.length === 0 ? <p className="text-sm text-slate-500">Nenhum aviso publicado.</p> : null}
        {posts.map((post) => (
          <article key={post.id} className="py-3 first:pt-0 last:pb-0">
            <p className="text-xs font-semibold uppercase text-[#229A8A]">{post.postType}</p>
            <h3 className="mt-1 font-semibold text-slate-900">{post.title}</h3>
            {post.summary ? <p className="mt-1 text-sm leading-6 text-slate-600">{post.summary}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

async function FaqListBlock({ data }: { data: Record<string, unknown> }) {
  const db = getDbConnection();
  const title = clean(data.title) || 'Perguntas frequentes';
  const categoryIds = asArray(data.faq_category_ids).map(clean).filter(Boolean);
  const items: IntranetFaqItem[] = await listFaqItemsByCategoryIds(db, categoryIds);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? <p className="text-sm text-slate-500">Nenhuma pergunta publicada nesta categoria.</p> : null}
        {items.map((item) => (
          <details key={item.id} className="rounded-md border border-slate-200 p-4">
            <summary className="cursor-pointer font-medium text-slate-900">{item.question}</summary>
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">
              {clean(item.answer.text || item.answer.body || item.answer)}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

function TableBlock({ data }: { data: Record<string, unknown> }) {
  const title = clean(data.title);
  const columns = asArray(data.columns).map(clean);
  const rows = asArray(data.rows);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      {title ? <h2 className="mb-4 text-lg font-semibold text-slate-900">{title}</h2> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>{columns.map((column) => <th key={column} className="px-3 py-2">{column}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, rowIndex) => {
              const values = Array.isArray(row) ? row : columns.map((column) => asObject(row)[column]);
              return (
                <tr key={rowIndex}>
                  {values.map((value, cellIndex) => <td key={cellIndex} className="px-3 py-2 text-slate-700">{clean(value)}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ContactCardsBlock({ data }: { data: Record<string, unknown> }) {
  const title = clean(data.title);
  const contacts = asArray(data.contacts);
  return (
    <section>
      {title ? <h2 className="mb-3 text-lg font-semibold text-slate-900">{title}</h2> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {contacts.map((contact, index) => {
          const item = asObject(contact);
          return (
            <article key={index} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <Phone size={18} className="mb-3 text-[#17407E]" />
              <h3 className="font-semibold text-slate-900">{clean(item.name)}</h3>
              {clean(item.role) ? <p className="text-sm text-slate-500">{clean(item.role)}</p> : null}
              <div className="mt-3 space-y-1 text-sm text-slate-700">
                {clean(item.phone) ? <p>{clean(item.phone)}</p> : null}
                {clean(item.email) ? <p>{clean(item.email)}</p> : null}
                {clean(item.notes) ? <p className="text-slate-500">{clean(item.notes)}</p> : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PlaceholderBlock({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-slate-50 text-[#17407E]">
        <FileText size={18} />
      </div>
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 leading-6">{description}</p>
    </section>
  );
}

function ChatbotEntryBlock({ data }: { data: Record<string, unknown> }) {
  return (
    <section className="rounded-lg border border-[#17407E]/20 bg-[#17407E] p-6 text-white shadow-sm">
      <Bot size={24} />
      <h2 className="mt-4 text-xl font-semibold">{clean(data.title) || 'IA Consultare'}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-50">{clean(data.description) || 'Assistente institucional da intranet.'}</p>
      <Link href="/ia" className="mt-5 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#17407E]">
        Abrir assistente
        <ExternalLink size={15} />
      </Link>
    </section>
  );
}

export async function BlockRenderer({ blocks }: { blocks: IntranetBlock[] }) {
  if (!blocks.length) {
    return (
      <PlaceholderBlock
        title="Pagina sem blocos publicados"
        description="O conteudo desta pagina sera exibido aqui quando for publicado pelo painel."
      />
    );
  }

  return (
    <div className="space-y-5">
      {await Promise.all(blocks.map(async (block, index) => {
        const data = blockData(block);
        const key = `${block.type}-${index}`;
        switch (block.type) {
          case 'rich_text':
            return <RichTextBlock key={key} data={data} />;
          case 'callout':
            return <CalloutBlock key={key} data={data} />;
          case 'quick_links':
            return <QuickLinksBlock key={key} data={data} />;
          case 'news_feed':
            return <NewsFeedBlock key={key} data={data} />;
          case 'faq_list':
            return <FaqListBlock key={key} data={data} />;
          case 'table':
            return <TableBlock key={key} data={data} />;
          case 'contact_cards':
            return <ContactCardsBlock key={key} data={data} />;
          case 'chatbot_entry':
            return <ChatbotEntryBlock key={key} data={data} />;
          case 'file_list':
            return <PlaceholderBlock key={key} title={clean(data.title) || 'Arquivos'} description="Lista de arquivos sera conectada aos assets da intranet." />;
          case 'professional_catalog':
            return <PlaceholderBlock key={key} title={clean(data.title) || 'Profissionais'} description="Catalogo de profissionais sera conectado na fase de integracoes." />;
          case 'procedure_catalog':
            return <PlaceholderBlock key={key} title={clean(data.title) || 'Procedimentos e exames'} description="Catalogo de procedimentos sera conectado na fase de integracoes." />;
          case 'qms_documents':
            return <PlaceholderBlock key={key} title={clean(data.title) || 'POPs e manuais'} description="Documentos QMS serao conectados na fase de integracoes." />;
          default:
            return <PlaceholderBlock key={key} title="Bloco nao suportado" description={`Tipo recebido: ${block.type}`} />;
        }
      }))}
    </div>
  );
}
