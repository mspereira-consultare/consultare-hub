'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Briefcase,
  DollarSign,
  FileText,
  Loader2,
  PieChart,
  Search,
  TrendingUp,
} from 'lucide-react';
import { ProposalsDetailSection } from './components/ProposalsDetailSection';
import { ProposalsFiltersPanel } from './components/ProposalsFiltersPanel';
import { ProposalsStatusCards } from './components/ProposalsStatusCards';
import { AWAITING_CLIENT_APPROVAL_STATUS } from '@/lib/proposals/constants';
import { formatCurrency, toNumber } from './components/formatters';
import type { GroupedUnit, ProposalDetailResponse, SellerRow, SortKey, Summary, UnitRow } from './components/types';

const EMPTY_SUMMARY: Summary = {
  qtd: 0,
  valor: 0,
  wonValue: 0,
  wonQtd: 0,
  lostValue: 0,
  conversionRate: 0,
  awaitingClientApprovalQtd: 0,
  awaitingClientApprovalValue: 0,
  approvedByClientQtd: 0,
  approvedByClientValue: 0,
  rejectedByClientQtd: 0,
  rejectedByClientValue: 0,
};

const EMPTY_DETAIL_DATA: ProposalDetailResponse = {
  rows: [],
  page: 1,
  pageSize: 25,
  totalRows: 0,
  totalPages: 1,
  detailStatusApplied: AWAITING_CLIENT_APPROVAL_STATUS,
};

