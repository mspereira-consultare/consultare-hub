export type BlockedAgendaJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type BlockedAgendaProfessionalSourceStatus = 'FEEGOW' | 'LOCAL' | 'FALLBACK';

export type BlockedAgendaRecurrenceFilter = 'all' | 'recurring' | 'single';
export type BlockedAgendaSituationFilter = 'active' | 'all';

export type BlockedAgendaFilters = {
  startDate?: string;
  endDate?: string;
  unitId?: 'all' | '2' | '3' | '12';
  professionalId?: string;
  recurrence?: BlockedAgendaRecurrenceFilter;
  situation?: BlockedAgendaSituationFilter;
  search?: string;
};

export type BlockedAgendaJob = {
  id: string;
  status: BlockedAgendaJobStatus;
  startDate: string;
  endDate: string;
  unitScope: number[];
  requestedBy: string;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
};

export type BlockedAgendaItem = {
  blockId: number;
  professionalId: number;
  professionalName: string;
  professionalSourceStatus: BlockedAgendaProfessionalSourceStatus;
  dateStart: string;
  dateEnd: string;
  timeStart: string;
  timeEnd: string;
  unitIds: number[];
  unitNamesText: string;
  weekDays: number[];
  description: string;
  isActiveInRange: boolean;
  isRecurring: boolean;
  isMultiUnit: boolean;
  statusLabels: string[];
  lastSyncedAt: string;
};

export type BlockedAgendaTotals = {
  totalBlocks: number;
  activeBlocks: number;
  professionalsWithActiveBlocks: number;
  recurringBlocks: number;
};

export type BlockedAgendaResult = {
  rows: BlockedAgendaItem[];
  totals: BlockedAgendaTotals;
  professionals: Array<{
    professionalId: number;
    professionalName: string;
  }>;
  dataJob: BlockedAgendaJob | null;
};

export const BLOCKED_AGENDAS_DEFAULT_UNITS = [2, 3, 12] as const;

const weekdayLabelMap: Record<number, string> = {
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sab',
  7: 'Dom',
};

export const formatBlockedAgendaWeekDaysShort = (weekDays: number[]) =>
  weekDays
    .map((day) => weekdayLabelMap[day])
    .filter(Boolean)
    .join(', ');
