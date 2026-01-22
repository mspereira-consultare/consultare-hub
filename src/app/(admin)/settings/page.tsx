import { turso } from "@/lib/turso";
import SettingsForm from "./settings-form";

// Impede cache para garantir dados frescos
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  // Valores padrão seguros (String vazia, nunca null)
  let initialFeegow = { 
    service: 'feegow', 
    username: '', 
    password: '', 
    token: '', 
    is_configured: false 
  };
  
  let initialClinia = { 
    service: 'clinia', 
    username: '', 
    password: '', 
    token: '', 
    is_configured: false
  };

  try {
    const result = await turso.execute({
      sql: "SELECT * FROM integrations_config WHERE service IN ('feegow', 'clinia')",
      args: [],
    });

    for (const row of result.rows) {
      // TRATAMENTO DE NULOS: (valor || '')
      // Isso corrige o erro "value prop on input should not be null"
      const config = {
        service: row.service as string,
        username: (row.username as string) || '', 
        password: (row.password as string) || '',
        token: (row.token as string) || '',
        is_configured: true
      };

      if (config.service === 'feegow') initialFeegow = config;
      if (config.service === 'clinia') initialClinia = config;
    }

  } catch (error) {
    console.error("Erro ao carregar configurações:", error);
  }

  return (
    <SettingsForm 
      initialFeegow={initialFeegow}
      initialClinia={initialClinia}
    />
  );
}