export default function ProposalsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'valor',
    direction: 'desc',
  });

  const today = new Date();
  const [dateRange, setDateRange] = useState({
    start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0],
    end: today.toISOString().split('T')[0],
  });

  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [unitData, setUnitData] = useState<GroupedUnit[]>([]);
  const [sellerData, setSellerData] = useState<SellerRow[]>([]);
  const [availableUnits, setAvailableUnits] = useState<string[]>([]);
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  const [heartbeat, setHeartbeat] = useState<any>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const [detailData, setDetailData] = useState<ProposalDetailResponse>(EMPTY_DETAIL_DATA);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailExporting, setDetailExporting] = useState(false);
  const [detailStatus, setDetailStatus] = useState(AWAITING_CLIENT_APPROVAL_STATUS);
  const [detailSearchInput, setDetailSearchInput] = useState('');
  const [detailSearch, setDetailSearch] = useState('');
  const [detailPage, setDetailPage] = useState(1);

  const detailSectionRef = useRef<HTMLDivElement | null>(null);
  const previousGlobalStatusRef = useRef('all');

  const avgTicket = summary.qtd > 0 ? summary.valor / summary.qtd : 0;
  const percentageOfTotal = (value: number) => (summary.valor > 0 ? (value / summary.valor) * 100 : 0);

  const processUnitData = (rows: UnitRow[]) => {
    const grouped = new Map<string, GroupedUnit>();

    rows.forEach((row) => {
      const key = String(row.unit_name || 'Sem unidade').trim() || 'Sem unidade';
      const current = grouped.get(key) || { name: key, total: 0, qtd: 0 };
      current.total += toNumber(row.valor);
      current.qtd += toNumber(row.qtd);
      grouped.set(key, current);
    });

    const groupedRows = Array.from(grouped.values()).sort((a, b) => b.total - a.total);
    setUnitData(groupedRows);

    if (selectedUnit === 'all') {
      setAvailableUnits(groupedRows.map((item) => item.name).filter(Boolean));
    }
  };

  const fetchData = useCallback(
    async (forceFresh = false) => {
      if (!heartbeat) setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams({
          startDate: dateRange.start,
          endDate: dateRange.end,
          unit: selectedUnit,
          status: selectedStatus,
        });
        if (forceFresh) params.set('refresh', Date.now().toString());

        const response = await fetch(`/api/admin/propostas?${params.toString()}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || 'Falha ao carregar propostas.');

        processUnitData((payload.byUnit || []) as UnitRow[]);
        setSellerData((payload.byProposer || []) as SellerRow[]);

        const incomingStatuses = Array.isArray(payload.availableStatuses)
          ? payload.availableStatuses.map((item: unknown) => String(item || '').trim()).filter(Boolean)
          : [];
        setAvailableStatuses(incomingStatuses);

        const rawSummary = payload.summary || {};
        setSummary({
          qtd: toNumber(rawSummary.qtd),
          valor: toNumber(rawSummary.valor),
          wonValue: toNumber(rawSummary.wonValue),
          wonQtd: toNumber(rawSummary.wonQtd),
          lostValue: toNumber(rawSummary.lostValue),
          conversionRate: toNumber(rawSummary.conversionRate),
          awaitingClientApprovalQtd: toNumber(rawSummary.awaitingClientApprovalQtd),
          awaitingClientApprovalValue: toNumber(rawSummary.awaitingClientApprovalValue),
          approvedByClientQtd: toNumber(rawSummary.approvedByClientQtd),
          approvedByClientValue: toNumber(rawSummary.approvedByClientValue),
          rejectedByClientQtd: toNumber(rawSummary.rejectedByClientQtd),
          rejectedByClientValue: toNumber(rawSummary.rejectedByClientValue),
        });

        if (payload.heartbeat) {
          setHeartbeat(payload.heartbeat);
          if (payload.heartbeat.status === 'RUNNING' || payload.heartbeat.status === 'PENDING') {
            window.setTimeout(() => fetchData(true), 3000);
            setIsUpdating(true);
          } else {
            setIsUpdating(false);
          }
        }
      } catch (fetchError) {
        console.error('Erro ao buscar dados de propostas:', fetchError);
        setError(fetchError instanceof Error ? fetchError.message : 'Erro ao carregar propostas.');
        setIsUpdating(false);
      } finally {
        setLoading(false);
      }
    },
    [dateRange.end, dateRange.start, heartbeat, selectedStatus, selectedUnit],
  );

  const fetchDetailData = useCallback(async () => {
    setDetailLoading(true);
    setDetailError('');

    try {
      const params = new URLSearchParams({
        startDate: dateRange.start,
        endDate: dateRange.end,
        unit: selectedUnit,
        status: selectedStatus,
        detailStatus,
        search: detailSearch,
        page: String(detailPage),
        pageSize: String(EMPTY_DETAIL_DATA.pageSize),
      });

      const response = await fetch(`/api/admin/propostas/details?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Falha ao carregar a base detalhada.');

      setDetailData(payload?.data || EMPTY_DETAIL_DATA);
      setDetailPage(Number(payload?.data?.page) || 1);
    } catch (fetchError) {
      console.error('Erro ao carregar base detalhada de propostas:', fetchError);
      setDetailError(fetchError instanceof Error ? fetchError.message : 'Erro ao carregar a base detalhada.');
      setDetailData(EMPTY_DETAIL_DATA);
    } finally {
      setDetailLoading(false);
    }
  }, [dateRange.end, dateRange.start, detailPage, detailSearch, detailStatus, selectedStatus, selectedUnit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchDetailData();
  }, [fetchDetailData]);

  useEffect(() => {
    if (selectedStatus === 'all') return;
    if (availableStatuses.includes(selectedStatus)) return;
    setSelectedStatus('all');
  }, [availableStatuses, selectedStatus]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDetailSearch(detailSearchInput.trim());
      setDetailPage(1);
    }, 350);
    return () => window.clearTimeout(timeoutId);
  }, [detailSearchInput]);

  useEffect(() => {
    if (selectedStatus !== 'all') {
      setDetailStatus(selectedStatus);
      setDetailPage(1);
    } else if (previousGlobalStatusRef.current !== 'all') {
      setDetailStatus(AWAITING_CLIENT_APPROVAL_STATUS);
      setDetailPage(1);
    }
    previousGlobalStatusRef.current = selectedStatus;
  }, [selectedStatus]);

  const filteredSellers = useMemo(
    () =>
      sellerData.filter((seller) =>
        String(seller.professional_name || 'Sistema').toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [sellerData, searchTerm],
  );

  const getSortValue = (seller: SellerRow, key: SortKey) => {
    if (key === 'professional_name') return String(seller.professional_name || 'Sistema').toLowerCase();
    if (key === 'conversion_rate') {
      const total = toNumber(seller.valor);
      const executed = toNumber(seller.valor_executado);
      return total > 0 ? (executed / total) * 100 : 0;
    }
    if (key === 'ticket_medio') {
      return toNumber(seller.valor) / Math.max(toNumber(seller.qtd), 1);
    }
    if (key === 'ticket_exec') {
      return toNumber(seller.valor_executado) / Math.max(toNumber(seller.qtd_executado), 1);
    }
    return toNumber((seller as any)[key]);
  };

  const sortedSellers = useMemo(() => {
    return [...filteredSellers].sort((a, b) => {
      const aVal = getSortValue(a, sortConfig.key);
      const bVal = getSortValue(b, sortConfig.key);

      let comparison = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal, 'pt-BR');
      } else {
        comparison = Number(aVal) - Number(bVal);
      }

      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [filteredSellers, sortConfig]);

  const toggleSort = (key: SortKey) => {
    setSortConfig((previous) => {
      if (previous.key === key) {
        return { key, direction: previous.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: key === 'professional_name' ? 'asc' : 'desc' };
    });
  };

  const sortIndicator = (key: SortKey) => {
    if (sortConfig.key !== key) return '↕';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const handleManualUpdate = async () => {
    setIsUpdating(true);
    setError('');
    try {
      await fetch('/api/admin/propostas', { method: 'POST' });
      window.setTimeout(() => fetchData(true), 1000);
    } catch (updateError) {
      console.error('Erro ao solicitar atualização de propostas:', updateError);
      setError(updateError instanceof Error ? updateError.message : 'Erro ao solicitar atualização.');
      setIsUpdating(false);
    }
  };

  const handleOpenAwaitingBase = () => {
    setDetailStatus(AWAITING_CLIENT_APPROVAL_STATUS);
    setDetailPage(1);
    window.setTimeout(() => {
      detailSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  };

  const handleExportDetail = async () => {
    setDetailExporting(true);
    setDetailError('');
    try {
      const params = new URLSearchParams({
        startDate: dateRange.start,
        endDate: dateRange.end,
        unit: selectedUnit,
        status: selectedStatus,
        detailStatus,
        search: detailSearch,
        page: String(detailPage),
        pageSize: String(EMPTY_DETAIL_DATA.pageSize),
      });
      const response = await fetch(`/api/admin/propostas/export?${params.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Falha ao exportar XLSX.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `propostas-detalhadas-${dateRange.start}_${dateRange.end}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      console.error('Erro ao exportar base detalhada:', exportError);
      setDetailError(exportError instanceof Error ? exportError.message : 'Erro ao exportar a base detalhada.');
    } finally {
      setDetailExporting(false);
    }
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen flex flex-col gap-6">
      <ProposalsFiltersPanel
        dateRange={dateRange}
        selectedUnit={selectedUnit}
        selectedStatus={selectedStatus}
        availableUnits={availableUnits}
        availableStatuses={availableStatuses}
        filtersExpanded={filtersExpanded}
        heartbeat={heartbeat}
        isUpdating={isUpdating}
        onChangeDateRange={setDateRange}
        onChangeUnit={setSelectedUnit}
        onChangeStatus={setSelectedStatus}
        onToggleExpanded={() => setFiltersExpanded((prev) => !prev)}
        onManualUpdate={handleManualUpdate}
        onResetFilters={() => {
          setSelectedUnit('all');
          setSelectedStatus('all');
        }}
      />

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {detailError && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{detailError}</div>}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Visão geral</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
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
        onOpenAwaitingBase={handleOpenAwaitingBase}
      />

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 animate-in fade-in">
          <Loader2 size={40} className="animate-spin mb-4 text-blue-600" />
          <p>Carregando análises...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-6">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-slate-500" />
                Performance por unidade
              </h2>

              <div className="space-y-4">
                {unitData.map((unit, index) => (
                  <div key={`${unit.name}-${index}`} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-bold text-slate-800">{unit.name || 'Sem unidade'}</h4>
                        <span className="text-xs text-slate-500">{unit.qtd} propostas</span>
                      </div>
                      <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-bold">{formatCurrency(unit.total)}</span>
                    </div>

                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex">
                      <div style={{ width: '100%' }} className="bg-blue-500 h-full opacity-80" />
                    </div>
                  </div>
                ))}
                {unitData.length === 0 && <p className="text-slate-400 text-sm italic">Nenhum dado por unidade.</p>}
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
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none w-full"
                    />
                  </div>
                </div>

                <div className="overflow-auto max-h-[560px]">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500 font-semibold">
                      <tr>
                        <th className="px-4 py-3">
                          <button onClick={() => toggleSort('professional_name')} className="inline-flex items-center gap-1 hover:text-slate-700">
                            Profissional <span>{sortIndicator('professional_name')}</span>
                          </button>
                        </th>
                        <th className="px-4 py-3 text-right">
                          <button onClick={() => toggleSort('qtd')} className="inline-flex items-center gap-1 hover:text-slate-700">
                            Qtd <span>{sortIndicator('qtd')}</span>
                          </button>
                        </th>
                        <th className="px-4 py-3 text-right">
                          <button onClick={() => toggleSort('qtd_executado')} className="inline-flex items-center gap-1 hover:text-slate-700">
                            Exec. qtd <span>{sortIndicator('qtd_executado')}</span>
                          </button>
                        </th>
                        <th className="px-4 py-3 text-right">
                          <button onClick={() => toggleSort('valor')} className="inline-flex items-center gap-1 hover:text-slate-700">
                            Total estimado <span>{sortIndicator('valor')}</span>
                          </button>
                        </th>
                        <th className="px-4 py-3 text-right">
                          <button onClick={() => toggleSort('valor_executado')} className="inline-flex items-center gap-1 hover:text-slate-700">
                            Total executado <span>{sortIndicator('valor_executado')}</span>
                          </button>
                        </th>
                        <th className="px-4 py-3 text-center">
                          <button onClick={() => toggleSort('conversion_rate')} className="inline-flex items-center gap-1 hover:text-slate-700">
                            Taxa de conversão <span>{sortIndicator('conversion_rate')}</span>
                          </button>
                        </th>
                        <th className="px-4 py-3 text-center">
                          <button onClick={() => toggleSort('ticket_medio')} className="inline-flex items-center gap-1 hover:text-slate-700">
                            Ticket médio <span>{sortIndicator('ticket_medio')}</span>
                          </button>
                        </th>
                        <th className="px-4 py-3 text-center">
                          <button onClick={() => toggleSort('ticket_exec')} className="inline-flex items-center gap-1 hover:text-slate-700">
                            Ticket exec. <span>{sortIndicator('ticket_exec')}</span>
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {sortedSellers.map((seller, index) => (
                        <tr key={`${seller.professional_name || 'sistema'}-${index}`} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-700">{seller.professional_name || 'Sistema'}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{toNumber(seller.qtd)}</td>
                          <td className="px-4 py-3 text-right text-emerald-600 font-semibold">{toNumber(seller.qtd_executado)}</td>
                          <td className="px-4 py-3 text-right text-slate-700 font-semibold">{formatCurrency(toNumber(seller.valor))}</td>
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
                            {formatCurrency(toNumber(seller.valor_executado) / Math.max(toNumber(seller.qtd_executado), 1))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {sortedSellers.length === 0 && !loading && (
                    <p className="text-center text-slate-400 py-6 text-sm">Nenhum profissional encontrado.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div ref={detailSectionRef}>
            <ProposalsDetailSection
              detailData={detailData}
              availableStatuses={availableStatuses.length > 0 ? availableStatuses : [AWAITING_CLIENT_APPROVAL_STATUS]}
              selectedStatus={selectedStatus}
              detailStatus={detailStatus}
              detailSearch={detailSearchInput}
              loading={detailLoading}
              exporting={detailExporting}
              onChangeDetailStatus={(value) => {
                setDetailStatus(value);
                setDetailPage(1);
              }}
              onChangeDetailSearch={setDetailSearchInput}
              onClearDetailFilters={() => {
                setDetailSearchInput('');
                if (selectedStatus === 'all') setDetailStatus(AWAITING_CLIENT_APPROVAL_STATUS);
                setDetailPage(1);
              }}
              onExport={handleExportDetail}
              onChangePage={setDetailPage}
            />
          </div>
        </>
      )}
    </div>
  );
}

