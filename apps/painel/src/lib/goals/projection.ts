/**
 * Motor único de projeção de metas.
 *
 * Correções implementadas a partir do documento técnico de 19/08/2026:
 *   Bug 1 - o dia corrente deixa de ser contado como dia inteiro. O realizado
 *           parcial de hoje é extrapolado para o dia cheio antes de virar base
 *           da média diária.
 *   Bug 2 - projeção diária é suprimida enquanto o expediente estiver abaixo do
 *           limiar de confiança (60%), porque extrapolar duas horas de caixa não
 *           tem significado estatístico.
 *   Bug 3 - o multiplicador usa dias operacionais ponderados (ver
 *           operational_calendar) em vez de dias corridos.
 *   Bug 5 - escala de cor única: verde >= 100%, laranja 85-99%, vermelho < 85%.
 */

import {
  dayWeight,
  monthStart,
  operationalDaysClosedInMonth,
  operationalDaysClosedInWeek,
  operationalDaysInMonth,
  operationalDaysInWeek,
  parseIsoDate,
  shiftDate,
  weekStart,
} from './operational_calendar';

/** Expediente considerado para a fração do dia corrente. */
export const WORK_DAY_START_HOUR = 8;
export const WORK_DAY_END_HOUR = 19;
export const WORK_DAY_HOURS = WORK_DAY_END_HOUR - WORK_DAY_START_HOUR;

/** Abaixo desta fração de expediente a projeção diária não é exibida. */
export const DAILY_PROJECTION_CONFIDENCE_THRESHOLD = 0.6;

/** Escala de cor única para atingimento projetado. */
export const PROJECTION_SUCCESS_THRESHOLD = 100;
export const PROJECTION_WARNING_THRESHOLD = 85;

export type ProjectionStatus = 'SUCCESS' | 'WARNING' | 'DANGER';

export type GoalPeriodicity = 'daily' | 'weekly' | 'monthly' | string;

export type ProjectionReason =
  | 'projected'
  | 'closed-period'
  | 'low-confidence'
  | 'no-elapsed-period'
  | 'rate-metric'
  | 'not-projectable';

/**
 * Como o indicador se comporta no tempo.
 *  - 'sum': acumula ao longo do período (faturamento, quantidade). Pode ser extrapolado.
 *  - 'average': é uma taxa ou média (ticket médio, % de confirmação, minutos de espera).
 *    Extrapolar por dias decorridos não faz sentido: o valor atual já é a melhor
 *    estimativa do patamar até o fim do período.
 */
export type ProjectionAggregation = 'sum' | 'average';

/** Unidades de meta que representam taxa/média em vez de acumulado. */
export const RATE_GOAL_UNITS = new Set(['percent', 'minutes']);

export const resolveAggregation = (unit: string | null | undefined): ProjectionAggregation =>
  RATE_GOAL_UNITS.has(String(unit || '').toLowerCase()) ? 'average' : 'sum';

export type ProjectionResult = {
  /** Valor projetado para o fim do período. Igual ao realizado quando não há projeção. */
  value: number;
  /** true quando a projeção não tem confiança suficiente e a UI deve exibir "—". */
  suppressed: boolean;
  /** Fração do expediente do dia corrente já decorrida (0..1). */
  workdayFraction: number;
  /** Dias operacionais ponderados já decorridos no período. */
  elapsedOperationalDays: number;
  /** Dias operacionais ponderados totais do período. */
  totalOperationalDays: number;
  /** Multiplicador aplicado sobre a base consolidada. */
  multiplier: number;
  reason: ProjectionReason;
};

const toFiniteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const saoPauloParts = (now: Date) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || '00';
  return {
    dateIso: `${pick('year')}-${pick('month')}-${pick('day')}`,
    hour: Number(pick('hour')),
    minute: Number(pick('minute')),
  };
};

/** Data de hoje no fuso da clínica, no formato YYYY-MM-DD. */
export const getSaoPauloToday = (now: Date = new Date()) => saoPauloParts(now).dateIso;

/**
 * Fração do expediente já decorrida no dia corrente (0..1).
 * Antes das 8h retorna 0; a partir das 19h retorna 1.
 */
export const getWorkdayElapsedFraction = (now: Date = new Date()) => {
  const { hour, minute } = saoPauloParts(now);
  const hoursNow = hour + minute / 60;
  if (hoursNow <= WORK_DAY_START_HOUR) return 0;
  if (hoursNow >= WORK_DAY_END_HOUR) return 1;
  return (hoursNow - WORK_DAY_START_HOUR) / WORK_DAY_HOURS;
};

