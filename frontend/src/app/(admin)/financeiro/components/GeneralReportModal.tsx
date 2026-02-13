'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, FileSpreadsheet, FileText, Loader2, RefreshCw } from 'lucide-react';

type UnitKey = 'all' | 'campinas_shopping' | 'ouro_verde' | 'centro_cambui' | 'resolve_saude';

type YearRow = {
  year: number;
  months: number[];
  total: number;
  accumulatedRef: number;
  highlights: boolean[];
};

type SectionReport = {
  key: UnitKey;
  label: string;
  referenceYearApplied: number | null;
  referenceAccumulated: number;
  bestHistoricalAccumulated: number;
  previousYearAccumulated: number;
  growthVsBest: number | null;
  growthVsPreviousYear: number | null;
  rows: YearRow[];
};

type ReportPayload = {
  generatedAt: string;
  referenceMonthRef: string;
  referenceYear: number;
  referenceMonth: number;
  referenceMonthLabel: string;
  accumulationCutoffBr: string;
  accumulationRuleLabel: string;
  unitFilter: UnitKey;
  availableUnits: Array<{ key: UnitKey; label: string }>;
  sections: SectionReport[];
};

type Props = {
  open: boolean;
  onClose: () => void;
};

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Marco',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const toMoney = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

const toPercent = (value: number | null) => (value === null ? '-' : `${value.toFixed(1).replace('.', ',')}%`);

const parseFilenameFromDisposition = (disposition: string | null, fallback: string) => {
  if (!disposition) return fallback;
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] || fallback;
};

export const GeneralReportModal = ({ open, onClose }: Props) => {
  const [unit, setUnit] = useState<UnitKey>('all');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null);
  const [error, setError] = useState<string>('');
  const [data, setData] = useState<ReportPayload | null>(null);

  const fetchReport = async () => {
    if (!open) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        unit,
        format: 'json',
      });
      const res = await fetch(`/api/admin/financial/general-report?${params.toString()}`);
      const body = await res.json();
      if (!res.ok || body?.status !== 'success') {
        throw new Error(body?.error || 'Falha ao carregar relatorio.');
      }
      setData(body.data as ReportPayload);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar relatorio.');
    } finally {
      setLoading(false);
    }
  };

  const exportFile = async (format: 'pdf' | 'xlsx') => {
    setExporting(format);
    setError('');
    try {
      const params = new URLSearchParams({
        unit,
        format,
      });
      const res = await fetch(`/api/admin/financial/general-report?${params.toString()}`);
      if (!res.ok) {
        let message = `Falha ao exportar ${format.toUpperCase()}.`;
        try {
          const body = await res.json();
          message = body?.error || message;
        } catch {
          // noop
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const reference = data?.referenceMonthRef || 'referencia-auto';
      const fileName = parseFilenameFromDisposition(
        res.headers.get('content-disposition'),
        `faturamento-geral-${reference}-${unit}.${format}`
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || `Falha ao exportar ${format.toUpperCase()}.`);
    } finally {
      setExporting(null);
    }
  };

  useEffect(() => {
    if (!open) return;
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unit]);

  const generatedLabel = useMemo(() => {
    if (!data?.generatedAt) return '-';
    const parsed = new Date(data.generatedAt);
    if (Number.isNaN(parsed.getTime())) return data.generatedAt;
    return parsed.toLocaleString('pt-BR');
  }, [data?.generatedAt]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-[1400px] bg-white rounded-2xl border border-slate-200 shadow-xl mt-8 mb-8">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Relatorio Geral de Faturamento</h2>
            <p className="text-xs text-slate-500">Base: faturamento_analitico | Gerado em: {generatedLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm text-slate-700">
              <span className="block text-xs uppercase tracking-wide font-semibold text-slate-500 mb-1">Unidade</span>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as UnitKey)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {(data?.availableUnits || [{ key: 'all', label: 'Todas unidades' }]).map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end gap-2 justify-start md:justify-end">
              <button
                onClick={fetchReport}
                disabled={loading}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-100 disabled:opacity-60"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Atualizar
              </button>
              <button
                onClick={() => exportFile('pdf')}
                disabled={Boolean(exporting)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-60"
              >
                {exporting === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                Exportar PDF
              </button>
              <button
                onClick={() => exportFile('xlsx')}
                disabled={Boolean(exporting)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-60"
              >
                {exporting === 'xlsx' ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
                Exportar XLSX
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        </div>

        <div className="p-5 space-y-6 max-h-[70vh] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-16 text-slate-600">
              <Loader2 className="animate-spin mr-2" size={18} />
              Carregando relatorio...
            </div>
          )}

          {!loading && data?.sections?.length === 0 && (
            <div className="text-sm text-slate-500">Sem dados para o periodo selecionado.</div>
          )}

          {!loading &&
            (data?.sections || []).map((section) => (
              <section key={section.key} className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-[#053F74] text-white">
                  <h3 className="text-sm font-bold">{section.label}</h3>
                  <p className="text-xs text-slate-100">
                    Referencia: {data?.referenceMonthLabel || '-'}
                    /{section.referenceYearApplied ?? data?.referenceYear ?? '-'}
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-[1100px] w-full text-xs">
                    <thead className="bg-[#17407E] text-white">
                      <tr>
                        <th className="px-2 py-2 text-left">Ano</th>
                        {MONTH_NAMES.map((month) => (
                          <th key={month} className="px-2 py-2 text-right">
                            {month}
                          </th>
                        ))}
                        <th className="px-2 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {section.rows.map((row) => (
                        <tr key={`${section.key}-${row.year}`} className="hover:bg-slate-50">
                          <td className="px-2 py-2 font-semibold text-slate-700">{row.year}</td>
                          {row.months.map((value, idx) => (
                            <td
                              key={`${row.year}-${idx}`}
                              className={`px-2 py-2 text-right ${
                                row.highlights[idx] ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-slate-700'
                              }`}
                            >
                              {toMoney(value)}
                            </td>
                          ))}
                          <td className="px-2 py-2 text-right font-bold text-slate-800 bg-slate-50">{toMoney(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-slate-50 border-t border-slate-200">
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
                      Crescimento vs melhor ano ({data?.accumulationRuleLabel || 'acumulado ate ontem'})
                    </p>
                    <p className="text-lg font-bold text-emerald-700">{toPercent(section.growthVsBest)}</p>
                    <p className="text-xs text-slate-500">
                      Ref: {toMoney(section.referenceAccumulated)} | Melhor historico: {toMoney(section.bestHistoricalAccumulated)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
                      Crescimento vs ano anterior ({data?.accumulationRuleLabel || 'acumulado ate ontem'})
                    </p>
                    <p className="text-lg font-bold text-teal-700">{toPercent(section.growthVsPreviousYear)}</p>
                    <p className="text-xs text-slate-500">
                      Ref: {toMoney(section.referenceAccumulated)} | Ano anterior: {toMoney(section.previousYearAccumulated)}
                    </p>
                  </div>
                </div>
              </section>
            ))}
        </div>
      </div>
    </div>
  );
};
