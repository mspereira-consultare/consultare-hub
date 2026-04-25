/* eslint-disable @next/next/no-img-element -- CMS images come from dynamic private asset URLs. */
import Link from 'next/link';
import {
  AlertCircle,
  Bot,
  Download,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  Phone,
  Stethoscope,
} from 'lucide-react';
import { getDbConnection } from '@consultare/core/db';
import {
  listIntranetProfessionals,
  listIntranetProcedures,
  listIntranetQmsDocuments,
} from '@consultare/core/intranet/catalog';
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
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const blockData = (block: IntranetBlock) => asObject(block.data || block);

function RichTextBlock({ data }: { data: Record<string, unknown> }) {
  const title = clean(data.title);
  const html = clean(data.body_html);
  const body = clean(data.body || data.body_text);
  const imageUrl = clean(data.image_url || data.imageUrl);
  const imageAlt = clean(data.image_alt || data.imageAlt) || title || 'Imagem da página';
  const imagePosition = clean(data.image_position || data.imagePosition) || 'above';
  const image = imageUrl ? (
    <img src={imageUrl} alt={imageAlt} className="h-auto w-full rounded-lg border border-slate-200 object-cover" />
  ) : null;
  const text = html ? (
    <div
      className="prose prose-slate max-w-none text-sm leading-7"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  ) : (
    <p className="whitespace-pre-line text-sm leading-7 text-slate-700">{body}</p>
  );

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      {title ? <h2 className="mb-3 text-xl font-semibold text-slate-900">{title}</h2> : null}
      {image && imagePosition === 'side' ? (
        <div className="grid gap-5 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:items-start">
          {image}
          {text}
        </div>
      ) : (
        <>
          {image ? <div className="mb-4">{image}</div> : null}
          {text}
        </>
      )}
    </section>
  );
}

function CalloutBlock({ data }: { data: Record<string, unknown> }) {
  const title = clean(data.title);
  const body = clean(data.body);
  const severity = clean(data.severity) || 'info';
  const styles: Record<string, { section: string; icon: string; label: string }> = {
    info: { section: 'border-blue-200 bg-blue-50 text-slate-800', icon: 'text-[#17407E]', label: 'Informativo' },
    success: { section: 'border-emerald-200 bg-emerald-50 text-slate-800', icon: 'text-emerald-700', label: 'Orientação' },
    warning: { section: 'border-amber-200 bg-amber-50 text-slate-900', icon: 'text-amber-700', label: 'Atenção' },
    danger: { section: 'border-rose-200 bg-rose-50 text-slate-900', icon: 'text-rose-700', label: 'Crítico' },
  };
  const style = styles[severity] || styles.info;
  return (
    <section className={`rounded-lg border p-5 ${style.section}`}>
      <div className="flex gap-3">
        <AlertCircle className={`mt-0.5 ${style.icon}`} size={20} />
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-75">{style.label}</div>
          {title ? <h2 className="font-semibold">{title}</h2> : null}
          {body ? <p className="mt-1 text-sm leading-6">{body}</p> : null}
        </div>
      </div>
    </section>
  );
}

