export type UserRole = 'ADMIN' | 'GESTOR' | 'OPERADOR' | 'INTRANET';
export type PermissionAction = 'view' | 'edit' | 'refresh';
export type PermissionSurface = 'painel' | 'intranet' | 'compartilhado';
export type PermissionCriticality = 'standard' | 'sensitive' | 'critical';

export type PermissionModuleKey =
  | 'principal'
  | 'operacoes'
  | 'pessoas'
  | 'qualidade'
  | 'financeiro'
  | 'inteligencia'
  | 'marketing'
  | 'intranet'
  | 'sistema';

export type PageKey =
  | 'intranet_portal'
  | 'dashboard'
  | 'monitor'
  | 'financeiro'
  | 'contratos'
  | 'propostas'
  | 'propostas_pos_consulta'
  | 'propostas_gerencial'
  | 'repasses'
  | 'marketing_controle'
  | 'marketing_funil'
  | 'colaboradores'
  | 'folha_pagamento'
  | 'recrutamento'
  | 'equipamentos'
  | 'agenda_ocupacao'
  | 'metas_dashboard'
  | 'metas'
  | 'produtividade'
  | 'agendamentos'
  | 'profissionais'
  | 'profissionais_mapas'
  | 'qualidade_documentos'
  | 'vigilancia_sanitaria'
  | 'qualidade_treinamentos'
  | 'qualidade_auditorias'
  | 'checklist_crc'
  | 'checklist_recepcao'
  | 'intranet_dashboard'
  | 'intranet_tarefas'
  | 'intranet_navegacao'
  | 'intranet_paginas'
  | 'intranet_noticias'
  | 'intranet_faq'
  | 'intranet_catalogo'
  | 'intranet_audiencias'
  | 'intranet_escopos'
  | 'intranet_chat'
  | 'intranet_chatbot'
  | 'ajuda'
  | 'users'
  | 'dashboard_executive_governance'
  | 'contract_templates'
  | 'settings';

export type PagePermission = {
  view: boolean;
  edit: boolean;
  refresh: boolean;
};

export type PermissionMatrix = Record<PageKey, PagePermission>;
export type PermissionModuleDefinition = {
  key: PermissionModuleKey;
  label: string;
  description: string;
  sortOrder: number;
};

export type PermissionCatalogEntry = {
  key: PageKey;
  label: string;
  path: string;
  moduleKey: PermissionModuleKey;
  surface: PermissionSurface;
  criticality: PermissionCriticality;
};

export const PERMISSION_MODULES: PermissionModuleDefinition[] = [
  { key: 'principal', label: 'Principal', description: 'Entrada, visão geral e navegação inicial do painel.', sortOrder: 10 },
  { key: 'operacoes', label: 'Operações', description: 'Rotinas de atendimento, agenda, profissionais e checklists.', sortOrder: 20 },
  { key: 'pessoas', label: 'Gestão de Pessoas', description: 'Colaboradores, folha, recrutamento e vínculo usuário-colaborador.', sortOrder: 30 },
  { key: 'qualidade', label: 'Qualidade', description: 'Equipamentos, documentos, vigilância, treinamentos e auditorias.', sortOrder: 40 },
  { key: 'financeiro', label: 'Financeiro', description: 'Financeiro, contratos, propostas e repasses.', sortOrder: 50 },
  { key: 'inteligencia', label: 'Inteligência', description: 'Metas, produtividade, ocupação de agenda e governança executiva.', sortOrder: 60 },
  { key: 'marketing', label: 'Marketing', description: 'Controle e funil de marketing.', sortOrder: 70 },
  { key: 'intranet', label: 'Intranet', description: 'Portal, tarefas e administração editorial da intranet.', sortOrder: 80 },
  { key: 'sistema', label: 'Sistema', description: 'Usuários, configurações, ajuda e modelos administrativos.', sortOrder: 90 },
];

