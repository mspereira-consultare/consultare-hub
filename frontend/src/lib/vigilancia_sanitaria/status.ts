import { EXPIRATION_WARNING_DAYS, type SurveillanceExpirationStatus } from '@/lib/vigilancia_sanitaria/constants';

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
  if (diff === 0) return 'VENCE_HOJE';
  if (diff <= EXPIRATION_WARNING_DAYS) return 'VENCENDO';
  return 'EM_DIA';
};

export const getExpirationStatusLabel = (status: SurveillanceExpirationStatus) => {
  const labels: Record<SurveillanceExpirationStatus, string> = {
    VENCIDO: 'Vencido',
    VENCE_HOJE: 'Vence hoje',
    VENCENDO: 'Vencendo',
    EM_DIA: 'Em dia',
    SEM_VALIDADE: 'Sem validade',
  };
  return labels[status] || status;
};

export const getExpirationSortRank = (status: SurveillanceExpirationStatus) => {
  const rank: Record<SurveillanceExpirationStatus, number> = {
    VENCIDO: 0,
    VENCE_HOJE: 1,
    VENCENDO: 2,
    EM_DIA: 3,
    SEM_VALIDADE: 4,
  };
  return rank[status] ?? 9;
};
