import { Loader2, Pencil, Plus, Trash2, Wrench } from 'lucide-react';
import type { EquipmentEvent } from '@/lib/equipamentos/types';

type SelectOption = { value: string; label: string };

type EventFormState = {
  eventDate: string;
  eventType: string;
  description: string;
  handledBy: string;
  status: string;
  notes: string;
};

type EquipmentEventsSectionProps = {
  events: EquipmentEvent[];
  eventTypes: SelectOption[];
  eventStatuses: SelectOption[];
  form: EventFormState;
  editingId: string | null;
  saving: boolean;
  onFormChange: (next: EventFormState) => void;
  onSubmit: () => void;
  onEdit: (event: EquipmentEvent) => void;
  onDelete: (eventId: string) => void;
  onCancelEdit: () => void;
};

const inputClassName =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200';
const labelClassName = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500';

const eventStatusLabel = (value: string, options: SelectOption[]) =>
  options.find((item) => item.value === value)?.label || value;
const eventTypeLabel = (value: string, options: SelectOption[]) =>
  options.find((item) => item.value === value)?.label || value;

export function EquipmentEventsSection({
  events,
  eventTypes,
  eventStatuses,
  form,
  editingId,
  saving,
  onFormChange,
  onSubmit,
  onEdit,
  onDelete,
  onCancelEdit,
}: EquipmentEventsSectionProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_1.4fr]">
      <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-white p-3 text-slate-600 shadow-sm">
            <Wrench size={18} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Novo evento</h3>
            <p className="text-sm text-slate-500">Registre calibração, manutenção preventiva, corretiva ou ocorrências.</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className={labelClassName}>Data</span>
            <input
              type="date"
              className={inputClassName}
              value={form.eventDate}
              onChange={(event) => onFormChange({ ...form, eventDate: event.target.value })}
            />
          </label>
          <label className="block">
            <span className={labelClassName}>Tipo</span>
            <select
              className={inputClassName}
              value={form.eventType}
              onChange={(event) => onFormChange({ ...form, eventType: event.target.value })}
            >
              {eventTypes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className={labelClassName}>Descrição</span>
            <input
              className={inputClassName}
              value={form.description}
              onChange={(event) => onFormChange({ ...form, description: event.target.value })}
              placeholder="Ex.: Troca de cabo, calibração anual, ajuste no painel"
            />
          </label>
          <label className="block">
            <span className={labelClassName}>Responsável / fornecedor</span>
            <input
              className={inputClassName}
              value={form.handledBy}
              onChange={(event) => onFormChange({ ...form, handledBy: event.target.value })}
            />
          </label>
          <label className="block">
            <span className={labelClassName}>Status</span>
            <select
              className={inputClassName}
              value={form.status}
              onChange={(event) => onFormChange({ ...form, status: event.target.value })}
            >
              {eventStatuses.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className={labelClassName}>Observações</span>
            <textarea
              className={`${inputClassName} min-h-[96px] resize-y`}
              value={form.notes}
              onChange={(event) => onFormChange({ ...form, notes: event.target.value })}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-[#17407E] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#143768] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {editingId ? 'Salvar evento' : 'Adicionar evento'}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={onCancelEdit}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white"
            >
              Cancelar edição
            </button>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Histórico de manutenção</h3>
          <p className="text-sm text-slate-500">Lista de eventos vinculados ao equipamento.</p>
        </div>

        <div className="mt-4 max-h-[420px] overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                <th className="px-2 py-3">Data</th>
                <th className="px-2 py-3">Tipo</th>
                <th className="px-2 py-3">Descrição</th>
                <th className="px-2 py-3">Status</th>
                <th className="px-2 py-3">Responsável</th>
                <th className="px-2 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-2 py-6 text-center text-slate-500">
                    Nenhum evento cadastrado até o momento.
                  </td>
                </tr>
              ) : (
                events.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 align-top">
                    <td className="px-2 py-3 text-slate-600">{item.eventDate || '-'}</td>
                    <td className="px-2 py-3 text-slate-700">{eventTypeLabel(item.eventType, eventTypes)}</td>
                    <td className="px-2 py-3">
                      <div className="font-medium text-slate-800">{item.description}</div>
                      {item.notes ? <div className="mt-1 text-xs text-slate-500">{item.notes}</div> : null}
                    </td>
                    <td className="px-2 py-3 text-slate-700">{eventStatusLabel(item.status, eventStatuses)}</td>
                    <td className="px-2 py-3 text-slate-600">{item.handledBy || '-'}</td>
                    <td className="px-2 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onEdit(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          <Pencil size={12} />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(item.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
                        >
                          <Trash2 size={12} />
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
