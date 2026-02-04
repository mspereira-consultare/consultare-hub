import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { invalidateCache } from '@/lib/api_cache';

export const dynamic = 'force-dynamic';

const SERVICE_ALIASES: Record<string, string> = {
  financeiro: 'financeiro',
  financeiro_api: 'financeiro',
  feegow_finance: 'financeiro',
  worker_feegow: 'financeiro',
  faturamento: 'faturamento',
  faturamento_scraping: 'faturamento',
  faturamento_scraper: 'faturamento',
  worker_faturamento_scraping: 'faturamento',
  comercial: 'comercial',
  propostas: 'comercial',
  propostas_api: 'comercial',
  contratos: 'contratos',
  contratos_api: 'contratos',
  cartao_de_beneficios_api: 'contratos',
  auth: 'auth',
  auth_feegow: 'auth',
  clinia: 'clinia',
  worker_clinia: 'clinia',
  monitor_medico: 'monitor_medico',
  monitor_recepcao: 'monitor_recepcao',
};

const normalizeService = (serviceRaw: string) => {
  const key = (serviceRaw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return SERVICE_ALIASES[key] || key;
};

export async function POST(request: Request) {
  try {
    const { service } = await request.json(); 

    if (!service) {
        return NextResponse.json({ error: "Serviço não informado" }, { status: 400 });
    }

    const serviceName = normalizeService(service);
    const db = getDbConnection();

    // Query unificada (Upsert)
    const sql = `
        INSERT INTO system_status (service_name, status, last_run, details)
        VALUES (?, 'PENDING', datetime('now'), 'Solicitado via Painel')
        ON CONFLICT(service_name) 
        DO UPDATE SET status = 'PENDING', details = 'Solicitado via Painel'
    `;

    // Agora é AWAIT para compatibilidade com Turso
    await db.execute(sql, [serviceName]);

    invalidateCache('admin:');
    return NextResponse.json({ 
        success: true, 
        message: "Atualização solicitada. O worker processará em breve." 
    });

  } catch (error: any) {
    console.error("Erro Refresh API:", error);
    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
}
