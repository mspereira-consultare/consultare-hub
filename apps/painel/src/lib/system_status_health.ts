import { parseSystemStatusTimestamp } from '@/lib/system_status_time';

const ACTIVE_SYSTEM_STATUSES = new Set(['RUNNING', 'PENDING', 'QUEUED']);
const STATUS_PRIORITY: Record<string, number> = {
  RUNNING: 0,
  PENDING: 1,
  QUEUED: 1,
  ERROR: 2,
  WARNING: 3,
  COMPLETED: 4,
  ONLINE: 5,
  UNKNOWN: 6,
};

const envInt = (name: string, fallback: number) => {
  const parsed = Number.parseInt(String(process.env[name] || ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const WATCHDOG_STALE_SEC = Math.max(60, envInt('WATCHDOG_STALE_SEC', 600));
const WATCHDOG_STALE_BUSINESS_SEC = Math.max(60, envInt('WATCHDOG_STALE_BUSINESS_SEC', 180));
const WATCHDOG_STALE_OFFHOURS_SEC = Math.max(120, envInt('WATCHDOG_STALE_OFFHOURS_SEC', 900));
const WATCHDOG_BUSINESS_START = String(process.env.WATCHDOG_BUSINESS_START || '08:00').trim() || '08:00';
const WATCHDOG_BUSINESS_END = String(process.env.WATCHDOG_BUSINESS_END || '19:00').trim() || '19:00';

export type EffectiveSystemStatusRecord = {
  serviceName: string;
  status: string;
  lastRun: string | null;
  details: string;
  isActive: boolean;
  isStale: boolean;
};

const parseHm = (value: string, fallbackHour: number, fallbackMinute: number) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return { hour: fallbackHour, minute: fallbackMinute };

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return { hour: fallbackHour, minute: fallbackMinute };
  }

  return { hour, minute };
};

const getSaoPauloMinuteOfDay = (now: Date) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  return hour * 60 + minute;
};

const isWithinBusinessWindow = (now: Date) => {
  const start = parseHm(WATCHDOG_BUSINESS_START, 8, 0);
  const end = parseHm(WATCHDOG_BUSINESS_END, 19, 0);
  const current = getSaoPauloMinuteOfDay(now);
  const startMinute = start.hour * 60 + start.minute;
  const endMinute = end.hour * 60 + end.minute;

  if (endMinute <= startMinute) {
    return current >= startMinute || current < endMinute;
  }

  return current >= startMinute && current < endMinute;
};

export const isSystemStatusActive = (status: string) => ACTIVE_SYSTEM_STATUSES.has(String(status || '').trim().toUpperCase());

export const getSystemStatusStaleLimitMs = (now = new Date()) => {
  const dynamicLimitSec = isWithinBusinessWindow(now) ? WATCHDOG_STALE_BUSINESS_SEC : WATCHDOG_STALE_OFFHOURS_SEC;
  const finalLimitSec = WATCHDOG_STALE_SEC > 0 ? Math.min(dynamicLimitSec, WATCHDOG_STALE_SEC) : dynamicLimitSec;
  return finalLimitSec * 1000;
};

export const isSystemStatusStale = (status: string, lastRun?: string | null, now = new Date()) => {
  if (!isSystemStatusActive(status)) return false;
  const parsed = parseSystemStatusTimestamp(lastRun);
  if (!parsed) return false;
  return now.getTime() - parsed.getTime() > getSystemStatusStaleLimitMs(now);
};

const sortByPriorityAndRecency = (left: EffectiveSystemStatusRecord, right: EffectiveSystemStatusRecord) => {
  const priorityDiff =
    (STATUS_PRIORITY[String(left.status || '').toUpperCase()] ?? STATUS_PRIORITY.UNKNOWN) -
    (STATUS_PRIORITY[String(right.status || '').toUpperCase()] ?? STATUS_PRIORITY.UNKNOWN);
  if (priorityDiff !== 0) return priorityDiff;

  const leftTs = parseSystemStatusTimestamp(left.lastRun)?.getTime() || 0;
  const rightTs = parseSystemStatusTimestamp(right.lastRun)?.getTime() || 0;
  return rightTs - leftTs;
};

export const pickEffectiveSystemStatus = (
  records: Array<{ serviceName: string; status: string; lastRun?: string | null; details?: string | null }>,
  now = new Date(),
): EffectiveSystemStatusRecord => {
  const normalized = records.map((record) => {
    const status = String(record.status || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
    const lastRun = String(record.lastRun || '').trim() || null;
    const details = String(record.details || '').trim();
    const stale = isSystemStatusStale(status, lastRun, now);

    return {
      serviceName: String(record.serviceName || '').trim().toLowerCase(),
      status: stale ? 'ERROR' : status,
      lastRun,
      details: stale ? `${details}${details ? ' | ' : ''}heartbeat stale detectado` : details,
      isActive: isSystemStatusActive(status) && !stale,
      isStale: stale,
    } satisfies EffectiveSystemStatusRecord;
  });

  const freshActive = normalized.filter((record) => record.isActive).sort(sortByPriorityAndRecency);
  if (freshActive.length > 0) return freshActive[0];

  const settled = normalized.filter((record) => !record.isStale).sort(sortByPriorityAndRecency);
  if (settled.length > 0) return settled[0];

  return [...normalized].sort(sortByPriorityAndRecency)[0] || {
    serviceName: '',
    status: 'UNKNOWN',
    lastRun: null,
    details: '',
    isActive: false,
    isStale: false,
  };
};
