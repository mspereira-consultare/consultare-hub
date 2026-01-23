import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import fs from "fs";
import bcrypt from "bcryptjs";

// Carrega variáveis de ambiente (.env.local ou .env)
const envPath = fs.existsSync('.env.local') ? '.env.local' : '.env';
dotenv.config({ path: envPath });

const url = process.env.TURSO_URL;
const authToken = process.env.TURSO_TOKEN;

if (!url) {
  console.error("❌ ERRO: TURSO_URL não definida no arquivo .env");
  process.exit(1);
}

const db = createClient({ url, authToken });

async function fixDatabase() {
  console.log(`🔧 Conectando ao Turso (${envPath})...`);
  console.log("🚀 Iniciando verificação e reparo do Schema...");

  try {
    // -------------------------------------------------------------------------
    // 1. TABELA: USERS (Usuários do Painel)
    // -------------------------------------------------------------------------
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL, -- Hash bcrypt
        role TEXT DEFAULT 'OPERADOR', -- ADMIN, GESTOR, OPERADOR
        department TEXT,
        status TEXT DEFAULT 'ATIVO',
        last_access TEXT,
        created_at TEXT,
        updated_at TEXT
      );
    `);
    console.log("✅ Tabela 'users' verificada.");

    // Verifica se existe pelo menos um usuário. Se não, cria o Admin Padrão.
    const userCount = await db.execute("SELECT count(*) as c FROM users");
    if (userCount.rows[0].c === 0) {
      const hash = await bcrypt.hash('123456', 10);
      const adminId = crypto.randomUUID();
      await db.execute({
        sql: `INSERT INTO users (id, name, email, password, role, department, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        args: [adminId, 'Admin Inicial', 'admin@consultare.com.br', hash, 'ADMIN', 'TI', 'ATIVO']
      });
      console.log("👤 Usuário Admin padrão criado (admin@consultare.com.br / 123456)");
    }

    // -------------------------------------------------------------------------
    // 2. TABELA: INTEGRATIONS_CONFIG (Feegow, Clinia, etc)
    // -------------------------------------------------------------------------
    await db.execute(`
      CREATE TABLE IF NOT EXISTS integrations_config (
        service TEXT PRIMARY KEY, -- 'feegow' ou 'clinia'
        username TEXT,
        password TEXT,
        token TEXT, -- Cookie ou Token API
        unit_id TEXT,
        updated_at TEXT
      );
    `);
    console.log("✅ Tabela 'integrations_config' verificada.");

    // -------------------------------------------------------------------------
    // 3. TABELA: SYSTEM_STATUS (Heartbeat e Status dos Workers)
    // -------------------------------------------------------------------------
    await db.execute(`
      CREATE TABLE IF NOT EXISTS system_status (
        service_name TEXT PRIMARY KEY,
        status TEXT, -- RUNNING, STOPPED, ERROR, PENDING
        last_run TEXT,
        message TEXT -- Mensagem de erro ou status detalhado
      );
    `);
    
    // Garante que a coluna 'message' existe (correção para erro anterior)
    try {
        await db.execute("ALTER TABLE system_status ADD COLUMN message TEXT");
        console.log("   -> Coluna 'message' adicionada em system_status.");
    } catch (e) {
        // Ignora erro se a coluna já existir
    }
    console.log("✅ Tabela 'system_status' verificada.");

    // -------------------------------------------------------------------------
    // 4. TABELA: GOALS_CONFIG (Configuração de Metas)
    // -------------------------------------------------------------------------
    // Nota: Usamos INTEGER PRIMARY KEY para compatibilidade com lógica de auto-incremento do SQLite,
    // mas o frontend deve tratar isso corretamente.
    await db.execute(`
      CREATE TABLE IF NOT EXISTS goals_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        scope TEXT DEFAULT 'CLINIC', -- 'CLINIC' ou 'CARD'
        sector TEXT,
        start_date TEXT,
        end_date TEXT,
        periodicity TEXT, -- 'mensal', 'anual'
        target_value REAL,
        unit TEXT, -- 'BRL', 'qtd', '%'
        linked_kpi_id TEXT, -- Ligação com o KPI Engine (ex: 'revenue', 'proposals')
        filter_group TEXT, -- Filtro opcional (ex: 'Consultas', 'Exames')
        created_at TEXT,
        updated_at TEXT
      );
    `);

    // Garante colunas novas que podem ter sido adicionadas recentemente
    const goalsColumns = ['filter_group', 'scope'];
    for (const col of goalsColumns) {
        try {
            await db.execute(`ALTER TABLE goals_config ADD COLUMN ${col} TEXT`);
            console.log(`   -> Coluna '${col}' adicionada em goals_config.`);
        } catch (e) {
            // Ignora se já existir
        }
    }
    console.log("✅ Tabela 'goals_config' verificada.");

    console.log("\n🏁 SUCESSO! Banco de dados atualizado e pronto para uso.");

  } catch (error) {
    console.error("\n❌ ERRO FATAL AO ATUALIZAR BANCO:");
    console.error(error);
  } finally {
    db.close();
  }
}

fixDatabase();