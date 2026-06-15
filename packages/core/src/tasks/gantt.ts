import type { TaskDependency, TaskSummary } from './types';

export type TaskGanttPresentationRow = {
  task: TaskSummary;
  start: Date;
  end: Date;
  startOffsetDays: number;
  spanDays: number;
  predecessorProtocols: string[];
  conflictingPredecessorProtocols: string[];
  hasScheduleConflict: boolean;
  scheduleConflictReason: string | null;
};

export type TaskGanttTick = {
  key: string;
  offset: number;
  label: string;
};

export type TaskGanttPresentation = {
  rows: TaskGanttPresentationRow[];
  timelineStart: Date;
  timelineEnd: Date;
  totalDays: number;
  ticks: TaskGanttTick[];
  monthTicks: TaskGanttTick[];
  hasTodayMarker: boolean;
  todayOffset: number;
};

export const parseTaskGanttDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

export const diffTaskGanttCalendarDays = (start: Date, end: Date) => {
  const dayMs = 1000 * 60 * 60 * 24;
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUtc - startUtc) / dayMs);
};

export const hasTaskScheduleConflict = (
  predecessorDueDate: string | null,
  successorStartDate: string | null
) => {
  const predecessor = parseTaskGanttDate(predecessorDueDate);
  const successor = parseTaskGanttDate(successorStartDate);
  if (!predecessor || !successor) return false;
  return predecessor.getTime() > successor.getTime();
};

export const buildTaskScheduleConflictReason = (
  predecessorProtocolId: string,
  predecessorDueDate: string | null,
  successorStartDate: string | null
) => {
  if (!hasTaskScheduleConflict(predecessorDueDate, successorStartDate)) return null;
  return `A predecessora ${predecessorProtocolId} termina em ${predecessorDueDate} e esta tarefa inicia em ${successorStartDate}.`;
};

export const buildTaskGanttPresentation = (
  tasks: TaskSummary[],
  dependencies: TaskDependency[],
  options?: {
    compareTasks?: (left: TaskSummary, right: TaskSummary) => number;
    locale?: string;
    keyPrefix?: string;
  }
): TaskGanttPresentation | null => {
  const locale = options?.locale || 'pt-BR';
  const datedRows = tasks
    .map((task) => ({
      task,
      start: parseTaskGanttDate(task.startDate),
      end: parseTaskGanttDate(task.dueDate),
    }))
    .filter((row): row is { task: TaskSummary; start: Date; end: Date } => Boolean(row.start && row.end))
    .sort((left, right) => {
      const startGap = left.start.getTime() - right.start.getTime();
      if (startGap !== 0) return startGap;
      const sortGap =
        (left.task.projectSortOrder ?? Number.MAX_SAFE_INTEGER) -
        (right.task.projectSortOrder ?? Number.MAX_SAFE_INTEGER);
      if (sortGap !== 0) return sortGap;
      return options?.compareTasks ? options.compareTasks(left.task, right.task) : left.task.title.localeCompare(right.task.title, locale);
    });

  if (!datedRows.length) return null;

  const timelineStart = datedRows.reduce((min, row) => (row.start < min ? row.start : min), datedRows[0].start);
  const timelineEnd = datedRows.reduce((max, row) => (row.end > max ? row.end : max), datedRows[0].end);
  const totalDays = Math.max(diffTaskGanttCalendarDays(timelineStart, timelineEnd) + 1, 1);
  const tickStep = Math.max(Math.floor(totalDays / 6), 1);
  const prefix = options?.keyPrefix || 'gantt';

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayOffset = diffTaskGanttCalendarDays(timelineStart, todayStart);
  const hasTodayMarker = todayOffset >= 0 && todayOffset <= totalDays - 1;

  const ticks = Array.from({ length: Math.max(Math.ceil(totalDays / tickStep), 2) }, (_, index) => {
    const offset = Math.min(index * tickStep, totalDays - 1);
    const date = new Date(timelineStart);
    date.setDate(date.getDate() + offset);
    return {
      key: `${prefix}-${offset}`,
      offset,
      label: date.toLocaleDateString(locale, { day: '2-digit', month: 'short' }),
    };
  });

  const monthTicks: TaskGanttTick[] = [];
  const monthCursor = new Date(timelineStart.getFullYear(), timelineStart.getMonth(), 1);
  while (monthCursor <= timelineEnd) {
    const offset = Math.max(0, diffTaskGanttCalendarDays(timelineStart, monthCursor));
    monthTicks.push({
      key: `${prefix}-${monthCursor.getFullYear()}-${monthCursor.getMonth()}`,
      offset,
      label: monthCursor.toLocaleDateString(locale, { month: 'short', year: 'numeric' }),
    });
    monthCursor.setMonth(monthCursor.getMonth() + 1);
  }

  const tasksById = new Map(datedRows.map(({ task }) => [task.id, task]));
  const dependencyBySuccessor = new Map<
    string,
    Array<{
      protocolId: string;
      hasConflict: boolean;
      reason: string | null;
    }>
  >();

  for (const dependency of dependencies) {
    const predecessorTask = tasksById.get(dependency.predecessorTaskId);
    const successorTask = tasksById.get(dependency.successorTaskId);
    if (!predecessorTask || !successorTask) continue;
    const protocolId = predecessorTask.protocolId;
    const hasConflict = hasTaskScheduleConflict(predecessorTask.dueDate, successorTask.startDate);
    const current = dependencyBySuccessor.get(dependency.successorTaskId) || [];
    current.push({
      protocolId,
      hasConflict,
      reason: buildTaskScheduleConflictReason(protocolId, predecessorTask.dueDate, successorTask.startDate),
    });
    dependencyBySuccessor.set(dependency.successorTaskId, current);
  }

  return {
    rows: datedRows.map(({ task, start, end }) => {
      const startOffsetDays = diffTaskGanttCalendarDays(timelineStart, start);
      const spanDays = Math.max(diffTaskGanttCalendarDays(start, end) + 1, 1);
      const predecessors = dependencyBySuccessor.get(task.id) || [];
      const conflictingPredecessorProtocols = predecessors.filter((item) => item.hasConflict).map((item) => item.protocolId);
      const firstConflict = predecessors.find((item) => item.hasConflict);
      return {
        task,
        start,
        end,
        startOffsetDays,
        spanDays,
        predecessorProtocols: predecessors.map((item) => item.protocolId),
        conflictingPredecessorProtocols,
        hasScheduleConflict: conflictingPredecessorProtocols.length > 0,
        scheduleConflictReason: firstConflict?.reason || null,
      };
    }),
    timelineStart,
    timelineEnd,
    totalDays,
    ticks,
    monthTicks,
    hasTodayMarker,
    todayOffset,
  };
};
