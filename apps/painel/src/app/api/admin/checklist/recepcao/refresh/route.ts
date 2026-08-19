import { NextResponse } from 'next/server';
import { invalidateCache } from '@/lib/api_cache';
import { requirePagePermission } from '@/lib/authz';
import {
  RECEPCAO_CHECKLIST_REFRESH_SERVICE,
  RECEPCAO_CHECKLIST_REFRESH_SERVICES,
} from '@/lib/checklist_recepcao';
import type { DbInterface } from '@/lib/db';
import { isSystemStatusActive, isSystemStatusStale } from '@/lib/system_status_health';
import { getCurrentSystemStatusTimestamp } from '@/lib/system_status_time';
import { upsertSystemStatus } from '@/lib/system_status_repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RefreshServiceRow = {
  serviceName: string;
  status: string;
  lastRun: string | null;
  details: string;
  isActive: boolean;
};

const readRefreshRows = async (db: DbInterface) => {
  const serviceNames = [RECEPCAO_CHECKLIST_REFRESH_SERVICE, ...RECEPCAO_CHECKLIST_REFRESH_SERVICES];
  const placeholders = serviceNames.map(() => '?').join(',');
  const rows = await db.query(
    `
      SELECT service_name, status, last_run, details
      FROM system_status
      WHERE service_name IN (${placeholders})
    `,
    serviceNames,
  );

  const byService = new Map<string, RefreshServiceRow>();
  for (const row of rows as Array<Record<string, unknown>>) {
    const serviceName = String(row.service_name || '').trim();
    if (!serviceName) continue;
    const status = String(row.status || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
    const lastRun = String(row.last_run || '').trim() || null;
    const details = String(row.details || '').trim();
    byService.set(serviceName, {
      serviceName,
      status,
      lastRun,
      details,
      isActive: isSystemStatusActive(status) && !isSystemStatusStale(status, lastRun),
    });
  }

  const emptyRow = (serviceName: string): RefreshServiceRow => ({
    serviceName,
    status: 'UNKNOWN',
    lastRun: null,
    details: '',
    isActive: false,
  });

  return {
    batchStatus: byService.get(RECEPCAO_CHECKLIST_REFRESH_SERVICE) || emptyRow(RECEPCAO_CHECKLIST_REFRESH_SERVICE),
    services: RECEPCAO_CHECKLIST_REFRESH_SERVICES.map((serviceName) => byService.get(serviceName) || emptyRow(serviceName)),
  };
};

const buildMessage = (
  batchStatus: RefreshServiceRow,
  requested: boolean,
) => {
  if (requested) {
    return 'Atualização completa da checklist enfileirada. O lote vai acionar ponto, agendamentos, faturamento, comercial e snapshot D+1.';
  }
  if (batchStatus.isActive) {
    return 'O lote de atualização da checklist já está em execução.';
  }
  return 'Nenhuma nova execução foi solicitada.';
};

export async function GET() {
  try {
    const auth = await requirePagePermission('checklist_recepcao', 'view');
    if (!auth.ok) {
      return NextResponse.json({ status: 'error', error: auth.error }, { status: auth.status });
    }

    const data = await readRefreshRows(auth.db);
    return NextResponse.json({ status: 'success', data });
  } catch (error: unknown) {
    console.error('Erro GET checklist recepcao refresh:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Erro ao consultar refresh da checklist.' },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const auth = await requirePagePermission('checklist_recepcao', 'refresh');
    if (!auth.ok) {
      return NextResponse.json({ status: 'error', error: auth.error }, { status: auth.status });
    }

    const current = await readRefreshRows(auth.db);
    const currentBatch = current.batchStatus;
    const isBatchBusy = currentBatch.isActive;
    const requestedAt = getCurrentSystemStatusTimestamp();

    if (!isBatchBusy) {
      await upsertSystemStatus(auth.db, {
        serviceName: RECEPCAO_CHECKLIST_REFRESH_SERVICE,
        status: 'PENDING',
        details: `Lote solicitado manualmente via checklist da recepção por ${auth.userId}.`,
        lastRun: requestedAt,
      });
    }

    invalidateCache('admin:');
    const next = await readRefreshRows(auth.db);

    return NextResponse.json({
      status: 'success',
      requestedAt,
      batchStatus: next.batchStatus,
      services: next.services,
      message: buildMessage(next.batchStatus, !isBatchBusy),
    });
  } catch (error: unknown) {
    console.error('Erro POST checklist recepcao refresh:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Erro ao solicitar refresh da checklist.' },
      { status: 500 },
    );
  }
}
