import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const db = getDbConnection();

        // Garante que a tabela existe (Segurança)
        await db.execute(`
            CREATE TABLE IF NOT EXISTS team_config (
                user_name TEXT PRIMARY KEY,
                team_name TEXT
            )
        `);

        // Busca todos os usuários únicos que já tiveram agendamentos
        // E faz JOIN com a tabela de times para ver quem já tem time definido
        const users = await db.query(`
            SELECT DISTINCT 
                f.scheduled_by as user_name,
                t.team_name
            FROM feegow_appointments f
            LEFT JOIN team_config t ON f.scheduled_by = t.user_name
            WHERE f.scheduled_by IS NOT NULL 
              AND f.scheduled_by != '' 
              AND f.scheduled_by != 'Sistema'
            ORDER BY f.scheduled_by ASC
        `);

        // Busca lista de times únicos para o filtro
        const teams = await db.query(`SELECT DISTINCT team_name FROM team_config ORDER BY team_name ASC`);

        return NextResponse.json({ users, teams });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { user_name, team_name } = body;
        const db = getDbConnection();

        if (team_name === 'none' || !team_name) {
            // Remove do time
            await db.execute(`DELETE FROM team_config WHERE user_name = ?`, [user_name]);
        } else {
            // Salva ou Atualiza (Upsert)
            await db.execute(`
                INSERT INTO team_config (user_name, team_name) VALUES (?, ?)
                ON CONFLICT(user_name) DO UPDATE SET team_name = excluded.team_name
            `, [user_name, team_name]);
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}