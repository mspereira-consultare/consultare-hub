// lib/turso.ts
import { createClient } from "@libsql/client";

const url = process.env.TURSO_URL;
const authToken = process.env.TURSO_TOKEN;

// Cria cliente apenas se URL está disponível
// Durante build sem env, retorna null; durante runtime, funciona normalmente
export const turso = (() => {
  if (!url || !authToken) {
    console.warn("⚠️ TURSO_URL ou TURSO_TOKEN não definidos. Cliente DB será null até runtime.");
    return null;
  }
  return createClient({
    url,
    authToken,
  });
})(); 