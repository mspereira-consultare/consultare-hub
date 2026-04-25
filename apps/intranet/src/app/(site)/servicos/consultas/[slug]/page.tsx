import { notFound } from 'next/navigation';
import { Stethoscope, Users } from 'lucide-react';
import { getDbConnection } from '@consultare/core/db';
import { getPublishedIntranetSpecialtyBySlug, listIntranetProfessionalsBySpecialty } from '@consultare/core/intranet/catalog';

export const dynamic = 'force-dynamic';

export default async function SpecialtyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = getDbConnection();
  const specialty = await getPublishedIntranetSpecialtyBySlug(db, slug);
  if (!specialty) notFound();
  const professionals = await listIntranetProfessionalsBySpecialty(db, specialty.id, { limit: 80 });

  return (
    <div className="px-4 py-6 lg:px-8">
      <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 p-5">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-[#17407E]">
            <Stethoscope size={24} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#229A8A]">Consulta</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{specialty.displayName}</h1>
          {specialty.shortDescription ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{specialty.shortDescription}</p> : null}
        </header>

        <div className="grid gap-6 p-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-5">
            {specialty.description ? (
              <div>
                <h2 className="font-semibold text-slate-900">Sobre a especialidade</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{specialty.description}</p>
              </div>
            ) : null}
            {specialty.serviceGuidance ? (
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                <h2 className="font-semibold text-[#17407E]">Orientações para atendimento</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#17407E]">{specialty.serviceGuidance}</p>
              </div>
            ) : null}
          </section>

          <aside>
            <div className="mb-4 flex items-center gap-2">
              <Users size={18} className="text-[#17407E]" />
              <h2 className="font-semibold text-slate-900">Profissionais que atendem</h2>
            </div>
            <div className="space-y-3">
              {professionals.length === 0 ? <p className="text-sm text-slate-500">Nenhum profissional publicado para esta especialidade.</p> : null}
              {professionals.map((professional) => (
                <article key={professional.professionalId} className="rounded-lg border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900">{professional.displayName}</h3>
                  {professional.cardHighlight ? <p className="mt-1 text-sm font-medium text-[#229A8A]">{professional.cardHighlight}</p> : null}
                  {professional.shortBio ? <p className="mt-2 text-sm leading-6 text-slate-600">{professional.shortBio}</p> : null}
                  {professional.serviceUnits.length ? <p className="mt-3 text-xs text-slate-500">{professional.serviceUnits.join(' · ')}</p> : null}
                  {professional.contactNotes ? <p className="mt-2 text-xs leading-5 text-slate-500">{professional.contactNotes}</p> : null}
                </article>
              ))}
            </div>
          </aside>
        </div>
      </article>
    </div>
  );
}
