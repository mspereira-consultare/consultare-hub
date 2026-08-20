/**
 * Fachada de compatibilidade do motor de metas.
 *
 * A regra de projeção vive em `@/lib/goals/projection` e o calendário
 * operacional em `@/lib/goals/operational_calendar`. Este arquivo existe para
 * manter os imports antigos funcionando e para oferecer o "view model" pronto
 * que as tabelas de metas consomem.
 */

import {
  calculateProjection,
  getProjectionStatus,
  resolveAggregation,
  type ProjectionResult,
  type ProjectionStatus,
} from './goals/projection';

export {
  DAILY_PROJECTION_CONFIDENCE_THRESHOLD,
  PROJECTION_SUCCESS_THRESHOLD,
  PROJECTION_WARNING_THRESHOLD,
  WORK_DAY_END_HOUR,
  WORK_DAY_START_HOUR,
  calculateCatchUpDailyTarget,
  calculateExpectedUntilDate,
  calculateProjectedPercentage,
  calculateProjection,
  deriveDailyTargetFromMonthly,
  getProjectionStatus,
  getSaoPauloToday,
  getWorkdayElapsedFraction,
  resolveAggregation,
} from './goals/projection';
export type { ProjectionResult, ProjectionStatus } from './goals/projection';

type GoalMetricShape = {
  current: number;
  target: number;
  periodicity: string;
  /** Realizado apenas do dia corrente, quando conhecido (projeção exata). */
  currentToday?: number | null;
  /** Data de referência do recorte, quando diferente de hoje. */
  referenceDate?: string | null;
  /** Unidade da meta ('percent'/'minutes' desativam a extrapolação). */
  unit?: string | null;
};

export function calculateGoalProjectionResult(goal: GoalMetricShape, now = new Date()): ProjectionResult {
  return calculateProjection({
    current: Number(goal.current || 0),
    currentToday: goal.currentToday ?? null,
    periodicity: goal.periodicity,
    aggregation: resolveAggregation(goal.unit),
    referenceDate: goal.referenceDate ?? null,
    now,
  });
}

export function calculateGoalProjection(goal: GoalMetricShape, now = new Date()) {
  return calculateGoalProjectionResult(goal, now).value;
}

export function calculateGoalProjectedPercentage(goal: GoalMetricShape, now = new Date()) {
  const targetValue = Number(goal.target || 0);
  if (targetValue <= 0) return 0;

  const projection = calculateGoalProjectionResult(goal, now);
  if (projection.suppressed) return 0;
  return Math.round((projection.value / targetValue) * 100);
}

export function calculateGoalRemaining(goal: Pick<GoalMetricShape, 'current' | 'target'>) {
  const targetValue = Number(goal.target || 0);
  const currentValue = Number(goal.current || 0);
  return Math.max(targetValue - currentValue, 0);
}

export type GoalProjectionView = {
  result: ProjectionResult;
  /** Valor projetado, ou null quando a projeção está suprimida. */
  value: number | null;
  /** Atingimento projetado em %, ou null quando suprimido/sem alvo. */
  percentage: number | null;
  percentageLabel: string;
  suppressed: boolean;
  status: ProjectionStatus;
  /** Explicação curta para tooltip/legenda. */
  hint: string;
};

const SUPPRESSED_LABEL = '—';

/** View model único usado pelas tabelas de metas, produtividade e checklist. */
export function buildGoalProjectionView(goal: GoalMetricShape, now = new Date()): GoalProjectionView {
  const result = calculateGoalProjectionResult(goal, now);
  const targetValue = Number(goal.target || 0);
  const percentage = result.suppressed || targetValue <= 0 ? null : (result.value / targetValue) * 100;

  const hint =
    result.reason === 'low-confidence'
      ? `Projeção diária só é exibida a partir de 60% do expediente (agora: ${Math.round(result.workdayFraction * 100)}%).`
      : result.reason === 'no-elapsed-period'
        ? 'Ainda não há expediente decorrido suficiente para projetar.'
        : result.reason === 'closed-period'
          ? 'Período encerrado: a projeção é igual ao realizado.'
          : result.reason === 'rate-metric'
            ? 'Métrica de taxa ou média: a projeção assume o mesmo patamar até o fim do período.'
            : result.reason === 'not-projectable'
              ? 'Periodicidade sem regra de projeção.'
              : `Base de ${result.elapsedOperationalDays.toFixed(2)} de ${result.totalOperationalDays.toFixed(2)} dias operacionais.`;

  return {
    result,
    value: result.suppressed ? null : result.value,
    percentage,
    percentageLabel: percentage === null ? SUPPRESSED_LABEL : `${Math.round(percentage)}%`,
    suppressed: result.suppressed,
    status: getProjectionStatus(percentage),
    hint,
  };
}

export const PROJECTION_SUPPRESSED_LABEL = SUPPRESSED_LABEL;
