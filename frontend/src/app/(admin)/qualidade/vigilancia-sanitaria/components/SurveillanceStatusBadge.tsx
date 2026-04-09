import type { SurveillanceExpirationStatus } from '@/lib/vigilancia_sanitaria/constants';

const styles: Record<SurveillanceExpirationStatus, string> = {
  VENCIDO: 'border-rose-200 bg-rose-50 text-rose-700',
  VENCE_HOJE: 'border-amber-200 bg-amber-50 text-amber-800',
  VENCENDO: 'border-yellow-200 bg-yellow-50 text-yellow-800',
  EM_DIA: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  SEM_VALIDADE: 'border-slate-200 bg-slate-50 text-slate-600',
};

export function SurveillanceStatusBadge({ status, label }: { status: SurveillanceExpirationStatus; label: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[status] || styles.SEM_VALIDADE}`}>
      {label}
    </span>
  );
}
