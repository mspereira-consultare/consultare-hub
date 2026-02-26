'use client';

import React, { useEffect, useState } from 'react';
import type { QmsTrainingPlan } from '@/lib/qms/types';

export type TrainingPlanPayload = {
  code: string;
  theme: string;
  sector: string;
  trainingType: 'inicial' | 'reciclagem';
  objective: string;
  instructor: string;
  targetAudience: string;
  workloadHours: string;
  plannedDate: string;
  expirationDate: string;
  evaluationApplied: boolean;
  evaluationType: string;
  targetIndicator: string;
  expectedGoal: string;
  status: 'planejado' | 'em_andamento' | 'concluido' | 'cancelado';
  notes: string;
  linkedDocumentIds: string[];
};

type DocumentOption = {
  id: string;
  code: string;
  name: string;
  sector: string;
};

type Props = {
  open: boolean;
  mode: 'create' | 'edit';
  saving: boolean;
  initialData: QmsTrainingPlan | null;
  documentOptions: DocumentOption[];
  onClose: () => void;
  onSubmit: (payload: TrainingPlanPayload) => void;
};

const emptyForm = (): TrainingPlanPayload => ({
  code: '',
  theme: '',
  sector: '',
  trainingType: 'inicial',
  objective: '',
  instructor: '',
  targetAudience: '',
  workloadHours: '',
  plannedDate: '',
  expirationDate: '',
  evaluationApplied: false,
  evaluationType: '',
  targetIndicator: '',
  expectedGoal: '',
  status: 'planejado',
  notes: '',
  linkedDocumentIds: [],
});

export function TrainingPlanModal({
  open,
  mode,
  saving,
  initialData,
  documentOptions,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<TrainingPlanPayload>(emptyForm);

  useEffect(() => {
    if (!open) return;
    if (!initialData || mode === 'create') {
      setForm(emptyForm());
      return;
    }
    setForm({
      code: initialData.code || '',
      theme: initialData.theme || '',
      sector: initialData.sector || '',
      trainingType: initialData.trainingType || 'inicial',
      objective: initialData.objective || '',
      instructor: initialData.instructor || '',
      targetAudience: initialData.targetAudience || '',
      workloadHours:
        initialData.workloadHours === null || initialData.workloadHours === undefined
          ? ''
          : String(initialData.workloadHours),
      plannedDate: initialData.plannedDate || '',
      expirationDate: initialData.expirationDate || '',
      evaluationApplied: Boolean(initialData.evaluationApplied),
      evaluationType: initialData.evaluationType || '',
      targetIndicator: initialData.targetIndicator || '',
      expectedGoal: initialData.expectedGoal || '',
      status: initialData.status || 'planejado',
      notes: initialData.notes || '',
      linkedDocumentIds: initialData.linkedDocumentIds || [],
    });
  }, [open, mode, initialData]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-5xl bg-white rounded-xl border border-slate-200 shadow-xl flex flex-col max-h-[95vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">
            {mode === 'create' ? 'Novo cronograma de treinamento' : 'Editar cronograma de treinamento'}
          </h2>
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
            onClick={onClose}
            disabled={saving}
          >
            Fechar
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Codigo (opcional)</span>
              <input
                value={form.code}
                onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-slate-600 font-medium">Tema do treinamento</span>
              <input
                value={form.theme}
                onChange={(e) => setForm((prev) => ({ ...prev, theme: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Status</span>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, status: e.target.value as TrainingPlanPayload['status'] }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              >
                <option value="planejado">Planejado</option>
                <option value="em_andamento">Em andamento</option>
                <option value="concluido">Concluido</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Setor</span>
              <input
                value={form.sector}
                onChange={(e) => setForm((prev) => ({ ...prev, sector: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Tipo</span>
              <select
                value={form.trainingType}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, trainingType: e.target.value as TrainingPlanPayload['trainingType'] }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              >
                <option value="inicial">Inicial</option>
                <option value="reciclagem">Reciclagem</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Data aplicacao</span>
              <input
                type="date"
                value={form.plannedDate}
                onChange={(e) => setForm((prev) => ({ ...prev, plannedDate: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Data vencimento</span>
              <input
                type="date"
                value={form.expirationDate}
                onChange={(e) => setForm((prev) => ({ ...prev, expirationDate: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Instrutor</span>
              <input
                value={form.instructor}
                onChange={(e) => setForm((prev) => ({ ...prev, instructor: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Publico-alvo</span>
              <input
                value={form.targetAudience}
                onChange={(e) => setForm((prev) => ({ ...prev, targetAudience: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Carga horaria</span>
              <input
                type="number"
                step="0.5"
                min="0"
                value={form.workloadHours}
                onChange={(e) => setForm((prev) => ({ ...prev, workloadHours: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm flex items-end">
              <span className="inline-flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={form.evaluationApplied}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, evaluationApplied: e.target.checked }))
                  }
                />
                Avaliacao aplicada
              </span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Tipo de avaliacao</span>
              <input
                value={form.evaluationType}
                onChange={(e) => setForm((prev) => ({ ...prev, evaluationType: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Indicador vinculado</span>
              <input
                value={form.targetIndicator}
                onChange={(e) => setForm((prev) => ({ ...prev, targetIndicator: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Meta esperada</span>
              <input
                value={form.expectedGoal}
                onChange={(e) => setForm((prev) => ({ ...prev, expectedGoal: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <label className="space-y-1 text-sm block">
            <span className="text-slate-600 font-medium">Objetivo</span>
            <textarea
              value={form.objective}
              onChange={(e) => setForm((prev) => ({ ...prev, objective: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 min-h-[80px] resize-y"
            />
          </label>

          <label className="space-y-1 text-sm block">
            <span className="text-slate-600 font-medium">Observacoes</span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 min-h-[80px] resize-y"
            />
          </label>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">POPs vinculados</p>
            <div className="max-h-44 overflow-auto border border-slate-200 rounded-lg p-3 space-y-2">
              {documentOptions.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum documento operacional disponivel.</p>
              ) : (
                documentOptions.map((doc) => (
                  <label key={doc.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.linkedDocumentIds.includes(doc.id)}
                      onChange={(e) => {
                        setForm((prev) => {
                          const next = new Set(prev.linkedDocumentIds);
                          if (e.target.checked) next.add(doc.id);
                          else next.delete(doc.id);
                          return { ...prev, linkedDocumentIds: Array.from(next) };
                        });
                      }}
                    />
                    <span>{doc.code} - {doc.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-70"
            disabled={saving}
            onClick={() => onSubmit(form)}
          >
            {saving ? 'Salvando...' : mode === 'create' ? 'Criar cronograma' : 'Salvar alteracoes'}
          </button>
        </div>
      </div>
    </div>
  );
}
