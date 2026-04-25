import { ClipboardList } from 'lucide-react';
import { getDbConnection } from '@consultare/core/db';
import { listIntranetProcedures } from '@consultare/core/intranet/catalog';
import { CatalogIndexClient } from '../catalog-index-client';

export const dynamic = 'force-dynamic';

export default async function ProcedimentosPage() {
  const db = getDbConnection();
  const procedures = await listIntranetProcedures(db, { catalogTypes: ['procedure'], limit: 200 });

  return (
    <div className="px-4 py-6 lg:px-8">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 p-5">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-[#17407E]">
            <ClipboardList size={24} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#229A8A]">Serviços</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Procedimentos</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Informações padronizadas para orientar pacientes sobre procedimentos realizados ou encaminhados.
          </p>
        </header>
        <CatalogIndexClient
          items={procedures.map((item) => ({
            id: item.id,
            title: item.displayName,
            href: `/servicos/procedimentos/${item.slug}`,
            summary: item.summary,
            category: item.category || item.subcategory,
            badge: item.subcategory,
          }))}
        />
      </section>
    </div>
  );
}
