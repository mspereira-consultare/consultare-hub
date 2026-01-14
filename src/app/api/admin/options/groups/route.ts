import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDbConnection();
    // Busca grupos distintos não nulos
    const result = db.prepare(`
        SELECT DISTINCT procedure_group 
        FROM feegow_appointments 
        WHERE procedure_group IS NOT NULL AND procedure_group != ''
        ORDER BY procedure_group ASC
    `).all() as { procedure_group: string }[];

    const groups = result.map(r => r.procedure_group);
    
    return NextResponse.json(groups);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}