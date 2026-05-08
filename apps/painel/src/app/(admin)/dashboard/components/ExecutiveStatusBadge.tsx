import type { ExecutiveIndicatorStatus } from '@/lib/dashboard_executive/types';
import { statusStyles } from './dashboardExecutiveUtils';

export function ExecutiveStatusBadge({ status }: { status: ExecutiveIndicatorStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusStyles[status]}`}
    >
      {status === 'SUCCESS' ? 'Estável' : status === 'WARNING' ? 'Atenção' : status === 'DANGER' ? 'Crítico' : 'Sem dado'}
    </span>
  );
}
