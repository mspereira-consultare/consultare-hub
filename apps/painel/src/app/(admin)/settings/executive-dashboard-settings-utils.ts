import type {
  ExecutiveConfigurationSnapshot,
  ExecutiveGroupDefinition,
  ExecutiveProfileKey,
  ExecutiveProfilePreviewRow,
  ExecutiveProfileWidgetConfig,
  ExecutiveScopeMode,
  ExecutiveUserException,
} from '@/lib/dashboard_executive/types';

export const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

export const normalizeText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const resolutionSourceLabel: Record<ExecutiveProfilePreviewRow['resolutionSource'], string> = {
  group_mapping: 'Grupo',
  user_exception: 'Exceção',
  unconfigured: 'Sem configuração',
};

export const resolutionSourceClass: Record<ExecutiveProfilePreviewRow['resolutionSource'], string> = {
  group_mapping: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  user_exception: 'bg-blue-50 text-blue-700 border-blue-200',
  unconfigured: 'bg-amber-50 text-amber-700 border-amber-200',
};

export const scopeModeLabel: Record<ExecutiveScopeMode, string> = {
  unrestricted: 'Sem restrição',
  employee_department: 'Departamento do colaborador',
  employee_units: 'Unidades do colaborador',
  employee_department_and_units: 'Departamento e unidades do colaborador',
  custom: 'Escopo customizado',
};

export const cloneExecutiveConfig = (config: ExecutiveConfigurationSnapshot): ExecutiveConfigurationSnapshot => ({
  profiles: config.profiles.map((item) => ({ ...item })),
  widgets: config.widgets.map((item) => ({ ...item })),
  profileWidgets: config.profileWidgets.map((item) => ({ ...item })),
  groups: config.groups.map((item) => ({
    ...item,
    departments: [...item.departments],
    teams: [...item.teams],
    units: [...item.units],
  })),
  jobTitles: config.jobTitles.map((item) => ({ ...item })),
  userExceptions: config.userExceptions.map((item) => ({
    ...item,
    addedWidgetKeys: [...item.addedWidgetKeys],
    hiddenWidgetKeys: [...item.hiddenWidgetKeys],
    departments: [...item.departments],
    teams: [...item.teams],
    units: [...item.units],
  })),
});

export const createEmptyGroup = (profileKey: ExecutiveProfileKey): ExecutiveGroupDefinition => ({
  id: crypto.randomUUID(),
  key: '',
  label: '',
  description: null,
  defaultProfileKey: profileKey,
  scopeMode: 'unrestricted',
  departments: [],
  teams: [],
  units: [],
  isActive: true,
  sortOrder: 999,
  updatedAt: null,
  updatedBy: null,
});

export const createEmptyException = (userId: string, profileKey: ExecutiveProfileKey): ExecutiveUserException => ({
  userId,
  profileKeyOverride: profileKey,
  addedWidgetKeys: [],
  hiddenWidgetKeys: [],
  scopeModeOverride: null,
  departments: [],
  teams: [],
  units: [],
  isActive: true,
  updatedAt: null,
  updatedBy: null,
});

export const compareProfileWidgets = (a: ExecutiveProfileWidgetConfig, b: ExecutiveProfileWidgetConfig) => {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.widgetKey.localeCompare(b.widgetKey);
};
