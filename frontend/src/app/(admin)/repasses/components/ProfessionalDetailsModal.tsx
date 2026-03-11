'use client';

import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, MessageSquareText, Save, X } from 'lucide-react';
import type {
  RepasseAConferirMainRow,
  RepasseConsolidacaoLineMarkColor,
  RepasseConsolidacaoMarkLegend,
} from '@/lib/repasses/types';
import { ManualLegendEditor } from './ManualLegendEditor';
import { ManualMarkingPanel } from './ManualMarkingPanel';

type RepasseLine = {
  sourceRowHash: string;
  invoiceId: string;
  executionDate: string;
  patientName: string;
  unitName: string;
  accountDate: string;
  requesterName: string;
  specialtyName: string;
  procedureName: string;
  attendanceValue: number;
  detailStatus: string;
  detailStatusText: string;
  roleCode: string;
  roleName: string;
  detailProfessionalName: string;
  detailRepasseValue: number;
  isInConsolidado: boolean;
  origem?: 'consolidado' | 'a_conferir';
  convenio?: string;
  funcao?: string;
  origin?: 'consolidado' | 'a_conferir';
};

type ProfessionalSummary = {
  professionalId: string;
  professionalName: string;
  status: 'SUCCESS' | 'NO_DATA' | 'SKIPPED' | 'ERROR' | 'NOT_PROCESSED';
  execucaoQty: number;
  execucaoValue: number;
  execucaoPending: boolean;
  producaoQty: number;
  producaoValue: number;
  rowsCount: number;
  totalValue: number;
  consolidadoQty: number;
  consolidadoValue: number;
  naoConsolidadoQty: number;
  naoConsolidadoValue: number;
  naoRecebidoQty: number;
  naoRecebidoValue: number;
  repasseTotalConsolidadoTabela: number;
  repasseTotalConsolidadoAConferir: number;
  hasDivergencia: boolean;
  divergenciaValue: number;
  repasseFinalValue: number;
  produtividadeValue: number;
  percentualProdutividadeValue: number;
  totalFinalValue: number;
  hasRepasseFinalOverride: boolean;
  lastProcessedAt: string | null;
  errorMessage: string | null;
  note: string | null;
  internalNote: string | null;
  paymentMinimumText: string | null;
  lastPdfAt: string | null;
  lastPdfArtifactId: string | null;
};

type ProfessionalDetailsModalProps = {
  open: boolean;
  item: ProfessionalSummary | null;
  periodRef: string;
  mainRows: RepasseAConferirMainRow[];
  rows: RepasseLine[];
  loadingRows: boolean;
  rowsError: string;
  noteValue: string;
  internalNoteValue: string;
  canEdit: boolean;
  savingNote: boolean;
  marksByRowHash: Record<string, RepasseConsolidacaoLineMarkColor | null>;
  savingMarks: boolean;
  legend: RepasseConsolidacaoMarkLegend;
  savingLegend: boolean;
  onClose: () => void;
  onNoteChange: (value: string) => void;
  onInternalNoteChange: (value: string) => void;
  onSaveNote: () => void;
  onMarkChange: (sourceRowHash: string, color: RepasseConsolidacaoLineMarkColor | null) => void;
  onSaveMarks: () => void;
  onLegendChange: (next: RepasseConsolidacaoMarkLegend) => void;
  onSaveLegend: () => void;
};