export type ProjectionInput = {
  /** Realizado acumulado no período (inclui o parcial de hoje). */
  current: number;
  /**
   * Realizado apenas do dia corrente. Quando informado, a projeção usa a fórmula
   * exata (separa o dia corrente do histórico consolidado). Quando ausente, cai
   * no divisor fracionário equivalente descrito no documento técnico.
   */
  currentToday?: number | null;
  periodicity: GoalPeriodicity;
  /** 'average' desativa a extrapolação para taxas e médias. Padrão: 'sum'. */
  aggregation?: ProjectionAggregation;
  /** Data de referência do recorte. Padrão: hoje no fuso da clínica. */
  referenceDate?: string | null;
  now?: Date;
};

const emptyResult = (value: number, reason: ProjectionReason, workdayFraction: number): ProjectionResult => ({
  value,
  suppressed: reason === 'low-confidence' || reason === 'no-elapsed-period',
  workdayFraction,
  elapsedOperationalDays: 0,
  totalOperationalDays: 0,
  multiplier: 1,
  reason,
});

const projectByOperationalDays = (args: {
  current: number;
  currentToday: number | null;
  totalOperationalDays: number;
  closedOperationalDays: number;
  referenceDayWeight: number;
  workdayFraction: number;
  isCurrentDay: boolean;
}): ProjectionResult => {
  const {
    current,
    currentToday,
    totalOperationalDays,
    closedOperationalDays,
    referenceDayWeight,
    workdayFraction,
    isCurrentDay,
  } = args;

  // Período encerrado (recorte histórico ou último dia com expediente concluído):
  // não há o que extrapolar, o multiplicador é exatamente 1,0.
  const dayIsComplete = !isCurrentDay || workdayFraction >= 1;
  const elapsedWithFullDay = closedOperationalDays + referenceDayWeight;

  if (dayIsComplete && elapsedWithFullDay >= totalOperationalDays) {
    return {
      value: current,
      suppressed: false,
      workdayFraction,
      elapsedOperationalDays: elapsedWithFullDay,
      totalOperationalDays,
      multiplier: 1,
      reason: 'closed-period',
    };
  }

  let base = current;
  let elapsed = elapsedWithFullDay;

  if (dayIsComplete) {
    // Dia de referência já fechado: base e divisor usam o dia inteiro.
    base = current;
    elapsed = elapsedWithFullDay;
  } else if (currentToday !== null) {
    // Fórmula exata: separa o dia corrente do histórico consolidado.
    const realizedUntilYesterday = current - currentToday;
    if (workdayFraction > 0) {
      base = realizedUntilYesterday + currentToday / workdayFraction;
      elapsed = closedOperationalDays + referenceDayWeight;
    } else {
      // Antes da abertura: projeta apenas sobre os dias já fechados.
      base = realizedUntilYesterday;
      elapsed = closedOperationalDays;
    }
  } else {
    // Divisor fracionário equivalente, quando o realizado do dia não é conhecido.
    base = current;
    elapsed = closedOperationalDays + referenceDayWeight * workdayFraction;
  }

  if (elapsed <= 0 || totalOperationalDays <= 0) {
    return emptyResult(current, 'no-elapsed-period', workdayFraction);
  }

  const multiplier = totalOperationalDays / elapsed;
  return {
    value: base * multiplier,
    suppressed: false,
    workdayFraction,
    elapsedOperationalDays: elapsed,
    totalOperationalDays,
    multiplier,
    reason: 'projected',
  };
};

