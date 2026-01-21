'use client';

import { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { 
  Users, DollarSign, AlertCircle, Calendar, 
  CheckCircle, TrendingDown, FileText
} from 'lucide-react';

export default function ContratosDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState({
    startDate: '2026-01-01',
    endDate: new Date().toISOString().split('T')[0]
  });

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/contratos?startDate=${dates.startDate}&endDate=${dates.endDate}`);
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error("Erro:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [dates]);

  const formatMoney = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

  if (loading && !data) return <div className="p-8 text-center text-gray-500">Carregando indicadores...</div>;

  return (
    <div className="space-y-6 pb-10">
      
      {/* --- CABEÇALHO --- */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-lg shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Cartão de Benefícios</h1>
          <p className="text-sm text-gray-500">Visão consolidada: API Contratos (Aprovados) + Receita Bruta Analítica</p>
        </div>
        <div className="flex gap-2 items-center bg-gray-50 p-2 rounded border mt-4 md:mt-0">
            <Calendar size={16} className="text-gray-500" />
            <input 
              type="date" 
              value={dates.startDate}
              onChange={(e) => setDates(prev => ({ ...prev, startDate: e.target.value }))}
              className="bg-transparent text-sm outline-none"
            />
            <span className="text-gray-400">até</span>
            <input 
              type="date" 
              value={dates.endDate}
              onChange={(e) => setDates(prev => ({ ...prev, endDate: e.target.value }))}
              className="bg-transparent text-sm outline-none"
            />
            <button 
                onClick={fetchData}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-bold uppercase tracking-wide ml-2"
            >
                Filtrar
            </button>
        </div>
      </div>

      {/* --- LINHA 1: DESTAQUES PRINCIPAIS --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* 1. CONTRATOS ATIVOS (TITULARES) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-600">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Contratos Ativos</p>
              <h3 className="text-4xl font-extrabold text-gray-800 mt-2">
                {data?.totals?.activeContractsCount || 0}
              </h3>
              <p className="text-xs text-blue-600 mt-1 font-medium bg-blue-50 inline-block px-2 py-0.5 rounded">
                Titulares Aprovados
              </p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
              <Users size={28} />
            </div>
          </div>
        </div>

        {/* 2. FATURAMENTO REALIZADO (RESOLVECARD) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-emerald-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Faturamento Realizado</p>
              <h3 className="text-3xl font-bold text-gray-800 mt-2">
                {formatMoney(data?.period?.billingRealized)}
              </h3>
              <div className="flex items-center gap-1 mt-1 text-emerald-700 text-xs font-semibold bg-emerald-50 px-2 py-0.5 rounded w-fit">
                <CheckCircle size={12} />
                Baixado no período (Scraper)
              </div>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600">
              <DollarSign size={28} />
            </div>
          </div>
        </div>

        {/* 3. ADESÃO (VENDAS NO PERÍODO) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-purple-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Total Adesão</p>
              <h3 className="text-3xl font-bold text-gray-800 mt-2">
                {formatMoney(data?.period?.salesMembership)}
              </h3>
              <p className="text-xs text-purple-600 mt-1">Vendas no período</p>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg text-purple-600">
              <FileText size={28} />
            </div>
          </div>
        </div>
      </div>

      {/* --- LINHA 2: GRÁFICO E TABELAS DE VALORES --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* GRÁFICO DIÁRIO DE FATURAMENTO */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <DollarSign size={18} className="text-emerald-500"/>
            Evolução do Faturamento Realizado (Diário)
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.period?.dailyChart || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis 
                    dataKey="date" 
                    tickFormatter={(tick) => {
                        if (!tick) return '';
                        const [y, m, d] = tick.split('-');
                        return `${d}/${m}`;
                    }}
                    tick={{fontSize: 12, fill: '#666'}}
                    axisLine={false}
                    tickLine={false}
                />
                <YAxis 
                    tick={{fontSize: 12, fill: '#666'}} 
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => `R$${val/1000}k`}
                />
                <Tooltip 
                    cursor={{fill: '#f0fdf4'}}
                    formatter={(value: any) => [formatMoney(value), 'Faturado']}
                    labelFormatter={(label) => {
                         if (!label) return '';
                         const [y, m, d] = label.split('-');
                         return `${d}/${m}/${y}`;
                    }}
                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Bar dataKey="faturamento" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CARDS LATERAIS (DETALHAMENTO) */}
        <div className="space-y-4">
            
            {/* CARD MENSALIDADES */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                <h4 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                    <Calendar size={18} className="text-blue-500"/> 
                    Mensalidades
                </h4>
                
                <div className="flex justify-between items-end border-b pb-2 mb-2">
                    <span className="text-sm text-gray-500">No Período (Novas)</span>
                    <span className="font-bold text-gray-800">{formatMoney(data?.period?.salesMRR)}</span>
                </div>
                <div className="flex justify-between items-end">
                    <span className="text-sm text-gray-500">Total Carteira (MRR)</span>
                    <span className="font-bold text-blue-600 text-lg">{formatMoney(data?.totals?.activeContractsMRR)}</span>
                </div>
            </div>

            {/* CARD INADIMPLÊNCIA */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-red-50">
                <h4 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                    <AlertCircle size={18} className="text-red-500"/> 
                    Inadimplência
                </h4>
                
                {/* Período */}
                <div className="mb-3">
                    <p className="text-xs text-gray-400 uppercase font-semibold">Neste Período</p>
                    <div className="flex justify-between items-baseline">
                        <span className="text-2xl font-bold text-gray-800">{data?.period?.defaultersCount} <small className="text-sm font-normal text-gray-500">contratos</small></span>
                        <span className="font-bold text-red-500">{formatMoney(data?.period?.defaultersValue)}</span>
                    </div>
                </div>

                {/* Total */}
                <div className="pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-400 uppercase font-semibold">Total Acumulado</p>
                    <div className="flex justify-between items-baseline">
                        <span className="text-xl font-bold text-gray-600">{data?.totals?.defaultersCount} <small className="text-sm font-normal text-gray-500">contratos</small></span>
                        <span className="font-semibold text-gray-600">{formatMoney(data?.totals?.defaultersValue)}</span>
                    </div>
                </div>
            </div>

            {/* CARD CANCELAMENTOS */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <TrendingDown size={18} className="text-orange-500"/>
                        <span className="font-bold text-gray-700">Cancelados</span>
                    </div>
                    <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-sm font-bold">
                        {data?.period?.cancelledCount}
                    </span>
                </div>
                <p className="text-xs text-gray-400 mt-1 text-right">Contratos cancelados no período selecionado</p>
            </div>

        </div>
      </div>
    </div>
  );
}