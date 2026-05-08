export type ExecutiveAreaKey =
  | 'financeiro'
  | 'comercial'
  | 'operacao'
  | 'pessoas'
  | 'qualidade';

export type ExecutiveProfileKey =
  | 'diretoria_gerencia_adm'
  | 'gerencia_operacional'
  | 'lider_unidades'
  | 'lider_operacional'
  | 'agendas'
  | 'financeiro'
  | 'marketing'
  | 'rh'
  | 'crc';

export type ExecutiveWidgetStatus = 'available' | 'planned' | 'blocked';
export type ExecutiveScopeResolutionSource = 'legacy_scope' | 'profile_rule' | 'user_override' | 'unconfigured';

export type ExecutiveWidgetKey =
  | 'tarefas'
  | 'aniversariantes_dia'
  | 'banco_horas'
  | 'estoque_vencendo'
  | 'agenda_calendario'
  | 'ocupacao_agendas'
  | 'confirmacao_agendas'
  | 'monitoramento_filas'
  | 'faturamento_hoje_meta'
  | 'faturamento_mes_meta'
  | 'contas_aberto'
  | 'nf_aberto'
  | 'mapa_semanal_agendas'
  | 'google'
  | 'reclame_aqui'
  | 'progresso_metas'
  | 'documentos_equipamentos_vencendo'
  | 'recoletas'
  | 'faturamento_campanha_conversao'
  | 'tempo_empresa_um_ano'
  | 'demanda_whatsapp'
  | 'fila_telefonia'
  | 'propostas_aberto'
  | 'mapa_diario_agendas'
  | 'ultima_inspecao'
  | 'contas_semana'
  | 'notas_fiscais'
  | 'previsto_realizado'
  | 'estornos_pendentes'
  | 'investimento_ads'
  | 'agendamento_diario_meta'
  | 'agendamento_mensal_meta'
  | 'contratos_pendentes_vencidos';

export type ExecutiveIndicatorStatus = 'SUCCESS' | 'WARNING' | 'DANGER' | 'NO_DATA';
export type ExecutiveTrend = 'up' | 'down' | 'stable' | 'unknown';

export type ExecutiveWidgetDefinition = {
  key: ExecutiveWidgetKey;
  label: string;
  areaKey: ExecutiveAreaKey;
  status: ExecutiveWidgetStatus;
  sourceKey: string | null;
  description: string | null;
  sortOrder: number;
};

export type ExecutiveProfileDefinition = {
  key: ExecutiveProfileKey;
  label: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type ExecutiveProfileWidgetConfig = {
  profileKey: ExecutiveProfileKey;
  widgetKey: ExecutiveWidgetKey;
  isVisible: boolean;
  sortOrder: number;
};

export type ExecutiveProfileRule = {
  id: string;
  profileKey: ExecutiveProfileKey;
  department: string | null;
  jobTitle: string | null;
  units: string[];
  isActive: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type ExecutiveUserOverride = {
  userId: string;
  profileKey: ExecutiveProfileKey | null;
  visibleWidgetKeys: ExecutiveWidgetKey[];
  departments: string[];
  teams: string[];
  units: string[];
  isActive: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type ExecutiveResolvedProfile = {
  profileKey: ExecutiveProfileKey | null;
  visibleWidgetKeys: ExecutiveWidgetKey[];
  resolutionSource: ExecutiveScopeResolutionSource;
  matchedRuleId: string | null;
};

export type ExecutiveScope = {
  userId: string;
  areas: ExecutiveAreaKey[];
  departments: string[];
  teams: string[];
  units: string[];
  profileKey: ExecutiveProfileKey | null;
  visibleWidgetKeys: ExecutiveWidgetKey[];
  resolutionSource: ExecutiveScopeResolutionSource;
  matchedRuleId: string | null;
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
  profile: ExecutiveResolvedProfile;
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

export type ExecutiveConfigurationSnapshot = {
  profiles: ExecutiveProfileDefinition[];
  widgets: ExecutiveWidgetDefinition[];
  profileWidgets: ExecutiveProfileWidgetConfig[];
  rules: ExecutiveProfileRule[];
  overrides: ExecutiveUserOverride[];
};
