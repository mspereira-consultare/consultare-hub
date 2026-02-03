'use server'

import { turso } from "@/lib/turso";
import { revalidatePath } from "next/cache";

export async function updateFeegowSettings(prevState: any, formData: FormData) {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;
  const token = formData.get("token") as string;

  try {
    // Verifica se turso foi inicializado
    if (!turso) {
      return { success: false, message: "Banco de dados não disponível. Tente novamente." };
    }

    // Salva na tabela que os Workers Python monitoram
    await turso.execute({
      sql: `
        INSERT INTO integrations_config (service, username, password, token, updated_at)
        VALUES ('feegow', ?, ?, ?, datetime('now'))
        ON CONFLICT(service) DO UPDATE SET
          username = excluded.username,
          password = excluded.password,
          token = excluded.token,
          updated_at = excluded.updated_at
      `,
      args: [username, password, token]
    });

    revalidatePath("/settings");
    return { success: true, message: "Configurações salvas e sincronizadas com os Workers!" };
    
  } catch (error) {
    console.error("Erro ao salvar no Turso:", error);
    const msg = String((error as any)?.message || error);
    // If Turso is blocked, relay that information
    if (msg.includes('reads are blocked') || msg.includes('BLOCKED')) {
      return { success: false, message: "Turso read operations bloqueadas: upgrade seu plano ou contacte o suporte." };
    }
    return { success: false, message: "Erro ao salvar no banco de dados." };
  }
}