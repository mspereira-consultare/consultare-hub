import React from 'react';
import { Clock, Accessibility, Baby } from 'lucide-react';
import { Patient } from '../types';

export const PatientRow = ({ patient }: { patient: Patient }) => {
  const isInService = patient.status === 'in_service';
  const isCriticalWait = patient.waitTime > 60 && !isInService;
  
  // Cores do SLA
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
    </div>
  );
};