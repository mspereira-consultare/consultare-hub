'use client';

import { Download, Loader2, X } from 'lucide-react';
import type { RepassePdfFilenameMode } from '@/lib/repasses/types';

type RepassePdfDownloadModalProps = {
  open: boolean;
  selectedCount: number;
  filenameMode: RepassePdfFilenameMode;
  loading: boolean;
  onClose: () => void;
  onFilenameModeChange: (value: RepassePdfFilenameMode) => void;
  onConfirm: () => void;
};

const options: Array<{
  value: RepassePdfFilenameMode;
  title: string;
  description: string;
}> = [
  {
    value: 'current',
    title: 'Padrão atual do painel',
    description: 'Mantém o nome salvo hoje no artefato PDF gerado pelo sistema.',
  },
  {
    value: 'full_name',
    title: 'Nome completo do profissional',
    description: 'Renomeia cada PDF usando apenas o nome completo do profissional.',
  },
];

export function RepassePdfDownloadModal({
  open,
  selectedCount,
  filenameMode,
  loading,
  onClose,
  onFilenameModeChange,
  onConfirm,
}: RepassePdfDownloadModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-xl rounded-xl border bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="repasse-pdf-download-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b px-4 py-3">
          <div>
            <h3 id="repasse-pdf-download-title" className="text-sm font-semibold text-slate-800">
              Baixar PDFs selecionados
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {selectedCount} profissional{selectedCount === 1 ? '' : 'is'} selecionado{selectedCount === 1 ? '' : 's'}.
              O sistema baixa os PDFs já gerados e avisa se algum estiver ausente.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Escolha o padrão de nome dos arquivos
          </div>
          <div className="space-y-2">
            {options.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition ${
                  filenameMode === option.value
                    ? 'border-[#17407E] bg-blue-50/50'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="repasse-pdf-filename-mode"
                  value={option.value}
                  checked={filenameMode === option.value}
                  onChange={() => onFilenameModeChange(option.value)}
                  className="mt-0.5 h-4 w-4 border-slate-300 text-[#17407E]"
                />
                <div>
                  <div className="text-sm font-semibold text-slate-800">{option.title}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{option.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Baixar
          </button>
        </div>
      </div>
    </div>
  );
}
