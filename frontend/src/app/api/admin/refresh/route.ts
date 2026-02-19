import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { invalidateCache } from '@/lib/api_cache';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasAnyRefresh, hasPermission, type PageKey } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const SERVICE_ALIASES: Record<string, string> = {
  appointments: 'appointments',
  agendamentos: 'appointments',
  financeiro: 'appointments',
  financeiro_api: 'appointments',
  feegow_finance: 'appointments',
  worker_feegow: 'appointments',
  worker_feegow_appointments: 'appointments',
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
  auth_clinia: 'auth_clinia',
  clinia_auth: 'auth_clinia',
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

const SERVICE_PAGE_MAP: Record<string, PageKey> = {
  appointments: 'produtividade',
  faturamento: 'financeiro',
  comercial: 'propostas',
  contratos: 'contratos',
  monitor_medico: 'monitor',
  monitor_recepcao: 'monitor',
  clinia: 'monitor',
  auth: 'settings',
  auth_clinia: 'settings',
};

const SERVICE_REFRESH_PAGES: Record<string, PageKey[]> = {
  appointments: ['produtividade', 'agendamentos', 'checklist_crc', 'checklist_recepcao'],
  faturamento: ['financeiro', 'dashboard', 'checklist_recepcao'],
  comercial: ['propostas', 'checklist_recepcao'],
  contratos: ['contratos'],
  clinia: ['monitor', 'checklist_crc'],
  monitor_medico: ['monitor'],
  monitor_recepcao: ['monitor'],
  auth: ['settings'],
  auth_clinia: ['settings'],
};

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
    }

    const { service } = await request.json(); 

    if (!service) {
        return NextResponse.json({ error: "Serviço não informado" }, { status: 400 });
    }

    const serviceName = normalizeService(service);
    const permissions = (session.user as any).permissions;
    const role = String((session.user as any).role || 'OPERADOR');
    const pageForService = SERVICE_PAGE_MAP[serviceName];

    const allowedPages = SERVICE_REFRESH_PAGES[serviceName];
    const canRefresh = Array.isArray(allowedPages) && allowedPages.length > 0
      ? allowedPages.some((page) => hasPermission(permissions, page, 'refresh', role))
      : pageForService
        ? hasPermission(permissions, pageForService, 'refresh', role)
        : hasAnyRefresh(permissions, role);

    if (!canRefresh) {
      return NextResponse.json({ error: 'Sem permissao para atualizar este servico' }, { status: 403 });
    }

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
