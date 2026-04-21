import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * ⚠️ DEPRECATED - Este endpoint foi substituído pelo novo sistema de equipes (many-to-many)
 * 
 * Endpoints novos:
 * - GET /api/admin/teams - Listar equipes
 * - POST /api/admin/teams - Criar equipe
 * - GET /api/admin/user-teams - Listar usuários com suas equipes
 * - POST /api/admin/user-teams - Adicionar/remover usuário de equipe
 * 
 * Este arquivo será removido em versão futura.
 * A tabela `team_config` foi migrada para `teams_master` + `user_teams`.
 * 
 * Data de deprecação: 2026-02-02
 */

export async function GET() {
    return NextResponse.json({ 
        error: 'Este endpoint foi descontinuado',
        message: 'Use /api/admin/user-teams em seu lugar',
        deprecated: true,
        migrated_date: '2026-02-02'
    }, { status: 410 });
}

export async function POST() {
    return NextResponse.json({ 
        error: 'Este endpoint foi descontinuado',
        message: 'Use /api/admin/user-teams em seu lugar',
        deprecated: true,
        migrated_date: '2026-02-02'
    }, { status: 410 });
}