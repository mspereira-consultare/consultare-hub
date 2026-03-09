import { randomUUID } from 'crypto';
import type { DbInterface } from '@/lib/db';
import {
  AGENDA_OCCUPANCY_DEFAULT_UNITS,
  type AgendaOccupancyDailyRow,
  type AgendaOccupancyFilters,
  type AgendaOccupancyJob,
  type AgendaOccupancyJobStatus,
  type AgendaOccupancyResult,
  type AgendaOccupancyRow,
} from '@/lib/agenda_ocupacao/types';

export class AgendaOcupacaoValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

let tablesEnsured = false;

const clean = (value: unknown) => String(value ?? '').trim();

const nowIso = () => new Date().toISOString();

const isMysqlProvider = () => {
  const provider = clean(process.env.DB_PROVIDER).toLowerCase();
  if (provider === 'mysql') return true;
  if (provider === 'turso') return false;
  return Boolean(process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL);
};

const safeExecute = async (db: DbInterface, sql: string) => {
  try {
    await db.execute(sql);
  } catch (error: unknown) {
    const err = error as { message?: unknown; code?: unknown };
    const msg = String(err?.message || '').toLowerCase();
    const code = String(err?.code || '').toUpperCase();
    if (
      code === 'ER_DUP_FIELDNAME' ||
      code === 'ER_DUP_KEYNAME' ||
      msg.includes('duplicate') ||
      msg.includes('already exists')
    ) {
      return;
    }
    throw error;
  }
};

const normalizeDate = (value: unknown, fieldName: string) => {
  const raw = clean(value);
  if (!raw) throw new AgendaOcupacaoValidationError(`Campo ${fieldName} obrigatorio.`);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new AgendaOcupacaoValidationError(`Campo ${fieldName} invalido. Use YYYY-MM-DD.`);
  }
  const dt = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(dt.getTime())) {
    throw new AgendaOcupacaoValidationError(`Campo ${fieldName} invalido.`);
  }
  return raw;
};

const normalizeUnitId = (value: unknown): 'all' | '2' | '3' | '12' => {
  const raw = clean(value || 'all');
  if (raw === '2' || raw === '3' || raw === '12') return raw;
  return 'all';
};

const normalizeUnitScope = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    const unique = new Set<number>();
    for (const item of value) {
      const n = Number(item);
      if ([2, 3, 12].includes(n)) unique.add(n);
    }
    if (unique.size > 0) return Array.from(unique).sort((a, b) => a - b);
  }

  const raw = clean(value);
  if (!raw || raw === 'all') return [...AGENDA_OCCUPANCY_DEFAULT_UNITS];
  if (['2', '3', '12'].includes(raw)) return [Number(raw)];
  return [...AGENDA_OCCUPANCY_DEFAULT_UNITS];
};

