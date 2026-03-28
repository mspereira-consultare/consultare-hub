'use client';

import { Briefcase, DollarSign, FileText, Loader2, PieChart, Search, TrendingUp } from 'lucide-react';
import { ProposalsStatusCards } from './ProposalsStatusCards';
import { formatCurrency, toNumber } from './formatters';
import type { GroupedUnit, SellerRow, SortKey, Summary } from './types';

type Props = {
  loading: boolean;
  summary: Summary;
  unitData: GroupedUnit[];
  sellerData: SellerRow[];
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  sortIndicator: (key: SortKey) => string;
  onToggleSort: (key: SortKey) => void;
  percentageOfTotal: (value: number) => number;
  onOpenAwaitingBase: () => void;
};

export function ProposalsOverviewSection({
  loading,
  summary,
  unitData,
  sellerData,
  searchTerm,
  onSearchTermChange,
  sortIndicator,
  onToggleSort,
  percentageOfTotal,
  onOpenAwaitingBase,
}: Props) {
  const avgTicket = summary.qtd > 0 ? summary.valor / summary.qtd : 0;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Visão gerencial</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-slate-500 text-[11px] font-bold uppercase tracking-wider mb-1">Total de propostas</p>
            <h3 className="text-2xl font-bold text-slate-800">{summary.qtd}</h3>
            <div className="mt-2 flex items-center gap-1 text-xs text-blue-600 font-medium">
              <FileText size={12} />
              <span>100% do volume</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-slate-500 text-[11px] font-bold uppercase tracking-wider mb-1">Valor total</p>
            <h3 className="text-2xl font-bold text-slate-800">{formatCurrency(summary.valor)}</h3>
            <div className="mt-2 flex items-center gap-1 text-xs text-emerald-600 font-medium">
              <DollarSign size={12} />
              <span>{summary.qtd} propostas · 100% do valor</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-slate-500 text-[11px] font-bold uppercase tracking-wider mb-1">Convertido (ganho)</p>
            <h3 className="text-2xl font-bold text-slate-800">{formatCurrency(summary.wonValue)}</h3>
            <div className="mt-2 flex items-center gap-1 text-xs text-purple-600 font-medium">
              <TrendingUp size={12} />
              <span>
                {summary.wonQtd} propostas · {percentageOfTotal(summary.wonValue).toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-slate-500 text-[11px] font-bold uppercase tracking-wider mb-1">Taxa de conversão</p>
            <h3 className="text-2xl font-bold text-slate-800">{summary.conversionRate.toFixed(1)}%</h3>
            <div className="mt-2 flex items-center gap-1 text-xs text-amber-600 font-medium">
              <PieChart size={12} />
              <span>
                {summary.wonQtd} de {summary.qtd} propostas
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-slate-500 text-[11px] font-bold uppercase tracking-wider mb-1">Ticket médio</p>
            <h3 className="text-2xl font-bold text-slate-800">{formatCurrency(avgTicket)}</h3>
            <div className="mt-2 flex items-center gap-1 text-xs text-slate-600 font-medium">
              <DollarSign size={12} />
              <span>{summary.qtd} propostas no cálculo</span>
            </div>
          </div>
        </div>
      </div>

      <ProposalsStatusCards
        summary={summary}
        percentageOfTotal={percentageOfTotal}
        onOpenAwaitingBase={onOpenAwaitingBase}
      />

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 animate-in fade-in">
          <Loader2 size={40} className="animate-spin mb-4 text-blue-600" />
          <p>Carregando análises...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-1">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-slate-500" />
              Performance por unidade
            </h2>

            <div className="space-y-4">
              {unitData.map((unit, index) => (
                <div
                  key={`${unit.name}-${index}`}
                  className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-bold text-slate-800">{unit.name || 'Sem unidade'}</h4>
                      <span className="text-xs text-slate-500">{unit.qtd} propostas</span>
                    </div>
                    <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-bold">
                      {formatCurrency(unit.total)}
                    </span>
                  </div>

                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex">
                    <div style={{ width: '100%' }} className="bg-blue-500 h-full opacity-80" />
                  </div>
                </div>
              ))}
              {unitData.length === 0 ? (
                <p className="text-slate-400 text-sm italic">Nenhum dado por unidade.</p>
              ) : null}
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 gap-4 flex-col sm:flex-row">
                <h2 className="font-bold text-slate-800">Ranking profissional</h2>
                <div className="relative w-full sm:w-64">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filtrar profissional..."
                    value={searchTerm}
                    onChange={(event) => onSearchTermChange(event.target.value)}
                    className="pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none w-full"
                  />
                </div>
              </div>

              <div className="overflow-auto max-h-[560px]">
                <table className="w-full text-left">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500 font-semibold">
                    <tr>
                      <th className="px-4 py-3">
                        <button
                          onClick={() => onToggleSort('professional_name')}
                          className="inline-flex items-center gap-1 hover:text-slate-700"
                        >
                          Profissional <span>{sortIndicator('professional_name')}</span>
                        </button>
                      </th>
                      <th className="px-4 py-3 text-right">
                        <button onClick={() => onToggleSort('qtd')} className="inline-flex items-center gap-1 hover:text-slate-700">
                          Qtd <span>{sortIndicator('qtd')}</span>
                        </button>
                      </th>
                      <th className="px-4 py-3 text-right">
                        <button
                          onClick={() => onToggleSort('qtd_executado')}
                          className="inline-flex items-center gap-1 hover:text-slate-700"
                        >
                          Exec. qtd <span>{sortIndicator('qtd_executado')}</span>
                        </button>
                      </th>
                      <th className="px-4 py-3 text-right">
                        <button onClick={() => onToggleSort('valor')} className="inline-flex items-center gap-1 hover:text-slate-700">
                          Total estimado <span>{sortIndicator('valor')}</span>
                        </button>
                      </th>
                      <th className="px-4 py-3 text-right">
                        <button
                          onClick={() => onToggleSort('valor_executado')}
                          className="inline-flex items-center gap-1 hover:text-slate-700"
                        >
                          Total executado <span>{sortIndicator('valor_executado')}</span>
                        </button>
                      </th>
                      <th className="px-4 py-3 text-center">
                        <button
                          onClick={() => onToggleSort('conversion_rate')}
                          className="inline-flex items-center gap-1 hover:text-slate-700"
                        >
                          Taxa de conversão <span>{sortIndicator('conversion_rate')}</span>
                        </button>
                      </th>
                      <th className="px-4 py-3 text-center">
                        <button
                          onClick={() => onToggleSort('ticket_medio')}
                          className="inline-flex items-center gap-1 hover:text-slate-700"
                        >
                          Ticket médio <span>{sortIndicator('ticket_medio')}</span>
                        </button>
                      </th>
                      <th className="px-4 py-3 text-center">
                        <button
                          onClick={() => onToggleSort('ticket_exec')}
                          className="inline-flex items-center gap-1 hover:text-slate-700"
                        >
                          Ticket exec. <span>{sortIndicator('ticket_exec')}</span>
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {sellerData.map((seller, index) => (
                      <tr
                        key={`${seller.professional_name || 'sistema'}-${index}`}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-slate-700">{seller.professional_name || 'Sistema'}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{toNumber(seller.qtd)}</td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-semibold">{toNumber(seller.qtd_executado)}</td>
                        <td className="px-4 py-3 text-right text-slate-700 font-semibold">
                          {formatCurrency(toNumber(seller.valor))}
                        </td>
                        <td className="px-4 py-3 text-right font-bold">
                          <span className="text-emerald-600">{formatCurrency(toNumber(seller.valor_executado))}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-600 text-xs font-semibold">
                          {toNumber(seller.valor) > 0
                            ? `${((toNumber(seller.valor_executado) / toNumber(seller.valor)) * 100).toFixed(1)}%`
                            : '0,0%'}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-400 text-xs">
                          {formatCurrency(toNumber(seller.valor) / Math.max(toNumber(seller.qtd), 1))}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-400 text-xs">
                          {formatCurrency(
                            toNumber(seller.valor_executado) / Math.max(toNumber(seller.qtd_executado), 1),
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sellerData.length === 0 ? (
                  <p className="text-center text-slate-400 py-6 text-sm">Nenhum profissional encontrado.</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
