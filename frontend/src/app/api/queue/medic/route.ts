import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { withCache } from '@/lib/api_cache';

export const dynamic = 'force-dynamic';
const CACHE_TTL_MS = 15000;
const ACTIVE_MAX_AGE_HOURS = Math.max(
  1,
  Number.parseInt(process.env.MEDIC_API_ACTIVE_MAX_AGE_HOURS || '12', 10) || 12
);

function getSaoPauloNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const part = (type: string) => parts.find((item) => item.type === type)?.value || '00';
  return {
    year: Number(part('year')),
    month: Number(part('month')),
    day: Number(part('day')),
    hour: Number(part('hour')),
    minute: Number(part('minute')),
    second: Number(part('second')),
  };
}

function computeCurrentWaitMinutes(arrivalRaw: string, fallbackMinutes: number) {
  const arrival = String(arrivalRaw || '').trim();
  const match = arrival.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallbackMinutes;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return fallbackMinutes;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallbackMinutes;

  const now = getSaoPauloNow();
  const currentMinutes = now.hour * 60 + now.minute;
  const arrivalMinutes = hour * 60 + minute;
  const diff = currentMinutes - arrivalMinutes;

  if (!Number.isFinite(diff) || diff < 0) return fallbackMinutes;
  return diff;
}

function normalizeUnitId(dbName: string): string { 
  const upper = (dbName || '').toUpperCase(); 
  if (upper.includes("OURO")) return "Ouro Verde"; 
  if (upper.includes("CAMBUI") || upper.includes("CAMBUÍ")) return "Centro Cambui"; 
  if (upper.includes("SHOPPING") || upper.includes("CAMPINAS")) return "Campinas Shopping";
  return dbName; 
}

export async function GET() {
  try {
    const cached = await withCache('queue:medic', CACHE_TTL_MS, async () => {
      const db = getDbConnection();
      const isMysql = String(process.env.DB_PROVIDER || '').toLowerCase() === 'mysql'
        || !!process.env.MYSQL_URL
        || !!process.env.MYSQL_PUBLIC_URL;

      // Inicializa unidades
      const unitsMap = new Map<string, any>();
      ["Ouro Verde", "Centro Cambui", "Campinas Shopping"].forEach(id => {
        unitsMap.set(id, {
          id,
          name: id.toUpperCase(),
          patients: [],
          totalAttended: 0,
          averageWaitDay: 0
        });
      });

      // 1️⃣ FILA ATUAL (somente ativos recentes)
      const filaSql = isMysql
        ? `
          SELECT hash_id, unidade, paciente, chegada, espera_minutos, status, profissional, updated_at
          FROM espera_medica
          WHERE (status IS NULL OR status NOT LIKE 'Finalizado%')
            AND updated_at IS NOT NULL
            AND updated_at >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL ${ACTIVE_MAX_AGE_HOURS} HOUR), '%Y-%m-%d %H:%i:%s')
          ORDER BY
            CASE WHEN status = 'Em Atendimento' THEN 0 ELSE 1 END,
            DATE_ADD(updated_at, INTERVAL 3 HOUR) DESC
        `
        : `
          SELECT hash_id, unidade, paciente, chegada, espera_minutos, status, profissional, updated_at
          FROM espera_medica
          WHERE (status IS NULL OR status NOT LIKE 'Finalizado%')
            AND updated_at IS NOT NULL
            AND datetime(updated_at) >= datetime('now', '-${ACTIVE_MAX_AGE_HOURS} hours')
          ORDER BY
            CASE WHEN status = 'Em Atendimento' THEN 0 ELSE 1 END,
            datetime(updated_at, '+3 hours') DESC
        `;
      const filaRows = await db.query(filaSql);

      (filaRows as any[]).forEach(row => {
        const normalizedId = normalizeUnitId(row.unidade);
        const targetUnit = unitsMap.get(normalizedId);
        if (!targetUnit) return;

        const status = (row.status || '').toUpperCase();
        const isService = status.includes('ATENDIMENTO') || status.includes('SALA');

        const waitTimeRaw = Number(row.espera_minutos);
        const fallbackWaitTime = Number.isFinite(waitTimeRaw) && waitTimeRaw >= 0 ? waitTimeRaw : 0;
        const waitTime = computeCurrentWaitMinutes(row.chegada, fallbackWaitTime);

        targetUnit.patients.push({
          id: row.hash_id,
          name: row.paciente,
          service: '',
          professional: row.profissional || '',
          arrival: row.chegada,
          waitTime,
          status: isService ? 'in_service' : 'waiting',
          priority: {
            isElderly: row.paciente?.toLowerCase().includes('idoso'),
            isWheelchair: row.paciente?.toLowerCase().includes('cadeirante'),
            isPregnant: row.paciente?.toLowerCase().includes('gestante')
          }
        });
      });

      // 2️⃣ TOTAL ATENDIDOS HOJE
      const attendedSql = isMysql
        ? `
          SELECT unidade, COUNT(*) as total
          FROM espera_medica
          WHERE status LIKE 'Finalizado%'
            AND DATE(updated_at) = CURDATE()
          GROUP BY unidade
        `
        : `
          SELECT unidade, COUNT(*) as total
          FROM espera_medica
          WHERE status LIKE 'Finalizado%'
            AND date(updated_at) = date('now')
          GROUP BY unidade
        `;
      const attendedRows = await db.query(attendedSql);

      (attendedRows as any[]).forEach(row => {
        const normalizedId = normalizeUnitId(row.unidade);
        const targetUnit = unitsMap.get(normalizedId);
        if (targetUnit) {
          targetUnit.totalAttended = row.total || 0;
        }
      });

      // 3️⃣ MÉDIA DE ESPERA DO DIA
      const avgSql = isMysql
        ? `
          SELECT unidade, ROUND(AVG(espera_minutos), 0) as media
          FROM espera_medica
          WHERE status LIKE 'Finalizado%'
            AND DATE(updated_at) = CURDATE()
            AND espera_minutos IS NOT NULL
            AND espera_minutos BETWEEN 0 AND 240
          GROUP BY unidade
        `
        : `
          SELECT unidade, ROUND(AVG(espera_minutos), 0) as media
          FROM espera_medica
          WHERE status LIKE 'Finalizado%'
            AND date(updated_at) = date('now')
            AND espera_minutos IS NOT NULL
            AND espera_minutos BETWEEN 0 AND 240
          GROUP BY unidade
        `;
      const avgRows = await db.query(avgSql);

      (avgRows as any[]).forEach(row => {
        const normalizedId = normalizeUnitId(row.unidade);
        const targetUnit = unitsMap.get(normalizedId);
        if (targetUnit) {
          targetUnit.averageWaitDay = row.media || 0;
        }
      });

      // 4️⃣ Ordenação da fila
      unitsMap.forEach(unit => {
        unit.patients.sort((a: any, b: any) => {
          if (a.status === 'in_service' && b.status !== 'in_service') return -1;
          if (a.status !== 'in_service' && b.status === 'in_service') return 1;
          return b.waitTime - a.waitTime;
        });
      }); 

      return {
        status: 'success',
        data: Array.from(unitsMap.values()),
        timestamp: new Date().toISOString()
      };
    });

    return NextResponse.json(cached);

  } catch (error) {
    console.error('[MEDIC API ERROR]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: (error as any)?.status || 500 });
  }
}
