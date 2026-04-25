/* eslint-disable @next/next/no-img-element -- Fotos vêm do endpoint autenticado de profissionais da intranet. */

import { Clock, DollarSign, Stethoscope, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { IntranetProcedureProfile, IntranetProfessionalProfile } from '@consultare/core/intranet/catalog';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function ProcedureDetail({ item, kind, professionals = [] }: { item: IntranetProcedureProfile; kind: 'procedure' | 'exam'; professionals?: IntranetProfessionalProfile[] }) {
  const eyebrow = kind === 'exam' ? 'Exame' : 'Procedimento';
  return (
    <div className="px-4 py-6 lg:px-8">
      <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#229A8A]">{eyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{item.displayName}</h1>
          {item.summary ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{item.summary}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {[item.category, item.subcategory].filter(Boolean).map((label) => (
              <span key={label} className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-100">{label}</span>
            ))}
            {kind === 'exam' ? (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${item.requiresPreparation ? 'bg-amber-50 text-amber-700 ring-amber-100' : 'bg-emerald-50 text-emerald-700 ring-emerald-100'}`}>
                {item.requiresPreparation ? 'Exige preparo' : 'Não exige preparo'}
              </span>
            ) : null}
          </div>
        </header>

        <div className="grid gap-6 p-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="space-y-5">
            <TextBlock title="Como funciona" text={item.howItWorks || item.description} />
            <TextBlock title="Orientações ao paciente" text={item.patientInstructions} />
            <TextBlock title="Preparo" text={item.preparationInstructions || (kind === 'exam' && !item.requiresPreparation ? 'Este exame não exige preparo específico.' : null)} highlighted={kind === 'exam'} />
            <TextBlock title="Contraindicações e atenção" text={item.contraindications} />
            <TextBlock title="Recuperação / após o atendimento" text={item.recoveryNotes} />
          </section>

          <aside className="space-y-3">
            {professionals.length ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <Users size={18} className="text-[#17407E]" />
                <h2 className="mt-3 font-semibold text-slate-900">Profissionais relacionados</h2>
                <div className="mt-3 space-y-3">
                  {professionals.map((professional) => (
                    <div key={professional.professionalId} className="flex gap-3 rounded-lg bg-white p-3 ring-1 ring-slate-100">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-blue-50 text-xs font-semibold text-[#17407E]">
                        {professional.photoUrl ? (
                          <img src={professional.photoUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          professional.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('')
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{professional.displayName}</p>
                        {professional.specialties.length ? <p className="mt-1 text-xs text-slate-500">{professional.specialties.join(' · ')}</p> : null}
                        {professional.contactNotes ? <p className="mt-1 text-xs leading-5 text-slate-500">{professional.contactNotes}</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {item.whoPerforms ? (
              <InfoCard icon={Stethoscope} title="Quem realiza" text={item.whoPerforms} />
            ) : null}
            {item.estimatedDurationText ? (
              <InfoCard icon={Clock} title="Duração / agenda" text={item.estimatedDurationText} />
            ) : null}
            {item.showPrice && item.publishedPrice !== null ? (
              <InfoCard icon={DollarSign} title="Preço publicado" text={money.format(item.publishedPrice)} />
            ) : null}
          </aside>
        </div>
      </article>
    </div>
  );
}

function TextBlock({ title, text, highlighted = false }: { title: string; text: string | null; highlighted?: boolean }) {
  if (!text) return null;
  return (
    <section className={highlighted ? 'rounded-lg border border-blue-100 bg-blue-50 p-4' : ''}>
      <h2 className={`font-semibold ${highlighted ? 'text-[#17407E]' : 'text-slate-900'}`}>{title}</h2>
      <p className={`mt-2 whitespace-pre-line text-sm leading-6 ${highlighted ? 'text-[#17407E]' : 'text-slate-600'}`}>{text}</p>
    </section>
  );
}

function InfoCard({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <Icon size={18} className="text-[#17407E]" />
      <h2 className="mt-3 font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}