const mapJob = (row: Record<string, unknown>): AgendaOccupancyJob => ({
  id: clean(row.id),
  status: clean(row.status).toUpperCase() as AgendaOccupancyJobStatus,
  startDate: clean(row.start_date),
  endDate: clean(row.end_date),
  unitScope: (() => {
    try {
      const parsed = JSON.parse(clean(row.unit_scope_json) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((v: unknown) => Number(v))
        .filter((v: number) => [2, 3, 12].includes(v));
    } catch {
      return [];
    }
  })(),
  requestedBy: clean(row.requested_by),
  errorMessage: clean(row.error_message) || null,
  createdAt: clean(row.created_at),
  startedAt: clean(row.started_at) || null,
  finishedAt: clean(row.finished_at) || null,
  updatedAt: clean(row.updated_at),
});

const mapRow = (row: Record<string, unknown>): AgendaOccupancyRow => ({
  especialidadeId: Number(row.especialidade_id) || 0,
  especialidadeNome: clean(row.especialidade_nome) || 'Sem especialidade',
  agendamentosCount: Number(row.agendamentos_count) || 0,
  horariosDisponiveisCount: Number(row.horarios_disponiveis_count) || 0,
  horariosBloqueadosCount: Number(row.horarios_bloqueados_count) || 0,
  capacidadeLiquidaCount: Number(row.capacidade_liquida_count) || 0,
  taxaConfirmacaoPct: Number(row.taxa_confirmacao_pct) || 0,
});

const mapDailyRow = (row: Record<string, unknown>): AgendaOccupancyDailyRow => ({
  dataRef: clean(row.data_ref),
  unidadeId: Number(row.unidade_id) || 0,
  unidadeNome: clean(row.unidade_nome),
  especialidadeId: Number(row.especialidade_id) || 0,
  especialidadeNome: clean(row.especialidade_nome) || 'Sem especialidade',
  agendamentosCount: Number(row.agendamentos_count) || 0,
  horariosDisponiveisCount: Number(row.horarios_disponiveis_count) || 0,
  horariosBloqueadosCount: Number(row.horarios_bloqueados_count) || 0,
  capacidadeLiquidaCount: Number(row.capacidade_liquida_count) || 0,
  taxaConfirmacaoPct: Number(row.taxa_confirmacao_pct) || 0,
  updatedAt: clean(row.updated_at),
});

export const ensureAgendaOcupacaoTables = async (db: DbInterface) => {
  if (tablesEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS agenda_occupancy_daily (
      data_ref VARCHAR(10) NOT NULL,
      unidade_id INTEGER NOT NULL,
      unidade_nome VARCHAR(120) NOT NULL,
      especialidade_id INTEGER NOT NULL,
      especialidade_nome VARCHAR(180) NOT NULL,
      agendamentos_count INTEGER NOT NULL,
      horarios_disponiveis_count INTEGER NOT NULL,
      horarios_bloqueados_count INTEGER NOT NULL,
      capacidade_liquida_count INTEGER NOT NULL,
      taxa_confirmacao_pct DECIMAL(10,4) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      PRIMARY KEY (data_ref, unidade_id, especialidade_id)
    )
  `);

  await safeExecute(
    db,
    'CREATE INDEX idx_agenda_occ_daily_unit_date ON agenda_occupancy_daily(unidade_id, data_ref)'
  );
  await safeExecute(
    db,
    'CREATE INDEX idx_agenda_occ_daily_spec_date ON agenda_occupancy_daily(especialidade_id, data_ref)'
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS agenda_occupancy_jobs (
      id VARCHAR(64) PRIMARY KEY,
      status VARCHAR(20) NOT NULL,
      start_date VARCHAR(10) NOT NULL,
      end_date VARCHAR(10) NOT NULL,
      unit_scope_json LONGTEXT,
      requested_by VARCHAR(64) NOT NULL,
      error_message TEXT,
      created_at VARCHAR(32) NOT NULL,
      started_at VARCHAR(32),
      finished_at VARCHAR(32),
      updated_at VARCHAR(32) NOT NULL
    )
  `);

  await safeExecute(db, 'CREATE INDEX idx_agenda_occ_jobs_status ON agenda_occupancy_jobs(status)');
  await safeExecute(db, 'CREATE INDEX idx_agenda_occ_jobs_created ON agenda_occupancy_jobs(created_at)');

  if (isMysqlProvider()) {
    await safeExecute(
      db,
      "ALTER TABLE agenda_occupancy_jobs MODIFY COLUMN id VARCHAR(64) NOT NULL"
    );
  }

  tablesEnsured = true;
};

export const createAgendaOcupacaoJob = async (
  db: DbInterface,
  input: {
    startDate?: unknown;
    endDate?: unknown;
    unitScope?: unknown;
  },
  actorUserId: string
): Promise<AgendaOccupancyJob> => {
  await ensureAgendaOcupacaoTables(db);

  const startDate = normalizeDate(input.startDate, 'startDate');
  const endDate = normalizeDate(input.endDate, 'endDate');
  if (startDate > endDate) {
    throw new AgendaOcupacaoValidationError('Data inicial nao pode ser maior que data final.');
  }

  const units = normalizeUnitScope(input.unitScope);
  const id = randomUUID().replace(/-/g, '');
  const now = nowIso();

  await db.execute(
    `
    INSERT INTO agenda_occupancy_jobs (
      id, status, start_date, end_date, unit_scope_json, requested_by,
      error_message, created_at, started_at, finished_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      'PENDING',
      startDate,
      endDate,
      JSON.stringify(units),
      clean(actorUserId) || 'unknown',
      null,
      now,
      null,
      null,
      now,
    ]
  );

  const rows = await db.query('SELECT * FROM agenda_occupancy_jobs WHERE id = ? LIMIT 1', [id]);
  return mapJob(rows[0]);
};

export const getLatestAgendaOcupacaoJob = async (
  db: DbInterface,
  filters: AgendaOccupancyFilters = {}
): Promise<AgendaOccupancyJob | null> => {
  await ensureAgendaOcupacaoTables(db);

  const startDate = filters.startDate ? normalizeDate(filters.startDate, 'startDate') : '';
  const endDate = filters.endDate ? normalizeDate(filters.endDate, 'endDate') : '';
  const unitId = normalizeUnitId(filters.unitId);

  const rows = await db.query(
    `
    SELECT *
    FROM agenda_occupancy_jobs
    ORDER BY created_at DESC
    LIMIT 50
    `
  );

  for (const row of rows || []) {
    const mapped = mapJob(row);
    if (startDate && mapped.startDate !== startDate) continue;
    if (endDate && mapped.endDate !== endDate) continue;
    if (unitId !== 'all' && !mapped.unitScope.includes(Number(unitId))) continue;
    return mapped;
  }

  return null;
};

const buildWhereByFilters = (filters: AgendaOccupancyFilters) => {
  const startDate = normalizeDate(filters.startDate, 'startDate');
  const endDate = normalizeDate(filters.endDate, 'endDate');
  if (startDate > endDate) {
    throw new AgendaOcupacaoValidationError('Data inicial nao pode ser maior que data final.');
  }

  const unitId = normalizeUnitId(filters.unitId);

  const where = ['data_ref >= ?', 'data_ref <= ?'];
  const params: unknown[] = [startDate, endDate];

  if (unitId !== 'all') {
    where.push('unidade_id = ?');
    params.push(Number(unitId));
  }

  return { where, params, startDate, endDate, unitId };
};

export const listAgendaOcupacaoBySpecialty = async (
  db: DbInterface,
  filters: AgendaOccupancyFilters
): Promise<AgendaOccupancyResult> => {
  await ensureAgendaOcupacaoTables(db);
  const { where, params } = buildWhereByFilters(filters);

  const rows = await db.query(
    `
    SELECT
      especialidade_id,
      COALESCE(NULLIF(TRIM(especialidade_nome), ''), 'Sem especialidade') as especialidade_nome,
      SUM(agendamentos_count) as agendamentos_count,
      SUM(horarios_disponiveis_count) as horarios_disponiveis_count,
      SUM(horarios_bloqueados_count) as horarios_bloqueados_count,
      SUM(capacidade_liquida_count) as capacidade_liquida_count,
      CASE
        WHEN SUM(capacidade_liquida_count) > 0
        THEN (SUM(agendamentos_count) * 100.0 / SUM(capacidade_liquida_count))
        ELSE 0
      END as taxa_confirmacao_pct
    FROM agenda_occupancy_daily
    WHERE ${where.join(' AND ')}
    GROUP BY especialidade_id, especialidade_nome
    ORDER BY taxa_confirmacao_pct ASC, especialidade_nome ASC
    `,
    params
  );

  const mappedRows = (rows || []).map(mapRow);

  const totals = mappedRows.reduce(
    (acc, item) => {
      acc.especialidades += 1;
      acc.agendamentos += item.agendamentosCount;
      acc.horariosDisponiveis += item.horariosDisponiveisCount;
      acc.horariosBloqueados += item.horariosBloqueadosCount;
      acc.capacidadeLiquida += item.capacidadeLiquidaCount;
      return acc;
    },
    {
      especialidades: 0,
      agendamentos: 0,
      horariosDisponiveis: 0,
      horariosBloqueados: 0,
      capacidadeLiquida: 0,
      taxaConfirmacaoPct: 0,
    }
  );

  totals.taxaConfirmacaoPct =
    totals.capacidadeLiquida > 0 ? (totals.agendamentos * 100) / totals.capacidadeLiquida : 0;

  return {
    rows: mappedRows,
    totals,
  };
};

export const listAgendaOcupacaoDailyRows = async (
  db: DbInterface,
  filters: AgendaOccupancyFilters
): Promise<AgendaOccupancyDailyRow[]> => {
  await ensureAgendaOcupacaoTables(db);
  const { where, params } = buildWhereByFilters(filters);

  const rows = await db.query(
    `
    SELECT
      data_ref,
      unidade_id,
      unidade_nome,
      especialidade_id,
      especialidade_nome,
      agendamentos_count,
      horarios_disponiveis_count,
      horarios_bloqueados_count,
      capacidade_liquida_count,
      taxa_confirmacao_pct,
      updated_at
    FROM agenda_occupancy_daily
    WHERE ${where.join(' AND ')}
    ORDER BY data_ref ASC, unidade_id ASC, especialidade_nome ASC
    `,
    params
  );

  return (rows || []).map(mapDailyRow);
};

export const getAgendaOcupacaoHeartbeat = async (db: DbInterface) => {
  await ensureAgendaOcupacaoTables(db);
  const rows = await db.query(
    `
    SELECT status, last_run, details
    FROM system_status
    WHERE service_name = 'agenda_occupancy'
    LIMIT 1
    `
  );

  const row = ((rows?.[0] as Record<string, unknown> | undefined) || {});
  return {
    status: clean(row?.status) || 'UNKNOWN',
    lastRun: clean(row?.last_run) || null,
    details: clean(row?.details) || '',
  };
};

export const normalizeAgendaFilters = (input: AgendaOccupancyFilters) => {
  const startDate = normalizeDate(input.startDate, 'startDate');
  const endDate = normalizeDate(input.endDate, 'endDate');
  if (startDate > endDate) {
    throw new AgendaOcupacaoValidationError('Data inicial nao pode ser maior que data final.');
  }
  const unitId = normalizeUnitId(input.unitId);
  return { startDate, endDate, unitId };
};
