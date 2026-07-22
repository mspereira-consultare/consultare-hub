import type { PayrollOccurrenceType } from '@/lib/payroll/constants';

export type PointEligibilityMode = 'DEFAULT' | 'INCLUDE' | 'EXCLUDE';

export type PointOverrideEligibility = {
  payrollDay: boolean;
  vtDay: boolean;
  vrDay: boolean;
  absence: boolean;
};

export type PointOverrideSummary = {
  hasOverride: boolean;
  dayOverrideApplied: boolean;
  occurrenceOverrideApplied: boolean;
  summary: string | null;
  latestOverrideAt: string | null;
};

export type EffectivePointOccurrenceLike = {
  id: string;
  employeeId: string | null;
  solidesEmployeeId: string | null;
  employeeName: string;
  employeeCpf: string | null;
  occurrenceType: PayrollOccurrenceType;
  dateStart: string;
  dateEnd: string;
  notes: string | null;
};

export type PointOccurrenceOverrideLike = {
  id: string;
  occurrenceId: string;
  employeeId: string | null;
  employeeName: string;
  employeeCpf: string | null;
  originalOccurrenceType: PayrollOccurrenceType | null;
  originalDateStart: string | null;
  originalDateEnd: string | null;
  overrideOccurrenceType: PayrollOccurrenceType | null;
  ignored: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EffectivePointDayLike = {
  id: string;
  employeeId: string | null;
  solidesEmployeeId: string | null;
  employeeName: string;
  employeeCpf: string | null;
  pointDate: string;
  plannedMinutes: number;
  workedMinutes: number;
  lateMinutes: number;
  dayBalanceMinutes: number;
  breakOverrunMinutes: number;
  pendingAdjustmentsCount: number;
  absenceFlag: boolean;
  inconsistencyFlag: boolean;
  justificationText: string | null;
};

export type PointDayOverrideLike = {
  id: string;
  employeeId: string;
  pointDate: string;
  payrollDayMode: PointEligibilityMode;
  vtDayMode: PointEligibilityMode;
  vrDayMode: PointEligibilityMode;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EffectiveResolvedOccurrence<T extends EffectivePointOccurrenceLike = EffectivePointOccurrenceLike> = T & {
  originalOccurrenceType: PayrollOccurrenceType;
  effectiveOccurrenceType: PayrollOccurrenceType | null;
  ignored: boolean;
  hasOverride: boolean;
  overrideId: string | null;
  overrideNotes: string | null;
  overrideSummary: string | null;
  overrideUpdatedAt: string | null;
  orphaned: boolean;
};

export type EffectiveResolvedDay<T extends EffectivePointDayLike = EffectivePointDayLike> = T & {
  occurrenceId: string | null;
  originalOccurrenceType: PayrollOccurrenceType | null;
  effectiveOccurrenceType: PayrollOccurrenceType | null;
  occurrenceNotes: string | null;
  occurrenceOverrideId: string | null;
  dayOverrideId: string | null;
  payrollDayMode: PointEligibilityMode;
  vtDayMode: PointEligibilityMode;
  vrDayMode: PointEligibilityMode;
  dayOverrideNotes: string | null;
  effectiveEligibility: PointOverrideEligibility;
  effectiveWorkedMinutes: number;
  effectivePlannedMinutes: number;
  effectiveLateMinutes: number;
  effectiveDayBalanceMinutes: number;
  effectiveBreakOverrunMinutes: number;
  hasOverride: boolean;
  overrideSummary: string | null;
  latestOverrideAt: string | null;
};

const JUSTIFIED_OCCURRENCE_TYPES = new Set<PayrollOccurrenceType>([
  'ATESTADO',
  'DECLARACAO',
  'AJUSTE_BATIDA',
  'AUSENCIA_AUTORIZADA',
  'FERIAS',
]);

const clean = (value: unknown) => String(value ?? '').trim();

const buildOccurrenceOverrideSummary = (override: PointOccurrenceOverrideLike | null, effectiveType: PayrollOccurrenceType | null) => {
  if (!override) return null;
  const parts: string[] = [];
  if (override.ignored) {
    parts.push('Ocorrência ignorada localmente');
  } else if (effectiveType && effectiveType !== override.originalOccurrenceType) {
    parts.push(`Reclassificada para ${effectiveType}`);
  }
  if (clean(override.notes)) parts.push(clean(override.notes));
  return parts.join(' · ') || 'Ajuste operacional aplicado';
};

const buildDayOverrideSummary = (override: PointDayOverrideLike | null) => {
  if (!override) return null;
  const parts: string[] = [];
  if (override.payrollDayMode !== 'DEFAULT') parts.push(`Folha: ${override.payrollDayMode}`);
  if (override.vtDayMode !== 'DEFAULT') parts.push(`VT: ${override.vtDayMode}`);
  if (override.vrDayMode !== 'DEFAULT') parts.push(`VR: ${override.vrDayMode}`);
  if (clean(override.notes)) parts.push(clean(override.notes));
  return parts.join(' · ') || 'Ajuste diário aplicado';
};

const applyMode = (current: boolean, mode: PointEligibilityMode) => {
  if (mode === 'INCLUDE') return true;
  if (mode === 'EXCLUDE') return false;
  return current;
};

export const buildPointEmployeeKey = ({
  employeeId,
  solidesEmployeeId,
  employeeName,
  employeeCpf,
}: {
  employeeId: string | null;
  solidesEmployeeId: string | null;
  employeeName: string;
  employeeCpf: string | null;
}) => employeeId || solidesEmployeeId || employeeCpf || clean(employeeName).toLowerCase();

export const resolveEffectiveOccurrence = <T extends EffectivePointOccurrenceLike>(
  occurrence: T,
  override: PointOccurrenceOverrideLike | null,
): EffectiveResolvedOccurrence<T> => {
  const effectiveOccurrenceType = override?.ignored
    ? null
    : (override?.overrideOccurrenceType || occurrence.occurrenceType);

  return {
    ...occurrence,
    originalOccurrenceType: occurrence.occurrenceType,
    effectiveOccurrenceType,
    ignored: Boolean(override?.ignored),
    hasOverride: Boolean(override),
    overrideId: override?.id || null,
    overrideNotes: override?.notes || null,
    overrideSummary: buildOccurrenceOverrideSummary(override, effectiveOccurrenceType),
    overrideUpdatedAt: override?.updatedAt || null,
    orphaned: false,
  };
};

export const resolveOrphanedOccurrenceOverride = (override: PointOccurrenceOverrideLike): EffectiveResolvedOccurrence => ({
  id: override.occurrenceId,
  employeeId: override.employeeId,
  solidesEmployeeId: null,
  employeeName: override.employeeName,
  employeeCpf: override.employeeCpf,
  dateStart: override.originalDateStart || '',
  dateEnd: override.originalDateEnd || override.originalDateStart || '',
  notes: override.notes,
  occurrenceType: override.originalOccurrenceType || 'AJUSTE_BATIDA',
  originalOccurrenceType: override.originalOccurrenceType || 'AJUSTE_BATIDA',
  effectiveOccurrenceType: override.ignored ? null : (override.overrideOccurrenceType || override.originalOccurrenceType || 'AJUSTE_BATIDA'),
  ignored: override.ignored,
  hasOverride: true,
  overrideId: override.id,
  overrideNotes: override.notes,
  overrideSummary: buildOccurrenceOverrideSummary(override, override.overrideOccurrenceType || override.originalOccurrenceType || null),
  overrideUpdatedAt: override.updatedAt,
  orphaned: true,
});

export const resolveEffectiveDay = <T extends EffectivePointDayLike>(
  day: T,
  primaryOccurrence: EffectiveResolvedOccurrence | null,
  dayOverride: PointDayOverrideLike | null,
): EffectiveResolvedDay<T> => {
  const effectiveType = primaryOccurrence?.effectiveOccurrenceType || null;
  const justified = Boolean(effectiveType && JUSTIFIED_OCCURRENCE_TYPES.has(effectiveType));
  const forcedAbsence = effectiveType === 'FALTA_INJUSTIFICADA';
  const hasPlannedJourney = Number(day.plannedMinutes || 0) > 0;
  const defaultAbsence = forcedAbsence || (day.absenceFlag && !justified);
  const defaultPayrollDay = !defaultAbsence && (day.workedMinutes > 0 || (justified && hasPlannedJourney));
  const defaultLateMinutes = defaultAbsence || justified || forcedAbsence ? 0 : Math.max(0, Number(day.lateMinutes || 0));

  let payrollDay = applyMode(defaultPayrollDay, dayOverride?.payrollDayMode || 'DEFAULT');
  let absence = applyMode(defaultAbsence, dayOverride?.payrollDayMode || 'DEFAULT');
  if (dayOverride?.payrollDayMode === 'INCLUDE') absence = false;
  if (dayOverride?.payrollDayMode === 'EXCLUDE') absence = false;

  const vtDay = applyMode(payrollDay, dayOverride?.vtDayMode || 'DEFAULT');
  const vrDay = applyMode(payrollDay, dayOverride?.vrDayMode || 'DEFAULT');

  const effectiveWorkedMinutes = payrollDay ? Number(day.workedMinutes || 0) : 0;
  const effectivePlannedMinutes = payrollDay ? Number(day.plannedMinutes || 0) : 0;
  const effectiveLateMinutes = payrollDay ? defaultLateMinutes : 0;
  const effectiveDayBalanceMinutes = payrollDay ? Number(day.dayBalanceMinutes || 0) : 0;
  const effectiveBreakOverrunMinutes = payrollDay ? Number(day.breakOverrunMinutes || 0) : 0;

  const hasOverride = Boolean(dayOverride || primaryOccurrence?.hasOverride);
  const summaries = [buildDayOverrideSummary(dayOverride), primaryOccurrence?.overrideSummary]
    .filter(Boolean) as string[];
  const summary = summaries.length ? Array.from(new Set(summaries)).join(' · ') : null;
  const latestOverrideAt = [dayOverride?.updatedAt, primaryOccurrence?.overrideUpdatedAt].filter(Boolean).sort().at(-1) || null;

  return {
    ...day,
    occurrenceId: primaryOccurrence?.id || null,
    originalOccurrenceType: primaryOccurrence?.originalOccurrenceType || null,
    effectiveOccurrenceType: effectiveType,
    occurrenceNotes: primaryOccurrence?.notes || null,
    occurrenceOverrideId: primaryOccurrence?.overrideId || null,
    dayOverrideId: dayOverride?.id || null,
    payrollDayMode: dayOverride?.payrollDayMode || 'DEFAULT',
    vtDayMode: dayOverride?.vtDayMode || 'DEFAULT',
    vrDayMode: dayOverride?.vrDayMode || 'DEFAULT',
    dayOverrideNotes: dayOverride?.notes || null,
    effectiveEligibility: {
      payrollDay,
      vtDay,
      vrDay,
      absence,
    },
    effectiveWorkedMinutes,
    effectivePlannedMinutes,
    effectiveLateMinutes,
    effectiveDayBalanceMinutes,
    effectiveBreakOverrunMinutes,
    hasOverride,
    overrideSummary: summary,
    latestOverrideAt,
  };
};

export const findPrimaryOccurrenceForDate = (
  pointDate: string,
  occurrences: EffectiveResolvedOccurrence[],
) => occurrences.find((occurrence) => occurrence.dateStart <= pointDate && occurrence.dateEnd >= pointDate) || null;

export const buildOccurrenceOverrideLookup = (overrides: PointOccurrenceOverrideLike[]) =>
  new Map(overrides.map((override) => [override.occurrenceId, override] as const));

export const buildDayOverrideLookup = (overrides: PointDayOverrideLike[]) =>
  new Map(overrides.map((override) => [`${override.employeeId}:${override.pointDate}`, override] as const));

export const isJustifiedOccurrenceType = (value: PayrollOccurrenceType | null | undefined) =>
  Boolean(value && JUSTIFIED_OCCURRENCE_TYPES.has(value));
