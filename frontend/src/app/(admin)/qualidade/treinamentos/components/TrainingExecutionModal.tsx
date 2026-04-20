'use client';

import React, { useEffect, useState } from 'react';
import type { QmsTraining } from '@/lib/qms/types';

type PlanOption = {
  id: string;
  code: string;
  theme: string;
  status: string;
};

type EmployeeOption = {
  id: string;
  fullName: string;
  cpf: string | null;
  department: string | null;
  status: string;
};

export type TrainingExecutionPayload = {
  code: string;
  planId: string;
  name: string;
  sector: string;
  trainingType: 'inicial' | 'reciclagem';
  instructor: string;
  targetAudience: string;
  performedAt: string;
  workloadHours: string;
  evaluationApplied: boolean;
  averageScore: string;
  nextTrainingDate: string;
  status: 'planejado' | 'em_andamento' | 'concluido' | 'cancelado';
  participantsPlanned: string;
  participantsActual: string;
  assignedEmployeeIds: string[];
  resultPostTraining: string;
  notes: string;
};

type Props = {
  open: boolean;
  mode: 'create' | 'edit';
  saving: boolean;
  initialData: QmsTraining | null;
  plans: PlanOption[];
  employeeOptions: EmployeeOption[];
  onClose: () => void;
  onSubmit: (payload: TrainingExecutionPayload, file: File | null, fileType: string) => void;
};

const emptyForm = (): TrainingExecutionPayload => ({
  code: '',
  planId: '',
  name: '',
  sector: '',
  trainingType: 'inicial',
  instructor: '',
  targetAudience: '',
  performedAt: '',
  workloadHours: '',
  evaluationApplied: false,
  averageScore: '',
  nextTrainingDate: '',
  status: 'planejado',
  participantsPlanned: '',
  participantsActual: '',
  assignedEmployeeIds: [],
  resultPostTraining: '',
  notes: '',
});

