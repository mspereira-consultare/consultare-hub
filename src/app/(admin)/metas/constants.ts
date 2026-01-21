// src/app/(admin)/metas/constants.ts

// --- 1. ESCOPOS (Onde a meta vai atuar?) ---
export const GOAL_SCOPES = [
    { value: 'CLINIC', label: 'Clínica Médica (Consultare)' },
    { value: 'CARD', label: 'Cartão de Benefícios (Resolve)' },
] as const;

export const SECTORS = ['Comercial', 'Financeiro', 'Recepção', 'Médico', 'Operacional', 'Marketing'] as const;

export const UNITS = [
    { value: 'qtd', label: 'Quantidade (UN)' },
    { value: 'currency', label: 'Moeda (R$)' },
    { value: 'percent', label: 'Porcentagem (%)' },
    { value: 'minutes', label: 'Tempo (Min)' },
] as const;

export const PERIODICITY_OPTIONS = [
    { value: 'daily', label: 'Meta Diária (Reseta todo dia)', short: 'Diária' },
    { value: 'weekly', label: 'Meta Semanal (Reseta toda seg)', short: 'Semanal' },
    { value: 'monthly', label: 'Meta Mensal (Reseta dia 1)', short: 'Mensal' },
    { value: 'total', label: 'Meta Acumulada (Alvo total do período)', short: 'Total' },
] as const;

// --- 2. KPIS DISPONÍVEIS (Mapeados para as APIs) ---
// Adicionei a propriedade 'scope' para ajudar o Front-end a filtrar a lista
export const AVAILABLE_KPIS = [
    { id: 'manual', label: 'Entrada Manual (Sem vínculo automático)', group: 'Geral', scope: 'ALL' },
    
    // === CLÍNICA MÉDICA (Scope: CLINIC) ===
    { id: 'revenue', label: 'Faturamento Total (R$)', group: 'Financeiro', scope: 'CLINIC' },
    { id: 'ticket_avg', label: 'Ticket Médio (R$)', group: 'Financeiro', scope: 'CLINIC' },
    { id: 'appointments', label: 'Total de Atendimentos (Qtd)', group: 'Operacional', scope: 'CLINIC' },
    { id: 'absenteeism', label: 'Taxa de Absenteísmo / Faltas (%)', group: 'Operacional', scope: 'CLINIC' },
    
    // === CARTÃO DE BENEFÍCIOS (Scope: CARD) ===
    { id: 'mrr', label: 'MRR / Receita Recorrente (R$)', group: 'Financeiro', scope: 'CARD' },
    { id: 'sales_value', label: 'Vendas Novas / Adesão (R$)', group: 'Comercial', scope: 'CARD' },
    { id: 'sales_qty', label: 'Vendas Novas / Quantidade (Qtd)', group: 'Comercial', scope: 'CARD' },
    { id: 'churn_rate', label: 'Taxa de Cancelamento / Churn (%)', group: 'Retenção', scope: 'CARD' },
    { id: 'default_rate', label: 'Taxa de Inadimplência (%)', group: 'Financeiro', scope: 'CARD' },

    // === DIGITAL / SUPORTE (Pode ser ambos ou específico) ===
    { id: 'whatsapp_queue', label: 'Fila de Espera WhatsApp (Qtd)', group: 'Digital', scope: 'ALL' },
    { id: 'whatsapp_time', label: 'Tempo Médio de Resposta (Min)', group: 'Digital', scope: 'ALL' },
] as const;

// --- 3. INTERFACE ATUALIZADA (Compatível com o Banco) ---
export interface Goal {
  id?: number;
  name: string;
  scope: 'CLINIC' | 'CARD'; // Novo campo obrigatório
  sector: string;
  start_date: string; 
  end_date: string;   
  periodicity: 'daily' | 'weekly' | 'monthly' | 'total';
  target_value: number;
  unit: 'qtd' | 'currency' | 'percent' | 'minutes';
  linked_kpi_id: string; 
  filter_group?: string; // Opcional (Para grupos de procedimento ou planos)
}