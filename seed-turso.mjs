import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import fs from "fs";

// Carrega variáveis de ambiente
if (fs.existsSync('.env.local')) dotenv.config({ path: '.env.local' });
else dotenv.config({ path: '.env' });

const url = process.env.TURSO_URL;
const authToken = process.env.TURSO_TOKEN;

if (!url) {
  console.error("❌ ERRO: TURSO_URL não definida.");
  process.exit(1);
}

const db = createClient({ url, authToken });

async function migrateTable() {
  console.log("🛠️  Verificando estrutura da tabela...");
  
  // 1. Cria a tabela básica se não existir
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'USER',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Tenta adicionar as colunas novas (se falhar é porque já existem, então ignoramos)
  const columnsToAdd = [
    "ALTER TABLE users ADD COLUMN department TEXT DEFAULT 'Geral'",
    "ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ATIVO'",
    "ALTER TABLE users ADD COLUMN last_access TEXT"
  ];

  for (const query of columnsToAdd) {
    try {
      await db.execute(query);
      console.log(`   ✅ Coluna adicionada: ${query.split('ADD COLUMN')[1].split(' ')[1]}`);
    } catch (e) {
      // Ignora erro se a coluna já existir
      if (!e.message.includes("duplicate column")) {
        // console.log(`   (Coluna já existe ou erro ignorável: ${e.message})`);
      }
    }
  }
}

async function main() {
  try {
    // 1. Corrige a tabela antes de inserir
    await migrateTable();

    console.log("\n🌱 Iniciando Seed de Dados...");

    const email = 'admin@consultare.com.br';
    const password = 'senha123';
    const passwordHash = await bcrypt.hash(password, 12);
    const id = crypto.randomUUID();

    // 2. Insere o Admin
    await db.execute({
        sql: `
            INSERT INTO users (id, email, name, password, role, department, status, updated_at)
            VALUES (?, ?, ?, ?, 'ADMIN', 'TI / Sistemas', 'ATIVO', datetime('now'))
            ON CONFLICT(email) DO UPDATE SET
                password = excluded.password,
                role = 'ADMIN',
                status = 'ATIVO',
                department = 'TI / Sistemas',
                updated_at = excluded.updated_at
        `,
        args: [id, email, 'Administrador Principal', passwordHash]
    });

    console.log(`\n🎉 SEED CONCLUÍDO COM SUCESSO!`);
    console.log(`👤 Usuário: ${email}`);
    console.log(`🔑 Senha:   ${password}`);

  } catch (e) {
    console.error("❌ Erro fatal no seed:", e);
  } finally {
    db.close();
  }
}

main();