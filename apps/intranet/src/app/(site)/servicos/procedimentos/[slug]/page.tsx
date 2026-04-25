import { notFound } from 'next/navigation';
import { getDbConnection } from '@consultare/core/db';
import { getPublishedIntranetProcedureBySlug } from '@consultare/core/intranet/catalog';
import { ProcedureDetail } from '../../procedure-detail';

export const dynamic = 'force-dynamic';

export default async function ProcedimentoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = getDbConnection();
  const item = await getPublishedIntranetProcedureBySlug(db, 'procedure', slug);
  if (!item) notFound();
  return <ProcedureDetail item={item} kind="procedure" />;
}
