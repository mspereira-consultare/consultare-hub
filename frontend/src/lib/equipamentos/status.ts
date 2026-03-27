import {
  CALIBRATION_WARNING_DAYS,
  EQUIPMENT_CALIBRATION_STATUSES,
  type EquipmentCalibrationStatus,
} from '@/lib/equipamentos/constants';

const normalizeDate = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [day, month, year] = raw.split('/');
    return `${year}-${month}-${day}`;
  }
  return null;
};

export const getTodayInSaoPauloIso = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

export const computeCalibrationStatus = (
  calibrationRequired: boolean,
  nextCalibrationDate: string | null | undefined,
): EquipmentCalibrationStatus => {
  if (!calibrationRequired) return 'NAO_APLICAVEL';
  const nextDate = normalizeDate(nextCalibrationDate);
  if (!nextDate) return 'SEM_PROGRAMACAO';

  const today = getTodayInSaoPauloIso();
  if (nextDate < today) return 'VENCIDO';

  const deadline = new Date(`${today}T00:00:00-03:00`);
  deadline.setDate(deadline.getDate() + CALIBRATION_WARNING_DAYS);
  const next = new Date(`${nextDate}T00:00:00-03:00`);
  if (next.getTime() <= deadline.getTime()) return 'VENCENDO';
  return 'EM_DIA';
};

export const getCalibrationStatusLabel = (status: EquipmentCalibrationStatus) =>
  EQUIPMENT_CALIBRATION_STATUSES.find((item) => item.value === status)?.label || status;
