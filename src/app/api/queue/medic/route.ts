import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export const dynamic = 'force-dynamic';

function normalizeUnitId(dbName: string): string {
  const upper = (dbName || '').toUpperCase();
  if (upper.includes("OURO VERDE")) return "Ouro Verde";
  if (upper.includes("CAMBUI") || upper.includes("CAMBUÍ")) return "Centro Cambui";
  if (upper.includes("SHOPPING") || upper.includes("CAMPINAS")) return "Campinas Shopping";
  return dbName;
}

function calculateWaitTime(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return 0;
  try {
    const now = new Date();
    const arrival = new Date();
    const [hours, minutes] = timeStr.split(':').map(Number);
    arrival.setHours(hours, minutes, 0, 0);
    // Ajuste para virada de dia
    if (arrival.getTime() > now.getTime()) arrival.setDate(arrival.getDate() - 1);
    
    const diffMs = now.getTime() - arrival.getTime();
    return Math.max(0, Math.floor(diffMs / 60000));
  } catch (e) { return 0; }
}

export async function GET() {
  try {
    const db = getDbConnection();
    
    // Inicializa mapa com as unidades esperadas
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

    // QUERY CORRIGIDA: Traz tudo da tabela (sem filtrar status) para contar os atendidos
    const sql = `SELECT * FROM espera_medica ORDER BY updated_at DESC`;
    
    // Usa db.query que retorna array de objetos diretamente
    const rows = await db.query(sql, []);

    (rows as any[]).forEach((row) => {
      const rawName = row.unidade || row.UNIDADE || '';
      const normalizedId = normalizeUnitId(rawName);
      const targetUnit = unitsMap.get(normalizedId);

      if (targetUnit) {
          const status = (row.status || '').toUpperCase();
          
          // Classificação de Status
          const isFinished = status.includes('FINALIZADO') || status.includes('CANCELADO') || status.includes('SAIU');
          const isService = status.includes('ATENDIMENTO') || status.includes('SALA');
          
          // Se estiver finalizado, apenas incrementa o contador
          if (isFinished) {
              targetUnit.totalAttended++;
          } else {
              // Se NÃO estiver finalizado, adiciona na lista de pacientes (Fila)
              const statusFront = isService ? 'in_service' : 'waiting';
              
              const esperaClean = String(row.espera || '').replace(/\D/g, '');
              const waitMinutes = esperaClean ? parseInt(esperaClean, 10) : calculateWaitTime(row.chegada);

              targetUnit.patients.push({
                id: row.hash_id,
                name: row.paciente,
                service: '', 
                professional: row.profissional || '',
                arrival: row.chegada, // HH:mm
                waitTime: waitMinutes,
                status: statusFront,
                priority: {
                    isElderly: (row.paciente?.toLowerCase().includes('idoso')),
                    isWheelchair: row.paciente?.toLowerCase().includes('cadeirante'),
                    isPregnant: row.paciente?.toLowerCase().includes('gestante')
                }
              });
          }
      }
    });

    // Ordenação da fila: Em atendimento primeiro, depois quem espera há mais tempo
    unitsMap.forEach(unit => {
        unit.patients.sort((a: any, b: any) => {
            if (a.status === 'in_service' && b.status !== 'in_service') return -1;
            if (a.status !== 'in_service' && b.status === 'in_service') return 1;
            return b.waitTime - a.waitTime;
        });
    });

    return NextResponse.json({ 
      status: 'success', 
      data: Array.from(unitsMap.values()), 
      timestamp: new Date().toISOString() 
    });

  } catch (error) {
    console.error('[MEDIC API ERROR]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}