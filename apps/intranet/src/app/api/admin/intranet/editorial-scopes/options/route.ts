import { NextResponse } from 'next/server';
import {
  listIntranetProcedureProfiles,
  listPublishedIntranetSpecialties,
} from '@consultare/core/intranet/catalog';
import { requireIntranetPermission } from '@/lib/intranet/auth';
import {
  IntranetValidationError,
  listAudienceUserOptions,
  listFaqCategories,
  listPages,
} from '@/lib/intranet/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const newsCategories = [
  { value: 'category:geral', label: 'Categoria: Geral' },
  { value: 'category:rh', label: 'Categoria: RH' },
  { value: 'category:operacional', label: 'Categoria: Operacional' },
  { value: 'category:comunicado', label: 'Categoria: Comunicado' },
  { value: 'category:qualidade', label: 'Categoria: Qualidade' },
  { value: 'category:ti', label: 'Categoria: TI' },
  { value: 'category:eventos', label: 'Categoria: Eventos' },
  { value: 'type:news', label: 'Tipo: Notícia' },
  { value: 'type:notice', label: 'Tipo: Aviso' },
  { value: 'type:banner', label: 'Tipo: Banner' },
];

const errorResponse = (error: unknown, fallback: string) => {
  const status =
    error instanceof IntranetValidationError
      ? error.status
      : Number((error as { status?: number })?.status) || 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
};

export async function GET() {
  try {
    const auth = await requireIntranetPermission('intranet_escopos', 'view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const [users, pages, faqCategories, specialties, catalogItems] = await Promise.all([
      listAudienceUserOptions(auth.db),
      listPages(auth.db, { status: 'all', search: '' }),
      listFaqCategories(auth.db),
      listPublishedIntranetSpecialties(auth.db, { limit: 300 }),
      listIntranetProcedureProfiles(auth.db, { limit: 300 }),
    ]);

    return NextResponse.json({
      status: 'success',
      data: {
        users,
        refs: {
          section: pages
            .filter((page) => page.status !== 'archived')
            .map((page) => ({ value: `page:${page.id}`, label: `${page.title} (/${page.fullPath})` })),
          faq: faqCategories.map((category) => ({ value: `category:${category.id}`, label: `Categoria: ${category.name}` })),
          news: newsCategories,
          catalog: [
            ...specialties.map((specialty) => ({ value: `specialty:${specialty.slug}`, label: `Especialidade: ${specialty.displayName}` })),
            ...catalogItems.map((item) => ({ value: `item:${item.id}`, label: `${item.catalogType === 'exam' ? 'Exame' : 'Procedimento'}: ${item.displayName}` })),
          ],
        },
      },
    });
  } catch (error: unknown) {
    console.error('Erro ao listar opções de escopos editoriais:', error);
    return errorResponse(error, 'Erro interno ao listar opções de escopos editoriais.');
  }
}
