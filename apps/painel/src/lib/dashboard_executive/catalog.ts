import type {
  ExecutiveAreaKey,
  ExecutiveProfileDefinition,
  ExecutiveProfileKey,
  ExecutiveProfileWidgetConfig,
  ExecutiveWidgetDefinition,
  ExecutiveWidgetKey,
} from '@/lib/dashboard_executive/types';

type WidgetSeed = Omit<ExecutiveWidgetDefinition, 'sortOrder'> & { sortOrder?: number };

const profileKeys: ExecutiveProfileKey[] = [
  'diretoria_gerencia_adm',
  'gerencia_operacional',
  'lider_unidades',
  'lider_operacional',
  'agendas',
  'financeiro',
  'marketing',
  'rh',
  'crc',
];

const buildProfile = (
  key: ExecutiveProfileKey,
  label: string,
  description: string,
  sortOrder: number
): ExecutiveProfileDefinition => ({
  key,
  label,
  description,
  isActive: true,
  sortOrder,
});

export const EXECUTIVE_PROFILE_DEFINITIONS: ExecutiveProfileDefinition[] = [
  buildProfile('diretoria_gerencia_adm', 'Diretoria e Gerência ADM', 'Visão executiva ampla do negócio.', 10),
  buildProfile('gerencia_operacional', 'Gerência Operacional', 'Leitura consolidada da operação e execução.', 20),
  buildProfile('lider_unidades', 'Líder de Unidades', 'Acompanhamento da unidade com foco em metas e agenda.', 30),
  buildProfile('lider_operacional', 'Líder Operacional', 'Foco em fluxo operacional e inspeções.', 40),
  buildProfile('agendas', 'Agendas', 'Acompanhamento de ocupação, mapa e confirmações.', 50),
  buildProfile('financeiro', 'Financeiro', 'Leitura financeira e pendências contábeis.', 60),
  buildProfile('marketing', 'Marketing', 'Performance de campanhas, investimento e conversão.', 70),
  buildProfile('rh', 'RH', 'Acompanhamento de pessoas e marcos de permanência.', 80),
  buildProfile('crc', 'CRC', 'Acompanhamento do funil de agenda e atendimento ao paciente.', 90),
];

