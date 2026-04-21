'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { QmsAuditDetail } from '@/lib/qms/types';

export type AuditFormPayload = {
  code: string;
  documentId: string;
  documentVersionId: string;
  responsible: string;
  auditDate: string;
  compliancePercent: string;
  nonConformity: string;
  actionPlan: string;
  correctionDeadline: string;
  reassessed: boolean;
  effectivenessCheckDate: string;
  criticality: 'baixa' | 'media' | 'alta';
  status: 'aberta' | 'em_tratativa' | 'encerrada';
};

type AuditOption = {
  documentId: string;
  code: string;
  name: string;
  versions: Array<{ id: string; label: string }>;
};

type Props = {
  open: boolean;
  mode: 'create' | 'edit';
  saving: boolean;
  initialData: QmsAuditDetail | null;
  options: AuditOption[];
  onClose: () => void;
  onSubmit: (payload: AuditFormPayload) => void;
};

const emptyForm = (): AuditFormPayload => ({
  code: '',
  documentId: '',
  documentVersionId: '',
  responsible: '',
  auditDate: '',
  compliancePercent: '',
  nonConformity: '',
  actionPlan: '',
  correctionDeadline: '',
  reassessed: false,
  effectivenessCheckDate: '',
  criticality: 'media',
  status: 'aberta',
});

export function AuditFormModal({
  open,
  mode,
  saving,
  initialData,
  options,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<AuditFormPayload>(emptyForm);

  const selectedDocument = useMemo(
    () => options.find((item) => item.documentId === form.documentId) || null,
    [options, form.documentId]
  );

  useEffect(() => {
    if (!open) return;
    if (!initialData || mode === 'create') {
      const firstDocument = options[0] || null;
      setForm({
        ...emptyForm(),
        documentId: firstDocument?.documentId || '',
        documentVersionId: firstDocument?.versions?.[0]?.id || '',
      });
      return;
    }
    setForm({
      code: initialData.audit.code || '',
      documentId: initialData.audit.documentId || '',
      documentVersionId: initialData.audit.documentVersionId || '',
      responsible: initialData.audit.responsible || '',
      auditDate: initialData.audit.auditDate || '',
      compliancePercent:
        initialData.audit.compliancePercent === null || initialData.audit.compliancePercent === undefined
          ? ''
          : String(initialData.audit.compliancePercent),
      nonConformity: initialData.audit.nonConformity || '',
      actionPlan: initialData.audit.actionPlan || '',
      correctionDeadline: initialData.audit.correctionDeadline || '',
      reassessed: Boolean(initialData.audit.reassessed),
      effectivenessCheckDate: initialData.audit.effectivenessCheckDate || '',
      criticality: initialData.audit.criticality || 'media',
      status: initialData.audit.status || 'aberta',
    });
  }, [open, mode, initialData, options]);

  useEffect(() => {
    if (!open || !form.documentId) return;
    const doc = options.find((item) => item.documentId === form.documentId);
    if (!doc) return;
    const hasCurrentVersion = doc.versions.some((item) => item.id === form.documentVersionId);
    if (!hasCurrentVersion) {
      setForm((prev) => ({ ...prev, documentVersionId: doc.versions[0]?.id || '' }));
    }
  }, [open, form.documentId, form.documentVersionId, options]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-5xl bg-white rounded-xl border border-slate-200 shadow-xl flex flex-col max-h-[95vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">
            {mode === 'create' ? 'Nova auditoria' : 'Editar auditoria'}
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
              <span className="text-slate-600 font-medium">POP avaliado</span>
              <select
                value={form.documentId}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    documentId: e.target.value,
                    documentVersionId:
                      options.find((item) => item.documentId === e.target.value)?.versions?.[0]?.id || '',
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              >
                <option value="">Selecione</option>
                {options.map((item) => (
                  <option key={item.documentId} value={item.documentId}>
                    {item.code} - {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Versao auditada</span>
              <select
                value={form.documentVersionId}
                onChange={(e) => setForm((prev) => ({ ...prev, documentVersionId: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              >
                <option value="">Selecione</option>
                {(selectedDocument?.versions || []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Responsavel</span>
              <input
                value={form.responsible}
                onChange={(e) => setForm((prev) => ({ ...prev, responsible: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Data auditoria</span>
              <input
                type="date"
                value={form.auditDate}
                onChange={(e) => setForm((prev) => ({ ...prev, auditDate: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Conformidade (%)</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.compliancePercent}
                onChange={(e) => setForm((prev) => ({ ...prev, compliancePercent: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Prazo correcao</span>
              <input
                type="date"
                value={form.correctionDeadline}
                onChange={(e) => setForm((prev) => ({ ...prev, correctionDeadline: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Criticidade</span>
              <select
                value={form.criticality}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, criticality: e.target.value as AuditFormPayload['criticality'] }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              >
                <option value="baixa">Baixa</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Status</span>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, status: e.target.value as AuditFormPayload['status'] }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              >
                <option value="aberta">Aberta</option>
                <option value="em_tratativa">Em tratativa</option>
                <option value="encerrada">Encerrada</option>
              </select>
            </label>
            <label className="space-y-1 text-sm flex items-end">
              <span className="inline-flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={form.reassessed}
                  onChange={(e) => setForm((prev) => ({ ...prev, reassessed: e.target.checked }))}
                />
                Reavaliado
              </span>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 font-medium">Data checagem eficacia</span>
              <input
                type="date"
                value={form.effectivenessCheckDate}
                onChange={(e) => setForm((prev) => ({ ...prev, effectivenessCheckDate: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <label className="space-y-1 text-sm block">
            <span className="text-slate-600 font-medium">Nao conformidade</span>
            <textarea
              value={form.nonConformity}
              onChange={(e) => setForm((prev) => ({ ...prev, nonConformity: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 min-h-[84px] resize-y"
            />
          </label>

          <label className="space-y-1 text-sm block">
            <span className="text-slate-600 font-medium">Plano de acao</span>
            <textarea
              value={form.actionPlan}
              onChange={(e) => setForm((prev) => ({ ...prev, actionPlan: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 min-h-[84px] resize-y"
            />
          </label>
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
            {saving ? 'Salvando...' : mode === 'create' ? 'Criar auditoria' : 'Salvar alteracoes'}
          </button>
        </div>
      </div>
    </div>
  );
}
