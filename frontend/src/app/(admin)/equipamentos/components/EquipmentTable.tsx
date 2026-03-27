import { Edit3, FileText, Wrench } from 'lucide-react';
import { EQUIPMENT_UNIT_LABELS } from '@/lib/equipamentos/constants';
import type { EquipmentListItem } from '@/lib/equipamentos/types';

const operationalStatusLabel: Record<string, string> = {
  ATIVO: 'Ativo',
  EM_MANUTENCAO: 'Em manutenção',
  INATIVO: 'Inativo',
  DESCARTADO: 'Descartado',
};

const calibrationBadgeClassName = (status: string) => {
  if (status === 'EM_DIA') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (status === 'VENCENDO') return 'bg-amber-50 text-amber-700 ring-amber-200';
  if (status === 'VENCIDO') return 'bg-rose-50 text-rose-700 ring-rose-200';
  if (status === 'NAO_APLICAVEL') return 'bg-slate-100 text-slate-600 ring-slate-200';
  return 'bg-slate-50 text-slate-700 ring-slate-200';
};

const operationalBadgeClassName = (status: string) => {
  if (status === 'ATIVO') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (status === 'EM_MANUTENCAO') return 'bg-amber-50 text-amber-700 ring-amber-200';
  if (status === 'INATIVO') return 'bg-slate-100 text-slate-600 ring-slate-200';
  if (status === 'DESCARTADO') return 'bg-rose-50 text-rose-700 ring-rose-200';
  return 'bg-slate-50 text-slate-700 ring-slate-200';
};

type EquipmentTableProps = {
  items: EquipmentListItem[];
  loading?: boolean;
  canEdit: boolean;
  onEdit: (item: EquipmentListItem) => void;
};

export function EquipmentTable({ items, loading, canEdit, onEdit }: EquipmentTableProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Tabela de equipamentos</h2>
          <p className="text-sm text-slate-500">Base detalhada com foco em calibração, manutenção e evidências.</p>
        </div>
      </div>

      <div className="max-h-[68vh] overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              <th className="px-4 py-3">Unidade</th>
              <th className="px-4 py-3">Equipamento</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">Localização</th>
              <th className="px-4 py-3">Status operacional</th>
              <th className="px-4 py-3">Status de calibração</th>
              <th className="px-4 py-3">Próxima calibração</th>
              <th className="px-4 py-3">Responsável</th>
              <th className="px-4 py-3">Suporte</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                  Carregando equipamentos...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                  Nenhum equipamento encontrado para os filtros atuais.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 align-top hover:bg-slate-50/80">
                  <td className="px-4 py-4 font-medium text-slate-700">{EQUIPMENT_UNIT_LABELS[item.unitName] || item.unitName}</td>
                  <td className="px-4 py-4">
                    <div className="font-semibold text-slate-900">{item.description}</div>
                    <div className="mt-1 text-xs text-slate-500">Identificação: {item.identificationNumber}</div>
                    {item.serialNumber ? <div className="mt-1 text-xs text-slate-500">Série: {item.serialNumber}</div> : null}
                  </td>
                  <td className="px-4 py-4 text-slate-600">{item.category || '-'}</td>
                  <td className="px-4 py-4 text-slate-600">{item.locationDetail || '-'}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${operationalBadgeClassName(item.operationalStatus)}`}>
                      {operationalStatusLabel[item.operationalStatus] || item.operationalStatus}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${calibrationBadgeClassName(item.calibrationStatus)}`}>
                      {item.calibrationStatusLabel}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-slate-700">{item.nextCalibrationDate || '-'}</td>
                  <td className="px-4 py-4 text-slate-600">{item.calibrationResponsible || '-'}</td>
                  <td className="px-4 py-4">
                    <div className="inline-flex items-center gap-2 text-slate-500">
                      <FileText size={14} />
                      <span>{item.fileCount}</span>
                    </div>
                    <div className="mt-2 inline-flex items-center gap-2 text-slate-500">
                      <Wrench size={14} />
                      <span>{item.openEventsCount} evento(s) abertos</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      disabled={!canEdit}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Edit3 size={14} />
                      Editar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

