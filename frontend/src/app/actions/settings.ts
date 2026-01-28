'use server'

import { turso } from "@/lib/turso";
import { revalidatePath } from "next/cache";

export async function updateFeegowSettings(prevState: any, formData: FormData) {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;
  const token = formData.get("token") as string;

  try {
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
    return { success: false, message: "Erro ao salvar no banco de dados." };
  }
}