export function TrainingExecutionModal({
  open,
  mode,
  saving,
  initialData,
  plans,
  employeeOptions,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<TrainingExecutionPayload>(emptyForm);
  const [fileType, setFileType] = useState('attendance_list');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    if (!initialData || mode === 'create') {
      setForm(emptyForm());
      setFileType('attendance_list');
      setSelectedFile(null);
      return;
    }

    setForm({
      code: initialData.code || '',
      planId: initialData.planId || '',
      name: initialData.name || '',
      sector: initialData.sector || '',
      trainingType: initialData.trainingType || 'inicial',
      instructor: initialData.instructor || '',
      targetAudience: initialData.targetAudience || '',
      performedAt: initialData.performedAt || '',
      workloadHours:
        initialData.workloadHours === null || initialData.workloadHours === undefined
          ? ''
          : String(initialData.workloadHours),
      evaluationApplied: Boolean(initialData.evaluationApplied),
      averageScore:
        initialData.averageScore === null || initialData.averageScore === undefined
          ? ''
          : String(initialData.averageScore),
      nextTrainingDate: initialData.nextTrainingDate || '',
      status: initialData.status || 'planejado',
      participantsPlanned:
        initialData.participantsPlanned === null || initialData.participantsPlanned === undefined
          ? ''
          : String(initialData.participantsPlanned),
      participantsActual:
        initialData.participantsActual === null || initialData.participantsActual === undefined
          ? ''
          : String(initialData.participantsActual),
      assignedEmployeeIds: Array.isArray(initialData.assignments)
        ? initialData.assignments.map((assignment) => assignment.employeeId).filter(Boolean)
        : [],
      resultPostTraining: initialData.resultPostTraining || '',
      notes: initialData.notes || '',
    });
    setFileType('attendance_list');
    setSelectedFile(null);
  }, [open, mode, initialData]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-5xl bg-white rounded-xl border border-slate-200 shadow-xl flex flex-col max-h-[95vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">
            {mode === 'create' ? 'Nova realizacao de treinamento' : 'Editar realizacao de treinamento'}
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
              <span className="text-slate-600 font-medium">Nome do treinamento</span>
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Status</span>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, status: e.target.value as TrainingExecutionPayload['status'] }))
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
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-slate-600 font-medium">Cronograma vinculado</span>
              <select
                value={form.planId}
                onChange={(e) => setForm((prev) => ({ ...prev, planId: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              >
                <option value="">Sem vinculo</option>
                {plans.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} - {item.theme}
                  </option>
                ))}
              </select>
            </label>
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
                  setForm((prev) => ({ ...prev, trainingType: e.target.value as TrainingExecutionPayload['trainingType'] }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              >
                <option value="inicial">Inicial</option>
                <option value="reciclagem">Reciclagem</option>
              </select>
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
              <span className="text-slate-600 font-medium">Data realizacao</span>
              <input
                type="date"
                value={form.performedAt}
                onChange={(e) => setForm((prev) => ({ ...prev, performedAt: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Proximo treinamento</span>
              <input
                type="date"
                value={form.nextTrainingDate}
                onChange={(e) => setForm((prev) => ({ ...prev, nextTrainingDate: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Participantes previstos</span>
              <input
                type="number"
                min="0"
                value={form.participantsPlanned}
                onChange={(e) => setForm((prev) => ({ ...prev, participantsPlanned: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Participantes realizados</span>
              <input
                type="number"
                min="0"
                value={form.participantsActual}
                onChange={(e) => setForm((prev) => ({ ...prev, participantsActual: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Nota media</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="10"
                value={form.averageScore}
                onChange={(e) => setForm((prev) => ({ ...prev, averageScore: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate-700">Participantes vinculados ao cadastro oficial</span>
              <span className="text-xs text-slate-500">
                Selecione colaboradores do cadastro oficial. A aba Qualidade & Metas em Colaboradores usa este vínculo como fonte gerencial.
              </span>
            </div>
            <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto md:grid-cols-2">
              {employeeOptions.length ? (
                employeeOptions.map((employee) => {
                  const checked = form.assignedEmployeeIds.includes(employee.id);
                  return (
                    <label key={employee.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            assignedEmployeeIds: event.target.checked
                              ? [...prev.assignedEmployeeIds, employee.id]
                              : prev.assignedEmployeeIds.filter((id) => id !== employee.id),
                          }))
                        }
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-700">{employee.fullName}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {employee.department || 'Setor nao informado'} · {employee.status}
                        </span>
                      </span>
                    </label>
                  );
                })
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500 md:col-span-2">
                  Nenhum colaborador carregado para vínculo.
                </div>
              )}
            </div>
          </section>

          <label className="space-y-1 text-sm flex items-end">
            <span className="inline-flex items-center gap-2 text-slate-700">
              <input
                type="checkbox"
                checked={form.evaluationApplied}
                onChange={(e) => setForm((prev) => ({ ...prev, evaluationApplied: e.target.checked }))}
              />
              Avaliacao aplicada
            </span>
          </label>

          <label className="space-y-1 text-sm block">
            <span className="text-slate-600 font-medium">Resultado pos-treinamento</span>
            <textarea
              value={form.resultPostTraining}
              onChange={(e) => setForm((prev) => ({ ...prev, resultPostTraining: e.target.value }))}
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Tipo de anexo (opcional)</span>
              <select
                value={fileType}
                onChange={(e) => setFileType(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              >
                <option value="attendance_list">Lista de presenca</option>
                <option value="evaluation">Avaliacao</option>
                <option value="evidence">Evidencia</option>
                <option value="other">Outro</option>
              </select>
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-slate-600 font-medium">Arquivo (opcional)</span>
              <input
                type="file"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              />
            </label>
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
            onClick={() => onSubmit(form, selectedFile, fileType)}
          >
            {saving ? 'Salvando...' : mode === 'create' ? 'Criar realizacao' : 'Salvar alteracoes'}
          </button>
        </div>
      </div>
    </div>
  );
}
