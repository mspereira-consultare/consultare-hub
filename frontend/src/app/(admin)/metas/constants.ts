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
    filter_group?: string; // Filtro avançado (ex.: Consultas, Exames)
    clinic_unit?: string; // Filtro de unidade clínica (ex.: Matriz, Filial)
    collaborator?: string; // Nome do colaborador (ex.: Profissional / Agendador)
    team?: string; // Equipe/setor alvo da meta (ex.: CRC, Recepção)
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
    { value: 'minutes', label: 'Tempo (min)' },
] as const;

export const PERIODICITY_OPTIONS = [
    { value: 'daily', label: 'Diária (reseta todo dia)' },
    { value: 'weekly', label: 'Semanal (reseta toda semana)' },
    { value: 'monthly', label: 'Mensal (reseta no dia 1)' },
    { value: 'total', label: 'Período total (acumulado)' },
] as const;

// Definição das fontes de dados
export const KPIS_AVAILABLE = [
    { id: 'manual', label: 'Sem vínculo (preenchimento manual)', scope: 'ALL', supportsFilter: false },

    // Escopo: clínica (suporta filtro de grupo do Feegow)
    { id: 'revenue', label: 'Faturamento total (pago)', scope: 'CLINIC', supportsFilter: true },
    { id: 'agendamentos', label: 'Agendamentos criados', scope: 'CLINIC', supportsFilter: true },
    { id: 'consultas_dia', label: 'Consultas no dia (data da consulta)', scope: 'CLINIC', supportsFilter: true },
    { id: 'agendamentos_confirm_rate', label: 'Taxa de confirmação (agendamentos)', scope: 'CLINIC', supportsFilter: true },
    { id: 'appointments', label: 'Qtd. atendimentos', scope: 'CLINIC', supportsFilter: true },
    { id: 'ticket_medio', label: 'Ticket médio', scope: 'CLINIC', supportsFilter: true },
    { id: 'proposals', label: 'Propostas criadas (qtd.)', scope: 'CLINIC', supportsFilter: false },
    { id: 'proposals_exec_qty', label: 'Propostas executadas (qtd.)', scope: 'CLINIC', supportsFilter: false },
    { id: 'proposals_exec_value', label: 'Propostas executadas (R$)', scope: 'CLINIC', supportsFilter: false },
    { id: 'proposals_exec_rate', label: 'Conversão de propostas (%)', scope: 'CLINIC', supportsFilter: false },

    // Escopo: cartão
    { id: 'contracts', label: 'Novas adesões (R$)', scope: 'CARD', supportsFilter: false },
    { id: 'sales', label: 'Vendas totais (R$)', scope: 'CARD', supportsFilter: false },
    { id: 'sales_qty', label: 'Novas adesões (qtd.)', scope: 'CARD', supportsFilter: false },
    { id: 'churn_rate', label: 'Cancelados', scope: 'CARD', supportsFilter: false },

    // Digitais
    { id: 'whatsapp_queue', label: 'Fila WhatsApp', scope: 'ALL', supportsFilter: false },
    { id: 'whatsapp_time', label: 'Tempo de resposta', scope: 'ALL', supportsFilter: false },
] as const;
