// lib/turso.ts
import { createClient } from "@libsql/client";

const url = process.env.TURSO_URL;
const authToken = process.env.TURSO_TOKEN;

if (!url) {
  throw new Error("TURSO_URL não definida nas variáveis de ambiente");
}

export const turso = createClient({
  url,
  authToken,
}); 