export const PAGE_DEFS: PermissionCatalogEntry[] = [
  { key: 'intranet_portal', label: 'Abrir Intranet', path: '/intranet', moduleKey: 'intranet', surface: 'compartilhado', criticality: 'standard' },
  { key: 'dashboard', label: 'Visão Geral', path: '/dashboard', moduleKey: 'principal', surface: 'painel', criticality: 'standard' },
  { key: 'monitor', label: 'Monitor', path: '/monitor', moduleKey: 'operacoes', surface: 'painel', criticality: 'standard' },
  { key: 'financeiro', label: 'Financeiro', path: '/financeiro', moduleKey: 'financeiro', surface: 'painel', criticality: 'sensitive' },
  { key: 'contratos', label: 'ResolveSaúde', path: '/contratos', moduleKey: 'financeiro', surface: 'painel', criticality: 'sensitive' },
  { key: 'propostas', label: 'Propostas - Base de trabalho', path: '/propostas', moduleKey: 'financeiro', surface: 'compartilhado', criticality: 'standard' },
  { key: 'propostas_pos_consulta', label: 'Propostas - Pós-consulta', path: '/propostas/pos-consulta', moduleKey: 'operacoes', surface: 'compartilhado', criticality: 'standard' },
  { key: 'propostas_gerencial', label: 'Propostas - Visão gerencial', path: '/propostas/gerencial', moduleKey: 'financeiro', surface: 'painel', criticality: 'sensitive' },
  { key: 'repasses', label: 'Fechamento de Repasses', path: '/repasses', moduleKey: 'financeiro', surface: 'painel', criticality: 'sensitive' },
  { key: 'marketing_controle', label: 'Marketing - Controle', path: '/marketing/controle', moduleKey: 'marketing', surface: 'painel', criticality: 'standard' },
  { key: 'marketing_funil', label: 'Marketing - Funil', path: '/marketing/funil', moduleKey: 'marketing', surface: 'painel', criticality: 'standard' },
  { key: 'colaboradores', label: 'Colaboradores', path: '/colaboradores', moduleKey: 'pessoas', surface: 'painel', criticality: 'sensitive' },
  { key: 'folha_pagamento', label: 'Folha de Pagamento', path: '/folha-pagamento', moduleKey: 'pessoas', surface: 'painel', criticality: 'critical' },
  { key: 'recrutamento', label: 'Recrutamento', path: '/recrutamento', moduleKey: 'pessoas', surface: 'painel', criticality: 'sensitive' },
  { key: 'equipamentos', label: 'Equipamentos', path: '/equipamentos', moduleKey: 'qualidade', surface: 'painel', criticality: 'standard' },
  { key: 'agenda_ocupacao', label: 'Ocupação de Agenda', path: '/agenda-ocupacao', moduleKey: 'inteligencia', surface: 'painel', criticality: 'standard' },
  { key: 'metas_dashboard', label: 'Painel de Metas', path: '/metas/dashboard', moduleKey: 'inteligencia', surface: 'compartilhado', criticality: 'standard' },
  { key: 'metas', label: 'Gestão de Metas', path: '/metas', moduleKey: 'inteligencia', surface: 'painel', criticality: 'sensitive' },
  { key: 'produtividade', label: 'Produtividade', path: '/produtividade', moduleKey: 'operacoes', surface: 'painel', criticality: 'standard' },
  { key: 'agendamentos', label: 'Agendamentos', path: '/agendamentos', moduleKey: 'operacoes', surface: 'painel', criticality: 'standard' },
  { key: 'profissionais', label: 'Profissionais', path: '/profissionais', moduleKey: 'operacoes', surface: 'painel', criticality: 'standard' },
  { key: 'profissionais_mapas', label: 'Mapas de Profissionais', path: '/profissionais/mapas', moduleKey: 'operacoes', surface: 'painel', criticality: 'standard' },
  { key: 'qualidade_documentos', label: 'Qualidade - POPs e Manuais', path: '/qualidade/documentos', moduleKey: 'qualidade', surface: 'painel', criticality: 'standard' },
  { key: 'vigilancia_sanitaria', label: 'Qualidade - Vigilância Sanitária', path: '/qualidade/vigilancia-sanitaria', moduleKey: 'qualidade', surface: 'painel', criticality: 'sensitive' },
  { key: 'qualidade_treinamentos', label: 'Qualidade - Treinamentos', path: '/qualidade/treinamentos', moduleKey: 'qualidade', surface: 'painel', criticality: 'standard' },
  { key: 'qualidade_auditorias', label: 'Qualidade - Auditorias', path: '/qualidade/auditorias', moduleKey: 'qualidade', surface: 'painel', criticality: 'sensitive' },
  { key: 'checklist_crc', label: 'Checklist CRC', path: '/checklist-crc', moduleKey: 'operacoes', surface: 'painel', criticality: 'standard' },
  { key: 'checklist_recepcao', label: 'Checklist Recepção', path: '/checklist-recepcao', moduleKey: 'operacoes', surface: 'painel', criticality: 'standard' },
  { key: 'intranet_dashboard', label: 'Intranet - Dashboard', path: '/gestao', moduleKey: 'intranet', surface: 'intranet', criticality: 'sensitive' },
  { key: 'intranet_tarefas', label: 'Intranet - Tarefas', path: '/tarefas', moduleKey: 'intranet', surface: 'compartilhado', criticality: 'standard' },
  { key: 'intranet_navegacao', label: 'Intranet - Navegação', path: '/gestao/navegacao', moduleKey: 'intranet', surface: 'intranet', criticality: 'sensitive' },
  { key: 'intranet_paginas', label: 'Intranet - Páginas', path: '/gestao/paginas', moduleKey: 'intranet', surface: 'intranet', criticality: 'sensitive' },
  { key: 'intranet_noticias', label: 'Intranet - Notícias e Avisos', path: '/gestao/noticias', moduleKey: 'intranet', surface: 'intranet', criticality: 'standard' },
  { key: 'intranet_faq', label: 'Intranet - FAQ', path: '/gestao/faq', moduleKey: 'intranet', surface: 'intranet', criticality: 'standard' },
  { key: 'intranet_catalogo', label: 'Intranet - Catálogo', path: '/gestao/catalogo', moduleKey: 'intranet', surface: 'intranet', criticality: 'standard' },
  { key: 'intranet_audiencias', label: 'Intranet - Audiências', path: '/gestao/audiencias', moduleKey: 'intranet', surface: 'intranet', criticality: 'sensitive' },
  { key: 'intranet_escopos', label: 'Intranet - Escopos Editoriais', path: '/gestao/escopos', moduleKey: 'intranet', surface: 'intranet', criticality: 'critical' },
  { key: 'intranet_chat', label: 'Intranet - Chat Interno', path: '/gestao/chat', moduleKey: 'intranet', surface: 'intranet', criticality: 'sensitive' },
  { key: 'intranet_chatbot', label: 'Intranet - Chatbot e Conhecimento', path: '/gestao/chatbot', moduleKey: 'intranet', surface: 'intranet', criticality: 'sensitive' },
  { key: 'ajuda', label: 'Ajuda', path: '/ajuda', moduleKey: 'sistema', surface: 'painel', criticality: 'standard' },
  { key: 'users', label: 'Usuários', path: '/users', moduleKey: 'sistema', surface: 'painel', criticality: 'critical' },
  { key: 'dashboard_executive_governance', label: 'Dashboard Executivo - Governança', path: '/dashboard-executivo', moduleKey: 'inteligencia', surface: 'painel', criticality: 'critical' },
  { key: 'contract_templates', label: 'Modelos de Contrato', path: '/modelos-contrato', moduleKey: 'sistema', surface: 'painel', criticality: 'sensitive' },
  { key: 'settings', label: 'Configurações', path: '/settings', moduleKey: 'sistema', surface: 'painel', criticality: 'critical' },
];

