import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { invalidateCache } from '@/lib/api_cache';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasAnyRefresh, hasPermission, type PageKey } from '@/lib/permissions';
import { getAgendaOcupacaoDefaultRange } from '@/lib/agenda_ocupacao/date_range';
import { createAgendaOcupacaoJob } from '@/lib/agenda_ocupacao/repository';
import { getBlockedAgendasDefaultRange } from '@/lib/agendas_bloqueadas/date_range';
import { createBlockedAgendasJob } from '@/lib/agendas_bloqueadas/repository';

export const dynamic = 'force-dynamic';

const nowInSaoPaulo = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date()).replace(' ', ' ');

const SERVICE_ALIASES: Record<string, string> = {
  appointments: 'appointments',
  agendamentos: 'appointments',
  financeiro: 'appointments',
  financeiro_api: 'appointments',
  feegow_finance: 'appointments',
  worker_feegow: 'appointments',
  worker_feegow_appointments: 'appointments',
  patients_registry: 'patients_registry',
  patients: 'patients_registry',
  pacientes: 'patients_registry',
  feegow_patients: 'patients_registry',
  worker_feegow_patients: 'patients_registry',
  procedures_catalog: 'procedures_catalog',
  procedures: 'procedures_catalog',
  feegow_procedures: 'procedures_catalog',
  worker_feegow_procedures: 'procedures_catalog',
  professionals_sync: 'professionals_sync',
  profissionais_sync: 'professionals_sync',
  feegow_professionals_sync: 'professionals_sync',
  worker_feegow_professionals_sync: 'professionals_sync',
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
  qms_documentos: 'qms_documentos',
  qualidade_documentos: 'qms_documentos',
  qms_docs: 'qms_documentos',
  qms_treinamentos: 'qms_treinamentos',
  qualidade_treinamentos: 'qms_treinamentos',
  qms_trainings: 'qms_treinamentos',
  qms_auditorias: 'qms_auditorias',
  qualidade_auditorias: 'qms_auditorias',
  qms_audits: 'qms_auditorias',
  clinia: 'clinia',
  worker_clinia: 'clinia',
  monitor_medico: 'monitor_medico',
  monitor_recepcao: 'monitor_recepcao',
  agenda_occupancy: 'agenda_occupancy',
  agenda_ocupacao: 'agenda_occupancy',
  ocupacao_agenda: 'agenda_occupancy',
  blocked_agendas: 'blocked_agendas',
  agendas_bloqueadas: 'blocked_agendas',
  agenda_bloqueada: 'blocked_agendas',
  marketing_funnel: 'marketing_funnel',
  marketing_funil: 'marketing_funnel',
  funil_marketing: 'marketing_funnel',
  worker_marketing_funnel_google: 'marketing_funnel',
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
  patients_registry: 'financeiro',
  faturamento: 'financeiro',
  comercial: 'propostas',
  contratos: 'contratos',
  marketing_funnel: 'marketing_funil',
  monitor_medico: 'monitor',
  monitor_recepcao: 'monitor',
  agenda_occupancy: 'agenda_ocupacao',
  blocked_agendas: 'agendas_bloqueadas',
  clinia: 'monitor',
  procedures_catalog: 'profissionais',
  professionals_sync: 'profissionais',
  qms_documentos: 'qualidade_documentos',
  qms_treinamentos: 'qualidade_treinamentos',
  qms_auditorias: 'qualidade_auditorias',
  auth: 'settings',
  auth_clinia: 'settings',
};

const SERVICE_REFRESH_PAGES: Record<string, PageKey[]> = {
  appointments: ['produtividade', 'agendamentos', 'checklist_crc', 'checklist_recepcao'],
  patients_registry: ['financeiro'],
  faturamento: ['financeiro', 'dashboard', 'checklist_recepcao'],
  comercial: ['propostas', 'checklist_recepcao'],
  contratos: ['contratos'],
  marketing_funnel: ['marketing_funil'],
  clinia: ['monitor', 'checklist_crc'],
  monitor_medico: ['monitor'],
  monitor_recepcao: ['monitor'],
  agenda_occupancy: ['agenda_ocupacao', 'profissionais'],
  blocked_agendas: ['agendas_bloqueadas'],
  procedures_catalog: ['profissionais'],
  professionals_sync: ['profissionais'],
  qms_documentos: ['qualidade_documentos'],
  qms_treinamentos: ['qualidade_treinamentos'],
  qms_auditorias: ['qualidade_auditorias'],
  auth: ['settings'],
  auth_clinia: ['settings'],
};

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { service } = await request.json(); 

    if (!service) {
        return NextResponse.json({ error: 'Serviço não informado' }, { status: 400 });
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
      return NextResponse.json({ error: 'Sem permissão para atualizar este serviço' }, { status: 403 });
    }

    const db = getDbConnection();
    let details = 'Solicitado via Painel';
    const requestedAt = nowInSaoPaulo();

    if (serviceName === 'agenda_occupancy') {
      const defaults = getAgendaOcupacaoDefaultRange();
      const userId = String((session.user as any).id || '').trim();
      const job = await createAgendaOcupacaoJob(
        db,
        {
          startDate: defaults.startDate,
          endDate: defaults.endDate,
          unitScope: 'all',
        },
        userId || 'unknown'
      );
      details = `Job ${job.id} enfileirado`;
    } else if (serviceName === 'blocked_agendas') {
      const defaults = getBlockedAgendasDefaultRange();
      const userId = String((session.user as any).id || '').trim();
      const job = await createBlockedAgendasJob(
        db,
        {
          startDate: defaults.startDate,
          endDate: defaults.endDate,
          unitScope: 'all',
        },
        userId || 'unknown'
      );
      details = `Job ${job.id} enfileirado`;
    }

    const currentRows = await db.query(
      `
        SELECT status, last_run, details
        FROM system_status
        WHERE service_name = ?
        LIMIT 1
      `,
      [serviceName]
    );
    const current = currentRows[0] as { status?: string; last_run?: string | null; details?: string | null } | undefined;
    const currentStatus = String(current?.status || '').trim().toUpperCase();
    if (currentStatus === 'RUNNING' || currentStatus === 'QUEUED') {
      invalidateCache('admin:');
      return NextResponse.json({
        success: true,
        message: 'Serviço já está em execução.',
      });
    }

    const sql = `
        INSERT INTO system_status (service_name, status, last_run, details)
        VALUES (?, 'PENDING', ?, ?)
        ON CONFLICT(service_name) 
        DO UPDATE SET status = 'PENDING', details = excluded.details, last_run = excluded.last_run
    `;

    await db.execute(sql, [serviceName, requestedAt, details]);

    invalidateCache('admin:');
    return NextResponse.json({ 
        success: true, 
        message: 'Atualização solicitada. O worker processará em breve.' 
    });

  } catch (error: any) {
    console.error('Erro na API de refresh:', error);
    return NextResponse.json({ error: error.message }, { status: (error as any)?.status || 500 });
  }
}
