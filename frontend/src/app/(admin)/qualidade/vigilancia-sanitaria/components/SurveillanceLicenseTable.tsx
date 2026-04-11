import { SURVEILLANCE_RENEWAL_STATUSES, SURVEILLANCE_UNIT_LABELS } from '@/lib/vigilancia_sanitaria/constants';
import { getExpirationAppearance } from '@/lib/vigilancia_sanitaria/status';
import type { SurveillanceLicense } from '@/lib/vigilancia_sanitaria/types';
import { SurveillanceStatusBadge } from './SurveillanceStatusBadge';

const formatDate = (value?: string | null) => (value ? value.split('-').reverse().join('/') : '-');
const renewalLabel = (value: string) => SURVEILLANCE_RENEWAL_STATUSES.find((item) => item.value === value)?.label || value;

export function SurveillanceLicenseTable({
  items,
  loading,
  canEdit,
  onEdit,
  onDelete,
}: {
  items: SurveillanceLicense[];
  loading: boolean;
  canEdit: boolean;
  onEdit: (item: SurveillanceLicense) => void;
  onDelete: (item: SurveillanceLicense) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.14em] text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Unidade</th>
              <th className="px-4 py-3 text-left">Licença</th>
              <th className="px-4 py-3 text-left">CNAE</th>
              <th className="px-4 py-3 text-left">Validade</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Renovação</th>
              <th className="px-4 py-3 text-left">Responsável</th>
              <th className="px-4 py-3 text-center">Anexos</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  Carregando licenças...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  Nenhuma licença encontrada.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const appearance = getExpirationAppearance(item.expirationStatus);

                return (
                  <tr key={item.id} className={appearance.row}>
                    <td className="px-4 py-3 text-slate-600">{SURVEILLANCE_UNIT_LABELS[item.unitName] || item.unitName}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{item.licenseName}</p>
                      <p className="text-xs text-slate-500">{item.licenseNumber || item.issuer || 'Sem número/protocolo'}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.cnae}</td>
                    <td className={`px-4 py-3 font-medium ${appearance.text}`}>{formatDate(item.validUntil)}</td>
                    <td className="px-4 py-3">
                      <SurveillanceStatusBadge status={item.expirationStatus} label={item.expirationStatusLabel} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">{renewalLabel(item.renewalStatus)}</td>
                    <td className="px-4 py-3 text-slate-600">{item.responsibleName || '-'}</td>
                    <td className="px-4 py-3 text-center text-slate-600">{item.fileCount}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => onEdit(item)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Ver/editar
                        </button>
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => onDelete(item)}
                            className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                          >
                            Excluir
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
