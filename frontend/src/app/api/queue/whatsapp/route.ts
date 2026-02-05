import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { withCache } from '@/lib/api_cache';

export const dynamic = 'force-dynamic';
const CACHE_TTL_MS = 15000;
const CENTRAL_GROUP_ID = 'da45d882-5702-439b-8133-3d896d6a8810';
const CENTRAL_GROUP_NAME = 'Central de relacionamento';
const WHATSAPP_GROUP_NAMES: Record<string, string> = {
  '27a55f28-fcc9-464a-b309-46eae46cac71': 'Cancelados',
  [CENTRAL_GROUP_ID]: CENTRAL_GROUP_NAME,
  'dbfa4605-60ec-4f17-92c5-05c7d90ebcb4': 'Resolvesaude',
  'e4f34a9b-6b42-4ab5-9cd8-70f248ef422d': 'Verificar pagamentos'
};

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
      const globalRow = groupsRaw.find((g: any) => g.group_id === '__global__');
      const filteredGroups = groupsRaw.filter((g: any) => g.group_id !== '__global__');
      const groupsFromDb = filteredGroups.map((g: any) => ({
          group_id: g.group_id,
          group_name: g.group_name,
          queue_size: Number(g.queue_size || 0),
          avg_wait_seconds: Number(g.avg_wait_seconds || 0)
      }));
      const groupsById = new Map(groupsFromDb.map(g => [g.group_id, g]));

      // Garante que todos os grupos do mapa existam (mesmo com 0 conversas)
      Object.entries(WHATSAPP_GROUP_NAMES).forEach(([id, name]) => {
        if (!groupsById.has(id)) {
          groupsById.set(id, {
            group_id: id,
            group_name: name,
            queue_size: 0,
            avg_wait_seconds: 0
          });
        }
      });

      const groups = Array.from(groupsById.values()).sort((a, b) => {
        if (a.group_id === CENTRAL_GROUP_ID) return -1;
        if (b.group_id === CENTRAL_GROUP_ID) return 1;
        return a.group_name.localeCompare(b.group_name, 'pt-BR');
      });

      // Calcula totais globais
      const totalQueue = globalRow ? Number(globalRow.queue_size || 0) : groups.reduce((acc, g) => acc + g.queue_size, 0);
      
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
