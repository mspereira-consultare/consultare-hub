export type ExecutiveAreaKey =
  | 'financeiro'
  | 'comercial'
  | 'operacao'
  | 'pessoas'
  | 'qualidade';

export type ExecutiveIndicatorStatus = 'SUCCESS' | 'WARNING' | 'DANGER' | 'NO_DATA';
export type ExecutiveTrend = 'up' | 'down' | 'stable' | 'unknown';

export type ExecutiveScope = {
  userId: string;
  areas: ExecutiveAreaKey[];
  departments: string[];
  teams: string[];
  units: string[];
  updatedAt: string | null;
  updatedBy: string | null;
};

export type ExecutiveIndicator = {
  areaKey: ExecutiveAreaKey;
  indicatorKey: string;
  label: string;
  format: 'number' | 'currency' | 'percent' | 'minutes' | 'text';
  currentValue: number | null;
  dayValue: number | null;
  weekValue: number | null;
  monthValue: number | null;
  targetValue: number | null;
  projectionValue: number | null;
  status: ExecutiveIndicatorStatus;
  trend: ExecutiveTrend;
  sourceUpdatedAt: string | null;
  scopeApplied: {
    units: string[];
    departments: string[];
    teams: string[];
  };
  note: string | null;
};

export type ExecutiveAreaBlock = {
  areaKey: ExecutiveAreaKey;
  label: string;
  summary: string;
  status: ExecutiveIndicatorStatus;
  indicators: ExecutiveIndicator[];
  updatedAt: string | null;
};

export type ExecutivePriority = {
  areaKey: ExecutiveAreaKey;
  title: string;
  description: string;
  severity: 'high' | 'medium';
};

export type ExecutiveLiveHeartbeat = {
  serviceName: string;
  status: string;
  lastRun: string | null;
  details: string | null;
};

export type ExecutiveLiveOperations = {
  medicQueue: number;
  receptionQueue: number;
  whatsappQueue: number;
  criticalWaitCount: number;
  attendedToday: number;
  averageReceptionWaitMinutes: number;
  heartbeats: ExecutiveLiveHeartbeat[];
};

export type ExecutiveMetricsPayload = {
  generatedAt: string;
  scope: Omit<ExecutiveScope, 'updatedAt' | 'updatedBy'>;
  overallStatus: ExecutiveIndicatorStatus;
  executiveSummary: string;
  aiStatus: 'PENDING_PHASE_2';
  areas: ExecutiveAreaBlock[];
  topPriorities: ExecutivePriority[];
  liveOperations: ExecutiveLiveOperations;
};

export type ExecutiveSnapshotStatus = 'COMPLETED' | 'FAILED';

export type ExecutiveSnapshot = {
  id: string;
  userId: string;
  scopeHash: string;
  status: ExecutiveSnapshotStatus;
  metrics: ExecutiveMetricsPayload;
  aiSummary: null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  requestedBy: string | null;
};
