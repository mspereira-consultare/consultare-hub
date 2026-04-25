import { Stethoscope } from 'lucide-react';
import { getDbConnection } from '@consultare/core/db';
import { listPublishedIntranetSpecialties } from '@consultare/core/intranet/catalog';
import { CatalogIndexClient } from '../catalog-index-client';

export const dynamic = 'force-dynamic';

export default async function ConsultasPage() {
  const db = getDbConnection();
  const specialties = await listPublishedIntranetSpecialties(db, { limit: 200 });

  return (
    <div className="px-4 py-6 lg:px-8">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 p-5">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-[#17407E]">
            <Stethoscope size={24} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#229A8A]">Serviços</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Consultas</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Consulte especialidades publicadas e veja quais profissionais atendem cada uma.
          </p>
        </header>
        <CatalogIndexClient
          items={specialties.map((specialty) => ({
            id: specialty.id,
            title: specialty.displayName,
            href: `/servicos/consultas/${specialty.slug}`,
            summary: specialty.shortDescription,
            category: specialty.isFeatured ? 'Destaques' : 'Especialidades',
            badge: 'Especialidade',
          }))}
          categoryLabel="Todas as especialidades"
        />
      </section>
    </div>
  );
}
