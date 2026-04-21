import type { SurveillanceExpirationStatus } from '@/lib/vigilancia_sanitaria/constants';
import { getExpirationAppearance } from '@/lib/vigilancia_sanitaria/status';

export function SurveillanceStatusBadge({ status, label }: { status: SurveillanceExpirationStatus; label: string }) {
  const appearance = getExpirationAppearance(status);

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${appearance.badge}`}>
      {label}
    </span>
  );
}
