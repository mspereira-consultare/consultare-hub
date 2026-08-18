export type RecepcaoChecklistViewMode = 'current' | 'd1';

export type RecepcaoChecklistFreezeSource = 'version' | 'live-fallback' | 'legacy-fallback';

const clean = (value: unknown) => String(value ?? '').trim();

export const parseIsoDate = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(clean(value)) ? clean(value) : null);

export const shiftDate = (dateIso: string, deltaDays: number) => {
  const [year, month, day] = dateIso.split('-').map(Number);
  const date = new Date(Date.UTC(year || 0, (month || 1) - 1, day || 1));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
};

export const isBusinessDay = (dateIso: string) => {
  const [year, month, day] = dateIso.split('-').map(Number);
  const weekday = new Date(Date.UTC(year || 0, (month || 1) - 1, day || 1)).getUTCDay();
  return weekday !== 0;
};

export const monthStart = (dateIso: string) => `${dateIso.slice(0, 7)}-01`;

export const monthEnd = (dateIso: string) => {
  const [year, month] = dateIso.slice(0, 7).split('-').map(Number);
  const date = new Date(Date.UTC(year || 0, month || 1, 0));
  return date.toISOString().slice(0, 10);
};

export const countBusinessDays = (startDate: string, endDate: string) => {
  if (endDate < startDate) return 0;
  let cursor = startDate;
  let total = 0;
  while (cursor <= endDate) {
    if (isBusinessDay(cursor)) total += 1;
    cursor = shiftDate(cursor, 1);
  }
  return total;
};

export const previousBusinessDate = (dateIso: string) => {
  let cursor = shiftDate(dateIso, -1);
  while (!isBusinessDay(cursor)) cursor = shiftDate(cursor, -1);
  return cursor;
};

export const resolveReferenceDate = (today: string, viewMode: RecepcaoChecklistViewMode, rawReferenceDate?: string | null) =>
  parseIsoDate(clean(rawReferenceDate)) || (viewMode === 'd1' ? previousBusinessDate(today) : today);

export const resolveReadOnly = (viewMode: RecepcaoChecklistViewMode) => viewMode === 'd1';

export const calculateShouldHaveUntilDate = (monthlyGoal: number, referenceDate: string) => {
  const businessDaysElapsed = countBusinessDays(monthStart(referenceDate), referenceDate);
  const businessDaysInMonth = countBusinessDays(monthStart(referenceDate), monthEnd(referenceDate));
  return businessDaysInMonth > 0 ? (monthlyGoal * businessDaysElapsed) / businessDaysInMonth : 0;
};

export const calculateDailyTarget = (monthlyGoal: number, currentValue: number, referenceDate: string) => {
  const remaining = Math.max(0, monthlyGoal - currentValue);
  const daysRemaining = countBusinessDays(referenceDate, monthEnd(referenceDate));
  if (daysRemaining <= 0) return remaining;
  return remaining / daysRemaining;
};

export const resolveFreezeSource = (args: {
  hasSelectedVersion: boolean;
  readOnly: boolean;
  hasLegacyManual: boolean;
}): RecepcaoChecklistFreezeSource => {
  if (args.hasSelectedVersion) return 'version';
  if (!args.readOnly && args.hasLegacyManual) return 'legacy-fallback';
  return 'live-fallback';
};