const WIDGETS: WidgetSeed[] = [
  { key: 'tarefas', label: 'Tarefas', areaKey: 'operacao', status: 'planned', sourceKey: null, description: 'Pendências operacionais e tarefas do setor.' },
  { key: 'aniversariantes_dia', label: 'Aniversariantes do dia', areaKey: 'pessoas', status: 'available', sourceKey: 'employees.dashboard', description: 'Colaboradores aniversariantes no período.' },
  { key: 'banco_horas', label: 'Banco de horas', areaKey: 'pessoas', status: 'planned', sourceKey: null, description: 'Saldo e alertas de banco de horas por setor.' },
  { key: 'estoque_vencendo', label: 'Estoque / produtos vencendo', areaKey: 'qualidade', status: 'planned', sourceKey: null, description: 'Itens com vencimento próximo ou expirado.' },
  { key: 'agenda_calendario', label: 'Agenda - calendário', areaKey: 'operacao', status: 'planned', sourceKey: null, description: 'Visão calendário da agenda operacional.' },
  { key: 'ocupacao_agendas', label: 'Ocupação das agendas', areaKey: 'operacao', status: 'available', sourceKey: 'agenda_occupancy', description: 'Indicadores de ocupação das agendas por recorte.' },
  { key: 'confirmacao_agendas', label: 'Confirmação das agendas', areaKey: 'operacao', status: 'available', sourceKey: 'agendamentos', description: 'Taxa e volume de confirmações de agenda.' },
  { key: 'monitoramento_filas', label: 'Monitoramento de filas', areaKey: 'operacao', status: 'available', sourceKey: 'queue.live', description: 'Fila médica, recepção e WhatsApp.' },
  { key: 'faturamento_hoje_meta', label: 'Faturamento hoje x meta', areaKey: 'financeiro', status: 'available', sourceKey: 'financial.history', description: 'Faturamento diário comparado à meta.' },
  { key: 'faturamento_mes_meta', label: 'Faturamento mês x meta', areaKey: 'financeiro', status: 'available', sourceKey: 'financial.history', description: 'Faturamento do mês comparado à meta.' },
  { key: 'contas_aberto', label: 'Contas em aberto', areaKey: 'financeiro', status: 'planned', sourceKey: null, description: 'Contas financeiras em aberto.' },
  { key: 'nf_aberto', label: 'NF em aberto', areaKey: 'financeiro', status: 'planned', sourceKey: null, description: 'Notas fiscais em aberto.' },
  { key: 'mapa_semanal_agendas', label: 'Mapa semanal das agendas', areaKey: 'operacao', status: 'available', sourceKey: 'agenda_occupancy', description: 'Distribuição semanal das agendas.' },
  { key: 'google', label: 'Google', areaKey: 'comercial', status: 'available', sourceKey: 'marketing.funil', description: 'Indicadores consolidados de Google e origem digital.' },
  { key: 'reclame_aqui', label: 'ReclameAqui', areaKey: 'qualidade', status: 'planned', sourceKey: null, description: 'Acompanhamento reputacional no ReclameAqui.' },
  { key: 'progresso_metas', label: 'Progresso das metas', areaKey: 'comercial', status: 'planned', sourceKey: 'goals.dashboard', description: 'Andamento das metas executivas do recorte.' },
  { key: 'documentos_equipamentos_vencendo', label: 'Documentos ou equipamentos vencidos', areaKey: 'qualidade', status: 'available', sourceKey: 'qms.surveillance', description: 'Itens vencidos ou a vencer em qualidade.' },
  { key: 'recoletas', label: 'Recoletas', areaKey: 'operacao', status: 'planned', sourceKey: null, description: 'Indicadores de recoleta e reprocesso.' },
  { key: 'faturamento_campanha_conversao', label: 'Faturamento x meta x campanha x conversão', areaKey: 'comercial', status: 'available', sourceKey: 'marketing.controle', description: 'Relação entre faturamento, mídia e conversão.' },
  { key: 'tempo_empresa_um_ano', label: 'Tempo de empresa - 1 ano', areaKey: 'pessoas', status: 'planned', sourceKey: 'employees.dashboard', description: 'Marcos de permanência e alertas de 1 ano.' },
  { key: 'demanda_whatsapp', label: 'Demanda WhatsApp', areaKey: 'operacao', status: 'available', sourceKey: 'queue.whatsapp', description: 'Fila e demanda atual de WhatsApp.' },
  { key: 'fila_telefonia', label: 'Fila telefonia', areaKey: 'operacao', status: 'planned', sourceKey: null, description: 'Fila de telefonia e tempo de espera.' },
  { key: 'propostas_aberto', label: 'Propostas em aberto', areaKey: 'comercial', status: 'available', sourceKey: 'proposals.summary', description: 'Propostas aguardando cliente ou em aberto.' },
  { key: 'mapa_diario_agendas', label: 'Mapa diário das agendas', areaKey: 'operacao', status: 'available', sourceKey: 'agenda_occupancy', description: 'Distribuição diária das agendas.' },
  { key: 'ultima_inspecao', label: 'Última inspeção', areaKey: 'qualidade', status: 'planned', sourceKey: null, description: 'Último registro de inspeção consolidado.' },
  { key: 'contas_semana', label: 'Contas da semana', areaKey: 'financeiro', status: 'planned', sourceKey: null, description: 'Consolidação financeira semanal.' },
  { key: 'notas_fiscais', label: 'Notas fiscais', areaKey: 'financeiro', status: 'planned', sourceKey: null, description: 'Indicadores de notas fiscais emitidas ou pendentes.' },
  { key: 'previsto_realizado', label: 'Previsto e realizado', areaKey: 'financeiro', status: 'planned', sourceKey: null, description: 'Comparativo previsto x realizado.' },
  { key: 'estornos_pendentes', label: 'Estornos pendentes', areaKey: 'financeiro', status: 'planned', sourceKey: null, description: 'Pendências de estorno e regularização.' },
  { key: 'investimento_ads', label: 'Investimento ADS', areaKey: 'comercial', status: 'available', sourceKey: 'marketing.controle', description: 'Investimento consolidado em mídia paga.' },
  { key: 'agendamento_diario_meta', label: 'Agendamento diário x meta', areaKey: 'operacao', status: 'planned', sourceKey: 'goals.dashboard', description: 'Acompanhamento diário de agendamento contra meta.' },
  { key: 'agendamento_mensal_meta', label: 'Agendamento mensal x meta', areaKey: 'operacao', status: 'planned', sourceKey: 'goals.dashboard', description: 'Acompanhamento mensal de agendamento contra meta.' },
  { key: 'contratos_pendentes_vencidos', label: 'Contratos pendentes ou vencidos', areaKey: 'qualidade', status: 'planned', sourceKey: null, description: 'Contratos com pendência ou vencimento.' },
];

