'use client';

import { Loader2, X } from 'lucide-react';
import type {
  PointDailyAdjustmentRow,
  PointEmployeeAdjustmentDetail,
  PointOccurrenceAdjustmentRow,
} from '@/lib/point/types';

type DayMode = 'DEFAULT' | 'INCLUDE' | 'EXCLUDE';

const modeOptions: Array<{ value: DayMode; label: string }> = [
  { value: 'DEFAULT', label: 'Padrão' },
  { value: 'INCLUDE', label: 'Incluir' },
  { value: 'EXCLUDE', label: 'Excluir' },
];

const occurrenceOptions = [
  { value: 'ATESTADO', label: 'Atestado' },
  { value: 'DECLARACAO', label: 'Declaração' },
  { value: 'AJUSTE_BATIDA', label: 'Ajuste de batida' },
  { value: 'AUSENCIA_AUTORIZADA', label: 'Ausência autorizada' },
  { value: 'FALTA_INJUSTIFICADA', label: 'Falta injustificada' },
  { value: 'FERIAS', label: 'Férias' },
];

const fieldClassName =
  'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#17407E] focus:ring-2 focus:ring-blue-100';

const formatDateBr = (value: string | null | undefined) => {
  if (!value) return '-';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

export function PointAdjustmentsModal({
  open,
  loading,
  saving,
  detail,
  error,
  successMessage,
  selectedDayKeys,
  selectedOccurrenceIds,
  onToggleDay,
  onToggleOccurrence,
  onClose,
  onSaveDay,
  onClearDay,
  onSaveOccurrence,
  onClearOccurrence,
  onApplyBulkDay,
  onClearBulkDay,
  onApplyBulkOccurrence,
  onClearBulkOccurrence,
}: {
  open: boolean;
  loading: boolean;
  saving: boolean;
  detail: PointEmployeeAdjustmentDetail | null;
  error: string;
  successMessage: string;
  selectedDayKeys: string[];
  selectedOccurrenceIds: string[];
  onToggleDay: (key: string, checked: boolean) => void;
  onToggleOccurrence: (occurrenceId: string, checked: boolean) => void;
  onClose: () => void;
  onSaveDay: (row: PointDailyAdjustmentRow) => void;
  onClearDay: (row: PointDailyAdjustmentRow) => void;
  onSaveOccurrence: (row: PointOccurrenceAdjustmentRow) => void;
  onClearOccurrence: (row: PointOccurrenceAdjustmentRow) => void;
  onApplyBulkDay: () => void;
  onClearBulkDay: () => void;
  onApplyBulkOccurrence: () => void;
  onClearBulkOccurrence: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35">
      <div className="h-full w-full max-w-[1120px] overflow-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Ajustes operacionais do ponto
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Corrija como os dias e ocorrências devem impactar folha, VT e VR sem alterar o dado bruto sincronizado da Sólides.
              </p>
              {detail ? (
                <div className="mt-2 text-xs text-slate-500">
                  <strong className="text-slate-700">{detail.employee.employeeName}</strong>
                  {detail.employee.employeeCpf ? ` · ${detail.employee.employeeCpf}` : ''}
                  {` · ${formatDateBr(detail.dateRange.startDate)} a ${formatDateBr(detail.dateRange.endDate)}`}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
          {successMessage ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div> : null}

          <section className="grid gap-4 md:grid-cols-3">
            <SummaryCard label="Dias com override" value={String(detail?.overrideSummary.dayOverrides || 0)} />
            <SummaryCard label="Ocorrências ajustadas" value={String(detail?.overrideSummary.occurrenceOverrides || 0)} />
            <SummaryCard label="Estado" value={detail?.overrideSummary.hasOverrides ? 'Com ajustes locais' : 'Base bruta'} />
          </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Ajuste diário</h3>
                <p className="mt-1 text-xs text-slate-500">Selecione dias para incluir ou excluir do cálculo da folha, VT e VR.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={onApplyBulkDay} disabled={selectedDayKeys.length === 0 || saving} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                  Aplicar em lote
                </button>
                <button type="button" onClick={onClearBulkDay} disabled={selectedDayKeys.length === 0 || saving} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
                  Limpar selecionados
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1180px] w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3"><input type="checkbox" checked={detail?.dailyRows.length ? selectedDayKeys.length === detail.dailyRows.length : false} onChange={(event) => detail?.dailyRows.forEach((row) => onToggleDay(row.id, event.target.checked))} className="h-4 w-4 rounded border-slate-300 text-[#17407E]" /></th>
                    <th className="px-3 py-3">Data</th>
                    <th className="px-3 py-3">Ocorrência efetiva</th>
                    <th className="px-3 py-3 text-center">Folha</th>
                    <th className="px-3 py-3 text-center">VT</th>
                    <th className="px-3 py-3 text-center">VR</th>
                    <th className="px-3 py-3">Observação</th>
                    <th className="px-3 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">Carregando ajuste diário...</td></tr>
                  ) : !detail?.dailyRows.length ? (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">Nenhum dia sincronizado para este colaborador no recorte atual.</td></tr>
                  ) : detail.dailyRows.map((row) => (
                    <DayRow
                      key={row.id}
                      row={row}
                      saving={saving}
                      selected={selectedDayKeys.includes(row.id)}
                      onToggle={onToggleDay}
                      onSave={onSaveDay}
                      onClear={onClearDay}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Reclassificação de ocorrência</h3>
                <p className="mt-1 text-xs text-slate-500">Ajuste o tipo efetivo da ocorrência ou ignore localmente, mantendo o payload bruto sincronizado intacto.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={onApplyBulkOccurrence} disabled={selectedOccurrenceIds.length === 0 || saving} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                  Aplicar em lote
                </button>
                <button type="button" onClick={onClearBulkOccurrence} disabled={selectedOccurrenceIds.length === 0 || saving} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
                  Limpar selecionadas
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1120px] w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3"><input type="checkbox" checked={detail?.occurrenceRows.length ? selectedOccurrenceIds.length === detail.occurrenceRows.length : false} onChange={(event) => detail?.occurrenceRows.forEach((row) => onToggleOccurrence(row.id, event.target.checked))} className="h-4 w-4 rounded border-slate-300 text-[#17407E]" /></th>
                    <th className="px-3 py-3">Período</th>
                    <th className="px-3 py-3">Tipo original</th>
                    <th className="px-3 py-3">Tipo efetivo</th>
                    <th className="px-3 py-3">Resumo</th>
                    <th className="px-3 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Carregando ocorrências...</td></tr>
                  ) : !detail?.occurrenceRows.length ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Nenhuma ocorrência sincronizada neste recorte.</td></tr>
                  ) : detail.occurrenceRows.map((row) => (
                    <OccurrenceRow
                      key={row.id}
                      row={row}
                      saving={saving}
                      selected={selectedOccurrenceIds.includes(row.id)}
                      onToggle={onToggleOccurrence}
                      onSave={onSaveOccurrence}
                      onClear={onClearOccurrence}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function DayRow({
  row,
  selected,
  saving,
  onToggle,
  onSave,
  onClear,
}: {
  row: PointDailyAdjustmentRow;
  selected: boolean;
  saving: boolean;
  onToggle: (key: string, checked: boolean) => void;
  onSave: (row: PointDailyAdjustmentRow) => void;
  onClear: (row: PointDailyAdjustmentRow) => void;
}) {
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-3 py-3">
        <input type="checkbox" checked={selected} onChange={(event) => onToggle(row.id, event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-[#17407E]" />
      </td>
      <td className="px-3 py-3 font-medium text-slate-800">{formatDateBr(row.pointDate)}</td>
      <td className="px-3 py-3">
        <div className="font-medium text-slate-700">{row.effectiveOccurrenceType || '-'}</div>
        {row.originalOccurrenceType && row.originalOccurrenceType !== row.effectiveOccurrenceType ? (
          <div className="mt-1 text-[11px] text-slate-500">Original: {row.originalOccurrenceType}</div>
        ) : null}
      </td>
      <td className="px-3 py-3">
        <select defaultValue={row.payrollDayMode} id={`day-payroll-${row.id}`} className={fieldClassName}>
          {modeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </td>
      <td className="px-3 py-3">
        <select defaultValue={row.vtDayMode} id={`day-vt-${row.id}`} className={fieldClassName}>
          {modeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </td>
      <td className="px-3 py-3">
        <select defaultValue={row.vrDayMode} id={`day-vr-${row.id}`} className={fieldClassName}>
          {modeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </td>
      <td className="px-3 py-3">
        <textarea defaultValue={row.dayOverrideNotes || ''} id={`day-notes-${row.id}`} rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#17407E] focus:ring-2 focus:ring-blue-100" />
        {row.overrideSummary ? <div className="mt-2 text-[11px] text-blue-700">{row.overrideSummary}</div> : null}
      </td>
      <td className="px-3 py-3 text-right">
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => onSave({ ...row, payrollDayMode: (document.getElementById(`day-payroll-${row.id}`) as HTMLSelectElement | null)?.value as DayMode || row.payrollDayMode, vtDayMode: (document.getElementById(`day-vt-${row.id}`) as HTMLSelectElement | null)?.value as DayMode || row.vtDayMode, vrDayMode: (document.getElementById(`day-vr-${row.id}`) as HTMLSelectElement | null)?.value as DayMode || row.vrDayMode, dayOverrideNotes: (document.getElementById(`day-notes-${row.id}`) as HTMLTextAreaElement | null)?.value || row.dayOverrideNotes })} disabled={saving} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            Salvar
          </button>
          {row.dayOverrideId ? (
            <button type="button" onClick={() => onClear(row)} disabled={saving} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
              Limpar
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function OccurrenceRow({
  row,
  selected,
  saving,
  onToggle,
  onSave,
  onClear,
}: {
  row: PointOccurrenceAdjustmentRow;
  selected: boolean;
  saving: boolean;
  onToggle: (occurrenceId: string, checked: boolean) => void;
  onSave: (row: PointOccurrenceAdjustmentRow) => void;
  onClear: (row: PointOccurrenceAdjustmentRow) => void;
}) {
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-3 py-3">
        <input type="checkbox" checked={selected} onChange={(event) => onToggle(row.id, event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-[#17407E]" />
      </td>
      <td className="px-3 py-3">{formatDateBr(row.dateStart)}{row.dateEnd !== row.dateStart ? ` a ${formatDateBr(row.dateEnd)}` : ''}</td>
      <td className="px-3 py-3 font-medium text-slate-700">{row.originalOccurrenceType}</td>
      <td className="px-3 py-3">
        <div className="space-y-2">
          <select defaultValue={row.effectiveOccurrenceType || row.originalOccurrenceType} id={`occ-type-${row.id}`} className={fieldClassName}>
            {occurrenceOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <label className="inline-flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" defaultChecked={row.ignored} id={`occ-ignored-${row.id}`} className="h-4 w-4 rounded border-slate-300 text-[#17407E]" />
            Ignorar ocorrência no cálculo local
          </label>
        </div>
      </td>
      <td className="px-3 py-3">
        <textarea defaultValue={row.overrideNotes || ''} id={`occ-notes-${row.id}`} rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#17407E] focus:ring-2 focus:ring-blue-100" />
        <div className="mt-2 text-[11px] text-slate-500">{row.overrideSummary || row.notes || (row.orphaned ? 'Override órfão sem ocorrência sincronizada atual.' : '-')}</div>
      </td>
      <td className="px-3 py-3 text-right">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() =>
              onSave({
                ...row,
                effectiveOccurrenceType: (document.getElementById(`occ-type-${row.id}`) as HTMLSelectElement | null)?.value as any || row.effectiveOccurrenceType,
                ignored: Boolean((document.getElementById(`occ-ignored-${row.id}`) as HTMLInputElement | null)?.checked),
                overrideNotes: (document.getElementById(`occ-notes-${row.id}`) as HTMLTextAreaElement | null)?.value || row.overrideNotes,
              })
            }
            disabled={saving}
            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Salvar
          </button>
          {row.hasOverride ? (
            <button type="button" onClick={() => onClear(row)} disabled={saving} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
              Limpar
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
