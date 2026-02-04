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
    const selectedTeam = searchParams.get('team') || 'CRC'; // Padrão CRC se não vier nada
    
    const dbStart = `${startDate} 00:00:00`;
    const dbEnd = `${endDate} 23:59:59`;

    const db = getDbConnection();

    // 1. RANKING INDIVIDUAL
    // Agora traz também o time de cada usuário para exibir no card
    // User ranking: join with new many-to-many tables and aggregate team names
    const userStats = await db.query(`
        SELECT 
            f.scheduled_by as user,
            GROUP_CONCAT(DISTINCT tm.name) as team_name,
            COUNT(*) as total,
            SUM(CASE WHEN f.status_id IN (3, 7) THEN 1 ELSE 0 END) as confirmados
        FROM feegow_appointments f
        LEFT JOIN user_teams ut ON ut.user_name = f.scheduled_by
        LEFT JOIN teams_master tm ON tm.id = ut.team_id
        WHERE f.scheduled_at BETWEEN ? AND ?
        AND f.scheduled_by IS NOT NULL AND f.scheduled_by != '' AND f.scheduled_by != 'Sistema'
        GROUP BY f.scheduled_by
        ORDER BY total DESC
    `, [dbStart, dbEnd]);

    // 2. ESTATÍSTICAS GERAIS (GLOBAL - TODA A CLÍNICA)
    const globalStatsRes = await db.query(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status_id IN (3, 7) THEN 1 ELSE 0 END) as confirmados
        FROM feegow_appointments
        WHERE scheduled_at BETWEEN ? AND ?
    `, [dbStart, dbEnd]);
    const globalStats = globalStatsRes[0] || { total: 0, confirmados: 0 };

    // 3. ESTATÍSTICAS DA EQUIPE SELECIONADA (Dinâmico via banco)
    // Team-specific stats using many-to-many relationship
    const teamStatsRes = await db.query(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN f.status_id IN (3, 7) THEN 1 ELSE 0 END) as confirmados,
            COUNT(DISTINCT f.scheduled_by) as active_members
        FROM feegow_appointments f
        JOIN user_teams ut ON ut.user_name = f.scheduled_by
        JOIN teams_master tm ON tm.id = ut.team_id
        WHERE f.scheduled_at BETWEEN ? AND ?
        AND tm.name = ?
    `, [dbStart, dbEnd, selectedTeam]);
    
    const teamStats = teamStatsRes[0] || { total: 0, confirmados: 0, active_members: 0 };

    // 4. HEARTBEAT
    const statusRes = await db.query(`
        SELECT status, last_run, message 
        FROM system_status 
        WHERE service_name = 'agendamentos'
    `);
    const heartbeat = statusRes[0] || { status: 'UNKNOWN', last_run: null, message: '' };

    return { 
        userStats, 
        globalStats,
        teamStats: {
            ...teamStats,
            name: selectedTeam
        },
        heartbeat
    };
    });

    return NextResponse.json(cached);

  } catch (error: any) {
    console.error("Erro API Produtividade:", error);
    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
}

// POST: Trigger de Atualização Manual
export async function POST() {
    try {
        const db = getDbConnection();
        await db.execute(`
            INSERT INTO system_status (service_name, status, last_run, message)
            VALUES ('agendamentos', 'PENDING', datetime('now'), 'Solicitado via Painel')
            ON CONFLICT(service_name) DO UPDATE SET
                status = 'PENDING',
                message = 'Solicitado via Painel',
                last_run = datetime('now')
        `);
        invalidateCache('admin:');
        return NextResponse.json({ success: true, message: "Atualização solicitada" });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
    }
}