export const EXECUTIVE_WIDGET_DEFINITIONS: ExecutiveWidgetDefinition[] = WIDGETS.map((widget, index) => ({
  ...widget,
  sortOrder: widget.sortOrder ?? (index + 1) * 10,
}));

const byKey = (...keys: ExecutiveWidgetKey[]) => keys;

const PROFILE_WIDGET_MAP: Record<ExecutiveProfileKey, ExecutiveWidgetKey[]> = {
  diretoria_gerencia_adm: byKey(
    'tarefas',
    'aniversariantes_dia',
    'banco_horas',
    'estoque_vencendo',
    'agenda_calendario',
    'ocupacao_agendas',
    'confirmacao_agendas',
    'monitoramento_filas',
    'faturamento_hoje_meta',
    'faturamento_mes_meta',
    'contas_aberto',
    'nf_aberto',
    'mapa_semanal_agendas',
    'google',
    'reclame_aqui',
    'progresso_metas',
    'documentos_equipamentos_vencendo',
    'recoletas',
    'faturamento_campanha_conversao',
    'tempo_empresa_um_ano',
    'demanda_whatsapp',
    'fila_telefonia'
  ),
  gerencia_operacional: byKey(
    'tarefas',
    'aniversariantes_dia',
    'banco_horas',
    'documentos_equipamentos_vencendo',
    'estoque_vencendo',
    'agenda_calendario',
    'ocupacao_agendas',
    'confirmacao_agendas',
    'ultima_inspecao'
  ),
  lider_unidades: byKey(
    'monitoramento_filas',
    'faturamento_hoje_meta',
    'faturamento_mes_meta',
    'contas_aberto',
    'nf_aberto',
    'propostas_aberto',
    'ocupacao_agendas',
    'mapa_diario_agendas',
    'confirmacao_agendas',
    'google',
    'reclame_aqui',
    'progresso_metas',
    'documentos_equipamentos_vencendo',
    'tarefas',
    'aniversariantes_dia',
    'banco_horas',
    'agenda_calendario',
    'ultima_inspecao'
  ),
  lider_operacional: byKey(
    'recoletas',
    'monitoramento_filas',
    'tarefas',
    'aniversariantes_dia',
    'banco_horas',
    'estoque_vencendo',
    'agenda_calendario',
    'ocupacao_agendas',
    'ultima_inspecao'
  ),
  agendas: byKey(
    'tarefas',
    'aniversariantes_dia',
    'agenda_calendario',
    'ocupacao_agendas',
    'mapa_diario_agendas',
    'mapa_semanal_agendas',
    'confirmacao_agendas',
    'contratos_pendentes_vencidos'
  ),
  financeiro: byKey(
    'contas_aberto',
    'notas_fiscais',
    'contas_semana',
    'previsto_realizado',
    'estornos_pendentes',
    'tarefas',
    'aniversariantes_dia',
    'estoque_vencendo',
    'agenda_calendario'
  ),
  marketing: byKey(
    'tarefas',
    'google',
    'reclame_aqui',
    'faturamento_campanha_conversao',
    'investimento_ads',
    'aniversariantes_dia',
    'agenda_calendario'
  ),
  rh: byKey(
    'aniversariantes_dia',
    'banco_horas',
    'agenda_calendario',
    'tempo_empresa_um_ano'
  ),
  crc: byKey(
    'tarefas',
    'aniversariantes_dia',
    'agenda_calendario',
    'ocupacao_agendas',
    'mapa_diario_agendas',
    'mapa_semanal_agendas',
    'confirmacao_agendas',
    'agendamento_diario_meta',
    'agendamento_mensal_meta',
    'demanda_whatsapp',
    'fila_telefonia'
  ),
};

const widgetAreaMap = new Map<ExecutiveWidgetKey, ExecutiveAreaKey>(
  EXECUTIVE_WIDGET_DEFINITIONS.map((widget) => [widget.key, widget.areaKey])
);

export const EXECUTIVE_PROFILE_WIDGET_DEFAULTS: ExecutiveProfileWidgetConfig[] = profileKeys.flatMap((profileKey) =>
  EXECUTIVE_WIDGET_DEFINITIONS.map((widget, index) => ({
    profileKey,
    widgetKey: widget.key,
    isVisible: PROFILE_WIDGET_MAP[profileKey].includes(widget.key),
    sortOrder: PROFILE_WIDGET_MAP[profileKey].includes(widget.key)
      ? (PROFILE_WIDGET_MAP[profileKey].indexOf(widget.key) + 1) * 10
      : 1000 + index * 10,
  }))
);

export const getWidgetArea = (widgetKey: ExecutiveWidgetKey) => widgetAreaMap.get(widgetKey) || 'operacao';