export const calculateProjection = (input: ProjectionInput): ProjectionResult => {
  const now = input.now || new Date();
  const today = getSaoPauloToday(now);
  const referenceDate = parseIsoDate(String(input.referenceDate || '')) || today;
  const isCurrentDay = referenceDate === today;
  const workdayFraction = isCurrentDay ? getWorkdayElapsedFraction(now) : 1;
  const current = toFiniteNumber(input.current);
  const currentToday =
    input.currentToday === null || input.currentToday === undefined ? null : toFiniteNumber(input.currentToday);
  const periodicity = String(input.periodicity || '').toLowerCase();

  if (input.aggregation === 'average') {
    // Taxas e médias não se acumulam: o realizado atual já é a projeção.
    return {
      value: current,
      suppressed: false,
      workdayFraction,
      elapsedOperationalDays: 0,
      totalOperationalDays: 0,
      multiplier: 1,
      reason: 'rate-metric',
    };
  }

  if (periodicity === 'daily') {
    if (!isCurrentDay || workdayFraction >= 1) {
      return {
        value: current,
        suppressed: false,
        workdayFraction,
        elapsedOperationalDays: 1,
        totalOperationalDays: 1,
        multiplier: 1,
        reason: 'closed-period',
      };
    }

    if (workdayFraction < DAILY_PROJECTION_CONFIDENCE_THRESHOLD) {
      // Bug 2: extrapolar o começo do expediente produz ruído, não previsão.
      return emptyResult(current, workdayFraction > 0 ? 'low-confidence' : 'no-elapsed-period', workdayFraction);
    }

    return {
      value: current / workdayFraction,
      suppressed: false,
      workdayFraction,
      elapsedOperationalDays: workdayFraction,
      totalOperationalDays: 1,
      multiplier: 1 / workdayFraction,
      reason: 'projected',
    };
  }

  if (periodicity === 'weekly') {
    return projectByOperationalDays({
      current,
      currentToday,
      totalOperationalDays: operationalDaysInWeek(referenceDate),
      closedOperationalDays: operationalDaysClosedInWeek(referenceDate),
      referenceDayWeight: dayWeight(referenceDate),
      workdayFraction,
      isCurrentDay,
    });
  }

  if (periodicity === 'monthly') {
    return projectByOperationalDays({
      current,
      currentToday,
      totalOperationalDays: operationalDaysInMonth(referenceDate),
      closedOperationalDays: operationalDaysClosedInMonth(referenceDate),
      referenceDayWeight: dayWeight(referenceDate),
      workdayFraction,
      isCurrentDay,
    });
  }

  return emptyResult(current, 'not-projectable', workdayFraction);
};

export const calculateProjectedPercentage = (input: ProjectionInput & { target: number }) => {
  const projection = calculateProjection(input);
  const target = toFiniteNumber(input.target);
  if (target <= 0 || projection.suppressed) return null;
  return (projection.value / target) * 100;
};

/** Escala de cor única (Bug 5): verde >= 100%, laranja 85-99%, vermelho < 85%. */
export const getProjectionStatus = (percentage: number | null | undefined): ProjectionStatus => {
  const value = toFiniteNumber(percentage);
  if (value >= PROJECTION_SUCCESS_THRESHOLD) return 'SUCCESS';
  if (value >= PROJECTION_WARNING_THRESHOLD) return 'WARNING';
  return 'DANGER';
};

/**
 * Meta do dia derivada da meta mensal (Bug 4).
 * meta_diaria = meta_mensal / dias_operacionais_do_mes * peso_do_dia
 * Com isso a soma das metas diárias do mês fecha exatamente com a meta mensal.
 */
export const deriveDailyTargetFromMonthly = (monthlyTarget: number, referenceDate: string) => {
  const target = toFiniteNumber(monthlyTarget);
  const totalOperationalDays = operationalDaysInMonth(referenceDate);
  if (target <= 0 || totalOperationalDays <= 0) return 0;
  return (target / totalOperationalDays) * dayWeight(referenceDate);
};

/**
 * Valor que o período deveria ter alcançado até a data de referência,
 * contando o dia corrente proporcionalmente ao expediente decorrido.
 */
export const calculateExpectedUntilDate = (args: {
  monthlyTarget: number;
  referenceDate: string;
  now?: Date;
  includeCurrentDayFraction?: boolean;
}) => {
  const target = toFiniteNumber(args.monthlyTarget);
  const totalOperationalDays = operationalDaysInMonth(args.referenceDate);
  if (target <= 0 || totalOperationalDays <= 0) return 0;

  const now = args.now || new Date();
  const isCurrentDay = args.referenceDate === getSaoPauloToday(now);
  const fraction =
    args.includeCurrentDayFraction === false || !isCurrentDay ? 1 : getWorkdayElapsedFraction(now);
  const elapsed = operationalDaysClosedInMonth(args.referenceDate) + dayWeight(args.referenceDate) * fraction;
  return (target * elapsed) / totalOperationalDays;
};

/** Meta diária dinâmica de recuperação: o que falta dividido pelos dias que restam. */
export const calculateCatchUpDailyTarget = (
  monthlyTarget: number,
  currentValue: number,
  referenceDate: string,
) => {
  const remaining = Math.max(0, toFiniteNumber(monthlyTarget) - toFiniteNumber(currentValue));
  const daysRemaining = sumRemainingOperationalDays(referenceDate);
  if (daysRemaining <= 0) return remaining;
  return remaining / daysRemaining;
};

const sumRemainingOperationalDays = (referenceDate: string) => {
  const totalOperationalDays = operationalDaysInMonth(referenceDate);
  const closed = operationalDaysClosedInMonth(referenceDate);
  return Math.max(0, Number((totalOperationalDays - closed).toFixed(6)));
};

export { monthStart, shiftDate, weekStart };
