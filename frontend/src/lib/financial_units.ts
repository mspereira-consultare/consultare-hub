export type FinancialUnitKey =
  | 'campinas_shopping'
  | 'centro_cambui'
  | 'ouro_verde'
  | 'resolve_saude';

export type FinancialUnitDefinition = {
  key: FinancialUnitKey;
  label: string;
  aliases: string[];
};

const FINANCIAL_UNITS: FinancialUnitDefinition[] = [
  {
    key: 'campinas_shopping',
    label: 'Campinas Shopping',
    aliases: ['Campinas Shopping', 'Shopping Campinas', 'Shop. Campinas'],
  },
  {
    key: 'centro_cambui',
    label: 'Centro Cambui',
    aliases: ['Centro Cambui', 'Centro Cambuí'],
  },
  {
    key: 'ouro_verde',
    label: 'Ouro Verde',
    aliases: ['Ouro Verde'],
  },
  {
    key: 'resolve_saude',
    label: 'ResolveSaude',
    aliases: [
      'Resolve',
      'ResolveSaude',
      'Resolve Saúde',
      'Resolvesaude',
      'Resolvecard Gestao De Beneficos E Meios De Pagamentos',
      'Resolvecard Gestão De Beneficos E Meios De Pagamentos',
      'RESOLVECARD GESTAO DE BENEFICOS E MEIOS DE PAGAMENTOS',
      'RESOLVECARD GESTÃO DE BENEFICOS E MEIOS DE PAGAMENTOS',
    ],
  },
];

export const normalizeFinancialUnitText = (value: string | null | undefined) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

export const listFinancialUnits = () => FINANCIAL_UNITS.slice();

export const getFinancialUnitByKey = (key: string | null | undefined) => {
  const normalizedKey = normalizeFinancialUnitText(key).replace(/\s+/g, '_');
  if (normalizedKey === 'resolve') {
    return FINANCIAL_UNITS.find((unit) => unit.key === 'resolve_saude') || null;
  }
  return FINANCIAL_UNITS.find((unit) => unit.key === normalizedKey) || null;
};

export const resolveFinancialUnit = (raw: string | null | undefined) => {
  const normalized = normalizeFinancialUnitText(raw);
  if (!normalized || normalized === 'all') return null;

  for (const unit of FINANCIAL_UNITS) {
    if (normalized === 'resolve' && unit.key === 'resolve_saude') return unit;
    if (normalizeFinancialUnitText(unit.key) === normalized) return unit;
    if (normalizeFinancialUnitText(unit.label) === normalized) return unit;
    if (unit.aliases.some((alias) => normalizeFinancialUnitText(alias) === normalized)) return unit;
  }

  return null;
};

export const buildFinancialUnitClause = (column: string, raw: string | null | undefined, params: any[]) => {
  const unit = resolveFinancialUnit(raw);
  if (!unit) {
    const fallback = String(raw || '').trim();
    if (!fallback || fallback.toLowerCase() === 'all') return '';
    params.push(fallback);
    return ` AND UPPER(TRIM(${column})) = UPPER(TRIM(?))`;
  }

  const aliases = Array.from(new Set([unit.label, ...unit.aliases].map((value) => String(value || '').trim()).filter(Boolean)));
  if (aliases.length === 0) return '';

  const placeholders = aliases.map(() => 'UPPER(TRIM(?))').join(', ');
  params.push(...aliases);
  return ` AND UPPER(TRIM(${column})) IN (${placeholders})`;
};

export const collapseFinancialUnits = <T extends { name?: string; total?: number; qtd?: number }>(rows: T[]) => {
  const grouped = new Map<string, { name: string; total: number; qtd: number }>();

  for (const row of rows || []) {
    const rawName = String(row?.name || '').trim();
    const resolved = resolveFinancialUnit(rawName);
    const key = resolved?.key || `raw:${normalizeFinancialUnitText(rawName)}`;
    const current = grouped.get(key) || {
      name: resolved?.label || rawName || 'Nao informado',
      total: 0,
      qtd: 0,
    };

    current.total += Number(row?.total || 0);
    current.qtd += Number(row?.qtd || 0);
    grouped.set(key, current);
  }

  return Array.from(grouped.values());
};
