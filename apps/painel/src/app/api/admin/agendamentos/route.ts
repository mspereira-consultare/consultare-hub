import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { withCache, buildCacheKey, invalidateCache } from '@/lib/api_cache';

export const dynamic = 'force-dynamic';
const CACHE_TTL_MS = 30 * 60 * 1000;

const UNIT_PATTERNS_BY_ID: Record<string, string[]> = {
  '2': ['OURO VERDE'],
  '3': ['CENTRO CAMBUI', 'CENTRO CAMBUÍ'],
  '12': ['CAMPINAS SHOPPING', 'SHOPPING CAMPINAS'],
};

export async function GET(request: Request) {
  try {
    const cacheKey = buildCacheKey('admin', request.url);
    const cached = await withCache(cacheKey, CACHE_TTL_MS, async () => {
      const { searchParams } = new URL(request.url);
      const startDate = searchParams.get('startDate') || new Date().toISOString().split('T')[0];
      const endDate = searchParams.get('endDate') || startDate;
      const aggregateBy = (searchParams.get('aggregateBy') || 'day').toLowerCase(); // day|month|year
      const unit = searchParams.get('unit') || 'all';
      const scheduledBy = searchParams.get('scheduled_by') || '';
      const specialty = searchParams.get('specialty') || '';
      const professional = searchParams.get('professional') || '';
      const status = searchParams.get('status') || '';
      const wantDistincts = String(searchParams.get('distincts') || 'false') === 'true';

      const dbStart = `${startDate} 00:00:00`;
      const dbEnd = `${endDate} 23:59:59`;

      const db = getDbConnection();

      // choose period expression
      let dateExpr = "SUBSTR(f.scheduled_at,1,10)"; // day
      if (aggregateBy === 'month') dateExpr = "SUBSTR(f.scheduled_at,1,7)"; // YYYY-MM
      if (aggregateBy === 'year') dateExpr = "SUBSTR(f.scheduled_at,1,4)"; // YYYY

      let whereSql = 'WHERE f.scheduled_at BETWEEN ? AND ?';
      const params: any[] = [dbStart, dbEnd];

      if (unit && unit !== 'all') {
        const patterns = UNIT_PATTERNS_BY_ID[String(unit)] || [String(unit).toUpperCase()];
        const unitClauses = patterns.map(() => 'UPPER(TRIM(f.unit_name)) LIKE ?');
        whereSql += ` AND (${unitClauses.join(' OR ')})`;
        params.push(...patterns.map((p) => `%${p}%`));
      }

      if (scheduledBy && scheduledBy !== 'all') {
        whereSql += ' AND UPPER(TRIM(f.scheduled_by)) = UPPER(TRIM(?))';
        params.push(scheduledBy);
      }
      if (specialty && specialty !== 'all') {
        whereSql += ' AND UPPER(TRIM(f.specialty)) = UPPER(TRIM(?))';
        params.push(specialty);
      }
      if (professional && professional !== 'all') {
        whereSql += ' AND UPPER(TRIM(f.professional_name)) = UPPER(TRIM(?))';
        params.push(professional);
      }
      if (status && status !== 'all') {
        whereSql += ' AND f.status_id = ?';
        params.push(Number(status));
      }

      const seriesRes = await db.query(`
        SELECT
          ${dateExpr} as period,
          COUNT(*) as total,
          SUM(CASE WHEN status_id IN (3,7) THEN 1 ELSE 0 END) as confirmados,
          SUM(CASE WHEN status_id = 6 THEN 1 ELSE 0 END) as nao_compareceu
        FROM feegow_appointments f
        ${whereSql}
        GROUP BY period
        ORDER BY period ASC
      `, params);

      // overall stats in period
      const statsRes = await db.query(`
        SELECT
          COUNT(*) as totalPeriod,
          SUM(CASE WHEN status_id IN (3,7) THEN 1 ELSE 0 END) as confirmados
        FROM feegow_appointments f
        ${whereSql}
      `, params);
      const stats = statsRes[0] || { totalPeriod: 0, confirmados: 0 };
      const confirmedRate = stats.totalPeriod ? (stats.confirmados / stats.totalPeriod) : 0;

      // heartbeat
      const statusRes = await db.query(`
        SELECT status, last_run, details
        FROM system_status
        WHERE service_name IN ('appointments', 'agendamentos', 'financeiro')
        ORDER BY CASE
          WHEN service_name = 'appointments' THEN 1
          WHEN service_name = 'agendamentos' THEN 2
          WHEN service_name = 'financeiro' THEN 3
          ELSE 99
        END
        LIMIT 1
      `);
      const heartbeat = statusRes[0] || { status: 'UNKNOWN', last_run: null, details: '' };

      const out: any = {
        series: seriesRes || [],
        stats: {
          totalPeriod: Number(stats.totalPeriod || 0),
          confirmedRate: Number(confirmedRate || 0),
        },
        heartbeat,
      };

      if (wantDistincts) {
        const distincts = await Promise.all([
          db.query("SELECT DISTINCT TRIM(scheduled_by) as v FROM feegow_appointments WHERE scheduled_by IS NOT NULL ORDER BY v LIMIT 1000"),
          db.query("SELECT DISTINCT TRIM(specialty) as v FROM feegow_appointments WHERE specialty IS NOT NULL ORDER BY v LIMIT 1000"),
          db.query("SELECT DISTINCT TRIM(professional_name) as v FROM feegow_appointments WHERE professional_name IS NOT NULL ORDER BY v LIMIT 1000"),
          db.query("SELECT DISTINCT status_id as v FROM feegow_appointments ORDER BY v"),
        ]);
        out.distincts = {
          scheduled_by: (distincts[0] || []).map((r: any) => r.v).filter(Boolean),
          specialty: (distincts[1] || []).map((r: any) => r.v).filter(Boolean),
          professional: (distincts[2] || []).map((r: any) => r.v).filter(Boolean),
          status_ids: (distincts[3] || []).map((r: any) => Number(r.v)).filter((v: any) => !Number.isNaN(v)),
        };
      }

      return out;
    });

    return NextResponse.json(cached);
  } catch (error: any) {
    console.error('Erro API Agendamentos:', error);
    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
}

// POST: trigger manual refresh (heartbeat)
export async function POST() {
  try {
    const db = getDbConnection();
    await db.execute(`
      INSERT INTO system_status (service_name, status, last_run, details)
      VALUES ('appointments', 'PENDING', datetime('now'), 'Solicitado via Painel')
      ON CONFLICT(service_name) DO UPDATE SET
        status = 'PENDING',
        details = 'Solicitado via Painel',
        last_run = datetime('now')
    `);
    invalidateCache('admin:');
    return NextResponse.json({ success: true, message: 'Atualização solicitada' });
  } catch (error: any) {
    console.error('Erro POST Agendamentos:', error);
    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
}
