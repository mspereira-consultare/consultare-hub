import { notFound } from 'next/navigation';
import { Stethoscope, Users } from 'lucide-react';
import { getDbConnection } from '@consultare/core/db';
import {
  getIntranetSpecialtyPage,
  getPublishedIntranetSpecialtyBySlug,
  listIntranetProfessionalProcedures,
  listIntranetProfessionalsBySpecialty,
  listIntranetProcedures,
  type IntranetProfessionalProfile,
  type IntranetProcedureProfile,
} from '@consultare/core/intranet/catalog';
import { BlockRenderer } from '../../../blocks';

/* eslint-disable @next/next/no-img-element -- Fotos dos profissionais vêm do endpoint autenticado de assets da intranet. */

export const dynamic = 'force-dynamic';

export default async function SpecialtyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = getDbConnection();
  const specialty = await getPublishedIntranetSpecialtyBySlug(db, slug);
  if (!specialty) notFound();
  const [specialtyPage, professionals, procedureLinks, catalogItems] = await Promise.all([
    getIntranetSpecialtyPage(db, specialty.id),
    listIntranetProfessionalsBySpecialty(db, specialty.id),
    listIntranetProfessionalProcedures(db),
    listIntranetProcedures(db, { limit: 500 }),
  ]);
  const publishedItemsById = new Map(catalogItems.filter((item) => item.isPublished).map((item) => [item.id, item]));
  const proceduresByProfessional = new Map<string, IntranetProcedureProfile[]>();
  for (const link of procedureLinks.filter((item) => item.isPublished)) {
    const item = publishedItemsById.get(link.itemId);
    if (!item) continue;
    const list = proceduresByProfessional.get(link.professionalId) || [];
    list.push(item);
    proceduresByProfessional.set(link.professionalId, list);
  }
  const blocks = Array.isArray(specialtyPage?.content?.blocks) ? specialtyPage.content.blocks : [];

  return (
    <div className="px-4 py-6 lg:px-8">
      <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 p-5">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-[#17407E]">
            <Stethoscope size={24} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#229A8A]">Consulta</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{specialty.displayName}</h1>
          {specialty.shortDescription ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{specialty.shortDescription}</p> : null}
        </header>

        <div className="space-y-8 p-5">
          {blocks.length ? (
            <BlockRenderer blocks={blocks} />
          ) : (
            <FallbackSpecialtyContent description={specialty.description} serviceGuidance={specialty.serviceGuidance} />
          )}

          <section>
            <div className="mb-5 flex items-center gap-2">
              <Users size={18} className="text-[#17407E]" />
              <h2 className="text-lg font-semibold text-slate-900">Profissionais que atendem</h2>
            </div>
            <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
              {professionals.length === 0 ? <p className="text-sm text-slate-500">Nenhum profissional publicado para esta especialidade.</p> : null}
              {professionals.map((professional) => (
                <ProfessionalCard key={professional.professionalId} professional={professional} procedures={proceduresByProfessional.get(professional.professionalId) || []} />
              ))}
            </div>
          </section>
        </div>
      </article>
    </div>
  );
}

function FallbackSpecialtyContent({ description, serviceGuidance }: { description: string | null; serviceGuidance: string | null }) {
  if (!description && !serviceGuidance) return null;
  return (
    <section className="space-y-5">
      {description ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-900">Sobre a especialidade</h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{description}</p>
        </div>
      ) : null}
      {serviceGuidance ? (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
          <h2 className="font-semibold text-[#17407E]">Orientações para atendimento</h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#17407E]">{serviceGuidance}</p>
        </div>
      ) : null}
    </section>
  );
}

function ProfessionalCard({ professional, procedures }: { professional: IntranetProfessionalProfile; procedures: IntranetProcedureProfile[] }) {
  const initials = professional.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('');
  const units = professional.serviceLocations.length ? professional.serviceLocations : professional.serviceUnits;
  const notes = professional.intranetNotesText || professional.contactNotes;
  const patientAge = professional.patientAgeText || formatAgeRange(professional.ageRange);
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="aspect-[4/3] overflow-hidden rounded-lg bg-blue-50">
        {professional.photoUrl ? (
          <img src={professional.photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-[#17407E]">{initials}</div>
        )}
      </div>
      <h3 className="mt-4 text-center text-xl font-semibold text-[#17407E]">{professional.displayName}</h3>
      <div className="mt-5 space-y-4 text-sm leading-6 text-slate-700">
        <InfoList title="Atendimento" items={professional.attendanceModes} />
        <InfoList title="Unidades que atende" items={units} />
        <InfoList title="Atende como" items={professional.specialties} />
        <InfoList title="Procedimentos que realiza" items={procedures.map((item) => item.displayName)} />
        <InfoValue title="Atende a partir de" value={patientAge} />
        <InfoValue title="Encaixes" value={professional.walkInPolicyText} />
        <InfoValue title="Consultório ideal" value={professional.idealRoomText} />
        <InfoValue title="Obs" value={notes} />
      </div>
    </article>
  );
}

function formatAgeRange(value: string | null) {
  const match = String(value || '').trim().match(/^(\d{1,3})-(\d{1,3})$/);
  if (!match) return null;
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min <= 0 && max >= 120) return 'Todas as idades';
  if (min <= 0) return `Até ${max} anos`;
  return `${min} anos`;
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  const cleanItems = items.map((item) => String(item || '').trim()).filter(Boolean);
  if (!cleanItems.length) return null;
  return (
    <div>
      <h4 className="font-semibold text-[#17407E]">{title}:</h4>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {cleanItems.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function InfoValue({ title, value }: { title: string; value: string | null }) {
  const text = String(value || '').trim();
  if (!text) return null;
  return (
    <div>
      <h4 className="font-semibold text-[#17407E]">{title}:</h4>
      <p className="mt-1 whitespace-pre-line">{text}</p>
    </div>
  );
}
