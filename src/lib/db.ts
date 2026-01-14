import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Variável para manter a conexão em cache (Singleton)
let dbInstance: Database.Database | undefined;

export function getDbConnection() {
  if (dbInstance) return dbInstance;

  // Tenta resolver o caminho absoluto
  // Em desenvolvimento local, process.cwd() é a raiz do projeto.
  const dbPath = path.join(process.cwd(), 'data', 'dados_clinica.db');

  // --- DIAGNÓSTICO DE ARQUIVO ---
  if (!fs.existsSync(dbPath)) {
    console.error(`\n[DB ERROR] ❌ Arquivo de banco NÃO ENCONTRADO em:`);
    console.error(`   -> ${dbPath}`);
    console.error(`   Verifique se a pasta 'data' está na raiz e se o worker rodou.\n`);
    
    // Tenta listar o que tem na pasta 'data' para ajudar
    const dataDir = path.join(process.cwd(), 'data');
    if (fs.existsSync(dataDir)) {
        console.error(`   Conteúdo da pasta 'data':`, fs.readdirSync(dataDir));
    } else {
        console.error(`   A pasta 'data' nem sequer existe em: ${dataDir}`);
    }
    
    throw new Error(`Banco de dados não encontrado: ${dbPath}`);
  } else {
    // Se quiser ver isso no terminal do Next.js para confirmar
    console.log(`[DB SUCCESS] ✅ Conectando ao banco em: ${dbPath}`);
  }

  try {
    // fileMustExist: true -> Impede criar banco vazio fantasma
    dbInstance = new Database(dbPath, { 
      verbose: undefined,
      fileMustExist: true 
    });
    
    dbInstance.pragma('journal_mode = WAL');
    return dbInstance;
  } catch (error) {
    console.error("❌ Erro fatal ao abrir conexão SQLite:", error);
    throw error;
  }
}