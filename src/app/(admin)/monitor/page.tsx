'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Clock, Users, Activity, RefreshCw, AlertCircle, Accessibility, Baby, WifiOff } from 'lucide-react';
import { useAutoAnimate } from '@formkit/auto-animate/react';

// --- TIPAGEM ---
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
  patients: Patient[];
}

// --- Componente: Linha do Paciente ---
const PatientRow = ({ patient }: { patient: Patient }) => {
  const isInService = patient.status === 'in_service';
  
  // Regra de Pulse: Apenas se > 60 min E não estiver em atendimento
  const isCriticalWait = patient.waitTime > 60 && !isInService;

  // Regra da Barra de SLA (Meta: 30 min)
  // Calcula porcentagem preenchida (máximo 100%)
  const slaPercentage = Math.min((patient.waitTime / 30) * 100, 100);
  
  // Cor da barra baseada no tempo
  let slaColor = 'bg-emerald-500'; // Até 20 min (Seguro)
  if (patient.waitTime > 20) slaColor = 'bg-amber-500'; // 20-30 min (Atenção)
  if (patient.waitTime >= 30) slaColor = 'bg-red-500';   // 30+ min (Estourou meta)

  // Ícones de Prioridade
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
      {/* NOTA: O 'animate-pulse' padrão do Tailwind afeta a opacidade de tudo. 
         Se achar muito forte, podemos criar uma classe CSS personalizada depois.
      */}

      <div className="flex-1 min-w-0 pr-2 z-10">
        {/* Nome Completo + Ícones + Badges */}
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

      {/* BARRA DE SLA (PROGRESSO DA META DE 30 MIN) */}
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

// --- Componente: Card da Unidade ---
const UnitCard = ({ unit }: { unit: UnitData }) => {
  // Hook de Animação Automática (Lista suave)
  const [animationParent] = useAutoAnimate();

  const metrics = useMemo(() => {
    const waiting = unit.patients.filter(p => p.status === 'waiting');
    const inService = unit.patients.filter(p => p.status === 'in_service');
    
    const totalWaitTime = waiting.reduce((acc, curr) => acc + curr.waitTime, 0);
    const avgWait = waiting.length > 0 ? Math.round(totalWaitTime / waiting.length) : 0;

    return {
      waitingCount: waiting.length,
      inServiceCount: inService.length,
      avgWait: avgWait
    };
  }, [unit.patients]);

  const isHighLoad = metrics.avgWait > 45 || metrics.waitingCount > 10;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-[500px]">
      <div className="p-3 border-b border-gray-100 bg-gray-50 rounded-t-lg shrink-0">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-gray-700 uppercase text-sm tracking-wide truncate" title={unit.name}>
            {unit.name}
          </h3>
          <span className="bg-white text-gray-500 text-[10px] font-bold px-2 py-0.5 rounded border border-gray-200 shadow-sm">
            Total: {unit.patients.length}
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

      {/* Lista com Animação */}
      <div 
        ref={animationParent} 
        className="flex-1 overflow-y-auto custom-scrollbar relative"
      >
        {unit.patients.length > 0 ? (
          unit.patients.map((patient, idx) => (
            <PatientRow key={`${patient.id}-${idx}`} patient={patient} />
          ))
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
            <Users size={32} className="mb-2 opacity-20" />
            <p className="text-xs font-medium">Sem pacientes na fila</p>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Página Principal ---
export default function MonitorPage() {
  const [data, setData] = useState<UnitData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<Date | null>(null); // Objeto Date real
  const [lastUpdatedString, setLastUpdatedString] = useState<string | null>(null); // Texto formatado
  const [error, setError] = useState<string | null>(null);
  
  // Estado para controlar se os dados estão "velhos" (Stale)
  const [isDataStale, setIsDataStale] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/queue', { cache: 'no-store' });
      if (!response.ok) throw new Error('Falha ao buscar dados');
      
      const jsonData = await response.json();
      if (Array.isArray(jsonData)) {
        setData(jsonData);
        const now = new Date();
        setLastUpdatedTime(now);
        setLastUpdatedString(now.toLocaleTimeString('pt-BR'));
        setError(null);
        setIsDataStale(false); // Reseta alerta de stale
      }
    } catch (err) {
      console.error(err);
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }, []);

  // Polling de Dados (15s)
  useEffect(() => {
    fetchData();
    const intervalId = setInterval(fetchData, 15000);
    return () => clearInterval(intervalId);
  }, [fetchData]);

  // Verificador de "Dados Obsoletos" (Roda a cada 5 segundos)
  useEffect(() => {
    const checkStale = setInterval(() => {
      if (lastUpdatedTime) {
        const now = new Date();
        const diffInSeconds = (now.getTime() - lastUpdatedTime.getTime()) / 1000;
        
        // Se a diferença for maior que 300 segundos (5 minutos), ativa o alerta
        if (diffInSeconds > 300) {
            setIsDataStale(true);
        }
      }
    }, 5000);

    return () => clearInterval(checkStale);
  }, [lastUpdatedTime]);

  return (
    <div className={`p-4 min-h-screen transition-colors duration-500 ${isDataStale ? 'bg-red-50' : 'bg-slate-100'}`}>
      <header className="mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
           {/* Título Muda se estiver Obsoleto */}
           <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
             {isDataStale ? (
                 <WifiOff className="text-red-600 animate-pulse" />
             ) : (
                 <Clock className="text-blue-600" />
             )}
             
             {isDataStale ? (
                 <span className="text-red-600">DADOS DESATUALIZADOS</span>
             ) : (
                 <span>Painel de Espera</span>
             )}
           </h1>
           
           <p className={`text-sm mt-1 font-medium ${isDataStale ? 'text-red-500' : 'text-slate-500'}`}>
             {isDataStale 
               ? 'Verifique a conexão do servidor. Os dados exibidos não são atuais.' 
               : 'Monitoramento em Tempo Real'}
           </p>
        </div>

        <div className="flex items-center gap-3">
            {error ? (
                <div className="flex items-center gap-1 text-red-600 text-xs font-bold bg-red-50 px-3 py-1.5 rounded-full border border-red-100">
                    <AlertCircle size={14} />
                    <span>{error}</span>
                </div>
            ) : (
                <div className={`flex items-center gap-2 text-xs transition-colors ${isDataStale ? 'text-red-600 font-bold' : 'text-slate-500'}`}>
                    <span className="relative flex h-2 w-2">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isDataStale ? 'bg-red-400' : 'bg-green-400'}`}></span>
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${isDataStale ? 'bg-red-500' : 'bg-green-500'}`}></span>
                    </span>
                    Atualizado às {lastUpdatedString || '--:--:--'}
                </div>
            )}
            
            <button 
                onClick={fetchData}
                disabled={loading}
                className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold px-4 py-2 rounded-lg border border-slate-200 shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                {loading ? '...' : 'Atualizar'}
            </button>
        </div>
      </header>

      {loading && data.length === 0 ? (
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
                <div key={i} className="h-[500px] bg-slate-200 rounded-lg animate-pulse"></div>
            ))}
         </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.map((unit) => (
                <UnitCard key={unit.id} unit={unit} />
            ))}
        </div>
      )}
    </div>
  );
}