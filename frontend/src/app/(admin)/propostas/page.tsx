'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  ChevronDown,
  ChevronRight,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  FilterX,
  FileText,
  Loader2,
  PieChart,
  RefreshCw,
  Search,
  TrendingUp,
} from 'lucide-react';

type SortKey =
  | 'professional_name'
  | 'qtd'
  | 'qtd_executado'
  | 'valor'
  | 'valor_executado'
  | 'conversion_rate'
  | 'ticket_medio'
  | 'ticket_exec';

type Summary = {
  qtd: number;
  valor: number;
  wonValue: number;
  wonQtd: number;
  lostValue: number;
  conversionRate: number;
  awaitingClientApprovalQtd: number;
  awaitingClientApprovalValue: number;
  approvedByClientQtd: number;
  approvedByClientValue: number;
  rejectedByClientQtd: number;
  rejectedByClientValue: number;
};

type UnitRow = {
  unit_name: string | null;
  status: string | null;
  qtd: number;
  valor: number;
};

type SellerRow = {
  professional_name: string | null;
  qtd: number;
  valor: number;
  qtd_executado: number;
  valor_executado: number;
};

type GroupedUnit = {
  name: string;
  total: number;
  qtd: number;
};

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

function toNumber(value: any): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatLastUpdate(dateString?: string | null): string {
  if (!dateString) return 'Nunca';
  const isoString = dateString.includes('T') ? dateString : dateString.replace(' ', 'T');
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return dateString;
  return parsed.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export default function ProposalsPage() {
  const [loading, setLoading] = useState(true);
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

  const avgTicket = summary.qtd > 0 ? summary.valor / summary.qtd : 0;
  const percentageOfTotal = (value: number) => (summary.valor > 0 ? (value / summary.valor) * 100 : 0);

  const processUnitData = (rows: UnitRow[]) => {
    const grouped = new Map<string, GroupedUnit>();

    rows.forEach((row) => {
      const key = String(row.unit_name || 'Sem Unidade').trim() || 'Sem Unidade';
      const current = grouped.get(key) || { name: key, total: 0, qtd: 0 };
      current.total += toNumber(row.valor);
      current.qtd += toNumber(row.qtd);
      grouped.set(key, current);
    });

    const groupedRows = Array.from(grouped.values()).sort((a, b) => b.total - a.total);
    setUnitData(groupedRows);

    if (selectedUnit === 'all') {
      const units = groupedRows.map((item) => item.name).filter(Boolean);
      setAvailableUnits(units);
    }
  };

  const fetchData = async (forceFresh = false) => {
    if (!heartbeat) setLoading(true);

    try {
      const params = new URLSearchParams({
        startDate: dateRange.start,
        endDate: dateRange.end,
        unit: selectedUnit,
        status: selectedStatus,
      });
      if (forceFresh) params.set('refresh', Date.now().toString());

      const res = await fetch(`/api/admin/propostas?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao carregar propostas');

      processUnitData((data.byUnit || []) as UnitRow[]);
      setSellerData((data.byProposer || []) as SellerRow[]);

      const incomingStatuses = Array.isArray(data.availableStatuses)
        ? data.availableStatuses.map((item: any) => String(item || '').trim()).filter(Boolean)
        : [];
      setAvailableStatuses(incomingStatuses);

      const totalQtd = toNumber(data.summary?.qtd);
      const totalVal = toNumber(data.summary?.valor);
      const wonVal = toNumber(data.summary?.wonValue);
      const wonQtd = toNumber(data.summary?.wonQtd);
      const lostVal = toNumber(data.summary?.lostValue);
      const awaitingClientApprovalQtd = toNumber(data.summary?.awaitingClientApprovalQtd);
      const awaitingClientApprovalValue = toNumber(data.summary?.awaitingClientApprovalValue);
      const approvedByClientQtd = toNumber(data.summary?.approvedByClientQtd);
      const approvedByClientValue = toNumber(data.summary?.approvedByClientValue);
      const rejectedByClientQtd = toNumber(data.summary?.rejectedByClientQtd);
      const rejectedByClientValue = toNumber(data.summary?.rejectedByClientValue);

      setSummary({
        qtd: totalQtd,
        valor: totalVal,
        wonValue: wonVal,
        wonQtd,
        lostValue: lostVal,
        conversionRate: totalVal > 0 ? (wonVal / totalVal) * 100 : 0,
        awaitingClientApprovalQtd,
        awaitingClientApprovalValue,
        approvedByClientQtd,
        approvedByClientValue,
        rejectedByClientQtd,
        rejectedByClientValue,
      });

      if (data.heartbeat) {
        setHeartbeat(data.heartbeat);
        if (data.heartbeat.status === 'RUNNING' || data.heartbeat.status === 'PENDING') {
          setTimeout(() => fetchData(true), 3000);
          setIsUpdating(true);
        } else {
          setIsUpdating(false);
        }
      }
    } catch (error) {
      console.error('Erro ao buscar dados de propostas:', error);
      setIsUpdating(false);
    } finally {
      setLoading(false);
    }
  };

  const handleManualUpdate = async () => {
    setIsUpdating(true);
    try {
      await fetch('/api/admin/propostas', { method: 'POST' });
      setTimeout(() => fetchData(true), 1000);
    } catch (error) {
      console.error('Erro ao solicitar atualização de propostas:', error);
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateRange.start, dateRange.end, selectedUnit, selectedStatus]);

  useEffect(() => {
    if (selectedStatus === 'all') return;
    if (availableStatuses.includes(selectedStatus)) return;
    setSelectedStatus('all');
  }, [availableStatuses, selectedStatus]);

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
    if (sortConfig.key !== key) return '<>';
    return sortConfig.direction === 'asc' ? '^' : 'v';
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen flex flex-col gap-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm z-20 relative">
        <div className="p-6 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-900 rounded-xl text-white shadow-md">
              <FileText size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Propostas</h1>
              <p className="text-slate-500 text-xs">Acompanhamento comercial e conversão.</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {heartbeat && (
              <div className="hidden sm:flex flex-col items-end border-r border-slate-200 pr-4">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Última sincronização</span>
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  <Clock size={12} />
                  {formatLastUpdate(heartbeat.last_run)}
                  {heartbeat.status === 'ERROR' && <span className="text-red-500 font-bold ml-1">Erro</span>}
                </div>
              </div>
            )}

            <button
              onClick={handleManualUpdate}
              disabled={isUpdating}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition-all border whitespace-nowrap ${
                isUpdating
                  ? 'bg-blue-50 text-blue-700 border-blue-200 cursor-wait'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-blue-600'
              }`}
            >
              {isUpdating ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
              {isUpdating ? 'Sincronizando...' : 'Atualizar'}
            </button>

            <button
              onClick={() => setFiltersExpanded((prev) => !prev)}
              className="p-2 hover:bg-slate-50 rounded-lg transition text-slate-600"
              title={filtersExpanded ? 'Recolher filtros' : 'Expandir filtros'}
            >
              {filtersExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
            </button>
          </div>
        </div>

        {filtersExpanded && (
          <div className="p-6 border-t border-slate-100">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-end">
              <div>
                <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 block flex items-center gap-2">
                  <Calendar size={14} />
                  Período
                </label>
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-200">
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                    className="bg-transparent text-sm text-slate-700 outline-none flex-1"
                  />
                  <span className="text-slate-300">→</span>
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                    className="bg-transparent text-sm text-slate-700 outline-none flex-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 block flex items-center gap-2">
                  <Building2 size={14} />
                  Unidade
                </label>
                <select
                  value={selectedUnit}
                  onChange={(e) => setSelectedUnit(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none hover:border-slate-300 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="all">Todas as unidades</option>
                  {availableUnits.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 block">Status da proposta</label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none hover:border-slate-300 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="all">Todos os status</option>
                  {availableStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                {(selectedUnit !== 'all' || selectedStatus !== 'all') && (
                  <button
                    onClick={() => {
                      setSelectedUnit('all');
                      setSelectedStatus('all');
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-lg border border-red-200 hover:bg-red-100 transition font-medium text-sm"
                    title="Limpar filtros"
                  >
                    <FilterX size={16} />
                    Limpar filtros
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Visão geral</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-slate-500 text-[11px] font-bold uppercase tracking-wider mb-1">Total propostas</p>
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

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Status do funil (cliente)</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          <div className="bg-amber-50/70 border border-amber-100 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Aguardando aprovação do cliente</p>
            <div className="mt-1 text-xl font-semibold text-amber-900">{formatCurrency(summary.awaitingClientApprovalValue)}</div>
            <div className="mt-1 text-xs text-amber-800/80">
              {summary.awaitingClientApprovalQtd} propostas · {percentageOfTotal(summary.awaitingClientApprovalValue).toFixed(1)}% do valor
            </div>
          </div>

          <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Aprovada pelo cliente</p>
            <div className="mt-1 text-xl font-semibold text-emerald-900 flex items-center gap-2">
              <CheckCircle2 size={16} />
              {formatCurrency(summary.approvedByClientValue)}
            </div>
            <div className="mt-1 text-xs text-emerald-800/80">
              {summary.approvedByClientQtd} propostas · {percentageOfTotal(summary.approvedByClientValue).toFixed(1)}% do valor
            </div>
          </div>

          <div className="bg-rose-50/70 border border-rose-100 rounded-xl px-4 py-3 shadow-sm sm:col-span-2 xl:col-span-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">Rejeitada pelo cliente</p>
            <div className="mt-1 text-xl font-semibold text-rose-900 flex items-center gap-2">
              <AlertCircle size={16} />
              {formatCurrency(summary.rejectedByClientValue)}
            </div>
            <div className="mt-1 text-xs text-rose-800/80">
              {summary.rejectedByClientQtd} propostas · {percentageOfTotal(summary.rejectedByClientValue).toFixed(1)}% do valor
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 animate-in fade-in">
          <Loader2 size={40} className="animate-spin mb-4 text-blue-600" />
          <p>Carregando análises...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-slate-500" />
              Performance por unidade
            </h2>

            <div className="space-y-4">
              {unitData.map((unit, idx) => (
                <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
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
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h2 className="font-bold text-slate-800">Ranking profissional</h2>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filtrar profissional..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none w-64"
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
                          Taxa conversão <span>{sortIndicator('conversion_rate')}</span>
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
                    {sortedSellers.map((seller, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
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
      )}
    </div>
  );
}
