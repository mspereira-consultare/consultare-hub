import React, { useMemo } from 'react';
import { Users, Activity, Clock, Ticket, CheckCircle2 } from 'lucide-react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { UnitData, ReceptionUnitStats } from '../types';
import { PatientRow } from './PatientRow';
import { formatMinutesToHours } from '@/lib/utils'; // Importa a função utilitária

interface UnitCardProps {
  unit: UnitData;
  receptionStats?: ReceptionUnitStats;
}

export const UnitCard = ({ unit, receptionStats }: UnitCardProps) => {
  const [animationParent] = useAutoAnimate(); // Ativa animações automáticas na lista
  const patients = unit.patients || [];

  // Métricas da Fila Médica Atual
  const metrics = useMemo(() => {
    const waiting = patients.filter(p => p.status === 'waiting');
    const inService = patients.filter(p => p.status === 'in_service');
    return { 
      waitingCount: waiting.length, 
      inServiceCount: inService.length 
    };
  }, [patients]);

  // Nova métrica: Média do dia vinda da API
  const displayAvgWait = unit.averageWaitDay ?? 0;

  // Definição de alertas visuais na borda do card
  const isMedicalHigh = metrics.waitingCount > 10 || displayAvgWait > 30;
  const isReceptionHigh = receptionStats ? receptionStats.fila > 15 : false;
  
  let borderColor = "border-gray-200";
  if (isReceptionHigh) borderColor = "border-amber-300 ring-1 ring-amber-100";
  if (isMedicalHigh) borderColor = "border-red-300 ring-1 ring-red-100";

  return (
    <div className={`bg-white rounded-lg shadow-sm border flex flex-col h-[520px] transition-colors ${borderColor}`}>
      
      {/* --- HEADER UNIFICADO --- */}
      <div className="p-3 border-b border-gray-100 bg-slate-50/50 rounded-t-lg shrink-0">
        
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-gray-700 uppercase text-sm tracking-wide truncate" title={unit.name}>
            {unit.name}
          </h3>
          {/* Indicador de pacientes em consulta agora */}
          <div className="flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-200">
             <Activity size={10} />
             Em sala: {metrics.inServiceCount}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
            
            {/* Bloco 1: Recepção */}
            <div className="bg-white p-2 rounded border border-slate-100 shadow-sm flex flex-col relative overflow-hidden">
                <div className="absolute top-0 right-0 p-1 opacity-[0.03]">
                    <Ticket size={40} />
                </div>
                
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Ticket size={10} /> Recepção
                </span>
                
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px]">
                      <span className="text-slate-500">Fila:</span>
                      <span className="font-bold text-slate-700 text-xs">{receptionStats?.fila ?? '-'}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                      <span className="text-slate-500">Média:</span>
                      <span className={`font-bold text-xs ${(receptionStats?.tempo_medio || 0) > 15 ? 'text-amber-600' : 'text-slate-700'}`}>
                          {formatMinutesToHours(receptionStats?.tempo_medio || 0)}
                      </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] pt-1 border-t border-slate-50 mt-1">
                      <span className="text-slate-400">Atendidos:</span>
                      <span className="font-bold text-slate-600">{receptionStats?.total_passaram ?? 0}</span>
                  </div>
              </div>
            </div>

            {/* Bloco 2: Médico (Usando média do dia) */}
            <div className="bg-white p-2 rounded border border-slate-100 shadow-sm flex flex-col relative overflow-hidden">
                <div className="absolute top-0 right-0 p-1 opacity-[0.03]">
                    <Activity size={40} />
                </div>

                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Activity size={10} /> Médico
                </span>

                <div className="space-y-1">
                    <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-500">Fila:</span>
                        <span className="font-bold text-slate-700 text-xs">{metrics.waitingCount}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-500">Média (Dia):</span>
                        <span className={`font-bold text-xs ${displayAvgWait > 30 ? 'text-red-600' : 'text-slate-700'}`}>
                            {formatMinutesToHours(displayAvgWait)}
                        </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] pt-1 border-t border-slate-50 mt-1">
                        <span className="text-slate-400">Atendidos:</span>
                        <span className="font-bold text-slate-600">{unit.totalAttended ?? 0}</span>
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* --- LISTA DE PACIENTES (Scrollbar oculta) --- */}
      <div 
        ref={animationParent} 
        className="flex-1 overflow-y-auto relative bg-white [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']"
      >
        {patients.length > 0 ? (
          patients.map((patient, idx) => (
            <PatientRow key={`${patient.id || 'p'}-${idx}`} patient={patient} />
          ))
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300">
            <Users size={32} className="mb-2 opacity-20" />
            <p className="text-xs font-medium">Fila médica vazia</p>
          </div>
        )}
      </div>
    </div>
  );
};