export const PAGE_KEYS: PageKey[] = PAGE_DEFS.map((p) => p.key);
export const PERMISSION_MODULE_KEYS: PermissionModuleKey[] = PERMISSION_MODULES.map((module) => module.key);

export const getPermissionCatalog = () => PAGE_DEFS;

export const getPageDefinition = (key: PageKey) =>
  PAGE_DEFS.find((page) => page.key === key) || null;

export const getPermissionModuleDefinition = (key: PermissionModuleKey) =>
  PERMISSION_MODULES.find((module) => module.key === key) || null;

export const getPagesByModule = (moduleKey: PermissionModuleKey) =>
  PAGE_DEFS.filter((page) => page.moduleKey === moduleKey);

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

export const INTRANET_BACKOFFICE_PAGE_KEYS: PageKey[] = [
  'intranet_dashboard',
  'intranet_tarefas',
  'intranet_navegacao',
  'intranet_paginas',
  'intranet_noticias',
  'intranet_faq',
  'intranet_catalogo',
  'intranet_audiencias',
  'intranet_escopos',
  'intranet_chat',
  'intranet_chatbot',
];

export const getDefaultMatrixByRole = (roleRaw: string): PermissionMatrix => {
  const role = String(roleRaw || 'OPERADOR').toUpperCase() as UserRole;
  const matrix = createEmptyMatrix();

  if (role === 'INTRANET') {
    // O papel basico do colaborador abre o portal da intranet e um pacote minimo do painel.
    setMany(matrix, ['intranet_portal', 'intranet_tarefas', 'propostas', 'propostas_pos_consulta', 'metas_dashboard'], { view: true });
    setMany(matrix, ['intranet_tarefas', 'propostas', 'propostas_pos_consulta'], { edit: true });
    setMany(matrix, ['propostas', 'propostas_pos_consulta', 'metas_dashboard'], { refresh: true });
    return matrix;
  }

  if (role === 'ADMIN') {
    setMany(matrix, PAGE_KEYS, { view: true, edit: true, refresh: true });
    return matrix;
  }

  if (role === 'GESTOR') {
    setMany(matrix, ['dashboard', 'monitor', 'financeiro', 'contratos', 'propostas', 'propostas_pos_consulta', 'propostas_gerencial', 'metas_dashboard', 'metas', 'produtividade', 'agendamentos', 'profissionais', 'profissionais_mapas', 'colaboradores', 'folha_pagamento', 'recrutamento', 'equipamentos', 'qualidade_documentos', 'vigilancia_sanitaria', 'qualidade_treinamentos', 'qualidade_auditorias', 'checklist_crc', 'checklist_recepcao', 'marketing_controle', 'marketing_funil', 'ajuda', 'dashboard_executive_governance', 'intranet_tarefas', ...INTRANET_BACKOFFICE_PAGE_KEYS], { view: true });
    setMany(matrix, ['monitor', 'financeiro', 'contratos', 'propostas', 'propostas_pos_consulta', 'metas', 'produtividade', 'agendamentos', 'profissionais', 'colaboradores', 'folha_pagamento', 'recrutamento', 'equipamentos', 'qualidade_documentos', 'vigilancia_sanitaria', 'qualidade_treinamentos', 'qualidade_auditorias', 'checklist_crc', 'checklist_recepcao', 'dashboard_executive_governance', 'intranet_tarefas', ...INTRANET_BACKOFFICE_PAGE_KEYS], { edit: true });
    setMany(matrix, ['monitor', 'financeiro', 'contratos', 'propostas', 'propostas_pos_consulta', 'propostas_gerencial', 'produtividade', 'agendamentos', 'profissionais', 'colaboradores', 'folha_pagamento', 'recrutamento', 'equipamentos', 'qualidade_documentos', 'vigilancia_sanitaria', 'qualidade_treinamentos', 'qualidade_auditorias', 'checklist_crc', 'checklist_recepcao', 'marketing_controle', 'marketing_funil', 'intranet_dashboard', 'intranet_chatbot'], { refresh: true });
    return matrix;
  }

  setMany(matrix, ['dashboard', 'monitor', 'propostas', 'propostas_pos_consulta', 'metas_dashboard', 'produtividade', 'agendamentos', 'profissionais', 'profissionais_mapas', 'colaboradores', 'equipamentos', 'qualidade_documentos', 'vigilancia_sanitaria', 'qualidade_treinamentos', 'qualidade_auditorias', 'checklist_crc', 'checklist_recepcao', 'marketing_funil', 'ajuda', 'intranet_tarefas'], { view: true });
  setMany(matrix, ['propostas', 'propostas_pos_consulta', 'checklist_crc', 'checklist_recepcao', 'intranet_tarefas'], { edit: true });
  setMany(matrix, ['monitor', 'produtividade', 'agendamentos', 'colaboradores', 'equipamentos', 'checklist_crc', 'checklist_recepcao'], { refresh: true });
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

export const getDefaultLandingPath = (matrixRaw: unknown, roleRaw = 'OPERADOR') => {
  const role = String(roleRaw || 'OPERADOR').toUpperCase() as UserRole;
  const preferredKeys: PageKey[] =
    role === 'INTRANET'
      ? ['intranet_portal', 'intranet_tarefas', 'propostas_pos_consulta', 'propostas', 'metas_dashboard']
      : ['dashboard'];

  for (const key of preferredKeys) {
    if (hasPermission(matrixRaw, key, 'view', role)) {
      return PAGE_DEFS.find((page) => page.key === key)?.path || '/dashboard';
    }
  }

  for (const page of PAGE_DEFS) {
    if (hasPermission(matrixRaw, page.key, 'view', role)) return page.path;
  }

  return role === 'INTRANET' ? '/intranet' : '/dashboard';
};

export const getPageFromPath = (pathname: string): PageKey | null => {
  const path = String(pathname || '').trim();

  if (path === '/intranet') return 'intranet_portal';
  if (path === '/dashboard') return 'dashboard';
  if (path === '/monitor') return 'monitor';
  if (path === '/financeiro') return 'financeiro';
  if (path === '/contratos') return 'contratos';
  if (path === '/propostas') return 'propostas';
  if (path === '/propostas/pos-consulta') return 'propostas_pos_consulta';
  if (path === '/propostas/gerencial') return 'propostas_gerencial';
  if (path === '/repasses') return 'repasses';
  if (path === '/marketing/controle') return 'marketing_controle';
  if (path === '/marketing/funil') return 'marketing_funil';
  if (path === '/colaboradores') return 'colaboradores';
  if (path === '/folha-pagamento') return 'folha_pagamento';
  if (path === '/recrutamento') return 'recrutamento';
  if (path === '/equipamentos') return 'equipamentos';
  if (path === '/agenda-ocupacao') return 'agenda_ocupacao';
  if (path === '/produtividade') return 'produtividade';
  if (path === '/agendamentos') return 'agendamentos';
  if (path === '/profissionais/mapas') return 'profissionais_mapas';
  if (path === '/profissionais') return 'profissionais';
  if (path === '/qualidade/documentos') return 'qualidade_documentos';
  if (path === '/qualidade/vigilancia-sanitaria') return 'vigilancia_sanitaria';
  if (path === '/qualidade/treinamentos') return 'qualidade_treinamentos';
  if (path === '/qualidade/auditorias') return 'qualidade_auditorias';
  if (path === '/metas/dashboard') return 'metas_dashboard';
  if (path === '/metas') return 'metas';
  if (path === '/checklist-crc') return 'checklist_crc';
  if (path === '/checklist-recepcao') return 'checklist_recepcao';
  if (path === '/gestao') return 'intranet_dashboard';
  if (path === '/tarefas') return 'intranet_tarefas';
  if (path === '/gestao/navegacao') return 'intranet_navegacao';
  if (path === '/gestao/paginas') return 'intranet_paginas';
  if (path === '/gestao/noticias') return 'intranet_noticias';
  if (path === '/gestao/faq') return 'intranet_faq';
  if (path === '/gestao/catalogo') return 'intranet_catalogo';
  if (path === '/gestao/audiencias') return 'intranet_audiencias';
  if (path === '/gestao/escopos') return 'intranet_escopos';
  if (path === '/gestao/chat') return 'intranet_chat';
  if (path === '/gestao/chatbot') return 'intranet_chatbot';
  if (path === '/ajuda') return 'ajuda';
  if (path === '/users') return 'users';
  if (path === '/dashboard-executivo') return 'dashboard_executive_governance';
  if (path === '/modelos-contrato') return 'contract_templates';
  if (path === '/settings') return 'settings';

  if (path === '/dashboard-executivo/tarefas') return 'dashboard_executive_governance';

  if (path.startsWith('/api/tasks')) return 'intranet_tarefas';
  if (path.startsWith('/api/admin/financial/')) return 'financeiro';
  if (path.startsWith('/api/admin/contratos')) return 'contratos';
  if (path === '/api/admin/propostas' || path === '/api/admin/propostas/') return 'propostas_gerencial';
  if (path.startsWith('/api/admin/propostas/pos-consulta')) return 'propostas_pos_consulta';
  if (path.startsWith('/api/admin/propostas/details')) return 'propostas';
  if (path.startsWith('/api/admin/propostas/export')) return 'propostas';
  if (path.startsWith('/api/admin/propostas/options')) return 'propostas';
  if (path.startsWith('/api/admin/propostas/followup')) return 'propostas';
  if (path.startsWith('/api/admin/repasses')) return 'repasses';
  if (path.startsWith('/api/admin/marketing/controle')) return 'marketing_controle';
  if (path.startsWith('/api/admin/marketing/funil')) return 'marketing_funil';
  if (path.startsWith('/api/admin/colaboradores')) return 'colaboradores';
  if (path.startsWith('/api/admin/folha-pagamento')) return 'folha_pagamento';
  if (path.startsWith('/api/admin/recrutamento')) return 'recrutamento';
  if (path.startsWith('/api/admin/equipamentos')) return 'equipamentos';
  if (path.startsWith('/api/admin/agenda-ocupacao')) return 'agenda_ocupacao';
  if (path.startsWith('/api/admin/produtividade')) return 'produtividade';
  if (path.startsWith('/api/admin/user-teams')) return 'produtividade';
  if (path.startsWith('/api/admin/teams')) return 'produtividade';
  if (path.startsWith('/api/admin/agendamentos')) return 'agendamentos';
  if (path.startsWith('/api/admin/profissionais/mapas')) return 'profissionais_mapas';
  if (path.startsWith('/api/admin/profissionais')) return 'profissionais';
  if (path.startsWith('/api/admin/qms/documentos')) return 'qualidade_documentos';
  if (path.startsWith('/api/admin/vigilancia-sanitaria')) return 'vigilancia_sanitaria';
  if (path.startsWith('/api/admin/qms/treinamentos')) return 'qualidade_treinamentos';
  if (path.startsWith('/api/admin/qms/auditorias')) return 'qualidade_auditorias';
  if (path.startsWith('/api/admin/goals/dashboard')) return 'metas_dashboard';
  if (path.startsWith('/api/admin/goals')) return 'metas';
  if (path.startsWith('/api/admin/options/')) return 'metas';
  if (path.startsWith('/api/admin/checklist/crc')) return 'checklist_crc';
  if (path.startsWith('/api/admin/checklist/recepcao')) return 'checklist_recepcao';
  if (path.startsWith('/api/admin/intranet/navigation')) return 'intranet_navegacao';
  if (path.startsWith('/api/admin/intranet/pages')) return 'intranet_paginas';
  if (path.startsWith('/api/admin/intranet/news')) return 'intranet_noticias';
  if (path.startsWith('/api/admin/intranet/faq')) return 'intranet_faq';
  if (path.startsWith('/api/admin/intranet/audiences')) return 'intranet_audiencias';
  if (path.startsWith('/api/admin/intranet/editorial-scopes')) return 'intranet_escopos';
  if (path.startsWith('/api/admin/intranet/catalog')) return 'intranet_catalogo';
  if (path.startsWith('/api/admin/intranet/knowledge')) return 'intranet_chatbot';
  if (path.startsWith('/api/admin/intranet/chatbot')) return 'intranet_chatbot';
  if (path.startsWith('/api/admin/intranet/chat')) return 'intranet_chat';
  if (path.startsWith('/api/admin/intranet')) return 'intranet_dashboard';
  if (path.startsWith('/api/admin/users')) return 'users';
  if (path.startsWith('/api/admin/dashboard/executive/config')) return 'dashboard_executive_governance';
  if (path.startsWith('/api/admin/tasks')) return 'dashboard_executive_governance';
  if (path.startsWith('/api/admin/contract-templates')) return 'contract_templates';
  if (path.startsWith('/api/admin/settings')) return 'settings';

  return null;
};
