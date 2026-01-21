'use client';

import React, { useEffect, useState } from 'react';
import { FileText, Calendar, DollarSign, PieChart, Briefcase, TrendingUp, Search, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';

export default function ComercialPage() {
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    
    const today = new Date();
    const [dateRange, setDateRange] = useState({
        start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });
    
    const [summary, setSummary] = useState<any>({ qtd: 0, valor: 0, conversionRate: 0, wonValue: 0 });
    const [unitData, setUnitData] = useState<any[]>([]);
    const [sellerData, setSellerData] = useState<any[]>([]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ startDate: dateRange.start, endDate: dateRange.end });
            const res = await fetch(`/api/admin/comercial?${params.toString()}`);
            const data = await res.json();
            
            // Processamento Inteligente dos Dados
            if (data.byUnit) processUnitData(data.byUnit);
            if (data.byProposer) processSellerData(data.byProposer);
            
        } catch (error) { console.error(error); } finally { setLoading(false); }
    };

    // FUNÇÃO AUXILIAR: Classifica Status
    const classifyStatus = (status: string) => {
        const s = status.toLowerCase();
        if (s.includes('aprov') || s.includes('execu') || s.includes('aceit') || s.includes('agend')) return 'won';
        if (s.includes('cancel') || s.includes('rejei') || s.includes('perd') || s.includes('não')) return 'lost';
        return 'open';
    };

    const processUnitData = (raw: any[]) => {
        const grouped: Record<string, any> = {};
        let globalTotal = 0;
        let globalWon = 0;
        let globalQtd = 0;

        raw.forEach(item => {
            if (!grouped[item.unit_name]) {
                grouped[item.unit_name] = { 
                    name: item.unit_name, 
                    totalQtd: 0, totalVal: 0, wonVal: 0, lostVal: 0, openVal: 0,
                    statuses: [] 
                };
            }
            grouped[item.unit_name].totalQtd += item.qtd;
            grouped[item.unit_name].totalVal += item.valor;
            grouped[item.unit_name].statuses.push(item);

            // Classificação
            const type = classifyStatus(item.status);
            if (type === 'won') grouped[item.unit_name].wonVal += item.valor;
            if (type === 'lost') grouped[item.unit_name].lostVal += item.valor;
            if (type === 'open') grouped[item.unit_name].openVal += item.valor;

            // Globais
            globalTotal += item.valor;
            globalQtd += item.qtd;
            if (type === 'won') globalWon += item.valor;
        });

        setSummary({
            qtd: globalQtd,
            valor: globalTotal,
            wonValue: globalWon,
            conversionRate: globalTotal > 0 ? (globalWon / globalTotal) * 100 : 0
        });

        setUnitData(Object.values(grouped).sort((a:any, b:any) => b.totalVal - a.totalVal));
    };

    const processSellerData = (raw: any[]) => {
        // Precisamos processar os status dentro do vendedor se a API mandar detalhado, 
        // mas o endpoint atual agrupa. Vamos assumir que a API já mandou agrupado ou vamos adaptar na próxima iteração.
        // Por enquanto, vamos usar o valor bruto para ranking.
        setSellerData(raw);
    };

    useEffect(() => { fetchData(); }, [dateRange]);

    // Filtro de Vendedores
    const filteredSellers = sellerData.filter(s => 
        s.professional_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-6 bg-slate-50 min-h-screen space-y-6">
            
            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200 gap-4">
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="p-3 bg-indigo-600 text-white rounded-lg shadow-md">
                        <Briefcase size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">Gestão Comercial</h1>
                        <p className="text-slate-500 text-xs">Pipeline de Vendas e Conversão</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 w-full md:w-auto">
                    <Calendar size={16} className="text-slate-500" />
                    <input type="date" value={dateRange.start} onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="bg-transparent text-sm outline-none w-32" />
                    <span className="text-slate-400">até</span>
                    <input type="date" value={dateRange.end} onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="bg-transparent text-sm outline-none w-32" />
                </div>
            </div>

            {/* KPI CARDS (AGORA COM CONVERSÃO) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                    <div>
                        <p className="text-slate-500 text-sm font-medium">Propostas Geradas</p>
                        <h3 className="text-2xl font-bold text-slate-800 mt-1">{summary.qtd}</h3>
                        <p className="text-xs text-slate-400 mt-1">Volume total no período</p>
                    </div>
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-full"><FileText size={24} /></div>
                </div>
                
                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                    <div>
                        <p className="text-slate-500 text-sm font-medium">Valor Total (Pipeline)</p>
                        <h3 className="text-2xl font-bold text-slate-800 mt-1">
                            {summary.valor?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                        </h3>
                         <p className="text-xs text-slate-400 mt-1">Soma de todos orçamentos</p>
                    </div>
                    <div className="p-3 bg-slate-50 text-slate-600 rounded-full"><DollarSign size={24} /></div>
                </div>

                <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between relative overflow-hidden">
                    <div className="absolute right-0 top-0 h-full w-2 bg-emerald-500"></div>
                    <div>
                        <p className="text-slate-500 text-sm font-medium">Conversão Global</p>
                        <div className="flex items-baseline gap-2 mt-1">
                            <h3 className="text-2xl font-bold text-emerald-600">
                                {summary.conversionRate.toFixed(1)}%
                            </h3>
                            <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                                {summary.wonValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                            </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Em valor aprovado</p>
                    </div>
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-full"><TrendingUp size={24} /></div>
                </div>
            </div>

            {/* GRID DE UNIDADES (FUNIL VISUAL) */}
            <div>
                <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2 mb-3">
                    <PieChart size={16} /> Performance por Unidade
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {unitData.map((unit) => {
                        const conversion = unit.totalVal > 0 ? (unit.wonVal / unit.totalVal) * 100 : 0;
                        
                        return (
                            <div key={unit.name} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col h-full">
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="font-bold text-slate-700 truncate pr-2" title={unit.name}>{unit.name}</h3>
                                    <div className="text-right">
                                        <p className="text-xs text-slate-400">Conversão</p>
                                        <p className={`font-bold ${conversion >= 30 ? 'text-emerald-600' : 'text-amber-500'}`}>
                                            {conversion.toFixed(1)}%
                                        </p>
                                    </div>
                                </div>
                                
                                {/* BARRA DE PROGRESSO MULTICOLORIDA (FUNIL) */}
                                <div className="w-full h-3 bg-slate-100 rounded-full flex overflow-hidden mb-4">
                                    <div className="bg-emerald-500 h-full" style={{ width: `${(unit.wonVal / unit.totalVal) * 100}%` }} title={`Ganho: ${unit.wonVal.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}`} />
                                    <div className="bg-blue-400 h-full" style={{ width: `${(unit.openVal / unit.totalVal) * 100}%` }} title={`Aberto: ${unit.openVal.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}`} />
                                    <div className="bg-red-300 h-full" style={{ width: `${(unit.lostVal / unit.totalVal) * 100}%` }} title={`Perdido: ${unit.lostVal.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}`} />
                                </div>

                                {/* LEGENDA / STATUS */}
                                <div className="space-y-2 flex-1 mt-auto">
                                    <div className="flex justify-between text-xs border-b border-slate-50 pb-2">
                                        <span className="flex items-center gap-1 text-emerald-700 font-medium"><CheckCircle2 size={12}/> Ganho</span>
                                        <span className="font-bold text-slate-700">{unit.wonVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                    </div>
                                    <div className="flex justify-between text-xs border-b border-slate-50 pb-2">
                                        <span className="flex items-center gap-1 text-blue-600 font-medium"><AlertCircle size={12}/> Aberto</span>
                                        <span className="text-slate-500">{unit.openVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="flex items-center gap-1 text-red-500 font-medium"><XCircle size={12}/> Perdido</span>
                                        <span className="text-slate-500">{unit.lostVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            
            {/* RANKING DE VENDEDORES */}
             <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                    <h3 className="font-bold text-slate-700">Ranking de Emissores</h3>
                    
                    {/* CAMPO DE BUSCA */}
                    <div className="relative">
                         <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                         <input 
                            type="text" 
                            placeholder="Buscar vendedor..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none w-full md:w-64 focus:border-indigo-400 transition-colors"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="px-4 py-3">Profissional</th>
                                <th className="px-4 py-3 text-right">Propostas</th>
                                <th className="px-4 py-3 text-right">Valor Total</th>
                                <th className="px-4 py-3 text-center">Ticket Médio</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredSellers.map((seller, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3 font-medium text-slate-700 flex items-center gap-2">
                                        {idx < 3 && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">#{idx+1}</span>}
                                        {seller.professional_name}
                                    </td>
                                    <td className="px-4 py-3 text-right text-slate-600">{seller.qtd}</td>
                                    <td className="px-4 py-3 text-right text-indigo-600 font-bold">
                                        {seller.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </td>
                                    <td className="px-4 py-3 text-center text-slate-400 text-xs">
                                        {(seller.valor / seller.qtd).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                     {filteredSellers.length === 0 && !loading && (
                        <p className="text-center text-slate-400 py-6 text-sm">Nenhum profissional encontrado.</p>
                    )}
                </div>
            </div>
        </div>
    );
}