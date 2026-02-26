import type { DbInterface } from '@/lib/db';
import { ensureQmsAuditTables } from '@/lib/qms/audits_repository';
import { ensureQmsTables } from '@/lib/qms/repository';
import { ensureQmsTrainingTables } from '@/lib/qms/trainings_repository';
import type { QmsOverviewMetrics, QmsServiceHeartbeat } from '@/lib/qms/types';

const clean = (value: unknown) => String(value ?? '').trim();
const toNumber = (value: unknown) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const serviceNames = ['qms_documentos', 'qms_treinamentos', 'qms_auditorias'];

const toIsoDateSp = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return `${map.get('year')}-${map.get('month')}-${map.get('day')}`;
};

const readCount = (rows: any[]) => toNumber(rows?.[0]?.total ?? rows?.[0]?.count);

export const getQmsOverviewMetrics = async (db: DbInterface): Promise<QmsOverviewMetrics> => {
  await ensureQmsTables(db);
  await ensureQmsTrainingTables(db);
  await ensureQmsAuditTables(db);

  const [docRows, planRows, executionRows, auditRows, auditComplianceRows, actionRows, heartbeatRows] =
    await Promise.all([
      db.query(
        `
        SELECT LOWER(status) AS status, COUNT(1) AS total
        FROM qms_documents
        GROUP BY LOWER(status)
        `,
        []
      ),
      db.query(
        `
        SELECT LOWER(status) AS status, COUNT(1) AS total
        FROM qms_training_plans
        GROUP BY LOWER(status)
        `,
        []
      ),
      db.query(
        `
        SELECT LOWER(status) AS status, COUNT(1) AS total
        FROM qms_trainings
        GROUP BY LOWER(status)
        `,
        []
      ),
      db.query(
        `
        SELECT LOWER(status) AS status, COUNT(1) AS total
        FROM qms_audits
        GROUP BY LOWER(status)
        `,
        []
      ),
      db.query(
        `
        SELECT compliance_percent
        FROM qms_audits
        WHERE compliance_percent IS NOT NULL
        `,
        []
      ),
      db.query(
        `
        SELECT deadline, status
        FROM qms_audit_actions
        `,
        []
      ),
      db.query(
        `
        SELECT service_name, status, last_run, details
        FROM system_status
        WHERE service_name IN (${serviceNames.map(() => '?').join(',')})
        `,
        serviceNames
      ),
    ]);

  const docMap = new Map<string, number>();
  for (const row of docRows || []) {
    docMap.set(clean(row.status).toLowerCase(), toNumber(row.total));
  }
  const documents = {
    total: Array.from(docMap.values()).reduce((sum, value) => sum + value, 0),
    vigente: docMap.get('vigente') || 0,
    aVencer: docMap.get('a_vencer') || 0,
    vencido: docMap.get('vencido') || 0,
    rascunho: docMap.get('rascunho') || 0,
    arquivado: docMap.get('arquivado') || 0,
  };

  const planMap = new Map<string, number>();
  for (const row of planRows || []) {
    planMap.set(clean(row.status).toLowerCase(), toNumber(row.total));
  }
  const plansTotal = Array.from(planMap.values()).reduce((sum, value) => sum + value, 0);
  const plansConcluidos = planMap.get('concluido') || 0;

  const executionMap = new Map<string, number>();
  for (const row of executionRows || []) {
    executionMap.set(clean(row.status).toLowerCase(), toNumber(row.total));
  }
  const executionsTotal = Array.from(executionMap.values()).reduce((sum, value) => sum + value, 0);
  const executionsConcluidas = executionMap.get('concluido') || 0;
  const executionRate =
    plansTotal > 0 ? Number(((executionsConcluidas / plansTotal) * 100).toFixed(1)) : null;

  const trainings = {
    plansTotal,
    plansConcluidos,
    plansEmAberto: Math.max(plansTotal - plansConcluidos, 0),
    executionsTotal,
    executionsConcluidas,
    executionRate,
  };

  const auditMap = new Map<string, number>();
  for (const row of auditRows || []) {
    auditMap.set(clean(row.status).toLowerCase(), toNumber(row.total));
  }
  const auditsTotal = Array.from(auditMap.values()).reduce((sum, value) => sum + value, 0);

  const complianceValues = (auditComplianceRows || [])
    .map((row: any) => Number(row.compliance_percent))
    .filter((value) => Number.isFinite(value));
  const avgCompliance =
    complianceValues.length > 0
      ? Number(
          (
            complianceValues.reduce((sum: number, value: number) => sum + value, 0) /
            complianceValues.length
          ).toFixed(1)
        )
      : null;

  const today = toIsoDateSp();
  const overdueActions = (actionRows || []).filter((row: any) => {
    const deadline = clean(row.deadline);
    const status = clean(row.status).toLowerCase();
    if (!deadline) return false;
    if (!['aberta', 'em_andamento', 'atrasada'].includes(status)) return false;
    return deadline < today;
  }).length;

  const audits = {
    total: auditsTotal,
    abertas: auditMap.get('aberta') || 0,
    emTratativa: auditMap.get('em_tratativa') || 0,
    encerradas: auditMap.get('encerrada') || 0,
    overdueActions,
    avgCompliance,
  };

  const rowsByService = new Map<string, any>();
  for (const row of heartbeatRows || []) {
    rowsByService.set(clean(row.service_name), row);
  }
  const heartbeats: QmsServiceHeartbeat[] = serviceNames.map((serviceName) => {
    const row = rowsByService.get(serviceName);
    return {
      serviceName,
      status: clean(row?.status || 'N/A'),
      lastRun: clean(row?.last_run) || null,
      details: clean(row?.details) || null,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    documents,
    trainings,
    audits,
    heartbeats,
  };
};

export const refreshQmsAll = async (
  db: DbInterface,
  actorUserId: string
): Promise<{
  documents: { total: number; updated: number };
  trainings: { plans: number; executions: number };
  audits: { audits: number; actions: number; overdueActionsUpdated: number };
}> => {
  const { refreshQmsDocumentStatuses } = await import('@/lib/qms/repository');
  const { refreshQmsTrainingStatuses } = await import('@/lib/qms/trainings_repository');
  const { refreshQmsAuditStatuses } = await import('@/lib/qms/audits_repository');

  const [documents, trainings, audits] = await Promise.all([
    refreshQmsDocumentStatuses(db, actorUserId),
    refreshQmsTrainingStatuses(db),
    refreshQmsAuditStatuses(db, actorUserId),
  ]);

  return {
    documents: { total: documents.total, updated: documents.updated },
    trainings: { plans: trainings.plans, executions: trainings.executions },
    audits,
  };
};
