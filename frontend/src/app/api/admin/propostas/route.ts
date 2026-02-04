import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { withCache, buildCacheKey, invalidateCache } from '@/lib/api_cache';

export const dynamic = 'force-dynamic';
const CACHE_TTL_MS = 30 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const cacheKey = buildCacheKey('admin', request.url);
    const cached = await withCache(cacheKey, CACHE_TTL_MS, async () => {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || new Date().toISOString().split('T')[0];
    const endDate = searchParams.get('endDate') || startDate;
    const unitFilter = searchParams.get('unit');
    
    const db = getDbConnection();

    // 1. TOTAIS GERAIS + CÁLCULO DE CONVERSÃO + VALOR PERDIDO
    // Adicionei 'executada' e 'aprovada pelo cliente' (tudo minúsculo para bater com lower(status))
    let summaryWhere = "WHERE date BETWEEN ? AND ?";
    const summaryParams: any[] = [startDate, endDate];
    if (unitFilter && unitFilter !== 'all') {
        summaryWhere += ` AND UPPER(TRIM(unit_name)) = UPPER(TRIM(?))`;
        summaryParams.push(unitFilter);
    }

    const summaryResult = await db.query(`
        SELECT 
            COUNT(*) as qtd,
            SUM(total_value) as valor,
            SUM(
                CASE 
                    WHEN lower(status) IN ('executada', 'aprovada pelo cliente', 'ganho', 'realizado', 'concluido', 'pago') 
                    THEN 1 
                    ELSE 0 
                END
            ) as won_qtd,
            SUM(
                CASE 
                    WHEN lower(status) IN ('executada', 'aprovada pelo cliente', 'ganho', 'realizado', 'concluido', 'pago') 
                    THEN total_value 
                    ELSE 0 
                END
            ) as won_value,
            SUM(
                CASE 
                    WHEN lower(status) IN ('cancelado', 'recusado', 'perdido', 'rejeição', 'cancelada') 
                    THEN total_value 
                    ELSE 0 
                END
            ) as lost_value
        FROM feegow_proposals
        ${summaryWhere}
    `, summaryParams);
    
    const rawSummary = summaryResult[0] || {};
    
    // Mapeia para o frontend (que espera wonValue)
    const summary = {
        qtd: rawSummary.qtd || 0,
        valor: rawSummary.valor || 0,
        wonValue: rawSummary.won_value || 0,
        wonQtd: rawSummary.won_qtd || 0,
        lostValue: rawSummary.lost_value || 0
    };

    // 2. POR UNIDADE
    let unitWhere = "WHERE date BETWEEN ? AND ?";
    const unitParams: any[] = [startDate, endDate];
    if (unitFilter && unitFilter !== 'all') {
        unitWhere += ` AND UPPER(TRIM(unit_name)) = UPPER(TRIM(?))`;
        unitParams.push(unitFilter);
    }

    const byUnit = await db.query(`
        SELECT 
            unit_name,
            status,
            COUNT(*) as qtd,
            SUM(total_value) as valor
        FROM feegow_proposals
        ${unitWhere}
        GROUP BY unit_name, status
        ORDER BY unit_name, valor DESC
    `, unitParams);

    // 3. RANKING DE VENDEDORES (COM SEPARAÇÃO DE STATUS)
    let proposerWhere = "WHERE date BETWEEN ? AND ?";
    const proposerParams: any[] = [startDate, endDate];
    if (unitFilter && unitFilter !== 'all') {
        proposerWhere += ` AND UPPER(TRIM(unit_name)) = UPPER(TRIM(?))`;
        proposerParams.push(unitFilter);
    }

    const byProposer = await db.query(`
        SELECT 
            professional_name,
            COUNT(*) as qtd,
            SUM(total_value) as valor,
            SUM(
                CASE 
                    WHEN lower(status) IN ('executada', 'aprovada pelo cliente', 'ganho', 'realizado', 'concluido', 'pago') 
                    THEN 1 
                    ELSE 0 
                END
            ) as qtd_executado,
            SUM(
                CASE 
                    WHEN lower(status) IN ('executada', 'aprovada pelo cliente', 'ganho', 'realizado', 'concluido', 'pago') 
                    THEN total_value 
                    ELSE 0 
                END
            ) as valor_executado
        FROM feegow_proposals
        ${proposerWhere}
        GROUP BY professional_name
        ORDER BY valor DESC
        LIMIT 20
    `, proposerParams);

    // 4. HEARTBEAT
    const statusResult = await db.query(`
        SELECT status, last_run, details 
        FROM system_status 
        WHERE service_name = 'comercial'
    `);
    const heartbeat = statusResult[0] || { status: 'UNKNOWN', last_run: null, details: '' };

    return {
        summary,
        byUnit,
        byProposer,
        heartbeat
    };
    });

    return NextResponse.json(cached);

  } catch (error: any) {
    console.error("Erro API Propostas:", error);
    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
}

export async function POST() {
    try {
        const db = getDbConnection();
        await db.execute(`
            INSERT INTO system_status (service_name, status, last_run, details)
            VALUES ('comercial', 'PENDING', datetime('now'), 'Solicitado via Painel')
            ON CONFLICT(service_name) DO UPDATE SET
                status = 'PENDING',
                details = 'Solicitado via Painel',
                last_run = datetime('now')
        `);
        invalidateCache('admin:');
        return NextResponse.json({ success: true, message: "Atualização solicitada" });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
    }
}
