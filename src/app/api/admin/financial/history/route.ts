import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const groupFilter = searchParams.get('group');
    const procedureFilter = searchParams.get('procedure');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const db = getDbConnection();

    // 1. CORREÇÃO DE DATA
    // O banco agora salva como 'YYYY-MM-DD' (ISO), então usamos a coluna diretamente.
    const dateCol = 'data_do_pagamento';
    
    // 2. FILTROS
    let whereClause = `WHERE 1=1`;
    const params: any[] = [];

    // --- REGRA DE NEGÓCIO: EXCLUIR RESOLVECARD ---
    // Este painel é da Clínica Médica, não deve somar o Cartão de Benefícios.
    whereClause += ` AND (unidade IS NULL OR (unidade NOT LIKE '%RESOLVECARD%' AND unidade NOT LIKE '%GESTÃO DE BENEFICOS%'))`;

    // Filtro de Grupo
    if (groupFilter && groupFilter !== 'all') {
        whereClause += ` AND UPPER(TRIM(grupo)) = UPPER(TRIM(?))`;
        params.push(groupFilter);
    }
    // Filtro de Procedimento
    if (procedureFilter && procedureFilter !== 'all') {
        whereClause += ` AND procedimento = ?`;
        params.push(procedureFilter);
    }
    // Filtro de Data (Comparação direta de string ISO funciona perfeitamente)
    if (startDate && endDate) {
        whereClause += ` AND ${dateCol} BETWEEN ? AND ?`;
        params.push(startDate, endDate);
    } else {
        whereClause += ` AND ${dateCol} >= date('now', '-30 days')`;
    }

    // 3. QUERIES (Financeiro)

    // Agrupamento Diário (Já está em YYYY-MM-DD, basta agrupar)
    const daily = db.prepare(`
        SELECT ${dateCol} as d, SUM(total_pago) as total, COUNT(*) as qtd
        FROM faturamento_analitico
        ${whereClause}
        GROUP BY d ORDER BY d ASC
    `).all(...params) || [];

    // Agrupamento Mensal (Extraímos os primeiros 7 caracteres: YYYY-MM)
    const monthly = db.prepare(`
        SELECT substr(${dateCol}, 1, 7) as m, SUM(total_pago) as total
        FROM faturamento_analitico
        ${whereClause}
        GROUP BY m ORDER BY m ASC
    `).all(...params) || [];

    // Totais Gerais
    const totals = db.prepare(`
        SELECT SUM(total_pago) as total, COUNT(*) as qtd
        FROM faturamento_analitico
        ${whereClause}
    `).get(...params) as { total: number, qtd: number } || { total: 0, qtd: 0 };

    // --- LISTA DE GRUPOS UNIFICADA (Faturamento + Agenda) ---
    
    // Verifica se a tabela agenda existe
    let hasAgenda = false;
    try {
        const check = db.prepare("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='feegow_appointments'").get() as any;
        hasAgenda = check['count(*)'] > 0;
    } catch (e) {}

    // Query base para grupos (com filtro de unidade aplicado)
    // Note que aplicamos o filtro de unidade aqui também para não sujar a lista de filtros
    let groupsQuery = `
        SELECT TRIM(grupo) as name, SUM(total_pago) as total, COUNT(*) as qtd
        FROM faturamento_analitico
        WHERE grupo IS NOT NULL AND grupo != ''
        AND (unidade IS NULL OR (unidade NOT LIKE '%RESOLVECARD%' AND unidade NOT LIKE '%GESTÃO DE BENEFICOS%'))
        GROUP BY TRIM(grupo)
    `;

    if (hasAgenda) {
        // Union com Agenda
        groupsQuery = `
            SELECT name, SUM(total) as total, SUM(qtd) as qtd FROM (
                SELECT TRIM(grupo) as name, SUM(total_pago) as total, COUNT(*) as qtd 
                FROM faturamento_analitico 
                WHERE grupo IS NOT NULL AND grupo != '' 
                AND (unidade IS NULL OR (unidade NOT LIKE '%RESOLVECARD%' AND unidade NOT LIKE '%GESTÃO DE BENEFICOS%'))
                GROUP BY 1
                
                UNION ALL
                
                SELECT TRIM(procedure_group) as name, 0 as total, COUNT(*) as qtd 
                FROM feegow_appointments 
                WHERE procedure_group IS NOT NULL AND procedure_group != '' 
                GROUP BY 1
            ) GROUP BY name ORDER BY total DESC
        `;
    } else {
        groupsQuery += ` ORDER BY total DESC`;
    }

    const groups = db.prepare(groupsQuery).all().map((g: any) => ({
        ...g,
        label: g.name,
        procedure_group: g.name
    })) || [];


    // --- LISTA DE PROCEDIMENTOS ---
    // Também aplicamos o filtro de unidade aqui
    let procWhere = `WHERE procedimento IS NOT NULL AND procedimento != ''`;
    procWhere += ` AND (unidade IS NULL OR (unidade NOT LIKE '%RESOLVECARD%' AND unidade NOT LIKE '%GESTÃO DE BENEFICOS%'))`;
    
    const procParams = [];
    if (groupFilter && groupFilter !== 'all') {
        procWhere += ` AND UPPER(TRIM(grupo)) = UPPER(TRIM(?))`;
        procParams.push(groupFilter);
    }
    const procedures = db.prepare(`
        SELECT DISTINCT procedimento as name
        FROM faturamento_analitico
        ${procWhere}
        ORDER BY name ASC
    `).all(...procParams) || [];

    return NextResponse.json({ daily, monthly, groups, procedures, totals });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}