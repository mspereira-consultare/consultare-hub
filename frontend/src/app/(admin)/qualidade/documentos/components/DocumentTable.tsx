'use client';

import React from 'react';
import type { QmsDocumentSummary } from '@/lib/qms/types';

type Props = {
  items: QmsDocumentSummary[];
  busyId: string | null;
  onEdit: (item: QmsDocumentSummary) => void;
  onDelete: (item: QmsDocumentSummary) => void;
  onCreateVersion: (item: QmsDocumentSummary) => void;
  onViewFile: (item: QmsDocumentSummary) => void;
  onDownloadFile: (item: QmsDocumentSummary) => void;
};

const formatDateBr = (value: string | null) => {
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '-';
  return `${m[3]}/${m[2]}/${m[1]}`;
};

const statusStyle = (status: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'vigente') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (normalized === 'a_vencer') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (normalized === 'vencido') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (normalized === 'arquivado') return 'bg-slate-100 text-slate-600 border-slate-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
};

const statusLabel = (status: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'a_vencer') return 'A vencer';
  if (normalized === 'vigente') return 'Vigente';
  if (normalized === 'vencido') return 'Vencido';
  if (normalized === 'arquivado') return 'Arquivado';
  return 'Rascunho';
};

export function DocumentTable({
  items,
  busyId,
  onEdit,
  onDelete,
  onCreateVersion,
  onViewFile,
  onDownloadFile,
}: Props) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-auto">
        <table className="min-w-[1160px] w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-slate-600">
              <th className="px-3 py-2.5 font-semibold">Código</th>
              <th className="px-3 py-2.5 font-semibold">Setor</th>
              <th className="px-3 py-2.5 font-semibold">POP</th>
              <th className="px-3 py-2.5 font-semibold">Versão atual</th>
              <th className="px-3 py-2.5 font-semibold">Próx. revisão</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Arquivos</th>
              <th className="px-3 py-2.5 font-semibold">Atualizado</th>
              <th className="px-3 py-2.5 font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  Nenhum documento encontrado para os filtros aplicados.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const isBusy = busyId === item.id;
                return (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="px-3 py-2.5 font-medium text-slate-700">{item.code}</td>
                    <td className="px-3 py-2.5 text-slate-700">{item.sector || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-700 max-w-[280px] truncate" title={item.name}>
                      {item.name}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{item.currentVersion?.versionLabel || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-700">
                      {formatDateBr(item.currentVersion?.nextReviewDate || null)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-1 rounded-lg border text-xs font-semibold ${statusStyle(item.status)}`}>
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">
                      {item.fileCount} arquivo{item.fileCount === 1 ? '' : 's'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{formatDateBr(item.updatedAt)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          onClick={() => onEdit(item)}
                          disabled={isBusy}
                        >
                          Editar
                        </button>
                        <button
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          onClick={() => onCreateVersion(item)}
                          disabled={isBusy}
                        >
                          Nova versão
                        </button>
                        <button
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          onClick={() => onViewFile(item)}
                          disabled={isBusy || !item.lastFile}
                        >
                          Visualizar
                        </button>
                        <button
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          onClick={() => onDownloadFile(item)}
                          disabled={isBusy || !item.lastFile}
                        >
                          Download
                        </button>
                        <button
                          className="px-2.5 py-1.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          onClick={() => onDelete(item)}
                          disabled={isBusy}
                        >
                          Excluir
                        </button>
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
