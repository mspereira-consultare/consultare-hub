// src/app/(admin)/metas/constants.ts

export const SECTORS = ['Comercial', 'Financeiro', 'Recepção', 'Médico', 'Operacional', 'Marketing'] as const;

export const UNITS = [
    { value: 'qtd', label: 'Quantidade (UN)' },
    { value: 'currency', label: 'Moeda (R$)' },
    { value: 'percent', label: 'Porcentagem (%)' },
    { value: 'minutes', label: 'Tempo (Min)' },
] as const;

// Nova definição de Periodicidade (O "Reset")
export const PERIODICITY_OPTIONS = [
    { value: 'daily', label: 'Meta Diária (Reseta todo dia)', short: 'Diária' },
    { value: 'weekly', label: 'Meta Semanal (Reseta toda seg)', short: 'Semanal' },
    { value: 'monthly', label: 'Meta Mensal (Reseta dia 1)', short: 'Mensal' },
    { value: 'total', label: 'Meta Acumulada (Alvo total do período)', short: 'Total' },
] as const;

export const AVAILABLE_KPIS = [
    { id: 'manual', label: 'Entrada Manual (Sem vínculo)', group: 'Geral' },
    
    // Digital
    { id: 'whatsapp_queue_current', label: 'Fila WhatsApp (Agora)', group: 'Digital' },
    { id: 'whatsapp_wait_time', label: 'Tempo Médio Espera (Min)', group: 'Digital' },
    
    // Fontes Individuais
    { id: 'appointments_total_clinia', label: 'Agendamentos (Só Clinia)', group: 'Comercial' },
    { id: 'appointments_bot_only', label: 'Agendamentos (Só Robô)', group: 'Comercial' },
    
    // Fonte Mesclada
    { id: 'appointments_merged_total', label: 'Agendamentos TOTAL (Clinia + Feegow)', group: 'Comercial' },

    // Financeiro (Feegow)
    { id: 'revenue_total', label: 'Faturamento Total (R$)', group: 'Financeiro' },
    { id: 'ticket_average', label: 'Ticket Médio (R$)', group: 'Financeiro' },
] as const;

export interface Goal {
  id?: number;
  sector: string;
  name: string;
  start_date: string; 
  end_date: string;   
  periodicity: 'daily' | 'weekly' | 'monthly' | 'total';
  target_value: number;
  unit: 'qtd' | 'currency' | 'percent' | 'minutes';
  linked_kpi_id: string; 
}