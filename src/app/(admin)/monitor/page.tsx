'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Clock, Users, Activity, RefreshCw, AlertCircle, Accessibility, Baby, WifiOff, Ticket, Timer } from 'lucide-react';
import { useAutoAnimate } from '@formkit/auto-animate/react';

// --- TIPAGEM MÉDICA ---
export interface Patient {
  id: string | number;
  name: string;
  isFirstTime?: boolean;
  priority?: {
    isWheelchair?: boolean;
    isPregnant?: boolean;
    isElderly?: boolean;
  };
  service: string;
  professional: string;
  arrival: string;
  waitTime: number;
  status: 'waiting' | 'in_service'; 
}

export interface UnitData {
  id: number | string;
  name: string;
  patients: Patient[]; // Pode vir undefined da API, trataremos isso no componente
}

// --- TIPAGEM RECEPÇÃO ---
export interface ReceptionUnitStats {
  fila: number;
  tempo_medio: number; 
  nome_unidade?: string;
}

export interface ReceptionResponse {
  global: {
    total_fila: number;
    tempo_medio: number;
  };
  por_unidade: Record<string, ReceptionUnitStats>;
}

// --- Componente: Card de KPI da Recepção ---
const ReceptionKpiCard = ({ unitId, stats }: { unitId: string, stats: ReceptionUnitStats }) => {
  const unitNames: Record<string, string> = {
    '2': 'Ouro Verde',
    '3': 'Cambuí',
    '12': 'Shopping',
    [unitId]: stats.nome_unidade || `Unidade ${unitId}`
  };

  const displayName = unitNames[unitId] || unitId;
  const isHighWait = stats.tempo_medio > 15;

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-col justify-between min-w-[200px]">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{displayName}</h3>
        <Ticket size={16} className="text-slate-300" />
      </div>
      
      <div className="flex gap-4 mt-1">
        <div>
          <span className="text-[10px] text-slate-400 font-semibold block">AGUARDANDO</span>
          <div className="flex items-center gap-1 text-2xl font-bold text-slate-700">
            <Users size={20} className="text-blue-500" />
            {stats.fila}
          </div>
        </div>
        <div className="w-px bg-slate-100 mx-1"></div>
        <div>
          <span className="text-[10px] text-slate-400 font-semibold block">MÉDIA ESPERA</span>
          <div className={`flex items-center gap-1 text-lg font-bold ${isHighWait ? 'text-amber-600' : 'text-slate-700'}`}>
            <Timer size={18} className={isHighWait ? 'text-amber-500' : 'text-green-500'} />
            {stats.tempo_medio}m
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Componente: Linha do Paciente ---
const PatientRow = ({ patient }: { patient: Patient }) => {
  const isInService = patient.status === 'in_service';
  const isCriticalWait = patient.waitTime > 60 && !isInService;
  const slaPercentage = Math.min((patient.waitTime / 30) * 100, 100);
  
  let slaColor = 'bg-emerald-500'; 
  if (patient.waitTime > 20) slaColor = 'bg-amber-500'; 
  if (patient.waitTime >= 30) slaColor = 'bg-red-500';

  const PriorityIcons = () => (
    <div className="flex items-center gap-1 mr-1 text-slate-500">
      {patient.priority?.isWheelchair && <Accessibility size={14} className="text-blue-600" title="Cadeirante" />}
      {patient.priority?.isPregnant && <Baby size={14} className="text-pink-500" title="Gestante" />}
      {patient.priority?.isElderly && <span className="text-[10px] font-bold bg-slate-200 px-1 rounded text-slate-600" title="Idoso">60+</span>}
    </div>
  );

  return (
    <div className={`
      relative flex justify-between items-start p-2 border-b last:border-0 transition-all duration-500
      hover:bg-gray-50 
      ${isInService ? 'bg-green-50/50' : ''}
      ${isCriticalWait ? 'bg-red-50/60 animate-pulse' : ''} 
    `}>
      <div className="flex-1 min-w-0 pr-2 z-10">
        <div className="flex flex-col"> 
          <div className="flex flex-wrap items-center gap-1 mb-0.5">
             <PriorityIcons />
             {patient.isFirstTime && (
                <span className="bg-cyan-100 text-cyan-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-cyan-200 uppercase tracking-tight shrink-0">
                  1ª Vez
                </span>
             )}
          </div>
          <p className={`font-bold text-sm leading-tight break-words ${isCriticalWait ? 'text-red-900' : 'text-gray-800'}`}>
            {patient.name}
          </p>
        </div>
        <div className="text-[10px] text-gray-500 mt-1 leading-snug space-y-0.5 pl-0.5 border-l-2 border-slate-200 ml-0.5">
            <p className="break-words font-medium text-slate-600 pl-1">{patient.service}</p>
            {patient.professional && (
              <p className="break-words text-slate-400 italic pl-1">{patient.professional}</p>
            )}
        </div>
      </div>
      <div className="flex flex-col items-end shrink-0 min-w-[65px] z-10">
        {isInService ? (
          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[9px] font-bold rounded-full border border-green-200 uppercase tracking-wide">
            Em Atend.
          </span>
        ) : (
          <div className={`
             flex items-center gap-1 font-bold text-xs
             ${patient.waitTime > 30 ? 'text-red-600' : 'text-amber-600'}
          `}>
            <Clock size={12} />
            <span>{patient.waitTime} min</span>
          </div>
        )}
        <span className="text-[10px] text-gray-400 mt-1 tabular-nums">
           {patient.arrival}
        </span>
      </div>
      {!isInService && (
          <div className="absolute bottom-0 left-0 h-[3px] w-full bg-slate-100 opacity-80">
            <div 
                className={`h-full ${slaColor} transition-all duration-1000`} 
                style={{ width: `${slaPercentage}%` }}
            />
          </div>
      )}
    </div>
  );
};

// --- Componente: Card da Unidade Médica (CORRIGIDO) ---
const MedicUnitCard = ({ unit }: { unit: UnitData }) => {
  const [animationParent] = useAutoAnimate();

  // CORREÇÃO CRÍTICA: Garante que patients é um array vazio se vier undefined
  const patients = unit.patients || [];

  const metrics = useMemo(() => {
    // Agora usamos 'patients' que é seguro, e não 'unit.patients'
    const waiting = patients.filter(p => p.status === 'waiting');
    const inService = patients.filter(p => p.status === 'in_service');
    const totalWaitTime = waiting.reduce((acc, curr) => acc + curr.waitTime, 0);
    const avgWait = waiting.length > 0 ? Math.round(totalWaitTime / waiting.length) : 0;

    return { waitingCount: waiting.length, inServiceCount: inService.length, avgWait: avgWait };
  }, [patients]);

  const isHighLoad = metrics.avgWait > 45 || metrics.waitingCount > 10;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-[500px]">
      <div className="p-3 border-b border-gray-100 bg-gray-50 rounded-t-lg shrink-0">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-gray-700 uppercase text-sm tracking-wide truncate" title={unit.name}>
            {unit.name}
          </h3>
          <span className="bg-white text-gray-500 text-[10px] font-bold px-2 py-0.5 rounded border border-gray-200 shadow-sm">
            Total: {patients.length}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
            <div className="bg-blue-50/50 p-2 rounded border border-blue-100 flex flex-col items-center justify-center">
                <span className="text-[9px] text-blue-600 uppercase font-bold tracking-wider">Fila</span>
                <div className="flex items-center gap-1 text-blue-700 font-bold text-lg leading-none mt-1">
                    <Users size={16} />
                    {metrics.waitingCount}
                </div>
            </div>
            
            <div className="bg-green-50/50 p-2 rounded border border-green-100 flex flex-col items-center justify-center">
                <span className="text-[9px] text-green-600 uppercase font-bold tracking-wider">Atendendo</span>
                <div className="flex items-center gap-1 text-green-700 font-bold text-lg leading-none mt-1">
                    <Activity size={16} />
                    {metrics.inServiceCount}
                </div>
            </div>

            <div className={`p-2 rounded border flex flex-col items-center justify-center ${isHighLoad ? 'bg-red-50 border-red-100' : 'bg-gray-100 border-gray-200'}`}>
                <span className={`text-[9px] uppercase font-bold tracking-wider ${isHighLoad ? 'text-red-600' : 'text-gray-500'}`}>Méd. Esp.</span>
                <div className={`flex items-center gap-1 font-bold text-lg leading-none mt-1 ${isHighLoad ? 'text-red-700' : 'text-gray-700'}`}>
                    <Clock size={16} />
                    {metrics.avgWait}<span className="text-xs">m</span>
                </div>
            </div>
        </div>
      </div>

      <div ref={animationParent} className="flex-1 overflow-y-auto custom-scrollbar relative">
        {patients.length > 0 ? (
          patients.map((patient, idx) => (
            // Uso de ID + IDX para garantir unicidade da chave
            <PatientRow key={`${patient.id || 'p'}-${idx}`} patient={patient} />
          ))
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
            <Users size={32} className="mb-2 opacity-20" />
            <p className="text-xs font-medium">Sem fila médica</p>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Página Principal ---
export default function MonitorPage() {
  const [medicData, setMedicData] = useState<UnitData[]>([]);
  const [receptionData, setReceptionData] = useState<ReceptionResponse | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<Date | null>(null);
  const [lastUpdatedString, setLastUpdatedString] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDataStale, setIsDataStale] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [resMedic, resRecep] = await Promise.all([
        fetch('/api/queue/medic', { cache: 'no-store' }),
        fetch('/api/queue/reception', { cache: 'no-store' })
      ]);

      if (!resMedic.ok && !resRecep.ok) throw new Error('Falha total na comunicação');

      if (resMedic.ok) {
        const jsonMedic = await resMedic.json();
        const data = Array.isArray(jsonMedic) ? jsonMedic : (jsonMedic?.data || []);
        setMedicData(data);
      }

      if (resRecep.ok) {
        const jsonRecep = await resRecep.json();
        // Fallback seguro se vier null
        setReceptionData(jsonRecep.data || jsonRecep || null);
      }

      const now = new Date();
      setLastUpdatedTime(now);
      setLastUpdatedString(now.toLocaleTimeString('pt-BR'));
      setError(null);
      setIsDataStale(false);

    } catch (err) {
      console.error(err);
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const intervalId = setInterval(fetchData, 15000);
    return () => clearInterval(intervalId);
  }, [fetchData]);

  useEffect(() => {
    const checkStale = setInterval(() => {
      if (lastUpdatedTime) {
        const now = new Date();
        const diffInSeconds = (now.getTime() - lastUpdatedTime.getTime()) / 1000;
        if (diffInSeconds > 300) setIsDataStale(true);
      }
    }, 5000);
    return () => clearInterval(checkStale);
  }, [lastUpdatedTime]);

  return (
    <div className={`p-4 min-h-screen transition-colors duration-500 ${isDataStale ? 'bg-red-50' : 'bg-slate-100'}`}>
      <header className="mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
           <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
             {isDataStale ? <WifiOff className="text-red-600 animate-pulse" /> : <Clock className="text-blue-600" />}
             {isDataStale ? <span className="text-red-600">DADOS DESATUALIZADOS</span> : <span>Painel de Espera</span>}
           </h1>
           <p className={`text-sm mt-1 font-medium ${isDataStale ? 'text-red-500' : 'text-slate-500'}`}>
             {isDataStale ? 'Verifique a conexão. Dados obsoletos.' : 'Monitoramento Integrado (Recepção + Médicos)'}
           </p>
        </div>

        <div className="flex items-center gap-3">
            {error && (
                <div className="flex items-center gap-1 text-red-600 text-xs font-bold bg-red-50 px-3 py-1.5 rounded-full border border-red-100">
                    <AlertCircle size={14} />
                    <span>{error}</span>
                </div>
            )}
            <div className={`flex items-center gap-2 text-xs transition-colors ${isDataStale ? 'text-red-600 font-bold' : 'text-slate-500'}`}>
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isDataStale ? 'bg-red-400' : 'bg-green-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${isDataStale ? 'bg-red-500' : 'bg-green-500'}`}></span>
                </span>
                {lastUpdatedString || '--:--:--'}
            </div>
            <button 
                onClick={fetchData}
                disabled={loading}
                className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold px-4 py-2 rounded-lg border border-slate-200 shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
        </div>
      </header>

      {/* SEÇÃO 1: RECEPÇÃO (KPIs) */}
      <section className="mb-6">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Ticket size={16} /> Chegada na Recepção (Totem)
        </h2>
        
        {loading && !receptionData ? (
           <div className="flex gap-4">
             {/* Key fixa para skeletons */}
             {[1, 2, 3].map(i => <div key={`skel-recep-${i}`} className="h-24 w-48 bg-slate-200 rounded-lg animate-pulse" />)}
           </div>
        ) : receptionData && receptionData.por_unidade ? (
           <div className="flex flex-wrap gap-4">
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-4 rounded-lg shadow-sm flex flex-col justify-between min-w-[200px]">
                  <span className="text-[10px] font-bold opacity-80 uppercase">Visão Geral</span>
                  <div className="flex justify-between items-end">
                     <div>
                        <span className="text-xs opacity-80 block">Total Fila</span>
                        <span className="text-3xl font-bold">{receptionData.global.total_fila}</span>
                     </div>
                     <div className="text-right">
                        <span className="text-xs opacity-80 block">Média Geral</span>
                        <span className="text-xl font-bold">{receptionData.global.tempo_medio}m</span>
                     </div>
                  </div>
              </div>

              {Object.entries(receptionData.por_unidade).map(([id, stats]) => (
                <ReceptionKpiCard key={`recep-unit-${id}`} unitId={id} stats={stats} />
              ))}
           </div>
        ) : (
           <div className="text-slate-400 text-sm italic">Dados de recepção indisponíveis.</div>
        )}
      </section>

      {/* SEÇÃO 2: ESPERA MÉDICA (Lista Detalhada) */}
      <section>
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Activity size={16} /> Fila de Atendimento Médico
        </h2>

        {loading && medicData.length === 0 ? (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                  <div key={`skel-medic-${i}`} className="h-[500px] bg-slate-200 rounded-lg animate-pulse"></div>
              ))}
           </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {medicData.map((unit, idx) => (
                  // Usa ID + Index para garantir chave única no render
                  <MedicUnitCard key={`medic-unit-${unit.id || idx}`} unit={unit} />
              ))}
          </div>
        )}
      </section>
    </div>
  );
}