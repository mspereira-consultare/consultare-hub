import {
  EXPIRATION_ALERT_DAYS,
  EXPIRATION_WARNING_DAYS,
  type SurveillanceExpirationStatus,
} from '@/lib/vigilancia_sanitaria/constants';

const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';

export const todaySaoPaulo = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`;
};

const dateToUtc = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year || 1970, (month || 1) - 1, day || 1);
};

export const daysUntil = (dateValue: string, today = todaySaoPaulo()) => {
  return Math.round((dateToUtc(dateValue) - dateToUtc(today)) / 86_400_000);
};

export const computeExpirationStatus = (
  validUntil?: string | null,
  today = todaySaoPaulo(),
): SurveillanceExpirationStatus => {
  if (!validUntil) return 'SEM_VALIDADE';
  const diff = daysUntil(validUntil, today);
  if (diff < 0) return 'VENCIDO';
  if (diff <= EXPIRATION_ALERT_DAYS) return 'ALERTA';
  if (diff <= EXPIRATION_WARNING_DAYS) return 'VENCENDO';
  return 'EM_DIA';
};

export const getExpirationStatusLabel = (status: SurveillanceExpirationStatus) => {
  const labels: Record<SurveillanceExpirationStatus, string> = {
    VENCIDO: 'Vencido',
    ALERTA: 'Alerta',
    VENCENDO: 'Vencendo',
    EM_DIA: 'Em dia',
    SEM_VALIDADE: 'Sem validade',
  };
  return labels[status] || status;
};

export const getExpirationSortRank = (status: SurveillanceExpirationStatus) => {
  const rank: Record<SurveillanceExpirationStatus, number> = {
    VENCIDO: 0,
    ALERTA: 1,
    VENCENDO: 2,
    EM_DIA: 3,
    SEM_VALIDADE: 4,
  };
  return rank[status] ?? 9;
};

export const getExpirationAppearance = (status: SurveillanceExpirationStatus) => {
  const appearances: Record<
    SurveillanceExpirationStatus,
    {
      badge: string;
      row: string;
      card: string;
      pill: string;
      text: string;
      progress: string;
    }
  > = {
    VENCIDO: {
      badge: 'border-violet-200 bg-violet-50 text-violet-800',
      row: 'bg-violet-50/60 hover:bg-violet-50',
      card: 'border-violet-200 bg-violet-50 text-violet-900',
      pill: 'border-violet-200 bg-white text-violet-800',
      text: 'text-violet-900',
      progress: 'bg-violet-500',
    },
    ALERTA: {
      badge: 'border-rose-200 bg-rose-50 text-rose-800',
      row: 'bg-rose-50/60 hover:bg-rose-50',
      card: 'border-rose-200 bg-rose-50 text-rose-900',
      pill: 'border-rose-200 bg-white text-rose-800',
      text: 'text-rose-900',
      progress: 'bg-rose-500',
    },
    VENCENDO: {
      badge: 'border-amber-200 bg-amber-50 text-amber-800',
      row: 'bg-amber-50/60 hover:bg-amber-50',
      card: 'border-amber-200 bg-amber-50 text-amber-900',
      pill: 'border-amber-200 bg-white text-amber-800',
      text: 'text-amber-900',
      progress: 'bg-amber-500',
    },
    EM_DIA: {
      badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      row: 'bg-emerald-50/40 hover:bg-emerald-50',
      card: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      pill: 'border-emerald-200 bg-white text-emerald-700',
      text: 'text-emerald-900',
      progress: 'bg-emerald-500',
    },
    SEM_VALIDADE: {
      badge: 'border-slate-200 bg-slate-50 text-slate-600',
      row: 'bg-slate-50/70 hover:bg-slate-50',
      card: 'border-slate-200 bg-slate-50 text-slate-800',
      pill: 'border-slate-200 bg-white text-slate-600',
      text: 'text-slate-800',
      progress: 'bg-slate-400',
    },
  };

  return appearances[status] || appearances.SEM_VALIDADE;
};
