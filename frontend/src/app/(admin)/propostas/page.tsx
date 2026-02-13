'use client';

import React, { useEffect, useState } from 'react';
import { 
    FileText, Calendar, DollarSign, PieChart, Briefcase, 
    TrendingUp, Search, AlertCircle, XCircle,
    RefreshCw, Clock, Loader2
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

export default function ProposalsPage() {
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUnit, setSelectedUnit] = useState('all');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
        key: 'valor',
        direction: 'desc'
    });
    
    // Filtro de Data
    const today = new Date();
    const [dateRange, setDateRange] = useState({
        start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });
    
    // Dados
    const [summary, setSummary] = useState<any>({ qtd: 0, valor: 0, conversionRate: 0, wonValue: 0, wonQtd: 0, lostValue: 0 });
    const [unitData, setUnitData] = useState<any[]>([]);
    const [sellerData, setSellerData] = useState<any[]>([]);
    const [availableUnits, setAvailableUnits] = useState<string[]>([]);
    
    // Heartbeat (Controle de Atualização)
    const [heartbeat, setHeartbeat] = useState<any>(null);
    const [isUpdating, setIsUpdating] = useState(false);
    const avgTicket = summary.qtd > 0 ? summary.valor / summary.qtd : 0;

    const fetchData = async (forceFresh = false) => {
        // Não ativa loading total se for apenas refresh de background
        if (!heartbeat) setLoading(true);
        
        try {
            const params = new URLSearchParams({ 
                startDate: dateRange.start, 
                endDate: dateRange.end,
                unit: selectedUnit
            });
            if (forceFresh) params.set('refresh', Date.now().toString());
            const res = await fetch(`/api/admin/propostas?${params.toString()}`);
            const data = await res.json();
            
            if (data.byUnit) processUnitData(data.byUnit);
            if (data.byProposer) processSellerData(data.byProposer);
            
            // Extrai lista de unidades disponíveis
            if (data.byUnit && selectedUnit === 'all') {
                const raw = data.byUnit.map((item: any) => item.unit_name);
                const units = Array.from(new Set(raw.map((u: any) => (u == null ? '' : String(u))))).filter(Boolean) as string[];
                units.sort();
                setAvailableUnits(units);
            }
            
            // Processa Sumário
            const totalQtd = data.summary?.qtd || 0;
            const totalVal = data.summary?.valor || 0;
            const wonVal = data.summary?.wonValue || 0;
            const wonQtd = data.summary?.wonQtd || 0;
            // Se lostValue não existir, calcula a partir da diferença (fallback)
            const rawLostVal = data.summary && typeof data.summary.lostValue !== 'undefined' ? data.summary.lostValue : (totalVal - wonVal);
            const lostVal = Number(rawLostVal) || 0;

            setSummary({
                qtd: totalQtd,
                valor: totalVal,
                wonValue: wonVal,
                wonQtd: wonQtd,
                lostValue: lostVal,
                conversionRate: totalVal > 0 ? (wonVal / totalVal) * 100 : 0,
                lostRate: totalVal > 0 ? (lostVal / totalVal) * 100 : 0
            });

            // Atualiza Heartbeat
            if (data.heartbeat) {
                setHeartbeat(data.heartbeat);
                // Se estiver rodando, continua sondando
                if (data.heartbeat.status === 'RUNNING' || data.heartbeat.status === 'PENDING') {
                    setTimeout(() => fetchData(true), 3000);
                    setIsUpdating(true);
                } else {
                    setIsUpdating(false);
                }
            }

        } catch (error) {
            console.error("Erro ao buscar dados:", error);
        } finally {
            setLoading(false);
        }
    };

    const processUnitData = (data: any[]) => {
        // Agrupa por Unidade
        const grouped: any = {};
        data.forEach(item => {
            if (!grouped[item.unit_name]) {
                grouped[item.unit_name] = { name: item.unit_name, total: 0, qtd: 0, status: {} };
            }
            grouped[item.unit_name].total += item.valor;
            grouped[item.unit_name].qtd += item.qtd;
            grouped[item.unit_name].status[item.status] = item.valor;
        });
        setUnitData(Object.values(grouped).sort((a: any, b: any) => b.total - a.total));
    };

    const processSellerData = (data: any[]) => {
        setSellerData(data);
    };

    // Trigger de Atualização Manual
    const handleManualUpdate = async () => {
        setIsUpdating(true);
        try {
            await fetch('/api/admin/propostas', { method: 'POST' });
            // Inicia polling imediato
            setTimeout(() => fetchData(true), 1000);
        } catch (e) {
            console.error(e);
            setIsUpdating(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [dateRange, selectedUnit]);

    // Filtros visuais
    const filteredSellers = sellerData.filter((s) =>
        String(s.professional_name || 'Sistema').toLowerCase().includes(searchTerm.toLowerCase())
    );
    const getSortValue = (seller: any, key: SortKey) => {
        if (key === 'professional_name') return String(seller.professional_name || 'Sistema').toLowerCase();
        if (key === 'conversion_rate') {
            const total = Number(seller.valor || 0);
            const executed = Number(seller.valor_executado || 0);
            return total > 0 ? (executed / total) * 100 : 0;
        }
        if (key === 'ticket_medio') return Number(seller.valor || 0) / Math.max(Number(seller.qtd || 0), 1);
        if (key === 'ticket_exec') return Number(seller.valor_executado || 0) / Math.max(Number(seller.qtd_executado || 0), 1);
        return Number(seller[key] || 0);
    };

    const sortedSellers = [...filteredSellers].sort((a, b) => {
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

    const toggleSort = (key: SortKey) => {
        setSortConfig((prev) => {
            if (prev.key === key) {
                return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: key === 'professional_name' ? 'asc' : 'desc' };
        });
    };

    const sortIndicator = (key: SortKey) => {
        if (sortConfig.key !== key) return '<>';
        return sortConfig.direction === 'asc' ? '^' : 'v';
    };

    // Função auxiliar para formatar data UTC do banco para Local
    const formatLastUpdate = (dateString: string) => {
        if (!dateString) return 'Nunca';
        const isoString = dateString.includes('T') ? dateString : dateString.replace(' ', 'T');
        try {
            const parsed = new Date(isoString);
            return Number.isNaN(parsed.getTime()) ? dateString : parsed.toLocaleString('pt-BR');
        } catch (e) {
            return dateString;
        }
    };

    return (
        <div className="p-8 max-w-[1600px] mx-auto min-h-screen bg-slate-50/50">
            {/* --- HEADER COM HEARTBEAT --- */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <FileText className="w-6 h-6 text-blue-600" />
                        Gestão de Propostas
                    </h1>
                    <p className="text-slate-500 mt-1">Acompanhamento comercial e conversão.</p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Status da Última Atualização */}
                    {heartbeat && (
                        <div className="hidden md:flex flex-col items-end mr-2">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                                Última Sincronização
                            </span>
                            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                                <Clock size={12} />
                                {/* CORREÇÃO APLICADA AQUI: */}
                                {formatLastUpdate(heartbeat.last_run)}
                                {heartbeat.status === 'ERROR' && <span className="text-red-500 font-bold ml-1">Erro</span>}
                            </div>
                        </div>
                    )}

                    {/* Botão de Atualizar */}
                    <button 
                        onClick={handleManualUpdate}
                        disabled={isUpdating}
                        className={`
                            flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all shadow-sm
                            ${isUpdating 
                                ? 'bg-blue-100 text-blue-700 cursor-wait' 
                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-blue-600'
                            }
                        `}
                    >
                        {isUpdating ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                        {isUpdating ? 'Sincronizando...' : 'Atualizar Dados'}
                    </button>

                    {/* Filtro de Data */}
                    <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm">
                        <Calendar size={16} className="text-slate-400" />
                        <input 
                            type="date" 
                            value={dateRange.start}
                            onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                            className="text-sm border-none focus:ring-0 text-slate-600 bg-transparent outline-none cursor-pointer"
                        />
                        <span className="text-slate-300">|</span>
                        <input 
                            type="date" 
                            value={dateRange.end}
                            onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                            className="text-sm border-none focus:ring-0 text-slate-600 bg-transparent outline-none cursor-pointer"
                        />
                    </div>

                    {/* Filtro de Unidade */}
                    <select
                        value={selectedUnit}
                        onChange={(e) => setSelectedUnit(e.target.value)}
                        className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 outline-none hover:border-slate-300 focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-sm"
                    >
                        <option value="all">Todas as Unidades</option>
                        {availableUnits.map((unit) => (
                            <option key={unit} value={unit}>{unit}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* --- CARDS DE KPI --- */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-5 mb-8">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                    <div className="relative">
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Total Propostas</p>
                        <h3 className="text-2xl font-bold text-slate-800">{summary.qtd}</h3>
                        <div className="mt-2 flex items-center gap-1 text-xs text-blue-600 font-medium">
                            <FileText size={12} />
                            <span>Volume Período</span>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                    <div className="relative">
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Valor Total</p>
                        <h3 className="text-2xl font-bold text-slate-800">
                            {summary.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </h3>
                        <div className="mt-2 flex items-center gap-1 text-xs text-emerald-600 font-medium">
                            <DollarSign size={12} />
                            <span>Bruto Estimado</span>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                    <div className="relative">
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Convertido (Ganho)</p>
                        <h3 className="text-2xl font-bold text-slate-800">
                            {summary.wonValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </h3>
                        <div className="mt-2 flex items-center gap-1 text-xs text-purple-600 font-medium">
                            <TrendingUp size={12} />
                            <span>Executado</span>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                    <div className="relative">
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Taxa Conversão</p>
                        <h3 className="text-2xl font-bold text-slate-800">
                            {(Number(summary?.conversionRate) || 0).toFixed(1)}%
                        </h3>
                        <div className="mt-2 flex items-center gap-1 text-xs text-amber-600 font-medium">
                            <PieChart size={12} />
                            <span>Eficiência</span>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-red-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                    <div className="relative">
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Valor Perdido</p>
                        <h3 className="text-2xl font-bold text-slate-800">
                            {(summary.valor - summary.wonValue).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </h3>
                        <div className="mt-2 flex items-center gap-1 text-xs text-red-600 font-medium">
                            <AlertCircle size={12} />
                            <span>{summary.valor > 0 ? ((((summary.valor - summary.wonValue) / summary.valor) * 100).toFixed(1)) : '0'}% do total</span>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                    <div className="relative">
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Ticket Medio</p>
                        <h3 className="text-2xl font-bold text-slate-800">
                            {avgTicket.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </h3>
                        <div className="mt-2 flex items-center gap-1 text-xs text-slate-600 font-medium">
                            <DollarSign size={12} />
                            <span>Média por proposta</span>
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
                    {/* --- RANKING POR UNIDADE --- */}
                    <div className="lg:col-span-1 space-y-6">
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <Briefcase className="w-5 h-5 text-slate-500" />
                            Performance por Unidade
                        </h2>
                        
                        <div className="space-y-4">
                            {unitData.map((unit, idx) => (
                                <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h4 className="font-bold text-slate-800">{unit.name || 'Sem Unidade'}</h4>
                                            <span className="text-xs text-slate-500">{unit.qtd} propostas</span>
                                        </div>
                                        <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-bold">
                                            {unit.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </span>
                                    </div>
                                    
                                    {/* Mini Barra de Progresso (Ganho vs Perda) */}
                                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex">
                                        {/* Assumindo que temos o detalhe, senao barra cinza */}
                                        <div style={{ width: '100%' }} className="bg-blue-500 h-full opacity-80"></div>
                                    </div>
                                </div>
                            ))}
                            {unitData.length === 0 && <p className="text-slate-400 text-sm italic">Nenhum dado por unidade.</p>}
                        </div>
                    </div>

                    {/* --- TABELA DE VENDEDORES --- */}
                    <div className="lg:col-span-2">
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <h2 className="font-bold text-slate-800">Ranking Profissional</h2>
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
                                                    Exec. Qtd <span>{sortIndicator('qtd_executado')}</span>
                                                </button>
                                            </th>
                                            <th className="px-4 py-3 text-right">
                                                <button onClick={() => toggleSort('valor')} className="inline-flex items-center gap-1 hover:text-slate-700">
                                                    Total Estimado <span>{sortIndicator('valor')}</span>
                                                </button>
                                            </th>
                                            <th className="px-4 py-3 text-right">
                                                <button onClick={() => toggleSort('valor_executado')} className="inline-flex items-center gap-1 hover:text-slate-700">
                                                    Total Executado <span>{sortIndicator('valor_executado')}</span>
                                                </button>
                                            </th>
                                            <th className="px-4 py-3 text-center">
                                                <button onClick={() => toggleSort('conversion_rate')} className="inline-flex items-center gap-1 hover:text-slate-700">
                                                    Taxa Conversao <span>{sortIndicator('conversion_rate')}</span>
                                                </button>
                                            </th>
                                            <th className="px-4 py-3 text-center">
                                                <button onClick={() => toggleSort('ticket_medio')} className="inline-flex items-center gap-1 hover:text-slate-700">
                                                    Ticket Medio <span>{sortIndicator('ticket_medio')}</span>
                                                </button>
                                            </th>
                                            <th className="px-4 py-3 text-center">
                                                <button onClick={() => toggleSort('ticket_exec')} className="inline-flex items-center gap-1 hover:text-slate-700">
                                                    Ticket Exec. <span>{sortIndicator('ticket_exec')}</span>
                                                </button>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-sm">
                                        {sortedSellers.map((seller, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3 font-medium text-slate-700">
                                                    {seller.professional_name || 'Sistema'}
                                                </td>
                                                <td className="px-4 py-3 text-right text-slate-600">{seller.qtd}</td>
                                                <td className="px-4 py-3 text-right text-emerald-600 font-semibold">{seller.qtd_executado || 0}</td>
                                                <td className="px-4 py-3 text-right text-slate-700 font-semibold">
                                                    {(seller.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold">
                                                    <span className="text-emerald-600">
                                                        {(seller.valor_executado || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center text-slate-600 text-xs font-semibold">
                                                    {seller.valor > 0
                                                        ? `${(((seller.valor_executado || 0) / seller.valor) * 100).toFixed(1)}%`
                                                        : '0,0%'}
                                                </td>
                                                <td className="px-4 py-3 text-center text-slate-400 text-xs">
                                                    {(seller.valor / (seller.qtd || 1)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                </td>
                                                <td className="px-4 py-3 text-center text-slate-400 text-xs">
                                                    {((seller.valor_executado || 0) / (seller.qtd_executado || 1)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
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
