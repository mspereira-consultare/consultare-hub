import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'dados_clinica.db');

export function getDbConnection() {
  // fileMustExist: true previne criar um banco vazio se o caminho estiver errado
  // verbose: console.log ajuda no debug (remova em produção)
  const db = new Database(dbPath, { 
    readonly: false, 
    fileMustExist: true 
  });
  
  // Opcional: Forçar WAL mode explicitamente na conexão de leitura (embora o Python já tenha definido)
  db.pragma('journal_mode = WAL');
  
  return db;
}