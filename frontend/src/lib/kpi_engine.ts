import { getDbConnection } from '@/lib/db';

interface KpiResult { 
    currentValue: number; 
    lastUpdated: string; 
}

interface KpiOptions { 
    group_filter?: string; 
    scope?: 'CLINIC' | 'CARD'; 
}

interface KpiHistoryItem { 
    date: string; 
    value: number; 
}

// --- CONFIGURAÇÃO DE DATAS ---
// Scraper: data_do_pagamento (DD/MM/YYYY) -> SQL converte para YYYY-MM-DD para comparação
const COL_DATA_ANALITICO = 'data_do_pagamento';
// SQLite/LibSQL substring: substr(col, start, length). Start é 1-based.
// DD/MM/YYYY -> YYYY-MM-DD: substr(7,4) || '-' || substr(4,2) || '-' || substr(1,2)
const SQL_DATE_ANALITICO = `substr(${COL_DATA_ANALITICO}, 7, 4) || '-' || substr(${COL_DATA_ANALITICO}, 4, 2) || '-' || substr(${COL_DATA_ANALITICO}, 1, 2)`;

const SQL_DATE_AGENDA = 'date'; 
const SQL_DATE_CONTRATO = 'start_date';

export async function calculateKpi(kpiId: string, startDate: string, endDate: string, options?: KpiOptions): Promise<KpiResult> {
  const db = getDbConnection();
  
  // 1. FILTROS DE GRUPO/PROCEDIMENTO
  const filterVal = options?.group_filter?.trim();
  
  // Cláusula para ignorar a unidade "Card" quando for escopo CLINIC (se necessário)
  // Ajuste conforme a lógica exata que você usava. Assumindo que Card tem unidade específica ou grupo.
  const clinicExclusion = options?.scope === 'CLINIC' ? "AND unidade NOT LIKE '%Card%'" : ""; 

  let query = '';
  let queryParams: any[] = [];

  // --- LÓGICA DE SELEÇÃO DE QUERY ---
  
  // 1. ESCOPO "CARD" (Propostas e Contratos Feegow)
  if (options?.scope === 'CARD') {
      if (kpiId === 'proposals') {
          // Total de Propostas (Qtd)
          query = `SELECT COUNT(*) as val FROM feegow_proposals WHERE date BETWEEN ? AND ?`;
          queryParams = [startDate, endDate];
      } 
      else if (kpiId === 'contracts') {
          // Total Vendas (Valor) - Contratos com status Aprovado/Executado
          query = `
            SELECT SUM(total_value) as val 
            FROM feegow_proposals 
            WHERE date BETWEEN ? AND ? 
            AND lower(status) IN ('executada', 'aprovada pelo cliente', 'ganho', 'realizado')
          `;
          queryParams = [startDate, endDate];
      }
      else if (kpiId === 'ticket_medio') {
          // Ticket Médio (Valor / Qtd) - Apenas dos ganhos
          query = `
             SELECT 
                SUM(total_value) as total,
                COUNT(*) as qtd
             FROM feegow_proposals
             WHERE date BETWEEN ? AND ?
             AND lower(status) IN ('executada', 'aprovada pelo cliente', 'ganho', 'realizado')
          `;
          queryParams = [startDate, endDate];
      }
      else if (kpiId === 'sales') { 
          // Vendas Cartão (Membership) - Tabela contracts
          query = `SELECT SUM(membership_value) as val FROM feegow_contracts WHERE status_contract = 'Aprovado' AND start_date BETWEEN ? AND ?`;
          queryParams = [startDate, endDate];
      } 
      else if (kpiId === 'sales_qty') { 
          // Qtd Vendas Cartão
          query = `SELECT COUNT(*) as val FROM feegow_contracts WHERE status_contract = 'Aprovado' AND start_date BETWEEN ? AND ?`;
          queryParams = [startDate, endDate];
      }
  }
  // 2. ESCOPO "CLINICA" (Faturamento Analítico)
  else {
      // Filtro de Grupo (Ex: "Consultas", "Exames")
      // Nota: Usamos UPPER e TRIM para evitar problemas de case/espaço
      let groupSql = "";
      if (filterVal && filterVal !== 'all') {
          groupSql = `AND UPPER(TRIM(grupo)) = UPPER(TRIM(?))`;
          queryParams.push(filterVal);
      }

      // Adicionamos as datas no início do array de params
      queryParams.unshift(endDate);
      queryParams.unshift(startDate);
      // Ordem final params: [startDate, endDate, filterVal?]

      if (kpiId === 'revenue' || kpiId === 'revenue_total') {
          // Receita Total (Soma do pago)
          query = `
            SELECT SUM(total_pago) as val 
            FROM faturamento_analitico 
            WHERE ${SQL_DATE_ANALITICO} BETWEEN ? AND ? 
            ${groupSql} 
            ${clinicExclusion}
          `;
      }
      else if (kpiId === 'appointments') {
          // Qtd de Atendimentos
          query = `
            SELECT COUNT(*) as val 
            FROM faturamento_analitico 
            WHERE ${SQL_DATE_ANALITICO} BETWEEN ? AND ? 
            ${groupSql} 
            ${clinicExclusion}
          `;
      }
      else if (kpiId === 'ticket_medio') {
          // Ticket Médio
           query = `
            SELECT SUM(total_pago) as total, COUNT(*) as qtd
            FROM faturamento_analitico 
            WHERE ${SQL_DATE_ANALITICO} BETWEEN ? AND ? 
            ${groupSql} 
            ${clinicExclusion}
          `;
      }
  }

  // --- EXECUÇÃO ---
  try {
      if (!query) return { currentValue: 0, lastUpdated: new Date().toISOString() };

      const result = await db.query(query, queryParams);
      const row = result[0] as any;

      // Lógica específica para Ticket Médio (que retorna total e qtd)
      if (kpiId === 'ticket_medio') {
          const total = row?.total || 0;
          const qtd = row?.qtd || 0;
          return {
              currentValue: qtd > 0 ? total / qtd : 0,
              lastUpdated: new Date().toISOString() // TODO: Pegar do banco se possível
          };
      }

      return {
          currentValue: row?.val || 0,
          lastUpdated: new Date().toISOString()
      };

  } catch (error) {
      console.error(`Erro KPI Engine [${kpiId}]:`, error);
      return { currentValue: 0, lastUpdated: new Date().toISOString() };
  }
}

