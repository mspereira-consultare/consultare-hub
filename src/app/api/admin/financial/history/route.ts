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

    // 1. COLUNA DE DATA (Faturamento)
    const dateCol = 'data_do_pagamento';
    const sqlDate = `substr(${dateCol}, 7, 4) || '-' || substr(${dateCol}, 4, 2) || '-' || substr(${dateCol}, 1, 2)`;

    // 2. FILTROS
    let whereClause = `WHERE 1=1`;
    const params: any[] = [];

    // Filtro Robusto (TRIM/UPPER)
    if (groupFilter && groupFilter !== 'all') {
        whereClause += ` AND UPPER(TRIM(grupo)) = UPPER(TRIM(?))`;
        params.push(groupFilter);
    }
    if (procedureFilter && procedureFilter !== 'all') {
        whereClause += ` AND procedimento = ?`;
        params.push(procedureFilter);
    }
    if (startDate && endDate) {
        whereClause += ` AND ${sqlDate} BETWEEN ? AND ?`;
        params.push(startDate, endDate);
    } else {
        whereClause += ` AND ${sqlDate} >= date('now', '-30 days')`;
    }

    // 3. QUERIES (Financeiro)

    const daily = db.prepare(`
        SELECT ${sqlDate} as d, SUM(total_pago) as total, COUNT(*) as qtd
        FROM faturamento_analitico
        ${whereClause}
        GROUP BY d ORDER BY d ASC
    `).all(...params) || [];

    const monthly = db.prepare(`
        SELECT substr(${dateCol}, 7, 4) || '-' || substr(${dateCol}, 4, 2) as m, SUM(total_pago) as total
        FROM faturamento_analitico
        ${whereClause}
        GROUP BY m ORDER BY m ASC
    `).all(...params) || [];

    const totals = db.prepare(`
        SELECT SUM(total_pago) as total, COUNT(*) as qtd
        FROM faturamento_analitico
        ${whereClause}
    `).get(...params) as { total: number, qtd: number } || { total: 0, qtd: 0 };

    // --- LISTA DE GRUPOS UNIFICADA (Faturamento + Agenda) ---
    // Isso garante que grupos como "Vacina" (que só estão na agenda) apareçam na lista
    
    // Verifica se a tabela agenda existe para evitar erro
    let hasAgenda = false;
    try {
        const check = db.prepare("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='feegow_appointments'").get() as any;
        hasAgenda = check['count(*)'] > 0;
    } catch (e) {}

    let groupsQuery = `
        SELECT TRIM(grupo) as name, SUM(total_pago) as total, COUNT(*) as qtd
        FROM faturamento_analitico
        WHERE grupo IS NOT NULL AND grupo != ''
        GROUP BY TRIM(grupo)
    `;

    if (hasAgenda) {
        // Faz UNION para trazer grupos da agenda também (com total 0 pois não tem faturamento ainda)
        groupsQuery = `
            SELECT name, SUM(total) as total, SUM(qtd) as qtd FROM (
                SELECT TRIM(grupo) as name, SUM(total_pago) as total, COUNT(*) as qtd 
                FROM faturamento_analitico 
                WHERE grupo IS NOT NULL AND grupo != '' 
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
        label: g.name, // Garante que o GroupList tenha label
        procedure_group: g.name
    })) || [];


    // --- LISTA DE PROCEDIMENTOS ---
    let procWhere = `WHERE procedimento IS NOT NULL AND procedimento != ''`;
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