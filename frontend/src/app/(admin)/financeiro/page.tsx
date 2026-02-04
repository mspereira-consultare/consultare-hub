'use client';

import React, { useEffect, useState, useRef } from 'react';
import { 
    DollarSign, FilterX, Calendar, Stethoscope, ChevronDown, Search, ChevronRight, Building2,
    RefreshCw, Clock, Loader2 // Novos ícones
} from 'lucide-react';
import { FinancialKPIs } from './components/FinancialKPIs';
import { HistoryTable } from './components/HistoryTable';
import { GroupList } from './components/GroupList';
import { HistoryChart } from './components/HistoryChart';

// --- COMPONENTE: DROPDOWN COM PESQUISA ---
const SearchableSelect = ({ options, value, onChange, placeholder }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: any) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // CORREÇÃO: Proteção contra null
    const filteredOptions = options.filter((opt: any) => 
        (opt.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const selectedLabel = value === 'all' ? placeholder : value;

    return (
        <div className="relative" ref={wrapperRef}>
            <div 
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 cursor-pointer min-w-[220px] justify-between hover:bg-slate-100 transition"
            >
                <div className="flex items-center gap-2 overflow-hidden">
                    <Stethoscope size={16} className="text-slate-500 flex-shrink-0" />
                    <span className="text-sm text-slate-700 truncate max-w-[180px]">
                        {selectedLabel}
                    </span>
                </div>
                <ChevronDown size={14} className="text-slate-400" />
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-[300px] bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                    <div className="p-2 border-b border-slate-100 bg-slate-50">
                        <div className="flex items-center bg-white px-2 rounded-lg border border-slate-200">
                            <Search size={14} className="text-slate-400" />
                            <input 
                                autoFocus
                                type="text" 
                                placeholder="Pesquisar..."
                                className="w-full p-2 text-sm outline-none bg-transparent"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    
                    <div className="max-h-[250px] overflow-y-auto custom-scrollbar">
                        <div 
                            onClick={() => { onChange('all'); setIsOpen(false); }}
                            className={`px-4 py-2 text-sm cursor-pointer hover:bg-blue-50 hover:text-blue-700 ${value === 'all' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600'}`}
                        >
                            Todos
                        </div>
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((opt: any) => (
                                <div 
                                    key={opt.name}
                                    onClick={() => { onChange(opt.name); setIsOpen(false); }}
                                    className={`px-4 py-2 text-sm cursor-pointer border-t border-slate-50 hover:bg-blue-50 hover:text-blue-700 ${value === opt.name ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600'}`}
                                >
                                    {opt.name}
                                </div>
                            ))
                        ) : (
                            <div className="px-4 py-3 text-xs text-slate-400 text-center">
                                Nenhum encontrado.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default function FinancialPage() {
  const [loading, setLoading] = useState(true);
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  
  // Filtros
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [selectedProcedure, setSelectedProcedure] = useState('all');
  const [selectedUnit, setSelectedUnit] = useState('all');
  
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0], 
    end: new Date().toISOString().split('T')[0]
  });

  const [daily, setDaily] = useState<any[]>([]);
  const [monthly, setMonthly] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [groupStats, setGroupStats] = useState<any[]>([]);
  const [procedures, setProcedures] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [totals, setTotals] = useState({ total: 0, qtd: 0 });

  // --- CONTROLE DE ATUALIZAÇÃO ---
  const [heartbeat, setHeartbeat] = useState<any>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchData = async (forceFresh = false) => {
    // Não ativa loading fullscreen se for apenas polling
    if (!heartbeat) setLoading(true);

    try {
        const params = new URLSearchParams({
            unit: selectedUnit,
            group: selectedGroup,
            procedure: selectedProcedure,
            startDate: dateRange.start,
            endDate: dateRange.end
        });
        if (forceFresh) params.set('refresh', Date.now().toString());

        const res = await fetch(`/api/admin/financial/history?${params.toString()}`);
        const data = await res.json();
        
        if (data && !data.error) {
            setDaily(data.daily?.map((d: any) => ({
                label: d.d?.split('-').reverse().slice(0, 2).join('/') || '?',
                total: d.total || 0,
                qtd: d.qtd || 0,
                sortKey: d.d || ''
            })) || []);
            
            setMonthly(data.monthly?.map((m: any) => {
                let label = '-';
                if (m.m) {
                    const parts = String(m.m).split('-').map((p: string) => Number(p));
                    if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
                        const [year, month] = parts;
                        const date = new Date(year, month - 1, 1);
                        try { label = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).toUpperCase(); } catch (e) { label = '-'; }
                    }
                }

                return {
                    label,
                    total: m.total || 0,
                    qtd: m.qtd || 0,
                    sortKey: m.m || ''
                };
            }) || []);
            
            // Só atualiza listas se não estiver filtrando
            if (selectedUnit === 'all') {
                setUnits(data.units?.map((u: any) => ({
                    ...u,
                    label: u.name
                })) || []);
            }
            if (selectedGroup === 'all') {
                setGroups(data.groups?.map((g: any) => ({
                    ...g,
                    label: g.procedure_group || g.label || g.name || 'Desconhecido'
                })) || []);
            }
            setGroupStats(data.groupStats || data.groups || []);
            if (selectedProcedure === 'all') {
                setProcedures(data.procedures || []);
            }

            setTotals(data.totals || { total: 0, qtd: 0 });

            // HEARTBEAT
            if (data.heartbeat) {
                setHeartbeat(data.heartbeat);
                if (data.heartbeat.status === 'RUNNING' || data.heartbeat.status === 'PENDING') {
                    setIsUpdating(true);
                    setTimeout(() => fetchData(true), 3000); // Polling
                } else {
                    setIsUpdating(false);
                }
            }
        }
    } catch (err) {
        console.error("Erro Financeiro:", err);
    } finally {
        setLoading(false);
    }
  };

  const handleManualUpdate = async () => {
    setIsUpdating(true);
    try {
        await fetch('/api/admin/financial/history', { method: 'POST' });
        setTimeout(() => fetchData(true), 1000);
    } catch (e) {
        console.error(e);
        setIsUpdating(false);
    }
  };

  useEffect(() => { fetchData(); }, [selectedUnit, selectedGroup, selectedProcedure, dateRange]);

  // Formatador de Data do Status
  const formatLastUpdate = (dateString: string) => {
    if (!dateString) return 'Nunca';
    const isoString = dateString.replace(' ', 'T') + 'Z';
    try { return new Date(isoString).toLocaleString('pt-BR'); } catch (e) { return dateString; }
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen flex flex-col gap-6">
      
      {/* HEADER COM FILTROS */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm z-20 relative">
        
        {/* LINHA 1: TÍTULO + HEARTBEAT + BOTÃO ATUALIZAR + BOTÃO EXPANDIR */}
        <div className="p-6 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-900 rounded-xl text-white shadow-md"><DollarSign size={24} /></div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Faturamento & Produção</h1>
              <p className="text-slate-500 text-xs">Visão analítica de procedimentos realizados e receita.</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* HEARTBEAT STATUS COM DATA */}
            {heartbeat && (
              <div className="hidden sm:flex flex-col items-end text-xs border-r border-slate-200 pr-4">
                <span className="font-bold uppercase text-slate-400 tracking-wider mb-0.5">Última Sincronização</span>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${isUpdating ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                  <span className="font-medium text-slate-600">{formatLastUpdate(heartbeat.last_run)}</span>
                </div>
              </div>
            )}
            
            {/* BOTÃO ATUALIZAR */}
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
            
            {/* BOTÃO EXPANDIR/RECOLHER */}
            <button 
              onClick={() => setFiltersExpanded(!filtersExpanded)}
              className="p-2 hover:bg-slate-50 rounded-lg transition text-slate-600"
              title={filtersExpanded ? "Recolher filtros" : "Expandir filtros"}
            >
              {filtersExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
            </button>
          </div>
        </div>

        {/* FILTROS (Expansível) */}
        {filtersExpanded && (
          <div className="p-6 space-y-4 border-t border-slate-100">
            
            {/* LINHA 2: PERÍODO + UNIDADE */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 block flex items-center gap-2">
                  <Calendar size={14} />
                  Período
                </label>
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-200">
                  <input 
                    type="date" 
                    value={dateRange.start}
                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="bg-transparent text-sm text-slate-700 outline-none flex-1"
                  />
                  <span className="text-slate-300">→</span>
                  <input 
                    type="date" 
                    value={dateRange.end}
                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="bg-transparent text-sm text-slate-700 outline-none flex-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 block flex items-center gap-2">
                  <Building2 size={14} />
                  Unidade
                </label>
                <SearchableSelect 
                  options={units} 
                  value={selectedUnit} 
                  onChange={setSelectedUnit} 
                  placeholder="Todas as Unidades"
                />
              </div>
            </div>

            {/* LINHA 3: GRUPO DE PROCEDIMENTO + PROCEDIMENTO */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 block">Grupo de Procedimento</label>
                <SearchableSelect 
                  options={groups} 
                  value={selectedGroup} 
                  onChange={setSelectedGroup} 
                  placeholder="Todos os Grupos"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 block">Procedimento</label>
                <SearchableSelect 
                  options={procedures} 
                  value={selectedProcedure} 
                  onChange={setSelectedProcedure} 
                  placeholder="Todos Procedimentos"
                />
              </div>

              <div>
                {(selectedUnit !== 'all' || selectedGroup !== 'all' || selectedProcedure !== 'all') && (
                  <button 
                    onClick={() => { setSelectedUnit('all'); setSelectedGroup('all'); setSelectedProcedure('all'); }} 
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-lg border border-red-200 hover:bg-red-100 transition font-medium text-sm"
                    title="Limpar todos os filtros"
                  >
                    <FilterX size={16} />
                    Limpar Filtros
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <FinancialKPIs data={totals} />

      {/* --- GRID DE LAYOUT (MANTIDO) --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
          
          <div className="lg:col-span-1">
              <GroupList 
                groups={groupStats} 
                selected={selectedGroup} 
                onSelect={(g) => { setSelectedGroup(g); setSelectedProcedure('all'); }} 
                className="h-[350px]" 
              />
          </div>

          <div className="lg:col-span-1">
              <HistoryChart title="Evolução Mensal" data={monthly} color="#1e3a8a" className="h-[350px]" />
          </div>

          <div className="lg:col-span-1">
              <HistoryTable title="Detalhe Mensal" data={monthly} className="h-[350px]" />
          </div>

          <div className="lg:col-span-2">
              <HistoryChart title="Curva Diária" data={daily} color="#0ea5e9" className="h-[400px]" />
          </div>

          <div className="lg:col-span-1">
               <HistoryTable title="Detalhe Diário" data={daily} className="h-[400px]" />
          </div>

      </div>
    </div>
  );
}
