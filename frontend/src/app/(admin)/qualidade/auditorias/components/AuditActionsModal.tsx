'use client';

import React, { useEffect, useState } from 'react';
import type { QmsAuditAction, QmsAuditDetail } from '@/lib/qms/types';

export type AuditActionPayload = {
  description: string;
  owner: string;
  deadline: string;
  status: 'aberta' | 'em_andamento' | 'concluida' | 'atrasada';
  completionNote: string;
};

type Props = {
  open: boolean;
  saving: boolean;
  detail: QmsAuditDetail | null;
  onClose: () => void;
  onCreate: (payload: AuditActionPayload) => void;
  onUpdate: (actionId: string, payload: AuditActionPayload) => void;
};

const emptyForm = (): AuditActionPayload => ({
  description: '',
  owner: '',
  deadline: '',
  status: 'aberta',
  completionNote: '',
});

const formatDateBr = (value: string | null) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '-';
  return `${match[3]}/${match[2]}/${match[1]}`;
};

const statusLabel = (value: string) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'concluida') return 'Concluida';
  if (normalized === 'em_andamento') return 'Em andamento';
  if (normalized === 'atrasada') return 'Atrasada';
  return 'Aberta';
};

const statusStyle = (value: string) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'concluida') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (normalized === 'em_andamento') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (normalized === 'atrasada') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
};

const toPayload = (action: QmsAuditAction): AuditActionPayload => ({
  description: action.description || '',
  owner: action.owner || '',
  deadline: action.deadline || '',
  status: action.status || 'aberta',
  completionNote: action.completionNote || '',
});

export function AuditActionsModal({
  open,
  saving,
  detail,
  onClose,
  onCreate,
  onUpdate,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AuditActionPayload>(emptyForm);

  useEffect(() => {
    if (!open) return;
    setEditingId(null);
    setForm(emptyForm());
  }, [open, detail?.audit.id]);

  if (!open || !detail) return null;

  const handleSave = () => {
    if (!form.description.trim()) return;
    if (editingId) {
      onUpdate(editingId, form);
      return;
    }
    onCreate(form);
  };

  const handleEdit = (action: QmsAuditAction) => {
    setEditingId(action.id);
    setForm(toPayload(action));
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-6xl bg-white rounded-xl border border-slate-200 shadow-xl flex flex-col max-h-[95vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Acoes corretivas</h2>
            <p className="text-sm text-slate-600">
              {detail.audit.code} - {detail.audit.documentCode} (v{detail.audit.documentVersionLabel})
            </p>
          </div>
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
            onClick={onClose}
            disabled={saving}
          >
            Fechar
          </button>
        </div>

        <div className="p-6 border-b border-slate-200 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-slate-600 font-medium">Descricao</span>
              <input
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="Descreva a acao corretiva"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Responsavel</span>
              <input
                value={form.owner}
                onChange={(e) => setForm((prev) => ({ ...prev, owner: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Prazo</span>
              <input
                type="date"
                value={form.deadline}
                onChange={(e) => setForm((prev) => ({ ...prev, deadline: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Status</span>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, status: e.target.value as AuditActionPayload['status'] }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              >
                <option value="aberta">Aberta</option>
                <option value="em_andamento">Em andamento</option>
                <option value="concluida">Concluida</option>
                <option value="atrasada">Atrasada</option>
              </select>
            </label>
            <label className="space-y-1 text-sm md:col-span-3">
              <span className="text-slate-600 font-medium">Nota de conclusao</span>
              <input
                value={form.completionNote}
                onChange={(e) => setForm((prev) => ({ ...prev, completionNote: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-2">
            {editingId && (
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                onClick={resetForm}
                disabled={saving}
              >
                Cancelar edicao
              </button>
            )}
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-70"
              onClick={handleSave}
              disabled={saving || !form.description.trim()}
            >
              {saving
                ? 'Salvando...'
                : editingId
                  ? 'Salvar alteracao'
                  : 'Adicionar acao'}
            </button>
          </div>
        </div>

        <div className="p-6 overflow-auto flex-1">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-slate-50 border border-slate-200">
              <tr className="text-left text-slate-600">
                <th className="px-3 py-2.5 font-semibold">Descricao</th>
                <th className="px-3 py-2.5 font-semibold">Responsavel</th>
                <th className="px-3 py-2.5 font-semibold">Prazo</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Conclusao</th>
                <th className="px-3 py-2.5 font-semibold">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {detail.actions.length === 0 ? (
                <tr className="border border-slate-200">
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Nenhuma acao corretiva registrada.
                  </td>
                </tr>
              ) : (
                detail.actions.map((item) => (
                  <tr key={item.id} className="border-x border-b border-slate-200">
                    <td className="px-3 py-2.5 text-slate-700 max-w-[360px] truncate" title={item.description}>
                      {item.description}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{item.owner || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-700">{formatDateBr(item.deadline)}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`px-2 py-1 rounded-lg border text-xs font-semibold ${statusStyle(item.status)}`}
                      >
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 max-w-[320px] truncate" title={item.completionNote || ''}>
                      {item.completionNote || '-'}
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                        onClick={() => handleEdit(item)}
                        disabled={saving}
                      >
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
    </div>
  );
}
