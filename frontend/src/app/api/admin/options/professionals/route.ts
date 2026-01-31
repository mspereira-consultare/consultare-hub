import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDbConnection();
    // Busca nomes distintos de profissionais e agendadores
    const rows = await db.query(`
      SELECT DISTINCT TRIM(COALESCE(professional_name, scheduled_by)) as name
      FROM feegow_appointments
      WHERE (professional_name IS NOT NULL AND professional_name != '') OR (scheduled_by IS NOT NULL AND scheduled_by != '')
      ORDER BY name ASC
    `);

    const list = rows.map((r: any) => ({ name: r.name }));
    return NextResponse.json(list);
  } catch (error: any) {
    console.error('Erro OPTIONS professionals:', error);
    return NextResponse.json([], { status: 200 });
  }
}
