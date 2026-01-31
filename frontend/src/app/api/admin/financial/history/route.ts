import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const groupFilter = searchParams.get('group');
    const procedureFilter = searchParams.get('procedure');
    const unitFilter = searchParams.get('unit');
    // O painel envia YYYY-MM-DD
    const startDate = searchParams.get('startDate') || new Date().toISOString().split('T')[0];
    const endDate = searchParams.get('endDate') || startDate;

    const db = getDbConnection();

    // 1. DEFINIÇÃO DAS COLUNAS E FILTROS BASE
    const dateCol = 'data_do_pagamento';
    const valueCol = 'total_pago';
    
    // REGRA 1: Filtro de Unidade (Excluir RESOLVECARD)
    const unitFilterExclude = `(unidade IS NULL OR (unidade NOT LIKE '%RESOLVECARD%' AND unidade NOT LIKE '%GESTÃO DE BENEFICOS%'))`;

    // Filtro de Data (Comparação de string ISO YYYY-MM-DD funciona no SQLite)
    let baseWhere = `WHERE ${dateCol} BETWEEN ? AND ? AND ${unitFilterExclude}`;
    const baseParams: any[] = [startDate, endDate];

    // Filtros Opcionais
    if (unitFilter && unitFilter !== 'all') {
        baseWhere += ` AND UPPER(TRIM(unidade)) = UPPER(TRIM(?))`;
        baseParams.push(unitFilter);
    }
    if (groupFilter && groupFilter !== 'all') {
        baseWhere += ` AND UPPER(TRIM(grupo)) = UPPER(TRIM(?))`;
        baseParams.push(groupFilter);
    }
    if (procedureFilter && procedureFilter !== 'all') {
        baseWhere += ` AND UPPER(TRIM(procedimento)) = UPPER(TRIM(?))`;
        baseParams.push(procedureFilter);
    }

    // 2. QUERY: DADOS DIÁRIOS
    const dailyRes = await db.query(`
        SELECT 
            ${dateCol} as d, 
            SUM(${valueCol}) as total, 
            COUNT(*) as qtd
        FROM faturamento_analitico
        ${baseWhere}
        GROUP BY d 
        ORDER BY d ASC
    `, baseParams);

    // 3. QUERY: DADOS MENSAIS (Agrupado por YYYY-MM)
    const monthlyRes = await db.query(`
        SELECT 
            substr(${dateCol}, 1, 7) as m, 
            SUM(${valueCol}) as total,
            COUNT(*) as qtd
        FROM faturamento_analitico
        ${baseWhere}
        GROUP BY m 
        ORDER BY m ASC
    `, baseParams);

    // 4. QUERY: TOTAIS GERAIS (KPIs)
    const totalsRes = await db.query(`
        SELECT 
            SUM(${valueCol}) as total, 
            COUNT(*) as qtd
        FROM faturamento_analitico
        ${baseWhere}
    `, baseParams);
    const totals = totalsRes[0] || { total: 0, qtd: 0 };

    // 5. QUERY: LISTA DE GRUPOS (Combobox)
    // Precisamos listar todos os grupos disponíveis no período + Agenda (se existir)
    // Mantemos a lógica original de UNION para mostrar a demanda da agenda
    
    // Filtro base para grupos (sem filtrar por grupo específico, para popular o combo)
    const groupParams = [startDate, endDate];
    let groupsQuery = `
        SELECT name, SUM(total) as total, SUM(qtd) as qtd FROM (
            -- Faturamento Realizado
            SELECT TRIM(grupo) as name, SUM(${valueCol}) as total, COUNT(*) as qtd 
            FROM faturamento_analitico 
            WHERE ${dateCol} BETWEEN ? AND ? 
            AND ${unitFilterExclude}`;
    
    // Se há filtro de unidade, aplica aqui também
    if (unitFilter && unitFilter !== 'all') {
        groupsQuery += ` AND UPPER(TRIM(unidade)) = UPPER(TRIM(?))`;
        groupParams.push(unitFilter);
    }
    
    groupsQuery += ` AND grupo IS NOT NULL AND grupo != ''
            GROUP BY 1
            
            UNION ALL
            
            -- Agenda (Demanda) - Assumindo que a tabela existe
            SELECT TRIM(procedure_group) as name, 0 as total, COUNT(*) as qtd 
            FROM feegow_appointments 
            WHERE date BETWEEN ? AND ?
            AND procedure_group IS NOT NULL AND procedure_group != '' 
            GROUP BY 1
        ) GROUP BY name ORDER BY total DESC
    `;
    
    // Duplicamos params para o UNION
    const unionParams = [...groupParams, startDate, endDate];

    // Tenta rodar com Agenda. Se falhar (tabela não existe), roda só Faturamento.
    let groups = [];
    try {
        const groupsRes = await db.query(groupsQuery, unionParams);
        groups = groupsRes;
    } catch (e) {
        // Fallback: Tabela agenda não existe
        let simpleGroupsQuery = `
            SELECT TRIM(grupo) as name, SUM(${valueCol}) as total, COUNT(*) as qtd
            FROM faturamento_analitico
            WHERE ${dateCol} BETWEEN ? AND ?
            AND ${unitFilterExclude}`;
        
        const simpleParams = [startDate, endDate];
        if (unitFilter && unitFilter !== 'all') {
            simpleGroupsQuery += ` AND UPPER(TRIM(unidade)) = UPPER(TRIM(?))`;
            simpleParams.push(unitFilter);
        }
        
        simpleGroupsQuery += ` AND grupo IS NOT NULL AND grupo != ''
            GROUP BY 1
            ORDER BY total DESC
        `;
        groups = await db.query(simpleGroupsQuery, simpleParams);
    }

    // Normaliza para o frontend
    groups = groups.map((g: any) => ({
        ...g,
        label: g.name,
        procedure_group: g.name
    }));

    // 6. QUERY: LISTA DE PROCEDIMENTOS (Combobox)
    let procWhere = `WHERE procedimento IS NOT NULL AND procedimento != '' AND ${unitFilterExclude}`;
    const procParams = [];
    if (unitFilter && unitFilter !== 'all') {
        procWhere += ` AND UPPER(TRIM(unidade)) = UPPER(TRIM(?))`;
        procParams.push(unitFilter);
    }
    if (groupFilter && groupFilter !== 'all') {
        procWhere += ` AND UPPER(TRIM(grupo)) = UPPER(TRIM(?))`;
        procParams.push(groupFilter);
    }

    const procedures = await db.query(`
        SELECT DISTINCT procedimento as name
        FROM faturamento_analitico
        ${procWhere}
        ORDER BY name ASC
    `, procParams);

    // 7. QUERY: LISTA DE UNIDADES (Combobox - Novo)
    const unitsRes = await db.query(`
        SELECT DISTINCT TRIM(unidade) as name
        FROM faturamento_analitico
        WHERE ${dateCol} BETWEEN ? AND ?
        AND ${unitFilterExclude}
        AND unidade IS NOT NULL AND unidade != ''
        ORDER BY name ASC
    `, [startDate, endDate]);

    const units = unitsRes.map((u: any) => ({
        ...u,
        label: u.name
    }));

    // 8. QUERY: FATURAMENTO POR UNIDADE
    let unitsBillingWhere = `WHERE ${dateCol} BETWEEN ? AND ? AND ${unitFilterExclude}`;
    const unitsBillingParams: any[] = [startDate, endDate];

    if (groupFilter && groupFilter !== 'all') {
        unitsBillingWhere += ` AND UPPER(TRIM(grupo)) = UPPER(TRIM(?))`;
        unitsBillingParams.push(groupFilter);
    }
    if (procedureFilter && procedureFilter !== 'all') {
        unitsBillingWhere += ` AND UPPER(TRIM(procedimento)) = UPPER(TRIM(?))`;
        unitsBillingParams.push(procedureFilter);
    }

    const unitsBillingRes = await db.query(`
        SELECT 
            TRIM(unidade) as name, 
            SUM(${valueCol}) as total,
            COUNT(*) as qtd
        FROM faturamento_analitico
        ${unitsBillingWhere}
        GROUP BY name
        ORDER BY total DESC
    `, unitsBillingParams);

    // 9. HEARTBEAT (Status)
    const statusRes = await db.query(`
        SELECT status, last_run, message 
        FROM system_status 
        WHERE service_name = 'financeiro'
    `);
    const heartbeat = statusRes[0] || { status: 'UNKNOWN', last_run: null, message: '' };

    return NextResponse.json({ 
        daily: dailyRes, 
        monthly: monthlyRes, 
        groups, 
        procedures,
        units,
        unitsBilling: unitsBillingRes,
        totals,
        heartbeat 
    });

  } catch (error: any) {
    console.error("Erro API Financeiro:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Trigger de Atualização
export async function POST() {
    try {
        const db = getDbConnection();
        await db.execute(`
            INSERT INTO system_status (service_name, status, last_run, message)
            VALUES ('financeiro', 'PENDING', datetime('now'), 'Solicitado via Painel')
            ON CONFLICT(service_name) DO UPDATE SET
                status = 'PENDING',
                message = 'Solicitado via Painel',
                last_run = datetime('now')
        `);
        return NextResponse.json({ success: true, message: "Atualização solicitada" });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}