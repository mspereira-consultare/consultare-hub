const DEFAULT_PUNCH_BASE = 'https://api.tangerino.com.br/api/punch';
const DEFAULT_EMPLOYER_BASE = 'https://api.tangerino.com.br/api/employer';
const DEFAULT_REPORTS_BASE = 'https://api.tangerino.com.br/api/time-sheet';

type SolidesModule = 'punch' | 'employer' | 'reports';

type RequestParams = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
};

class SolidesClientError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'SolidesClientError';
  }
}

const resolveToken = () =>
  String(
    process.env.TANGERINO_INTEGRATION_TOKEN ||
      process.env.SOLIDES_TANGERINO_INTEGRATION_TOKEN ||
      process.env.SOLIDES_INTEGRATION_TOKEN ||
      process.env.TANGERINO_AUTH_TOKEN ||
      '',
  ).trim();

const resolveBase = (module: SolidesModule) => {
  if (module === 'employer') return String(process.env.TANGERINO_EMPLOYER_API_BASE || DEFAULT_EMPLOYER_BASE).trim();
  if (module === 'reports') return String(process.env.TANGERINO_REPORTS_API_BASE || DEFAULT_REPORTS_BASE).trim();
  return String(process.env.TANGERINO_PUNCH_API_BASE || DEFAULT_PUNCH_BASE).trim();
};

const buildUrl = (base: string, path: string, query?: RequestParams['query']) => {
  const url = new URL(`${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
};

const request = async <T>(module: SolidesModule, params: RequestParams): Promise<T> => {
  const token = resolveToken();
  if (!token) {
    throw new SolidesClientError('Token da integração Sólides não configurado.');
  }

  const response = await fetch(buildUrl(resolveBase(module), params.path, params.query), {
    method: params.method || 'GET',
    headers: {
      Authorization: `Basic ${token}`,
      Accept: 'application/json',
      ...(params.body ? { 'Content-Type': 'application/json' } : {}),
    },
    cache: 'no-store',
    body: params.body ? JSON.stringify(params.body) : undefined,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new SolidesClientError(
      String((payload as { message?: unknown; error?: unknown } | null)?.message || (payload as { error?: unknown } | null)?.error || 'Falha ao consultar Sólides.'),
      response.status,
    );
  }

  return payload as T;
};

export const createSolidesEmployerClient = () => ({
  request: <T>(params: RequestParams) => request<T>('employer', params),
});

export const createSolidesPunchClient = () => ({
  request: <T>(params: RequestParams) => request<T>('punch', params),
});

export const createSolidesReportsClient = () => ({
  request: <T>(params: RequestParams) => request<T>('reports', params),
});

export { SolidesClientError };
