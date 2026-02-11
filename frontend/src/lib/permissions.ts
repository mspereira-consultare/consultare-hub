export type UserRole = 'ADMIN' | 'GESTOR' | 'OPERADOR';
export type PermissionAction = 'view' | 'edit' | 'refresh';

export type PageKey =
  | 'dashboard'
  | 'monitor'
  | 'financeiro'
  | 'contratos'
  | 'propostas'
  | 'metas_dashboard'
  | 'metas'
  | 'produtividade'
  | 'checklist_crc'
  | 'checklist_recepcao'
  | 'users'
  | 'settings';

export type PagePermission = {
  view: boolean;
  edit: boolean;
  refresh: boolean;
};

export type PermissionMatrix = Record<PageKey, PagePermission>;

export const PAGE_DEFS: Array<{ key: PageKey; label: string; path: string }> = [
  { key: 'dashboard', label: 'Visao Geral', path: '/dashboard' },
  { key: 'monitor', label: 'Monitor', path: '/monitor' },
  { key: 'financeiro', label: 'Financeiro', path: '/financeiro' },
  { key: 'contratos', label: 'ResolveSaude', path: '/contratos' },
  { key: 'propostas', label: 'Propostas', path: '/propostas' },
  { key: 'metas_dashboard', label: 'Painel de Metas', path: '/metas/dashboard' },
  { key: 'metas', label: 'Gestao de Metas', path: '/metas' },
  { key: 'produtividade', label: 'Produtividade', path: '/produtividade' },
  { key: 'checklist_crc', label: 'Checklist CRC', path: '/checklist-crc' },
  { key: 'checklist_recepcao', label: 'Checklist Recepcao', path: '/checklist-recepcao' },
  { key: 'users', label: 'Usuarios', path: '/users' },
  { key: 'settings', label: 'Configuracoes', path: '/settings' },
];

export const PAGE_KEYS: PageKey[] = PAGE_DEFS.map((p) => p.key);

const emptyPermission = (): PagePermission => ({ view: false, edit: false, refresh: false });

export const createEmptyMatrix = (): PermissionMatrix => {
  const out = {} as PermissionMatrix;
  for (const key of PAGE_KEYS) out[key] = emptyPermission();
  return out;
};

const setMany = (matrix: PermissionMatrix, keys: PageKey[], patch: Partial<PagePermission>) => {
  for (const key of keys) {
    matrix[key] = {
      view: patch.view ?? matrix[key].view,
      edit: patch.edit ?? matrix[key].edit,
      refresh: patch.refresh ?? matrix[key].refresh,
    };
  }
};

export const getDefaultMatrixByRole = (roleRaw: string): PermissionMatrix => {
  const role = String(roleRaw || 'OPERADOR').toUpperCase() as UserRole;
  const matrix = createEmptyMatrix();

  if (role === 'ADMIN') {
    setMany(matrix, PAGE_KEYS, { view: true, edit: true, refresh: true });
    return matrix;
  }

  if (role === 'GESTOR') {
    setMany(matrix, ['dashboard', 'monitor', 'financeiro', 'contratos', 'propostas', 'metas_dashboard', 'metas', 'produtividade', 'checklist_crc', 'checklist_recepcao'], { view: true });
    setMany(matrix, ['monitor', 'financeiro', 'contratos', 'propostas', 'metas', 'produtividade', 'checklist_crc', 'checklist_recepcao'], { edit: true });
    setMany(matrix, ['monitor', 'financeiro', 'contratos', 'propostas', 'produtividade', 'checklist_crc', 'checklist_recepcao'], { refresh: true });
    return matrix;
  }

  setMany(matrix, ['dashboard', 'monitor', 'metas_dashboard', 'produtividade', 'checklist_crc', 'checklist_recepcao'], { view: true });
  setMany(matrix, ['checklist_crc', 'checklist_recepcao'], { edit: true });
  setMany(matrix, ['monitor', 'produtividade', 'checklist_crc', 'checklist_recepcao'], { refresh: true });
  return matrix;
};

const toBool = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const raw = String(value || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
};

export const sanitizeMatrix = (input: unknown, roleRaw = 'OPERADOR'): PermissionMatrix => {
  const base = getDefaultMatrixByRole(roleRaw);
  if (!input || typeof input !== 'object') return base;
  const src = input as Record<string, any>;

  for (const key of PAGE_KEYS) {
    const raw = src[key];
    if (!raw || typeof raw !== 'object') continue;
    base[key] = {
      view: toBool(raw.view),
      edit: toBool(raw.edit),
      refresh: toBool(raw.refresh),
    };
  }

  return base;
};

export const hasPermission = (
  matrixRaw: unknown,
  page: PageKey,
  action: PermissionAction,
  roleRaw = 'OPERADOR'
) => {
  const matrix = sanitizeMatrix(matrixRaw, roleRaw);
  return Boolean(matrix[page]?.[action]);
};

export const hasAnyRefresh = (matrixRaw: unknown, roleRaw = 'OPERADOR') => {
  const matrix = sanitizeMatrix(matrixRaw, roleRaw);
  return PAGE_KEYS.some((key) => matrix[key].refresh);
};

export const getPageFromPath = (pathname: string): PageKey | null => {
  const path = String(pathname || '').trim();

  if (path === '/dashboard') return 'dashboard';
  if (path === '/monitor') return 'monitor';
  if (path === '/financeiro') return 'financeiro';
  if (path === '/contratos') return 'contratos';
  if (path === '/propostas') return 'propostas';
  if (path === '/produtividade') return 'produtividade';
  if (path === '/metas/dashboard') return 'metas_dashboard';
  if (path === '/metas') return 'metas';
  if (path === '/checklist-crc') return 'checklist_crc';
  if (path === '/checklist-recepcao') return 'checklist_recepcao';
  if (path === '/users') return 'users';
  if (path === '/settings') return 'settings';

  if (path.startsWith('/api/admin/financial/')) return 'financeiro';
  if (path.startsWith('/api/admin/contratos')) return 'contratos';
  if (path.startsWith('/api/admin/propostas')) return 'propostas';
  if (path.startsWith('/api/admin/produtividade')) return 'produtividade';
  if (path.startsWith('/api/admin/user-teams')) return 'produtividade';
  if (path.startsWith('/api/admin/teams')) return 'produtividade';
  if (path.startsWith('/api/admin/goals')) return 'metas';
  if (path.startsWith('/api/admin/options/')) return 'metas';
  if (path.startsWith('/api/admin/checklist/crc')) return 'checklist_crc';
  if (path.startsWith('/api/admin/checklist/recepcao')) return 'checklist_recepcao';
  if (path.startsWith('/api/admin/users')) return 'users';
  if (path.startsWith('/api/admin/settings')) return 'settings';

  return null;
};

