import { getDbConnection } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const db = getDbConnection();

    const services = await db.query(`
      SELECT service_name, status, last_run, details
      FROM system_status
      ORDER BY last_run DESC
    `);

    return NextResponse.json(services);
  } catch (error) {
    console.error('[STATUS] Erro:', error);
    return NextResponse.json({ error: 'Erro ao buscar status.' }, { status: (error as any)?.status || 500 });
  }
}
