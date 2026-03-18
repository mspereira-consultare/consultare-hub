export type UserRole = 'ADMIN' | 'GESTOR' | 'OPERADOR';
export type PermissionAction = 'view' | 'edit' | 'refresh';

export type PageKey =
  | 'dashboard'
  | 'monitor'
  | 'financeiro'
  | 'contratos'
  | 'propostas'
  | 'repasses'
  | 'marketing_funil'
  | 'agenda_ocupacao'
  | 'metas_dashboard'
  | 'metas'
  | 'produtividade'
  | 'agendamentos'
  | 'profissionais'
  | 'qualidade_documentos'
  | 'qualidade_treinamentos'
  | 'qualidade_auditorias'
  | 'checklist_crc'
  | 'checklist_recepcao'
  | 'ajuda'
  | 'users'
  | 'contract_templates'
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
  { key: 'repasses', label: 'Fechamento de Repasses', path: '/repasses' },
  { key: 'marketing_funil', label: 'Marketing - Funil', path: '/marketing/funil' },
  { key: 'agenda_ocupacao', label: 'Ocupacao de Agenda', path: '/agenda-ocupacao' },
  { key: 'metas_dashboard', label: 'Painel de Metas', path: '/metas/dashboard' },
  { key: 'metas', label: 'Gestao de Metas', path: '/metas' },
  { key: 'produtividade', label: 'Produtividade', path: '/produtividade' },
  { key: 'agendamentos', label: 'Agendamentos', path: '/agendamentos' },
  { key: 'profissionais', label: 'Profissionais', path: '/profissionais' },
  { key: 'qualidade_documentos', label: 'Qualidade - Documentos', path: '/qualidade/documentos' },
  { key: 'qualidade_treinamentos', label: 'Qualidade - Treinamentos', path: '/qualidade/treinamentos' },
  { key: 'qualidade_auditorias', label: 'Qualidade - Auditorias', path: '/qualidade/auditorias' },
  { key: 'checklist_crc', label: 'Checklist CRC', path: '/checklist-crc' },
  { key: 'checklist_recepcao', label: 'Checklist Recepcao', path: '/checklist-recepcao' },
  { key: 'ajuda', label: 'Ajuda', path: '/ajuda' },
  { key: 'users', label: 'Usuarios', path: '/users' },
  { key: 'contract_templates', label: 'Modelos de Contrato', path: '/modelos-contrato' },
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
    setMany(matrix, ['dashboard', 'monitor', 'financeiro', 'contratos', 'propostas', 'metas_dashboard', 'metas', 'produtividade', 'agendamentos', 'profissionais', 'qualidade_documentos', 'qualidade_treinamentos', 'qualidade_auditorias', 'checklist_crc', 'checklist_recepcao', 'ajuda'], { view: true });
    setMany(matrix, ['monitor', 'financeiro', 'contratos', 'propostas', 'metas', 'produtividade', 'agendamentos', 'profissionais', 'qualidade_documentos', 'qualidade_treinamentos', 'qualidade_auditorias', 'checklist_crc', 'checklist_recepcao'], { edit: true });
    setMany(matrix, ['monitor', 'financeiro', 'contratos', 'propostas', 'produtividade', 'agendamentos', 'profissionais', 'qualidade_documentos', 'qualidade_treinamentos', 'qualidade_auditorias', 'checklist_crc', 'checklist_recepcao'], { refresh: true });
    return matrix;
  }

  setMany(matrix, ['dashboard', 'monitor', 'metas_dashboard', 'produtividade', 'agendamentos', 'profissionais', 'qualidade_documentos', 'qualidade_treinamentos', 'qualidade_auditorias', 'checklist_crc', 'checklist_recepcao', 'ajuda'], { view: true });
  setMany(matrix, ['checklist_crc', 'checklist_recepcao'], { edit: true });
  setMany(matrix, ['monitor', 'produtividade', 'agendamentos', 'checklist_crc', 'checklist_recepcao'], { refresh: true });
  return matrix;
};

const toBool = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const raw = String(value || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
};

export const sanitizeMatrix = (input: unknown, roleRaw = 'OPERADOR'): PermissionMatrix => {
  const base = input && typeof input === 'object' ? createEmptyMatrix() : getDefaultMatrixByRole(roleRaw);
  if (!input || typeof input !== 'object') return base;
  const src = input as Record<string, unknown>;

  for (const key of PAGE_KEYS) {
    const raw = src[key];
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    base[key] = {
      view: toBool(item.view),
      edit: toBool(item.edit),
      refresh: toBool(item.refresh),
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
  if (path === '/repasses') return 'repasses';
  if (path === '/marketing/funil') return 'marketing_funil';
  if (path === '/agenda-ocupacao') return 'agenda_ocupacao';
  if (path === '/produtividade') return 'produtividade';
  if (path === '/agendamentos') return 'agendamentos';
  if (path === '/profissionais') return 'profissionais';
  if (path === '/qualidade/documentos') return 'qualidade_documentos';
  if (path === '/qualidade/treinamentos') return 'qualidade_treinamentos';
  if (path === '/qualidade/auditorias') return 'qualidade_auditorias';
  if (path === '/metas/dashboard') return 'metas_dashboard';
  if (path === '/metas') return 'metas';
  if (path === '/checklist-crc') return 'checklist_crc';
  if (path === '/checklist-recepcao') return 'checklist_recepcao';
  if (path === '/ajuda') return 'ajuda';
  if (path === '/users') return 'users';
  if (path === '/modelos-contrato') return 'contract_templates';
  if (path === '/settings') return 'settings';

  if (path.startsWith('/api/admin/financial/')) return 'financeiro';
  if (path.startsWith('/api/admin/contratos')) return 'contratos';
  if (path.startsWith('/api/admin/propostas')) return 'propostas';
  if (path.startsWith('/api/admin/repasses')) return 'repasses';
  if (path.startsWith('/api/admin/marketing/funil')) return 'marketing_funil';
  if (path.startsWith('/api/admin/agenda-ocupacao')) return 'agenda_ocupacao';
  if (path.startsWith('/api/admin/produtividade')) return 'produtividade';
  if (path.startsWith('/api/admin/user-teams')) return 'produtividade';
  if (path.startsWith('/api/admin/teams')) return 'produtividade';
  if (path.startsWith('/api/admin/agendamentos')) return 'agendamentos';
  if (path.startsWith('/api/admin/profissionais')) return 'profissionais';
  if (path.startsWith('/api/admin/qms/documentos')) return 'qualidade_documentos';
  if (path.startsWith('/api/admin/qms/treinamentos')) return 'qualidade_treinamentos';
  if (path.startsWith('/api/admin/qms/auditorias')) return 'qualidade_auditorias';
  if (path.startsWith('/api/admin/goals/dashboard')) return 'metas_dashboard';
  if (path.startsWith('/api/admin/goals')) return 'metas';
  if (path.startsWith('/api/admin/options/')) return 'metas';
  if (path.startsWith('/api/admin/checklist/crc')) return 'checklist_crc';
  if (path.startsWith('/api/admin/checklist/recepcao')) return 'checklist_recepcao';
  if (path.startsWith('/api/admin/users')) return 'users';
  if (path.startsWith('/api/admin/contract-templates')) return 'contract_templates';
  if (path.startsWith('/api/admin/settings')) return 'settings';

  return null;
};
