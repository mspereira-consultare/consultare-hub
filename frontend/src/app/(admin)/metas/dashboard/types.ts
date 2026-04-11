export interface DashboardGoal {
  goal_id: number;
  name: string;
  target: number;
  current: number;
  percentage: number;
  unit: string;
  periodicity: string;
  scope: 'CLINIC' | 'CARD';
  status: 'SUCCESS' | 'WARNING' | 'DANGER';
  sector?: string;
  start_date?: string;
  end_date?: string;
  filter_group?: string;
  clinic_unit?: string;
  team?: string;
  collaborator?: string;
  linked_kpi_id?: string;
}

export type GoalFilters = {
  name: string;
  status: string;
  scope: string;
  periodicity: string;
  clinic_unit: string;
  unit: string;
  sector: string;
  linked_kpi_id: string;
  filter_group: string;
  collaborator: string;
  team: string;
  start_date: string;
  end_date: string;
  target_min: string;
  target_max: string;
};
