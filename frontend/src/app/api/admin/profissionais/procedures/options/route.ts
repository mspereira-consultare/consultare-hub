import { NextResponse } from 'next/server';
import { requireProfissionaisPermission } from '@/lib/profissionais/auth';
import { listFeegowProcedureCatalog } from '@/lib/profissionais/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FEEGOW_BASE_URL = 'https://api.feegow.com/v1/api';

type FeegowProcedure = {
  procedimento_id?: number | string;
  nome?: string;
  valor?: number | string;
  codigo?: string;
  tipo_procedimento?: number | string;
  grupo_procedimento?: number | string;
};

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const normalized = raw
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const fromFeegowApi = async (search: string, limit: number) => {
  const token = String(process.env.FEEGOW_ACCESS_TOKEN || '').trim();
  if (!token) return [];

  try {
    const url = new URL(`${FEEGOW_BASE_URL}/procedures/list`);
    if (search) url.searchParams.set('nome_procedimento', search);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-access-token': token,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const payload = await res.json();
    const content = Array.isArray(payload?.content) ? (payload.content as FeegowProcedure[]) : [];

    return content
      .map((row) => {
        const procedimentoId = Number(row?.procedimento_id || 0);
        const nome = String(row?.nome || '').trim();
        if (!Number.isFinite(procedimentoId) || procedimentoId <= 0 || !nome) return null;
        return {
          procedimentoId,
          nome,
          codigo: String(row?.codigo || '').trim() || null,
          tipoProcedimento:
            row?.tipo_procedimento === undefined || row?.tipo_procedimento === null
              ? null
              : Number(row.tipo_procedimento),
          grupoProcedimento:
            row?.grupo_procedimento === undefined || row?.grupo_procedimento === null
              ? null
              : Number(row.grupo_procedimento),
          valor: toNumber(row?.valor),
          updatedAt: null,
        };
      })
      .filter(Boolean)
      .slice(0, limit) as Array<{
      procedimentoId: number;
      nome: string;
      codigo: string | null;
      tipoProcedimento: number | null;
      grupoProcedimento: number | null;
      valor: number;
      updatedAt: string | null;
    }>;
  } catch {
    return [];
  }
};

export async function GET(request: Request) {
  try {
    const auth = await requireProfissionaisPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const search = String(searchParams.get('search') || '').trim();
    const limitRaw = Number(searchParams.get('limit') || 80);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.trunc(limitRaw))) : 80;

    const fromDb = await listFeegowProcedureCatalog(auth.db, { search, limit });
    if (fromDb.length > 0) {
      return NextResponse.json({
        status: 'success',
        data: fromDb,
        source: 'catalog_db',
      });
    }

    const fromApi = await fromFeegowApi(search, limit);
    return NextResponse.json({
      status: 'success',
      data: fromApi,
      source: fromApi.length > 0 ? 'feegow_api_fallback' : 'empty',
    });
  } catch (error: unknown) {
    console.error('Erro ao carregar opcoes de procedimentos:', error);
    const e = error as { message?: string; status?: number };
    const status = Number(e?.status) || 500;
    return NextResponse.json(
      { error: e?.message || 'Erro interno ao carregar opcoes de procedimentos.' },
      { status }
    );
  }
}
