import { NextResponse } from 'next/server';
import {
  buildAppointmentConfirmationHybridCte,
  getAppointmentConfirmationContext,
} from '@/lib/appointments_confirmation_repository';
import { getDbConnection } from '@/lib/db';
import { withCache, buildCacheKey, invalidateCache } from '@/lib/api_cache';

export const dynamic = 'force-dynamic';
const CACHE_TTL_MS = 30 * 60 * 1000;

const nowInSaoPaulo = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date()).replace(' ', ' ');

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
    const confirmationContext = await getAppointmentConfirmationContext(db);
    const hybridCte = buildAppointmentConfirmationHybridCte(confirmationContext);

    // 1. RANKING INDIVIDUAL
    // Agora traz também o time de cada usuário para exibir no card
    // User ranking: join with new many-to-many tables and aggregate team names
    const userStats = await db.query(`
        ${hybridCte.sql}
        SELECT 
            f.scheduled_by as user,
            GROUP_CONCAT(DISTINCT tm.name) as team_name,
            COUNT(DISTINCT f.appointment_id) as total,
            COUNT(DISTINCT CASE WHEN COALESCE(f.effective_confirmed_d1, 0) = 1 THEN f.appointment_id END) as confirmados
        FROM appointment_confirmation_base f
        LEFT JOIN user_teams ut ON ut.user_name = f.scheduled_by
        LEFT JOIN teams_master tm ON tm.id = ut.team_id
        WHERE f.scheduled_at BETWEEN ? AND ?
        AND f.scheduled_by IS NOT NULL AND f.scheduled_by != '' AND f.scheduled_by != 'Sistema'
        GROUP BY f.scheduled_by
        ORDER BY total DESC
    `, [...hybridCte.params, dbStart, dbEnd]);

    // 2. ESTATÍSTICAS GERAIS (GLOBAL - TODA A CLÍNICA)
    const globalStatsRes = await db.query(`
        ${hybridCte.sql}
        SELECT 
            COUNT(DISTINCT appointment_id) as total,
            COUNT(DISTINCT CASE WHEN COALESCE(effective_confirmed_d1, 0) = 1 THEN appointment_id END) as confirmados,
            SUM(CASE WHEN effective_status_id = 6 THEN 1 ELSE 0 END) as nao_compareceu
        FROM appointment_confirmation_base
        WHERE scheduled_at BETWEEN ? AND ?
    `, [...hybridCte.params, dbStart, dbEnd]);
    const globalStats = globalStatsRes[0] || { total: 0, confirmados: 0, nao_compareceu: 0 };

    // 3. ESTATÍSTICAS DA EQUIPE SELECIONADA (Dinâmico via banco)
    // Team-specific stats using many-to-many relationship
    const teamStatsRes = await db.query(`
        ${hybridCte.sql}
        SELECT 
            COUNT(DISTINCT f.appointment_id) as total,
            COUNT(DISTINCT CASE WHEN COALESCE(f.effective_confirmed_d1, 0) = 1 THEN f.appointment_id END) as confirmados,
            COUNT(DISTINCT f.scheduled_by) as active_members
        FROM appointment_confirmation_base f
        JOIN user_teams ut ON ut.user_name = f.scheduled_by
        JOIN teams_master tm ON tm.id = ut.team_id
        WHERE f.scheduled_at BETWEEN ? AND ?
        AND tm.name = ?
    `, [...hybridCte.params, dbStart, dbEnd, selectedTeam]);
    
    const teamStats = teamStatsRes[0] || { total: 0, confirmados: 0, active_members: 0 };

    // 4. HEARTBEAT
    const statusRes = await db.query(`
        SELECT status, last_run, details 
        FROM system_status 
        WHERE service_name IN ('appointments', 'financeiro', 'agendamentos')
        ORDER BY CASE 
          WHEN service_name = 'appointments' THEN 1
          WHEN service_name = 'financeiro' THEN 2
          WHEN service_name = 'agendamentos' THEN 3
          ELSE 99
        END
        LIMIT 1
    `);
    const heartbeat = statusRes[0] || { status: 'UNKNOWN', last_run: null, details: '' };

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
        const requestedAt = nowInSaoPaulo();
        const currentRows = await db.query(`
            SELECT status
            FROM system_status
            WHERE service_name = 'appointments'
            LIMIT 1
        `);
        const currentStatus = String(currentRows[0]?.status || '').trim().toUpperCase();
        if (currentStatus === 'RUNNING' || currentStatus === 'QUEUED') {
            invalidateCache('admin:');
            return NextResponse.json({ success: true, message: "Atualização já está em execução" });
        }
        await db.execute(`
            INSERT INTO system_status (service_name, status, last_run, details)
            VALUES ('appointments', 'PENDING', ?, 'Solicitado via Painel')
            ON CONFLICT(service_name) DO UPDATE SET
                status = 'PENDING',
                details = 'Solicitado via Painel',
                last_run = excluded.last_run
        `, [requestedAt]);
        invalidateCache('admin:');
        return NextResponse.json({ success: true, message: "Atualização solicitada" });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
    }
}
