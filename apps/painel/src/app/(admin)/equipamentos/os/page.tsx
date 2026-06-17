import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
const EQUIPMENT_WORK_ORDERS_SECTION_ID = 'ordens-servico';

type PageProps =
  | { searchParams?: Record<string, string | string[] | undefined> }
  | { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export default async function EquipmentWorkOrdersPage(props: PageProps) {
  const resolvedSearchParams = await Promise.resolve((props as { searchParams?: Record<string, string | string[] | undefined> }).searchParams);
  const readParam = (key: string) => {
    const value = resolvedSearchParams?.[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const params = new URLSearchParams();
  const osId = String(readParam('osId') || '').trim();
  const equipmentId = String(readParam('equipmentId') || '').trim();

  if (osId) params.set('osId', osId);
  if (equipmentId) params.set('equipmentId', equipmentId);

  const query = params.toString();
  redirect(`/equipamentos${query ? `?${query}` : ''}#${EQUIPMENT_WORK_ORDERS_SECTION_ID}`);
}