function ImageBlock({ data }: { data: Record<string, unknown> }) {
  const title = clean(data.title);
  const imageUrl = clean(data.image_url || data.imageUrl || data.url);
  const imageAlt = clean(data.image_alt || data.imageAlt) || title || 'Imagem da página';
  const caption = clean(data.caption);
  if (!imageUrl) {
    return <PlaceholderBlock title={title || 'Imagem'} description="Imagem ainda não selecionada." />;
  }

  return (
    <figure className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      {title ? <h2 className="mb-3 text-lg font-semibold text-slate-900">{title}</h2> : null}
      <img src={imageUrl} alt={imageAlt} className="h-auto w-full rounded-lg object-cover" />
      {caption ? <figcaption className="mt-2 text-xs leading-5 text-slate-500">{caption}</figcaption> : null}
    </figure>
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
  const title = clean(data.title) || 'Notícias e avisos';
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

async function QmsDocumentsBlock({ data }: { data: Record<string, unknown> }) {
  const db = getDbConnection();
  const title = clean(data.title) || 'POPs e manuais';
  const documents = await listIntranetQmsDocuments(db, {
    sector: clean(data.sector),
    status: clean(data.status_filter || data.status),
    featuredOnly: data.featured_only === true || data.featured_only === '1',
    limit: Number(data.limit || 8),
  });

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {documents.length === 0 ? <p className="text-sm text-slate-500">Nenhum documento QMS publicado para este bloco.</p> : null}
        {documents.map((document) => (
          <article key={document.id} className="rounded-md border border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase text-[#229A8A]">{document.code || document.sector}</p>
            <h3 className="mt-1 font-semibold text-slate-900">{document.name}</h3>
            <p className="mt-1 text-xs text-slate-500">{[document.sector, document.versionLabel, document.status].filter(Boolean).join(' · ')}</p>
            {document.objective ? <p className="mt-2 text-sm leading-6 text-slate-600">{document.objective}</p> : null}
            {document.fileUrl ? (
              <Link
                href={document.fileUrl}
                className="mt-4 inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-[#17407E]"
              >
                <Download size={14} />
                Baixar arquivo
              </Link>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

async function ProfessionalCatalogBlock({ data }: { data: Record<string, unknown> }) {
  const db = getDbConnection();
  const title = clean(data.title) || 'Portfólio de profissionais';
  const professionals = await listIntranetProfessionals(db, {
    specialties: asArray(data.specialties).map(clean).filter(Boolean),
    featuredOnly: data.featured_only === true || data.featured_only === '1',
    limit: Number(data.limit || 9),
  });

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-slate-900">{title}</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {professionals.length === 0 ? <p className="text-sm text-slate-500">Nenhum profissional publicado para este bloco.</p> : null}
        {professionals.map((professional) => (
          <article key={professional.professionalId} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-[#17407E]">
              <Stethoscope size={19} />
            </div>
            <h3 className="font-semibold text-slate-900">{professional.displayName}</h3>
            {professional.cardHighlight ? <p className="mt-1 text-sm font-medium text-[#229A8A]">{professional.cardHighlight}</p> : null}
            {professional.shortBio ? <p className="mt-2 text-sm leading-6 text-slate-600">{professional.shortBio}</p> : null}
            {professional.specialties.length ? <p className="mt-3 text-xs text-slate-500">{professional.specialties.join(' · ')}</p> : null}
            {professional.serviceUnits.length ? <p className="mt-1 text-xs text-slate-500">{professional.serviceUnits.join(' · ')}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

async function ProcedureCatalogBlock({ data }: { data: Record<string, unknown> }) {
  const db = getDbConnection();
  const title = clean(data.title) || 'Procedimentos e exames';
  const showPrices = data.show_prices !== false && data.show_prices !== '0';
  const procedures = await listIntranetProcedures(db, {
    categories: asArray(data.categories).map(clean).filter(Boolean),
    featuredOnly: data.featured_only === true || data.featured_only === '1',
    limit: Number(data.limit || 10),
  });

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-4 divide-y divide-slate-100">
        {procedures.length === 0 ? <p className="text-sm text-slate-500">Nenhum procedimento publicado para este bloco.</p> : null}
        {procedures.map((procedure) => (
          <article key={procedure.procedimentoId} className="py-4 first:pt-0 last:pb-0">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-[#229A8A]">{[procedure.category, procedure.subcategory].filter(Boolean).join(' · ') || 'Catálogo'}</p>
                <h3 className="mt-1 font-semibold text-slate-900">{procedure.displayName}</h3>
              </div>
              {showPrices && procedure.showPrice && procedure.publishedPrice !== null ? (
                <p className="text-sm font-semibold text-[#17407E]">{money.format(procedure.publishedPrice)}</p>
              ) : null}
            </div>
            {procedure.summary ? <p className="mt-2 text-sm leading-6 text-slate-600">{procedure.summary}</p> : null}
            {procedure.preparationInstructions ? (
              <p className="mt-2 text-xs leading-5 text-slate-500">Preparo: {procedure.preparationInstructions}</p>
            ) : null}
          </article>
        ))}
      </div>
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
        title="Página sem blocos publicados"
        description="O conteúdo desta página será exibido aqui quando for publicado pelo painel."
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
          case 'image':
            return <ImageBlock key={key} data={data} />;
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
            return <PlaceholderBlock key={key} title={clean(data.title) || 'Arquivos'} description="Lista de arquivos será conectada aos assets da intranet." />;
          case 'professional_catalog':
            return <ProfessionalCatalogBlock key={key} data={data} />;
          case 'procedure_catalog':
            return <ProcedureCatalogBlock key={key} data={data} />;
          case 'qms_documents':
            return <QmsDocumentsBlock key={key} data={data} />;
          default:
            return <PlaceholderBlock key={key} title="Bloco não suportado" description={`Tipo recebido: ${block.type}`} />;
        }
      }))}
    </div>
  );
}
