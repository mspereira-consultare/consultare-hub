import { NextResponse } from 'next/server';
import { requireProfissionaisPermission } from '@/lib/profissionais/auth';
import { listActiveContractTemplateOptions } from '@/lib/contract_templates/repository';
import type { ContractTypeCode } from '@/lib/profissionais/constants';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FEEGOW_BASE_URL = 'https://api.feegow.com/v1/api';

type FeegowSpecialty = {
  nome?: string;
  name?: string;
};

const normalizeNames = (raw: string[]) =>
  Array.from(
    new Set(
      raw
        .map((v) => String(v || '').trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

const tryLoadSpecialtiesFromFeegow = async (): Promise<string[]> => {
  const token = String(process.env.FEEGOW_ACCESS_TOKEN || '').trim();
  if (!token) return [];

  try {
    const res = await fetch(`${FEEGOW_BASE_URL}/specialties/list`, {
      method: 'GET',
      headers: {
        'x-access-token': token,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    if (!res.ok) return [];

    const payload = await res.json();
    const content = Array.isArray(payload?.content) ? (payload.content as FeegowSpecialty[]) : [];
    return normalizeNames(content.map((row) => String(row?.nome || row?.name || '')));
  } catch {
    return [];
  }
};

const loadSpecialtiesFromDatabase = async (db: any): Promise<string[]> => {
  const rows = await db.query(
    `
    SELECT DISTINCT TRIM(specialty) AS specialty
    FROM feegow_appointments
    WHERE specialty IS NOT NULL
      AND TRIM(specialty) <> ''
    ORDER BY specialty ASC
    `
  );
  return normalizeNames(rows.map((row: any) => String(row?.specialty || '')));
};

export async function GET(request: Request) {
  try {
    const auth = await requireProfissionaisPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const contractType = String(searchParams.get('contractType') || '').toUpperCase() as ContractTypeCode;

    let activeTemplates: Array<{ id: string; name: string; contractType: string; version: number }> = [];
    try {
      activeTemplates = await listActiveContractTemplateOptions(auth.db, contractType || '');
    } catch (error) {
      console.error('Erro ao carregar modelos ativos na rota de opcoes de profissionais:', error);
    }

    let specialties: string[] = [];
    let source: 'feegow_api' | 'database' | 'unknown' = 'unknown';

    const fromFeegow = await tryLoadSpecialtiesFromFeegow();
    if (fromFeegow.length > 0) {
      specialties = fromFeegow;
      source = 'feegow_api';
    } else {
      try {
        const fromDb = await loadSpecialtiesFromDatabase(auth.db);
        specialties = fromDb;
        source = 'database';
      } catch (error) {
        // Especialidades nao podem derrubar retorno dos modelos de contrato.
        console.error('Erro ao carregar especialidades no fallback de banco:', error);
      }
    }

    return NextResponse.json({
      status: 'success',
      data: {
        specialties,
        source,
        activeContractTemplates: activeTemplates,
      },
    });
  } catch (error: any) {
    console.error('Erro ao carregar opcoes de profissionais:', error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao carregar opcoes.' },
      { status }
    );
  }
}
