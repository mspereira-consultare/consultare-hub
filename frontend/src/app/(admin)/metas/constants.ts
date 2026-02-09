// src/app/(admin)/metas/constants.ts

export interface Goal {
    id?: number;
    name: string;
    scope: 'CLINIC' | 'CARD';
    sector: string;
    start_date: string;
    end_date: string;
    periodicity: string;
    target_value: number;
    unit: string;
    linked_kpi_id: string; // ID do KPI para automação
    filter_group?: string; // Filtro avançado (Ex: Consultas, Exames)
    clinic_unit?: string; // Filtro de unidade clínica (Ex: Matriz, Filial)
    collaborator?: string; // Nome do colaborador (Ex: Profissional / Agendador)
    team?: string; // Equipe/setor alvo da meta (Ex: CRC, Recepção)
}

export const GOAL_SCOPES = [
    { value: 'CLINIC', label: 'Clínica (Consultare)' },
    { value: 'CARD', label: 'Cartão (Resolve)' },
] as const;

export const SECTORS = [
    'Comercial', 'Financeiro', 'Recepção', 'Médico', 'Operacional', 'Marketing', 'Diretoria'
] as const;

export const UNITS = [
    { value: 'currency', label: 'Moeda (R$)' },
    { value: 'qtd', label: 'Quantidade (UN)' },
    { value: 'percent', label: 'Porcentagem (%)' },
    { value: 'minutes', label: 'Tempo (Min)' },
] as const;

export const PERIODICITY_OPTIONS = [
    { value: 'daily', label: 'Diária (Reseta todo dia)' },
    { value: 'weekly', label: 'Semanal (Reseta toda semana)' },
    { value: 'monthly', label: 'Mensal (Reseta dia 1)' },
    { value: 'total', label: 'Período Total (Acumulado)' },
] as const;

// --- DEFINIÇÃO DAS FONTES DE DADOS ---
export const KPIS_AVAILABLE = [
    { id: 'manual', label: 'Sem Vínculo (Preenchimento Manual)', scope: 'ALL', supportsFilter: false },
    
    // ESCOPO: CLÍNICA (Suportam Filtro de Grupo do Feegow)
    { id: 'revenue', label: 'Faturamento Total (Pago)', scope: 'CLINIC', supportsFilter: true },
    { id: 'agendamentos', label: 'Agendamentos (Consultas)', scope: 'CLINIC', supportsFilter: true },
    { id: 'agendamentos_confirm_rate', label: 'Taxa de Confirmação (Agendamentos)', scope: 'CLINIC', supportsFilter: true },
    { id: 'appointments', label: 'Qtd. Atendimentos', scope: 'CLINIC', supportsFilter: true },
    { id: 'ticket_medio', label: 'Ticket Médio', scope: 'CLINIC', supportsFilter: true },
    { id: 'proposals', label: 'Propostas Criadas (Qtd)', scope: 'CLINIC', supportsFilter: false },
    { id: 'proposals_exec_qty', label: 'Propostas Executadas (Qtd)', scope: 'CLINIC', supportsFilter: false },
    { id: 'proposals_exec_value', label: 'Propostas Executadas (R$)', scope: 'CLINIC', supportsFilter: false },
    { id: 'proposals_exec_rate', label: 'Conversão de Propostas (%)', scope: 'CLINIC', supportsFilter: false },
    
    // ESCOPO: CARTÃO
    { id: 'contracts', label: 'Novas Adesões (R$)', scope: 'CARD', supportsFilter: false },
    { id: 'sales', label: 'Vendas Totais (R$)', scope: 'CARD', supportsFilter: false },
    { id: 'sales_qty', label: 'Novas Adesões (Qtd.)', scope: 'CARD', supportsFilter: false },
    { id: 'churn_rate', label: 'Cancelados', scope: 'CARD', supportsFilter: false },
    
    // DIGITAIS
    { id: 'whatsapp_queue', label: 'Fila WhatsApp', scope: 'ALL', supportsFilter: false },
    { id: 'whatsapp_time', label: 'Tempo de Resposta', scope: 'ALL', supportsFilter: false },
] as const;
