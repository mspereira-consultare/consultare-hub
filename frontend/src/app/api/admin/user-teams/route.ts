import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET: Lista usuários e suas equipes
export async function GET() {
    try {
        const db = getDbConnection();

        // Cria tabelas se não existirem
        await db.execute(`
            CREATE TABLE IF NOT EXISTS teams_master (
                id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                name TEXT UNIQUE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS user_teams (
                id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                user_name TEXT NOT NULL,
                team_id TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (team_id) REFERENCES teams_master(id) ON DELETE CASCADE,
                UNIQUE(user_name, team_id)
            )
        `);

        // Busca todos os usuários únicos de agendamentos
        const users = await db.query(`
            SELECT DISTINCT f.scheduled_by as user_name
            FROM feegow_appointments f
            WHERE f.scheduled_by IS NOT NULL 
              AND f.scheduled_by != '' 
              AND f.scheduled_by != 'Sistema'
            ORDER BY f.scheduled_by ASC
        `);

        // Para cada usuário, busca suas equipes
        const usersWithTeams = await Promise.all(users.map(async (u: { user_name: string }) => {
            const teamsRes = await db.query(`
                SELECT tm.id, tm.name
                FROM user_teams ut
                INNER JOIN teams_master tm ON ut.team_id = tm.id
                WHERE ut.user_name = ?
                ORDER BY tm.name ASC
            `, [u.user_name]);
            
            return {
                user_name: u.user_name,
                teams: teamsRes.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name }))
            };
        }));

        // Busca todas as equipes disponíveis
        const allTeams = await db.query(`
            SELECT id, name
            FROM teams_master
            ORDER BY name ASC
        `);

        return NextResponse.json({ 
            users: usersWithTeams, 
            teams: allTeams 
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error("Erro ao buscar usuários e equipes:", error);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}

// POST: Adicionar ou remover usuário de uma equipe
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { user_name, team_id, action = 'add' } = body; // action: 'add' ou 'remove'

        if (!user_name || !team_id) {
            return NextResponse.json({ 
                error: 'user_name e team_id são obrigatórios' 
            }, { status: 400 });
        }

        const db = getDbConnection();

        // Cria tabela se não existir
        await db.execute(`
            CREATE TABLE IF NOT EXISTS user_teams (
                id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                user_name TEXT NOT NULL,
                team_id TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (team_id) REFERENCES teams_master(id) ON DELETE CASCADE,
                UNIQUE(user_name, team_id)
            )
        `);

        if (action === 'remove') {
            // Remove usuário da equipe
            await db.execute(`
                DELETE FROM user_teams 
                WHERE user_name = ? AND team_id = ?
            `, [user_name, team_id]);
        } else {
            // Adiciona usuário à equipe (se não existir)
            await db.execute(`
                INSERT OR IGNORE INTO user_teams (user_name, team_id)
                VALUES (?, ?)
            `, [user_name, team_id]);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error("Erro ao atualizar usuário-equipe:", error);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
