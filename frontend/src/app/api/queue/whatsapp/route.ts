import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { withCache } from '@/lib/api_cache';

export const dynamic = 'force-dynamic';
const CACHE_TTL_MS = 15000;

export async function GET() {
  try {
    const cached = await withCache('queue:whatsapp', CACHE_TTL_MS, async () => {
      const db = getDbConnection();

      // Busca os grupos já com nomes corretos salvos pelo worker
      // Migrado de db.prepare().all() para await db.query()
      const groupsRaw = await db.query(`
      SELECT group_id, group_name, queue_size, avg_wait_seconds 
      FROM clinia_group_snapshots 
      ORDER BY queue_size DESC
    `);
    
      // Garante tipagem numérica para evitar erros nos cálculos
      const groups = groupsRaw.map((g: any) => ({
          group_id: g.group_id,
          group_name: g.group_name,
          queue_size: Number(g.queue_size || 0),
          avg_wait_seconds: Number(g.avg_wait_seconds || 0)
      }));

      // Calcula totais globais
      const totalQueue = groups.reduce((acc, g) => acc + g.queue_size, 0);
      
      // Média apenas dos grupos com tempo > 0
      const activeGroups = groups.filter(g => g.avg_wait_seconds > 0);
      const totalWait = activeGroups.reduce((acc, g) => acc + g.avg_wait_seconds, 0);
      const avgWait = activeGroups.length > 0 ? Math.round(totalWait / activeGroups.length) : 0;

      return { 
        status: 'success', 
        data: {
          global: {
            queue: totalQueue,
            avgWaitSeconds: avgWait
          },
          groups: groups
        } 
      };
    });

    return NextResponse.json(cached);

  } catch (error) {
    console.error('Erro API WhatsApp:', error);
    return NextResponse.json({ 
        status: 'error', 
        data: { global: { queue: 0, avgWaitSeconds: 0 }, groups: [] } 
    });
  }
}
