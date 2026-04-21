import { getDbConnection } from "@/lib/db";
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
    const db = getDbConnection();
    const rows = await db.query(
      "SELECT * FROM integrations_config WHERE service IN ('feegow', 'clinia')"
    );

    for (const row of rows) {
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