const formatCurrency = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const toBrDate = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[1]}/${br[2]}/${br[3]}`;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return raw;
};

const markRowClass = (color: RepasseConsolidacaoLineMarkColor | null | undefined) => {
  if (color === 'green') return 'bg-emerald-50';
  if (color === 'yellow') return 'bg-amber-50';
  if (color === 'red') return 'bg-rose-50';
  return '';
};

const markButtonClass = (active: boolean, color: RepasseConsolidacaoLineMarkColor) => {
  const base = 'rounded border px-2 py-1 text-[10px] font-semibold';
  if (color === 'green') {
    return `${base} ${
      active ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-emerald-300 bg-white text-emerald-700'
    }`;
  }
  if (color === 'yellow') {
    return `${base} ${
      active ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-300 bg-white text-amber-700'
    }`;
  }
  return `${base} ${
    active ? 'border-rose-500 bg-rose-500 text-white' : 'border-rose-300 bg-white text-rose-700'
  }`;
};

const statusBadgeClass: Record<RepasseAConferirMainRow['detailStatus'], string> = {
  CONSOLIDADO: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  NAO_CONSOLIDADO: 'border-amber-300 bg-amber-50 text-amber-700',
  NAO_RECEBIDO: 'border-rose-300 bg-rose-50 text-rose-700',
  SEM_CORRESPONDENCIA: 'border-slate-300 bg-slate-100 text-slate-700',
};

export function ProfessionalDetailsModal({
  open,
  item,
  periodRef,
  mainRows,
  rows,
  loadingRows,
  rowsError,
  noteValue,
  internalNoteValue,
  canEdit,
  savingNote,
  marksByRowHash,
  savingMarks,
  legend,
  savingLegend,
  onClose,
  onNoteChange,
  onInternalNoteChange,
  onSaveNote,
  onMarkChange,
  onSaveMarks,
  onLegendChange,
  onSaveLegend,
}: ProfessionalDetailsModalProps) {
  const [expandedByRow, setExpandedByRow] = useState<Record<string, boolean>>({});

  const rowsForManualControl = useMemo(
    () => mainRows.map((row) => ({ sourceRowHash: row.rowKey, detailRepasseValue: row.repasseConsolidadoValue })),
    [mainRows]
  );

  const toggleRow = (rowKey: string) => {
    setExpandedByRow((prev) => ({
      ...prev,
      [rowKey]: !prev[rowKey],
    }));
  };

  if (!open || !item) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[92vh] min-h-0 w-full max-w-[1600px] flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Detalhes do profissional</h3>
            <p className="text-xs text-slate-500">
              {item.professionalName} | Período: {periodRef}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded border px-2 py-1 text-xs text-slate-700">
            <span className="inline-flex items-center gap-1">
              <X size={13} />
              Fechar
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 border-b bg-slate-50 px-4 py-3 md:grid-cols-10">
          <div className="rounded border bg-white px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Execução</div>
            <div className="text-sm font-semibold text-slate-700">
              {item.execucaoPending ? 'N/D' : `${item.execucaoQty} | ${formatCurrency(item.execucaoValue)}`}
            </div>
          </div>
          <div className="rounded border bg-white px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Produção (Feegow)</div>
            <div className="text-sm font-semibold text-slate-800">
              {item.producaoQty} | {formatCurrency(item.producaoValue)}
            </div>
          </div>
          <div className="rounded border bg-white px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Atendimentos</div>
            <div className="text-base font-bold text-slate-800">{item.rowsCount}</div>
          </div>
          <div className="rounded border bg-white px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Total repasse</div>
            <div className="text-base font-bold text-slate-800">{formatCurrency(item.totalValue)}</div>
          </div>
          <div className="rounded border bg-white px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Consolidado</div>
            <div className="text-sm font-semibold text-emerald-700">
              {item.consolidadoQty} | {formatCurrency(item.consolidadoValue)}
            </div>
          </div>
          <div className="rounded border bg-white px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Não consolidado</div>
            <div className="text-sm font-semibold text-amber-700">
              {item.naoConsolidadoQty} | {formatCurrency(item.naoConsolidadoValue)}
            </div>
          </div>
          <div className="rounded border bg-white px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Não recebido</div>
            <div className="text-sm font-semibold text-rose-700">
              {item.naoRecebidoQty} | {formatCurrency(item.naoRecebidoValue)}
            </div>
          </div>
          <div className="rounded border bg-white px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Repasse final</div>
            <div className="text-sm font-semibold text-slate-800">{formatCurrency(item.repasseFinalValue)}</div>
          </div>
          <div className="rounded border bg-white px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Produtividade</div>
            <div className="text-sm font-semibold text-slate-800">{formatCurrency(item.produtividadeValue)}</div>
          </div>
          <div className="rounded border bg-white px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">5% + Total final</div>
            <div className="text-xs font-semibold text-slate-700">{formatCurrency(item.percentualProdutividadeValue)}</div>
            <div className="text-sm font-bold text-emerald-700">{formatCurrency(item.totalFinalValue)}</div>
          </div>
          <div className="rounded border bg-white px-3 py-2 md:col-span-10">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Pagamento mínimo</div>
            <div className="text-sm font-semibold text-slate-700">{item.paymentMinimumText || '-'}</div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto px-4 py-3 xl:grid-cols-[minmax(0,1fr)_430px] xl:overflow-hidden">
          <div className="flex min-h-0 flex-col rounded-lg border">
            <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Atendimentos do período
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[1650px] text-xs">
                <thead className="sticky top-0 bg-white text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-10 px-2 py-2 text-center">+</th>
                    <th
                      className="cursor-help px-2 py-2 text-left"
                      title="Data de execução do procedimento"
                    >
                      Data execução
                    </th>
                    <th className="px-2 py-2 text-left">Paciente</th>
                    <th className="px-2 py-2 text-left">Unidade</th>
                    <th className="px-2 py-2 text-left">Procedimento</th>
                    <th className="px-2 py-2 text-left">Especialidade</th>
                    <th
                      className="cursor-help px-2 py-2 text-left"
                      title="Fonte: Feegow > Financeiro > Repasses > Consolidação"
                    >
                      Data da conta
                    </th>
                    <th
                      className="cursor-help px-2 py-2 text-right"
                      title="Fonte: Feegow > Financeiro > Repasses > Repasse Consolidado"
                    >
                      Repasse consolidado
                    </th>
                    <th
                      className="cursor-help px-2 py-2 text-right"
                      title="Valor de repasse em Feegow > Financeiro > Repasses > Consolidação"
                    >
                      Repasse a conferir
                    </th>
                    <th
                      className="cursor-help px-2 py-2 text-left"
                      title="Indica se repasse foi consolidado em Feegow > Financeiro > Repasses > Consolidação"
                    >
                      Status consolidação
                    </th>
                    <th
                      className="cursor-help px-2 py-2 text-left"
                      title="Indica a confiabilidade do cruzamento do procedimento entre os relatórios de Consolidação e Repasses Consolidados do Feegow."
                    >
                      Vínculo
                    </th>
                    <th className="px-2 py-2 text-center">Classificação</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingRows ? (
                    <tr>
                      <td colSpan={12} className="px-2 py-8 text-center text-slate-500">
                        <span className="inline-flex items-center gap-2">
                          <Loader2 size={14} className="animate-spin" />
                          Carregando atendimentos...
                        </span>
                      </td>
                    </tr>
                  ) : rowsError ? (
                    <tr>
                      <td colSpan={12} className="px-2 py-8 text-center text-rose-700">
                        {rowsError}
                      </td>
                    </tr>
                  ) : mainRows.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-2 py-8 text-center text-slate-500">
                        Sem atendimentos para este profissional no período.
                      </td>
                    </tr>
                  ) : (
                    mainRows.map((row) => {
                      const isExpanded = Boolean(expandedByRow[row.rowKey]);
                      const mark = marksByRowHash[row.rowKey] || null;
                      return (
                        <Fragment key={row.rowKey}>
                          <tr className={`border-t text-slate-700 ${markRowClass(mark)}`}>
                            <td className="px-2 py-1.5 text-center">
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded border p-1 text-slate-600 hover:bg-slate-100"
                                onClick={() => toggleRow(row.rowKey)}
                              >
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                            </td>
                            <td className="px-2 py-1.5">{toBrDate(row.executionDate)}</td>
                            <td className="px-2 py-1.5">{row.patientName || '-'}</td>
                            <td className="px-2 py-1.5">{row.unitName || '-'}</td>
                            <td className="px-2 py-1.5">{row.procedureName || '-'}</td>
                            <td className="px-2 py-1.5">{row.specialtyName || '-'}</td>
                            <td className="px-2 py-1.5">{toBrDate(row.accountDate)}</td>
                            <td className="px-2 py-1.5 text-right font-semibold text-slate-800">
                              {formatCurrency(row.repasseConsolidadoValue)}
                            </td>
                            <td className="px-2 py-1.5 text-right font-semibold text-slate-700">
                              {formatCurrency(row.repasseAConferirValue)}
                            </td>
                            <td className="px-2 py-1.5">
                              <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass[row.detailStatus]}`}>
                                {row.detailStatusText || row.detailStatus}
                              </span>
                            </td>
                            <td className="px-2 py-1.5">
                              {row.hasMatch ? (
                                row.matchConfidence === 'HIGH' ? (
                                  <span className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                    Alta confiança
                                  </span>
                                ) : (
                                  <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                    Fallback
                                  </span>
                                )
                              ) : (
                                <span className="rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                  Sem correspondência
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center justify-center gap-1">
                                {(['green', 'yellow', 'red'] as RepasseConsolidacaoLineMarkColor[]).map((color) => (
                                  <button
                                    key={color}
                                    type="button"
                                    onClick={() => onMarkChange(row.rowKey, mark === color ? null : color)}
                                    className={markButtonClass(mark === color, color)}
                                    title={legend[color]}
                                  >
                                    {legend[color]}
                                  </button>
                                ))}
                              </div>
                            </td>
                          </tr>

                          {isExpanded ? (
                            <tr className="border-t bg-slate-50/50">
                              <td colSpan={12} className="px-3 py-3">
                                <div className="overflow-auto rounded border bg-white">
                                  <table className="w-full min-w-[980px] text-xs">
                                    <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                                      <tr>
                                        <th className="px-2 py-2 text-left">Requisitante</th>
                                        <th className="px-2 py-2 text-left">Convênio</th>
                                        <th className="px-2 py-2 text-left">Recibo</th>
                                        <th
                                          className="cursor-help px-2 py-2 text-right"
                                          title="Valor cobrado pelo atendimento."
                                        >
                                          Valor (conta)
                                        </th>
                                        <th className="px-2 py-2 text-right">Repasse item</th>
                                        <th className="px-2 py-2 text-left">Detalhe consolidação</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {row.expandedItems.length === 0 ? (
                                        <tr>
                                          <td colSpan={6} className="px-2 py-3 text-center text-slate-500">
                                            Sem detalhes de consolidação para esta linha.
                                          </td>
                                        </tr>
                                      ) : (
                                        row.expandedItems.map((detail, idx) => (
                                          <tr key={`${row.rowKey}-${idx}`} className="border-t text-slate-700">
                                            <td className="px-2 py-1.5">{detail.requesterName || '-'}</td>
                                            <td className="px-2 py-1.5">{detail.convenio || '-'}</td>
                                            <td className="px-2 py-1.5">{detail.invoiceId || '-'}</td>
                                            <td className="px-2 py-1.5 text-right">{formatCurrency(detail.attendanceValue)}</td>
                                            <td className="px-2 py-1.5 text-right font-medium">
                                              {formatCurrency(detail.detailRepasseValue)}
                                            </td>
                                            <td className="px-2 py-1.5">{detail.detailStatusText || '-'}</td>
                                          </tr>
                                        ))
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
            <ManualMarkingPanel rows={rowsForManualControl} marks={marksByRowHash} legend={legend} />

            <div className="flex justify-end">
              <button
                type="button"
                onClick={onSaveMarks}
                disabled={!canEdit || savingMarks}
                className="inline-flex items-center gap-2 rounded border bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                {savingMarks ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar marcações
              </button>
            </div>

            <ManualLegendEditor
              legend={legend}
              disabled={!canEdit}
              saving={savingLegend}
              onChange={onLegendChange}
              onSave={onSaveLegend}
            />

            <div className="rounded-lg border bg-slate-50 p-3">
              <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <MessageSquareText size={14} />
                Observação do relatório
              </div>
              <textarea
                value={noteValue}
                onChange={(e) => onNoteChange(e.target.value)}
                placeholder="Este texto será incluído no relatório."
                className="min-h-[120px] w-full resize-y rounded border bg-white px-3 py-2 text-sm outline-none"
                disabled={!canEdit}
              />
            </div>

            <div className="rounded-lg border bg-slate-50 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Observação interna
              </div>
              <textarea
                value={internalNoteValue}
                onChange={(e) => onInternalNoteChange(e.target.value)}
                placeholder="Anotação interna (não vai para o relatório)."
                className="min-h-[110px] w-full resize-y rounded border bg-white px-3 py-2 text-sm outline-none"
                disabled={!canEdit}
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={onSaveNote}
                disabled={!canEdit || savingNote}
                className="inline-flex items-center gap-2 rounded border bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                {savingNote ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar observações
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
