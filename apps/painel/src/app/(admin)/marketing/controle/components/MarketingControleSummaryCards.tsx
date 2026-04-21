import {
  CalendarCheck2,
  DollarSign,
  Globe2,
  MessageCircle,
  Milestone,
  UserRoundPlus,
  UsersRound,
} from 'lucide-react';
import type { MarketingControleSummary } from './types';
import { formatCompactCurrency, formatNumber } from './formatters';

type MarketingControleSummaryCardsProps = {
  summary: MarketingControleSummary;
};

type SummaryCard = {
  key: string;
  label: string;
  value: string;
  helper: string;
  icon: typeof Globe2;
  accentClassName: string;
  iconChipClassName: string;
};

export function MarketingControleSummaryCards({ summary }: MarketingControleSummaryCardsProps) {
  const cards: SummaryCard[] = [
    {
      key: 'visitors',
      label: 'Visitantes do site',
      value: formatNumber(summary.cards.visitors),
      helper: 'Soma de usuários do site no mês selecionado.',
      icon: Globe2,
      accentClassName: 'border-t-sky-500',
      iconChipClassName: 'bg-sky-50 text-sky-700',
    },
    {
      key: 'whatsapp-clicks',
      label: 'Cliques em WhatsApp',
      value: formatNumber(summary.cards.whatsappClicks),
      helper: 'Leitura de intenção derivada do clique para WhatsApp.',
      icon: MessageCircle,
      accentClassName: 'border-t-emerald-500',
      iconChipClassName: 'bg-emerald-50 text-emerald-700',
    },
    {
      key: 'clinia-new-contacts',
      label: 'Novos contatos Clinia',
      value: formatNumber(summary.cards.cliniaNewContacts),
      helper: 'Somente contatos Google no Clinia Ads.',
      icon: UserRoundPlus,
      accentClassName: 'border-t-cyan-500',
      iconChipClassName: 'bg-cyan-50 text-cyan-700',
    },
    {
      key: 'clinia-appointments',
      label: 'Agendamentos Clinia',
      value: formatNumber(summary.cards.cliniaAppointments),
      helper: 'Conversões para agendamento com origem Google.',
      icon: CalendarCheck2,
      accentClassName: 'border-t-indigo-500',
      iconChipClassName: 'bg-indigo-50 text-indigo-700',
    },
    {
      key: 'spend',
      label: 'Investimento Google Ads',
      value: formatCompactCurrency(summary.cards.googleSpend),
      helper: 'Soma da verba do Google Ads no mês.',
      icon: DollarSign,
      accentClassName: 'border-t-amber-500',
      iconChipClassName: 'bg-amber-50 text-amber-700',
    },
    {
      key: 'cost-per-contact',
      label: 'Custo por novo contato',
      value:
        summary.cards.costPerNewContact == null
          ? '—'
          : formatCompactCurrency(summary.cards.costPerNewContact),
      helper: 'Investimento dividido pelos novos contatos Google no Clinia.',
      icon: UsersRound,
      accentClassName: 'border-t-violet-500',
      iconChipClassName: 'bg-violet-50 text-violet-700',
    },
    {
      key: 'cost-per-appointment',
      label: 'Custo por agendamento',
      value:
        summary.cards.costPerAppointment == null
          ? '—'
          : formatCompactCurrency(summary.cards.costPerAppointment),
      helper: 'Investimento dividido pelos agendamentos Clinia (Google).',
      icon: Milestone,
      accentClassName: 'border-t-rose-500',
      iconChipClassName: 'bg-rose-50 text-rose-700',
    },
  ];

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article
            key={card.key}
            className={`rounded-xl border border-slate-200 border-t-[3px] bg-white px-4 py-3.5 shadow-sm ${card.accentClassName}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {card.label}
                </p>
                <p className="mt-2.5 text-[1.9rem] font-bold leading-none text-slate-900">{card.value}</p>
              </div>
              <div className={`rounded-xl p-2.5 ${card.iconChipClassName}`}>
                <Icon size={16} />
              </div>
            </div>
            <p className="mt-2.5 text-[11px] text-slate-500">{card.helper}</p>
          </article>
        );
      })}
    </section>
  );
}
