export type AgendaOccupancyJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type AgendaOccupancyJob = {
  id: string;
  status: AgendaOccupancyJobStatus;
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

export type AgendaOccupancyRow = {
  especialidadeId: number;
  especialidadeNome: string;
  agendamentosCount: number;
  horariosDisponiveisCount: number;
  horariosBloqueadosCount: number;
  capacidadeLiquidaCount: number;
  taxaConfirmacaoPct: number;
};

export type AgendaOccupancyFilters = {
  startDate?: string;
  endDate?: string;
  unitId?: 'all' | '2' | '3' | '12';
};

export type AgendaOccupancyResult = {
  rows: AgendaOccupancyRow[];
  totals: {
    especialidades: number;
    agendamentos: number;
    horariosDisponiveis: number;
    horariosBloqueados: number;
    capacidadeLiquida: number;
    taxaConfirmacaoPct: number;
  };
};

export type AgendaOccupancyDailyRow = {
  dataRef: string;
  unidadeId: number;
  unidadeNome: string;
  especialidadeId: number;
  especialidadeNome: string;
  agendamentosCount: number;
  horariosDisponiveisCount: number;
  horariosBloqueadosCount: number;
  capacidadeLiquidaCount: number;
  taxaConfirmacaoPct: number;
  updatedAt: string;
};

export const AGENDA_OCCUPANCY_DEFAULT_UNITS = [2, 3, 12] as const;
