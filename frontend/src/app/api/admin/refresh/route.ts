import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { invalidateCache } from '@/lib/api_cache';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { service } = await request.json(); 

    if (!service) {
        return NextResponse.json({ error: "Serviço não informado" }, { status: 400 });
    }

    const db = getDbConnection();

    // Query unificada (Upsert)
    const sql = `
        INSERT INTO system_status (service_name, status, last_run, details)
        VALUES (?, 'PENDING', datetime('now'), 'Solicitado via Painel')
        ON CONFLICT(service_name) 
        DO UPDATE SET status = 'PENDING', details = 'Solicitado via Painel'
    `;

    // Agora é AWAIT para compatibilidade com Turso
    await db.execute(sql, [service]);

    invalidateCache('admin:');
    return NextResponse.json({ 
        success: true, 
        message: "Atualização solicitada. O worker processará em breve." 
    });

  } catch (error: any) {
    console.error("Erro Refresh API:", error);
    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
}
