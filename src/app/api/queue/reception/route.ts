import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import util from 'util';

const execPromise = util.promisify(exec);

export async function GET() {
  try {
    // Caminho absoluto para o script
    const scriptPath = path.join(process.cwd(), 'workers', 'worker_recepcao.py');
    
    // Executa o Python. 
    // OBS: Certifique-se que o comando 'python' está no PATH ou use o caminho do venv
    const { stdout, stderr } = await execPromise(`python "${scriptPath}"`);

    if (stderr) {
      console.warn('Python Stderr:', stderr); // Warnings do Python podem cair aqui
    }

    // Faz o parse do JSON retornado pelo Python
    const data = JSON.parse(stdout);

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('Erro ao executar worker de recepção:', error);
    return NextResponse.json(
      { error: 'Falha ao processar dados da recepção' }, 
      { status: 500 }
    );
  }
}