/**
 * Gera histórico dia a dia (ou mês a mês) para gráficos
 */
export async function calculateHistory(kpiId: string, startDate: string, endDate: string, options?: KpiOptions): Promise<KpiHistoryItem[]> {
    const db = getDbConnection();
    
    // A lógica de construção da Query é similar, mas com GROUP BY e ORDER BY
    // Simplificando: vamos reutilizar a lógica de query string mas adicionar o agrupamento por data

    const filterVal = options?.group_filter?.trim();
    const clinicExclusion = options?.scope === 'CLINIC' ? "AND unidade NOT LIKE '%Card%'" : ""; 
    
    let query = '';
    let queryParams: any[] = []; // [startDate, endDate, filter?]

    // --- ESCOPO CARD ---
    if (options?.scope === 'CARD') {
        queryParams = [startDate, endDate];
        
        if (kpiId === 'proposals') {
             query = `SELECT date as d, COUNT(*) as val FROM feegow_proposals WHERE date BETWEEN ? AND ? GROUP BY d ORDER BY d`;
        } else if (kpiId === 'contracts') {
             query = `SELECT date as d, SUM(total_value) as val FROM feegow_proposals WHERE date BETWEEN ? AND ? AND lower(status) IN ('executada', 'aprovada pelo cliente', 'ganho') GROUP BY d ORDER BY d`;
        } else if (kpiId === 'sales') {
             query = `SELECT start_date as d, SUM(membership_value) as val FROM feegow_contracts WHERE status_contract = 'Aprovado' AND start_date BETWEEN ? AND ? GROUP BY d ORDER BY d`;
        }
    }
    // --- ESCOPO CLINICA ---
    else {
        queryParams = [startDate, endDate];
        let groupSql = "";
        if (filterVal && filterVal !== 'all') {
            groupSql = `AND UPPER(TRIM(grupo)) = UPPER(TRIM(?))`;
            queryParams.push(filterVal);
        }

        if (kpiId === 'revenue') {
             query = `SELECT ${SQL_DATE_ANALITICO} as d, SUM(total_pago) as val FROM faturamento_analitico WHERE d BETWEEN ? AND ? ${groupSql} ${clinicExclusion} GROUP BY d ORDER BY d`;
        } else if (kpiId === 'appointments') {
             query = `SELECT ${SQL_DATE_ANALITICO} as d, COUNT(*) as val FROM faturamento_analitico WHERE d BETWEEN ? AND ? ${groupSql} ${clinicExclusion} GROUP BY d ORDER BY d`;
        }
    }

    if (!query) return [];

    try {
        const rows = await db.query(query, queryParams);
        
        // Mapeia para o formato do gráfico
        return rows.map((r: any) => ({
            date: r.d,
            value: r.val || 0
        }));

    } catch (e) {
        console.error("Erro History:", e);
        return [];
    }
}