import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export async function GET() {
  try {
    const db = getDbConnection();

    // Query otimizada para pegar apenas quem está esperando
    // Ajuste o filtro WHERE conforme sua regra de negócio (ex: status != 'Atendido_Inferido')
    const stmt = db.prepare(`
      SELECT 
        hash_id, 
        unidade_nome, 
        paciente, 
        especialidade, 
        profissional, 
        hora_agendada, 
        status,
        dt_chegada 
      FROM espera_medica_historico 
      WHERE status = 'Espera'
      ORDER BY dt_chegada ASC
    `);

    const rows = stmt.all();

    return NextResponse.json({ 
      status: 'success', 
      data: rows, 
      timestamp: new Date().toISOString() 
    });
    
  } catch (error) {
    console.error('Erro ao ler banco de médicos:', error);
    return NextResponse.json(
      { error: 'Falha ao buscar fila médica' }, 
      { status: 500 }
    );
  }
}