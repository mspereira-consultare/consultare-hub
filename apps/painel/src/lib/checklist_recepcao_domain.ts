import {
  calculateCatchUpDailyTarget,
  calculateExpectedUntilDate,
  calculateProjection,
  type ProjectionResult,
} from '@/lib/goals/projection';
import {
  dayWeight,
  isOperationalDay,
  monthEnd,
  monthStart,
  operationalDaysClosedInMonth,
  operationalDaysInMonth,
  operationalDaysRemainingInMonth,
  parseIsoDate,
  previousOperationalDate,
  shiftDate,
} from '@/lib/goals/operational_calendar';

export type RecepcaoChecklistViewMode = 'current' | 'd1';

export type RecepcaoChecklistFreezeSource = 'version' | 'live-fallback' | 'legacy-fallback';

const clean = (value: unknown) => String(value ?? '').trim();

export { monthEnd, monthStart, parseIsoDate, shiftDate };

/**
 * Dia operacional segundo o critério único da clínica (ver goals/operational_calendar):
 * segunda a sexta valem 1, sábado vale 0,5 e domingos/feriados não contam.
 */
export const isBusinessDay = (dateIso: string) => isOperationalDay(dateIso);

/**
 * Soma ponderada de dias operacionais no intervalo. Mantém o nome antigo para
 * não quebrar os consumidores, mas agora devolve valor fracionário por causa
 * do peso do sábado.
 */
export const countBusinessDays = (startDate: string, endDate: string) => {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end || end < start) return 0;
  let cursor = start;
  let total = 0;
  while (cursor <= end) {
    total += dayWeight(cursor);
    cursor = shiftDate(cursor, 1);
  }
  return Number(total.toFixed(6));
};

export const previousBusinessDate = (dateIso: string) => previousOperationalDate(dateIso);

export const resolveReferenceDate = (today: string, viewMode: RecepcaoChecklistViewMode, rawReferenceDate?: string | null) =>
  parseIsoDate(clean(rawReferenceDate)) || (viewMode === 'd1' ? previousBusinessDate(today) : today);

/**
 * Somente leitura vale apenas para data futura: não existe checklist de um dia
 * que ainda não aconteceu. Datas passadas são editáveis (correção de D-1), e
 * todo salvamento fica registrado no log de preenchimentos.
 */
export const resolveReadOnly = (referenceDate: string, today: string) => referenceDate > today;

/**
 * Recorte histórico: muda a ORIGEM dos indicadores (confirmação D+1 vem do
 * snapshot congelado, não da visão viva) e desliga o fallback do manual legado.
 * É independente de poder editar ou não.
 */
export const resolveIsHistorical = (referenceDate: string, today: string) => referenceDate < today;

/**
 * Valor que a unidade deveria ter faturado até a data de referência.
 * O dia corrente entra proporcionalmente ao expediente já decorrido.
 */
export const calculateShouldHaveUntilDate = (monthlyGoal: number, referenceDate: string, now?: Date) =>
  calculateExpectedUntilDate({ monthlyTarget: monthlyGoal, referenceDate, now });

/** Meta diária de recuperação: o que falta dividido pelos dias operacionais restantes. */
export const calculateDailyTarget = (monthlyGoal: number, currentValue: number, referenceDate: string) =>
  calculateCatchUpDailyTarget(monthlyGoal, currentValue, referenceDate);

/** Projeção do mês para a unidade, separando o realizado parcial do dia corrente. */
export const calculateMonthProjection = (args: {
  revenueMonth: number;
  revenueDay: number;
  referenceDate: string;
  now?: Date;
}): ProjectionResult =>
  calculateProjection({
    current: args.revenueMonth,
    currentToday: args.revenueDay,
    periodicity: 'monthly',
    referenceDate: args.referenceDate,
    now: args.now,
  });

export const operationalDaysSummary = (referenceDate: string) => ({
  elapsed: operationalDaysClosedInMonth(referenceDate) + dayWeight(referenceDate),
  total: operationalDaysInMonth(referenceDate),
  remaining: operationalDaysRemainingInMonth(referenceDate),
});

export const resolveFreezeSource = (args: {
  hasSelectedVersion: boolean;
  isHistorical: boolean;
  hasLegacyManual: boolean;
}): RecepcaoChecklistFreezeSource => {
  if (args.hasSelectedVersion) return 'version';
  if (!args.isHistorical && args.hasLegacyManual) return 'legacy-fallback';
  return 'live-fallback';
};
