'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { UnitData, ReceptionResponse, WhatsAppResponse } from './types';
import { UnitCard } from './components/UnitCard';
import { MonitorHeader } from './components/MonitorHeader';

const MEDIC_TO_RECEPTION_MAP: Record<string, string> = {
  "Ouro Verde": "2",
  "Centro Cambui": "3", 
  "Campinas Shopping": "12",
};

export default function MonitorPage() {
  const [medicData, setMedicData] = useState<UnitData[]>([]);
  const [receptionData, setReceptionData] = useState<ReceptionResponse | null>(null);
  const [whatsAppData, setWhatsAppData] = useState<WhatsAppResponse | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<Date | null>(null);
  const [lastUpdatedString, setLastUpdatedString] = useState<string | null>(null);
  const [isDataStale, setIsDataStale] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      // setLoading(true); // Opcional
      
      const [resMedic, resRecep, resWhats] = await Promise.all([
        fetch('/api/queue/medic', { cache: 'no-store' }),
        fetch('/api/queue/reception', { cache: 'no-store' }),
        fetch('/api/queue/whatsapp', { cache: 'no-store' })
      ]);

      if (resMedic.ok) {
        const json = await resMedic.json();
        setMedicData(Array.isArray(json) ? json : (json?.data || []));
      }

      if (resRecep.ok) {
        const json = await resRecep.json();
        setReceptionData(json.data || json || null);
      }

      if (resWhats.ok) {
        const json = await resWhats.json();
        setWhatsAppData(json.data || null);
      }

      const now = new Date();
      setLastUpdatedTime(now);
      setLastUpdatedString(now.toLocaleTimeString('pt-BR'));
      setIsDataStale(false);

    } catch (err) {
      console.error('Erro de conexão:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const intervalId = setInterval(fetchData, 15000);
    
    const staleId = setInterval(() => {
        if (lastUpdatedTime && (new Date().getTime() - lastUpdatedTime.getTime()) > 300000) {
            setIsDataStale(true);
        }
    }, 5000);
    
    return () => { clearInterval(intervalId); clearInterval(staleId); };
  }, [fetchData, lastUpdatedTime]);

  return (
    <div className={`p-4 min-h-screen transition-colors duration-500 ${isDataStale ? 'bg-red-50' : 'bg-slate-100'}`}>
      
      <MonitorHeader 
        isDataStale={isDataStale}
        lastUpdatedString={lastUpdatedString}
        loading={loading}
        onRefresh={fetchData}
        whatsAppData={whatsAppData}
      />

      {loading && medicData.length === 0 ? (
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="h-[500px] bg-slate-200 rounded-lg animate-pulse" />)}
         </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {medicData.map((unit, idx) => {
                const receptionId = MEDIC_TO_RECEPTION_MAP[unit.id] || "0";
                const unitReceptionStats = receptionData?.por_unidade?.[receptionId];
                return (
                    <UnitCard 
                        key={`unit-${unit.id || idx}`} 
                        unit={unit} 
                        receptionStats={unitReceptionStats} 
                    />
                );
            })}
        </div>
      )}
    </div>
  );
}