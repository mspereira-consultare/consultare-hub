import type {
  ExecutiveConfigurationSnapshot,
  ExecutiveProfileKey,
  ExecutiveProfilePreviewRow,
  ExecutiveProfileRule,
  ExecutiveProfileWidgetConfig,
  ExecutiveUserOverride,
} from '@/lib/dashboard_executive/types';

export const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

export const normalizeText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const parseCsv = (value: string) =>
  Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );

export const formatCsv = (values: string[]) => values.join(', ');

export const resolutionSourceLabel: Record<ExecutiveProfilePreviewRow['resolutionSource'], string> = {
  legacy_scope: 'Escopo legado',
  profile_rule: 'Regra',
  user_override: 'Override',
  unconfigured: 'Sem configuração',
};

export const resolutionSourceClass: Record<ExecutiveProfilePreviewRow['resolutionSource'], string> = {
  legacy_scope: 'bg-slate-100 text-slate-700 border-slate-200',
  profile_rule: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  user_override: 'bg-blue-50 text-blue-700 border-blue-200',
  unconfigured: 'bg-amber-50 text-amber-700 border-amber-200',
};

export const cloneExecutiveConfig = (config: ExecutiveConfigurationSnapshot): ExecutiveConfigurationSnapshot => ({
  profiles: config.profiles.map((item) => ({ ...item })),
  widgets: config.widgets.map((item) => ({ ...item })),
  profileWidgets: config.profileWidgets.map((item) => ({ ...item })),
  rules: config.rules.map((item) => ({ ...item, units: [...item.units] })),
  overrides: config.overrides.map((item) => ({
    ...item,
    visibleWidgetKeys: [...item.visibleWidgetKeys],
    departments: [...item.departments],
    teams: [...item.teams],
    units: [...item.units],
  })),
});

export const createEmptyRule = (profileKey: ExecutiveProfileKey): ExecutiveProfileRule => ({
  id: crypto.randomUUID(),
  profileKey,
  department: null,
  jobTitle: null,
  units: [],
  isActive: true,
  updatedAt: null,
  updatedBy: null,
});

export const createEmptyOverride = (userId: string, profileKey: ExecutiveProfileKey): ExecutiveUserOverride => ({
  userId,
  profileKey,
  visibleWidgetKeys: [],
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
