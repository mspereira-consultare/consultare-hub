import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { withCache } from '@/lib/api_cache';

export const dynamic = 'force-dynamic';
const CACHE_TTL_MS = 15000;

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
      const filaSql = `
      SELECT hash_id, unidade, paciente, chegada, espera_minutos, status, profissional, updated_at
      FROM espera_medica
      WHERE status NOT LIKE 'Finalizado%'
        AND datetime(updated_at, '+3 hours') >= datetime('now', '-60 minutes')
      ORDER BY
        CASE WHEN status = 'Em Atendimento' THEN 0 ELSE 1 END,
        datetime(updated_at, '+3 hours') DESC
    `;
      const filaRows = await db.query(filaSql);

      (filaRows as any[]).forEach(row => {
        if (!row.updated_at) return;
        const updatedAt = new Date(row.updated_at.replace(' ', 'T'));
        if (isNaN(updatedAt.getTime())) return;

        const normalizedId = normalizeUnitId(row.unidade);
        const targetUnit = unitsMap.get(normalizedId);
        if (!targetUnit) return;

        const status = (row.status || '').toUpperCase();
        const isService = status.includes('ATENDIMENTO') || status.includes('SALA');

        const waitTimeRaw = Number(row.espera_minutos);
        const waitTime = Number.isFinite(waitTimeRaw) && waitTimeRaw >= 0 ? waitTimeRaw : 0;

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
      const attendedSql = `
      SELECT unidade, COUNT(*) as total
      FROM espera_medica
      WHERE status LIKE 'Finalizado%'
        AND updated_at >= datetime('now', '-1 day', '-3 hours')
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
      const avgSql = `
      SELECT unidade, ROUND(AVG(espera_minutos), 0) as media
      FROM espera_medica
      WHERE status LIKE 'Finalizado%'
        AND updated_at >= datetime('now', '-1 day', '-3 hours')
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
