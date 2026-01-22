import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDbConnection();
    
    // Busca status dos serviços
    const services = db.prepare(`
        SELECT service_name, status, last_run, details 
        FROM system_status 
        ORDER BY last_run DESC
    `).all();

    return NextResponse.json(services);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}