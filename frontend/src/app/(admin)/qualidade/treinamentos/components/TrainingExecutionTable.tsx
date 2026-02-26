'use client';

import React from 'react';
import type { QmsTraining } from '@/lib/qms/types';

type Props = {
  items: QmsTraining[];
  busyId: string | null;
  onEdit: (item: QmsTraining) => void;
  onDelete: (item: QmsTraining) => void;
  onUpload: (item: QmsTraining) => void;
  onViewFile: (item: QmsTraining) => void;
  onDownloadFile: (item: QmsTraining) => void;
};

const formatDateBr = (value: string | null) => {
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '-';
  return `${m[3]}/${m[2]}/${m[1]}`;
};

const statusStyle = (status: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'concluido') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (normalized === 'em_andamento') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (normalized === 'cancelado') return 'bg-slate-100 text-slate-600 border-slate-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
};

const statusLabel = (status: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'concluido') return 'Concluido';
  if (normalized === 'em_andamento') return 'Em andamento';
  if (normalized === 'cancelado') return 'Cancelado';
  return 'Planejado';
};

export function TrainingExecutionTable({
  items,
  busyId,
  onEdit,
  onDelete,
  onUpload,
  onViewFile,
  onDownloadFile,
}: Props) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-auto">
        <table className="min-w-[1180px] w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-slate-600">
              <th className="px-3 py-2.5 font-semibold">Codigo</th>
              <th className="px-3 py-2.5 font-semibold">Treinamento</th>
              <th className="px-3 py-2.5 font-semibold">Plano</th>
              <th className="px-3 py-2.5 font-semibold">Setor</th>
              <th className="px-3 py-2.5 font-semibold">Data</th>
              <th className="px-3 py-2.5 font-semibold">Participantes</th>
              <th className="px-3 py-2.5 font-semibold">Nota media</th>
              <th className="px-3 py-2.5 font-semibold">Arquivos</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                  Nenhuma realizacao cadastrada.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const isBusy = busyId === item.id;
                return (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="px-3 py-2.5 font-medium text-slate-700">{item.code}</td>
                    <td className="px-3 py-2.5 text-slate-700 max-w-[220px] truncate" title={item.name}>
                      {item.name}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{item.planCode || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-700">{item.sector || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-700">{formatDateBr(item.performedAt)}</td>
                    <td className="px-3 py-2.5 text-slate-700">
                      {item.participantsActual ?? 0}/{item.participantsPlanned ?? 0}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">
                      {item.averageScore === null ? '-' : item.averageScore.toFixed(1)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{item.filesCount}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-1 rounded-lg border text-xs font-semibold ${statusStyle(item.status)}`}>
                        {statusLabel(item.status)}
                      </span>
                    </td>
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
                          onClick={() => onUpload(item)}
                          disabled={isBusy}
                        >
                          Upload
                        </button>
                        <button
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          onClick={() => onViewFile(item)}
                          disabled={isBusy || item.filesCount <= 0}
                        >
                          Visualizar
                        </button>
                        <button
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          onClick={() => onDownloadFile(item)}
                          disabled={isBusy || item.filesCount <= 0}
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
