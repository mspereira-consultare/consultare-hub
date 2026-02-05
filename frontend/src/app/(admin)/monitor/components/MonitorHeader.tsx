'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Clock, RefreshCw, WifiOff, MessageCircle, ChevronDown, Volume2, SlidersHorizontal } from 'lucide-react';
import { formatMinutesToHours } from '@/lib/utils';
import { WhatsAppResponse } from '../types';

interface MonitorHeaderProps {
  isDataStale: boolean;
  lastUpdatedString: string | null;
  loading: boolean;
  onRefresh: () => void;
  whatsAppData: WhatsAppResponse | null;
  alertsEnabled: boolean;
  audioUnlocked: boolean;
  onToggleAlerts: () => void;
  alertIntervalSeconds: number;
  onOpenAlertConfig: () => void;
}

export const MonitorHeader = ({ 
  isDataStale, 
  lastUpdatedString, 
  loading, 
  onRefresh, 
  whatsAppData,
  alertsEnabled,
  audioUnlocked,
  onToggleAlerts,
  alertIntervalSeconds,
  onOpenAlertConfig
}: MonitorHeaderProps) => {
  
  const CENTRAL_GROUP_ID = 'da45d882-5702-439b-8133-3d896d6a8810';
  const [selectedGroup, setSelectedGroup] = useState<string>(CENTRAL_GROUP_ID);

  // Lógica de Filtragem
  const currentStats = useMemo(() => {
    if (!whatsAppData) return { queue: 0, avgWaitSeconds: 0 };
    
    if (selectedGroup === 'all') {
      return whatsAppData.global;
    } else {
      const group = whatsAppData.groups.find(g => g.group_id === selectedGroup);
      return group 
        ? { queue: group.queue_size, avgWaitSeconds: group.avg_wait_seconds } 
        : { queue: 0, avgWaitSeconds: 0 };
    }
  }, [whatsAppData, selectedGroup]);

  // Texto do Grupo Selecionado (para exibição visual)
  const selectedGroupName = useMemo(() => {
    if (selectedGroup === 'all') return 'TODOS';
    const group = whatsAppData?.groups.find(g => g.group_id === selectedGroup);
    // Limpa o nome e limita tamanho
    return group ? group.group_name.replace(/[^a-zA-Z0-9\s]/g, '').substring(0, 15) : 'Selecionado';
  }, [selectedGroup, whatsAppData]);

  const avgMinutes = Math.round(currentStats.avgWaitSeconds / 60);
  const isHighAlert = currentStats.queue > 10;
  
  // Verifica se tem dados para habilitar o select
  const hasData = whatsAppData && whatsAppData.groups.length > 0;

  useEffect(() => {
    if (!whatsAppData || whatsAppData.groups.length === 0) return;
    const hasCentral = whatsAppData.groups.some(g => g.group_id === CENTRAL_GROUP_ID);
    if (!hasCentral) {
      setSelectedGroup('all');
      return;
    }
    if (!whatsAppData.groups.some(g => g.group_id === selectedGroup)) {
      setSelectedGroup(CENTRAL_GROUP_ID);
    }
  }, [whatsAppData, selectedGroup]);

  return (
    <header className="mb-6 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
      
      {/* Título e Status */}
      <div>
         <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
           {isDataStale ? <WifiOff className="text-red-600 animate-pulse" /> : <Clock className="text-blue-600" />}
           {isDataStale ? <span className="text-red-600">DADOS DESATUALIZADOS</span> : <span>Painel Integrado</span>}
         </h1>
         <p className={`text-sm mt-1 font-medium ${isDataStale ? 'text-red-500' : 'text-slate-500'}`}>
           Monitoramento Unificado: Recepção &rarr; Médico &rarr; Digital
         </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
          
          {/* --- CARD WHATSAPP --- */}
          <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border shadow-sm transition-colors ${isHighAlert ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
              
              <div className={`p-2 rounded-full shrink-0 ${isHighAlert ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                  <MessageCircle size={18} />
              </div>

              <div className="flex flex-col min-w-[140px]">
                  {/* HEADER DO CARD COM SELETOR INVISÍVEL (OVERLAY) */}
                  <div className="flex justify-between items-center mb-0.5 gap-2 relative">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider whitespace-nowrap">
                         Fila Digital
                      </span>
                      
                      {/* Container do Seletor */}
                      <div className="relative">
                           {/* CAMADA VISUAL (Texto + Ícone) */}
                           <div className={`flex items-center justify-end gap-1 text-[10px] font-bold cursor-pointer ${!hasData ? 'text-slate-300' : 'text-blue-600 hover:text-blue-800'}`}>
                                <span className="uppercase text-right truncate max-w-[100px]">
                                    {selectedGroupName}
                                </span>
                                <ChevronDown size={12} />
                           </div>

                           {/* CAMADA FUNCIONAL (Select Invisível por cima de tudo) */}
                           <select 
                              value={selectedGroup}
                              onChange={(e) => setSelectedGroup(e.target.value)}
                              disabled={!hasData}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                           >
                              {whatsAppData?.groups.map(g => (
                                  <option key={g.group_id} value={g.group_id}>
                                      {g.group_name.replace(/[^a-zA-Z0-9\s]/g, '')}
                                  </option>
                              ))}
                              <option value="all">TODOS</option>
                           </select>
                      </div>

                      {/* Botão de Atualizar (apenas ícone) */}
                      <button
                        onClick={onRefresh}
                        disabled={loading}
                        className="p-1 rounded-md border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
                        title="Atualizar fila digital"
                      >
                        <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                      </button>
                  </div>

                  {/* Dados Numéricos */}
                  <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                         <span className={`text-lg font-bold leading-none ${isHighAlert ? 'text-red-700' : 'text-slate-700'}`}>
                           {currentStats.queue}
                         </span>
                         <span className="text-xs text-slate-400">aguardando</span>
                      </div>
                      <div className="w-px h-3 bg-slate-200"></div>
                      <div className="flex items-center gap-1" title="Estatística de ontem">
                         <Clock size={12} className="text-slate-400" />
                         <span className={`text-sm font-bold leading-none ${avgMinutes > 15 ? 'text-amber-600' : 'text-slate-600'}`}>
                           {formatMinutesToHours ? formatMinutesToHours(avgMinutes) : `${avgMinutes}m`}
                         </span>
                      </div>
                  </div>
              </div>
          </div>

          {/* Última Atualização */}
          <div className={`flex items-center gap-2 text-xs transition-colors ${isDataStale ? 'text-red-600 font-bold' : 'text-slate-500'}`}>
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isDataStale ? 'bg-red-400' : 'bg-green-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isDataStale ? 'bg-red-500' : 'bg-green-500'}`}></span>
              </span>
              {lastUpdatedString || '--:--:--'}
          </div>
          
          <button 
            onClick={onToggleAlerts}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-all shadow-sm ${
              !alertsEnabled ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            title={alertsEnabled ? (audioUnlocked ? 'Desativar alerta sonoro' : 'Ativar som do alerta') : 'Ativar alerta sonoro'}
          >
            <Volume2 size={14} />
            {!alertsEnabled ? 'Alerta Sonoro: Pausado' : (audioUnlocked ? 'Alerta Sonoro: Ativo' : 'Ativar Som')}
          </button>

          <button
            onClick={onOpenAlertConfig}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold bg-white border-slate-200 text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
            title="Definir intervalo do alerta sonoro"
          >
            <SlidersHorizontal size={14} />
            Intervalo: {alertIntervalSeconds}s
          </button>

          <button onClick={onRefresh} disabled={loading} className="p-2 bg-white hover:bg-slate-50 rounded-lg border shadow-sm active:scale-95 transition-all">
              <RefreshCw size={14} className={loading ? "animate-spin text-slate-400" : "text-slate-700"} />
          </button>
      </div>
    </header>
  );
};
