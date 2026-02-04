import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { withCache, buildCacheKey, invalidateCache } from '@/lib/api_cache';

export const dynamic = 'force-dynamic';
const CACHE_TTL_MS = 30 * 60 * 1000;

// GET: Lista todas as equipes criadas
export async function GET(request: Request) {
    try {
        const cacheKey = buildCacheKey('admin', request.url);
        const cached = await withCache(cacheKey, CACHE_TTL_MS, async () => {
            const db = getDbConnection();

            // Garante que a tabela de equipes existe
            await db.execute(`
                CREATE TABLE IF NOT EXISTS teams_master (
                    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                    name TEXT UNIQUE NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Busca todas as equipes
            const teams = await db.query(`
                SELECT id, name, created_at, updated_at 
                FROM teams_master 
                ORDER BY name ASC
            `);

            return { teams };
        });

        return NextResponse.json(cached);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error("Erro ao buscar equipes:", error);
        return NextResponse.json({ error: errorMessage }, { status: (error as any)?.status || 500 });
    }
}

// POST: Criar nova equipe
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name } = body;
        
        if (!name || name.trim() === '') {
            return NextResponse.json({ error: 'Nome da equipe é obrigatório' }, { status: 400 });
        }

        const db = getDbConnection();

        // Garante que a tabela de equipes existe
        await db.execute(`
            CREATE TABLE IF NOT EXISTS teams_master (
                id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                name TEXT UNIQUE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Insere a nova equipe
        await db.execute(`
            INSERT INTO teams_master (name) VALUES (?)
        `, [name.trim()]);

        invalidateCache('admin:');
        return NextResponse.json({ 
            success: true, 
            team: { name: name.trim() }
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage && errorMessage.includes('UNIQUE')) {
            return NextResponse.json({ error: 'Esta equipe já existe' }, { status: 400 });
        }
        console.error("Erro ao criar equipe:", error);
        return NextResponse.json({ error: errorMessage }, { status: (error as any)?.status || 500 });
    }
}

// DELETE: Remover equipe
export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const teamId = searchParams.get('id');

        if (!teamId) {
            return NextResponse.json({ error: 'ID da equipe é obrigatório' }, { status: 400 });
        }

        const db = getDbConnection();

        // Primeiro, remove todos os relacionamentos desta equipe
        await db.execute(`
            DELETE FROM user_teams WHERE team_id = ?
        `, [teamId]);

        // Depois remove a equipe
        await db.execute(`
            DELETE FROM teams_master WHERE id = ?
        `, [teamId]);

        invalidateCache('admin:');
        return NextResponse.json({ success: true });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error("Erro ao deletar equipe:", error);
        return NextResponse.json({ error: errorMessage }, { status: (error as any)?.status || 500 });
    }
}
