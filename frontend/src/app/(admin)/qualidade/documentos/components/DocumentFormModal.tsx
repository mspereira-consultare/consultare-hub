'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { QmsDocumentDetail, QmsDocumentStatus } from '@/lib/qms/types';

export type DocumentFormPayload = {
  code: string;
  sector: string;
  name: string;
  objective: string;
  periodicityDays: string;
  status: QmsDocumentStatus;
  versionLabel: string;
  elaboratedBy: string;
  reviewedBy: string;
  approvedBy: string;
  creationDate: string;
  lastReviewDate: string;
  nextReviewDate: string;
  linkedTrainingRef: string;
  notes: string;
};

type Props = {
  open: boolean;
  mode: 'create' | 'edit';
  saving: boolean;
  initialData: QmsDocumentDetail | null;
  onClose: () => void;
  onSubmit: (payload: DocumentFormPayload, file: File | null) => void;
};

const STATUS_OPTIONS: Array<{ value: QmsDocumentStatus; label: string }> = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'vigente', label: 'Vigente' },
  { value: 'a_vencer', label: 'A vencer' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'arquivado', label: 'Arquivado' },
];

const emptyForm = (): DocumentFormPayload => ({
  code: '',
  sector: '',
  name: '',
  objective: '',
  periodicityDays: '',
  status: 'rascunho',
  versionLabel: '1.0',
  elaboratedBy: '',
  reviewedBy: '',
  approvedBy: '',
  creationDate: '',
  lastReviewDate: '',
  nextReviewDate: '',
  linkedTrainingRef: '',
  notes: '',
});

export function DocumentFormModal({
  open,
  mode,
  saving,
  initialData,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<DocumentFormPayload>(emptyForm);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const currentVersion = useMemo(
    () => initialData?.versions.find((item) => item.isCurrent) || initialData?.versions?.[0] || null,
    [initialData]
  );

  useEffect(() => {
    if (!open) return;
    if (!initialData || mode === 'create') {
      setForm(emptyForm());
      setSelectedFile(null);
      return;
    }
    setForm({
      code: initialData.document.code || '',
      sector: initialData.document.sector || '',
      name: initialData.document.name || '',
      objective: initialData.document.objective || '',
      periodicityDays:
        initialData.document.periodicityDays !== null &&
        initialData.document.periodicityDays !== undefined
          ? String(initialData.document.periodicityDays)
          : '',
      status: initialData.document.status || 'rascunho',
      versionLabel: currentVersion?.versionLabel || '1.0',
      elaboratedBy: currentVersion?.elaboratedBy || '',
      reviewedBy: currentVersion?.reviewedBy || '',
      approvedBy: currentVersion?.approvedBy || '',
      creationDate: currentVersion?.creationDate || '',
      lastReviewDate: currentVersion?.lastReviewDate || '',
      nextReviewDate: currentVersion?.nextReviewDate || '',
      linkedTrainingRef: currentVersion?.linkedTrainingRef || '',
      notes: currentVersion?.notes || '',
    });
    setSelectedFile(null);
  }, [open, mode, initialData, currentVersion]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-6xl bg-white rounded-xl border border-slate-200 shadow-xl flex flex-col max-h-[95vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">
            {mode === 'create' ? 'Novo documento operacional (POP)' : 'Editar documento operacional (POP)'}
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Código (opcional)</span>
              <input
                value={form.code}
                onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                placeholder="Auto se vazio (ex.: POP-2026-0001)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Setor</span>
              <input
                value={form.sector}
                onChange={(e) => setForm((prev) => ({ ...prev, sector: e.target.value }))}
                placeholder="Ex.: Recepção"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Status</span>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, status: e.target.value as QmsDocumentStatus }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              >
                {STATUS_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Nome do POP</span>
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Nome do procedimento operacional"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Treinamento vinculado</span>
              <input
                value={form.linkedTrainingRef}
                onChange={(e) => setForm((prev) => ({ ...prev, linkedTrainingRef: e.target.value }))}
                placeholder="Ex.: TRN-2026-0001"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <label className="space-y-1 text-sm block">
            <span className="text-slate-600 font-medium">Objetivo</span>
            <textarea
              value={form.objective}
              onChange={(e) => setForm((prev) => ({ ...prev, objective: e.target.value }))}
              placeholder="Descreva o objetivo do documento"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 min-h-[84px] resize-y"
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Versão</span>
              <input
                value={form.versionLabel}
                onChange={(e) => setForm((prev) => ({ ...prev, versionLabel: e.target.value }))}
                placeholder="Ex.: 1.0"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Periodicidade (dias)</span>
              <input
                value={form.periodicityDays}
                onChange={(e) => setForm((prev) => ({ ...prev, periodicityDays: e.target.value }))}
                placeholder="Ex.: 180"
                inputMode="numeric"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Data de criação</span>
              <input
                type="date"
                value={form.creationDate}
                onChange={(e) => setForm((prev) => ({ ...prev, creationDate: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Última revisão</span>
              <input
                type="date"
                value={form.lastReviewDate}
                onChange={(e) => setForm((prev) => ({ ...prev, lastReviewDate: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Próxima revisão</span>
              <input
                type="date"
                value={form.nextReviewDate}
                onChange={(e) => setForm((prev) => ({ ...prev, nextReviewDate: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Elaborado por</span>
              <input
                value={form.elaboratedBy}
                onChange={(e) => setForm((prev) => ({ ...prev, elaboratedBy: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Revisado por</span>
              <input
                value={form.reviewedBy}
                onChange={(e) => setForm((prev) => ({ ...prev, reviewedBy: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Aprovado por</span>
              <input
                value={form.approvedBy}
                onChange={(e) => setForm((prev) => ({ ...prev, approvedBy: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Observações</span>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 min-h-[84px] resize-y"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Arquivo do documento (opcional)</span>
              <input
                type="file"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              />
              <p className="text-xs text-slate-500">
                {selectedFile ? `Selecionado: ${selectedFile.name}` : 'Nenhum arquivo selecionado'}
              </p>
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
            onClick={() => onSubmit(form, selectedFile)}
          >
            {saving ? 'Salvando...' : mode === 'create' ? 'Criar documento' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}
