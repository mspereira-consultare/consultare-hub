import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export async function GET() {
  const dbPath = path.join(process.cwd(), 'fila.db'); 

  try {
    if (!fs.existsSync(dbPath)) {
      return NextResponse.json({ error: 'Banco de dados não encontrado.' }, { status: 500 });
    }

    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    
    // Busca dados
    const rows: any[] = db.prepare('SELECT * FROM fila_tempo_real').all();
    
    const unitsMap = new Map<string, any>();

    rows.forEach((row, index) => {
      // --- 1. LIMPEZA DE TEXTO (Encoding) ---
      const fixText = (str: string) => {
          if (!str) return '';
          try { 
              // Tenta corrigir UTF-8 misturado com Latin1
              return decodeURIComponent(escape(str)); 
          } catch { 
              // CORREÇÃO: Usamos o código Unicode \uFFFD para identificar o caractere de erro ()
              return str.replace(/\uFFFD/g, ''); 
          }
      };

      const unitName = fixText(row.UNIDADE || 'Outras Unidades');

      if (!unitsMap.has(unitName)) {
        unitsMap.set(unitName, { id: unitName, name: unitName, patients: [] });
      }

      // --- 2. TRATAMENTO DO NOME DO PACIENTE ---
      let fullName = fixText(row.PACIENTE || '');
      
      // Extrai "Primeira vez"
      let isFirstTime = false;
      if (fullName.includes('Primeira vez')) {
          isFirstTime = true;
          fullName = fullName.replace('Primeira vez', '').trim();
      }

      // --- 3. DETECÇÃO DE PRIORIDADE (Ícones/Texto) ---
      const lowerRaw = fullName.toLowerCase();
      const isWheelchair = lowerRaw.includes('cadeirante') || fullName.includes('♿');
      const isPregnant = lowerRaw.includes('gestante') || fullName.includes('🤰');
      
      const age = row.IDADE ? parseInt(row.IDADE) : 0;
      const isElderly = lowerRaw.includes('idoso') || (age >= 60);

      // --- 4. LÓGICA DE TEMPO ---
      const rawTimeColumn = (row['TEMPO DE ESPERA'] || '').toString();
      const lowerTime = rawTimeColumn.toLowerCase();
      let currentStatus: 'waiting' | 'in_service' = 'waiting';
      let waitTimeMinutes = 0;

      if (lowerTime.includes('atendimento') || lowerTime.includes('em andamento')) {
          currentStatus = 'in_service';
          waitTimeMinutes = 0; 
      } else {
          currentStatus = 'waiting';
          const numbers = rawTimeColumn.match(/(\d+)/);
          if (numbers) waitTimeMinutes = parseInt(numbers[0], 10);
      }

      unitsMap.get(unitName).patients.push({
        id: index, 
        name: fullName, 
        isFirstTime: isFirstTime,
        priority: { isWheelchair, isPregnant, isElderly }, 
        service: fixText(row.SERVICO || row.COMPROMISSO || ''),
        professional: fixText(row.PROFISSIONAL || ''),
        arrival: row.CHEGADA || '--:--',
        waitTime: waitTimeMinutes,
        status: currentStatus,
      });
    });

    // Ordenação
    const responseData = Array.from(unitsMap.values()).map(unit => {
        unit.patients.sort((a: any, b: any) => b.waitTime - a.waitTime);
        return unit;
    });

    return NextResponse.json(responseData);

  } catch (error: any) {
    console.error('[API ERROR]', error);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}