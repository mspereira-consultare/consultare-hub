'use client';

import React, { useEffect, useState } from 'react';
import { DollarSign, FilterX } from 'lucide-react';
import { FinancialKPIs } from './components/FinancialKPIs';
import { HistoryTable } from './components/HistoryTable';
import { GroupList } from './components/GroupList';
import { HistoryChart } from './components/HistoryChart';

export default function FinancialPage() {
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState('all');
  
  const [daily, setDaily] = useState<any[]>([]);
  const [monthly, setMonthly] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [totals, setTotals] = useState({ total: 0, qtd: 0 });

  const fetchData = async (group: string) => {
    setLoading(true);
    try {
        const url = `/api/admin/financial/history?group=${encodeURIComponent(group)}`;
        const res = await fetch(url, { cache: 'no-store' });
        const data = await res.json();
        
        if (data) {
            setDaily(data.daily.map((d: any) => ({
                label: d.date.split('-').reverse().slice(0, 2).join('/'),
                total: d.total,
                qtd: d.qtd
            })));
            
            setMonthly(data.monthly.map((m: any) => {
                if (!m.month) return { label: '-', total: 0, qtd: 0 };
                const [y, mo] = m.month.split('-');
                const date = new Date(parseInt(y), parseInt(mo) - 1, 1);
                return {
                    label: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).toUpperCase(),
                    total: m.total,
                    qtd: m.qtd
                };
            }));
            
            setGroups(data.groups || []);
            setTotals(data.totals || { total: 0, qtd: 0 });
        }
    } catch (err) {
        console.error(err);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => { fetchData(selectedGroup); }, [selectedGroup]);

  return (
    <div className="p-6 min-h-screen bg-slate-50 flex flex-col gap-6">
      
      {/* HEADER & FILTROS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-900 rounded-xl text-white shadow-md">
                <DollarSign size={24} />
            </div>
            <div>
                <h1 className="text-xl font-bold text-slate-800">Financeiro</h1>
                <p className="text-slate-500 text-xs">
                    {selectedGroup === 'all' ? 'Visão Consolidada' : `Filtro: ${selectedGroup}`}
                </p>
            </div>
        </div>
        
        {selectedGroup !== 'all' && (
            <button 
                onClick={() => setSelectedGroup('all')}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-red-50 hover:text-red-600 text-xs font-medium transition shadow-sm"
            >
                <FilterX size={14} /> Limpar Filtro
            </button>
        )}
      </div>

      {/* KPIS (Topo) */}
      <FinancialKPIs data={totals} />

      {/* LAYOUT PRINCIPAL (GRID OTIMIZADO) */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
          
          {/* COLUNA 1: LISTA DE GRUPOS (ALTA) */}
          {/* Ocupa 1 coluna e usa h-[600px] para alinhar com o conteúdo da direita */}
          <div className="xl:col-span-1">
              <GroupList 
                  groups={groups} 
                  selected={selectedGroup} 
                  onSelect={setSelectedGroup}
                  className="h-[620px]" 
              />
          </div>

          {/* COLUNA 2, 3, 4: CONTEÚDO PRINCIPAL */}
          <div className="xl:col-span-3 space-y-6">
              
              {/* LINHA 1: MENSAL (Lado a Lado) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[300px]">
                  <HistoryChart 
                    title="Evolução Mensal" 
                    data={monthly} 
                    color="#1e3a8a" // Azul Escuro (Consultare)
                    className="h-full"
                  />
                  <HistoryTable 
                    title="Dados Mensais" 
                    data={monthly}
                    className="h-full"
                  />
              </div>

              {/* LINHA 2: DIÁRIA (Lado a Lado) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[300px]">
                   <HistoryChart 
                    title="Curva Diária (30 dias)" 
                    data={daily} 
                    color="#0ea5e9" // Azul Claro (Contraste)
                    className="h-full"
                  />
                  <HistoryTable 
                    title="Dados Diários" 
                    data={daily}
                    className="h-full" 
                  />
              </div>

          </div>

      </div>
    </div>
  );
}