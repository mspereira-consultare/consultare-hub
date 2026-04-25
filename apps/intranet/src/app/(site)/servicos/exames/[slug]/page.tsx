import { notFound } from 'next/navigation';
import { getDbConnection } from '@consultare/core/db';
import { getPublishedIntranetProcedureBySlug, listIntranetProfessionalsByCatalogItem } from '@consultare/core/intranet/catalog';
import { ProcedureDetail } from '../../procedure-detail';

export const dynamic = 'force-dynamic';

export default async function ExamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = getDbConnection();
  const item = await getPublishedIntranetProcedureBySlug(db, 'exam', slug);
  if (!item) notFound();
  const professionals = await listIntranetProfessionalsByCatalogItem(db, item.id);
  return <ProcedureDetail item={item} kind="exam" professionals={professionals} />;
}
