import { exec } from 'child_process';
import { NextResponse } from 'next/server';
import path from 'path';

export async function GET() {
  return new Promise((resolve) => {
    // 1. Define o caminho absoluto para o script na raiz
    const scriptPath = path.join(process.cwd(), 'workers', 'worker_recepcao.py');
    
    // 2. Executa o script
    // Nota: O child_process herda process.env por padrão, então FEEGOW_USER/PASS estarão disponíveis
    exec(`python "${scriptPath}"`, (error, stdout, stderr) => {
      
      if (error) {
        console.error("Erro no Worker Python:", stderr);
        // Retorna zero em caso de erro para não quebrar o painel
        resolve(NextResponse.json({ 
            status: 'error', 
            data: { 
              global: { total_fila: 0, tempo_medio: 0, tempo_medio_fmt: "--" },
              por_unidade: {}
            } 
        }, { status: 500 }));
        return;
      }

      try {
        const data = JSON.parse(stdout);
        resolve(NextResponse.json(data));
      } catch (e) {
        console.error("Erro ao parsear JSON do Python:", stdout);
        resolve(NextResponse.json({ status: 'error', msg: 'JSON inválido' }, { status: 500 }));
      }
    });
  });
}