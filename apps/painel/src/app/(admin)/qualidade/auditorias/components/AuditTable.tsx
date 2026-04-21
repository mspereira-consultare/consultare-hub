'use client';

import React from 'react';
import type { QmsAudit } from '@/lib/qms/types';

type Props = {
  items: QmsAudit[];
  busyId: string | null;
  onEdit: (item: QmsAudit) => void;
  onDelete: (item: QmsAudit) => void;
  onOpenActions: (item: QmsAudit) => void;
};

const formatDateBr = (value: string | null) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '-';
  return `${match[3]}/${match[2]}/${match[1]}`;
};

const formatPercent = (value: number | null) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  return `${Number(value).toFixed(1)}%`;
};

const criticalityLabel = (value: string) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'alta') return 'Alta';
  if (normalized === 'baixa') return 'Baixa';
  return 'Media';
};

const criticalityStyle = (value: string) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'alta') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (normalized === 'baixa') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
};

const statusLabel = (value: string) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'encerrada') return 'Encerrada';
  if (normalized === 'em_tratativa') return 'Em tratativa';
  return 'Aberta';
};

const statusStyle = (value: string) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'encerrada') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (normalized === 'em_tratativa') return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
};

export function AuditTable({ items, busyId, onEdit, onDelete, onOpenActions }: Props) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-auto">
        <table className="min-w-[1280px] w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-slate-600">
              <th className="px-3 py-2.5 font-semibold">Codigo</th>
              <th className="px-3 py-2.5 font-semibold">POP</th>
              <th className="px-3 py-2.5 font-semibold">Versao</th>
              <th className="px-3 py-2.5 font-semibold">Data auditoria</th>
              <th className="px-3 py-2.5 font-semibold">Responsavel</th>
              <th className="px-3 py-2.5 font-semibold">Conformidade</th>
              <th className="px-3 py-2.5 font-semibold">Criticidade</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Acoes</th>
              <th className="px-3 py-2.5 font-semibold">Prazo correcao</th>
              <th className="px-3 py-2.5 font-semibold">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                  Nenhuma auditoria encontrada.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const isBusy = busyId === item.id;
                return (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="px-3 py-2.5 font-medium text-slate-700">{item.code}</td>
                    <td className="px-3 py-2.5 text-slate-700 max-w-[260px] truncate" title={item.documentName}>
                      {item.documentCode} - {item.documentName}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{item.documentVersionLabel || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-700">{formatDateBr(item.auditDate)}</td>
                    <td className="px-3 py-2.5 text-slate-700">{item.responsible || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-700">{formatPercent(item.compliancePercent)}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`px-2 py-1 rounded-lg border text-xs font-semibold ${criticalityStyle(item.criticality)}`}
                      >
                        {criticalityLabel(item.criticality)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`px-2 py-1 rounded-lg border text-xs font-semibold ${statusStyle(item.status)}`}
                      >
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">
                      {item.actionsOpen}/{item.actionsTotal}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{formatDateBr(item.correctionDeadline)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          onClick={() => onOpenActions(item)}
                          disabled={isBusy}
                        >
                          Acoes
                        </button>
                        <button
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          onClick={() => onEdit(item)}
                          disabled={isBusy}
                        >
                          Editar
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
