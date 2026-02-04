'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const alertTriggeredRef = useRef(false);
  const WAIT_ALERT_MINUTES = 30;

  const ensureAudioContext = () => {
    if (!audioContextRef.current && typeof window !== 'undefined') {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      if (Ctx) audioContextRef.current = new Ctx();
    }
    return audioContextRef.current;
  };

  const unlockAudio = async () => {
    const ctx = ensureAudioContext();
    if (!ctx) return false;
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      const ready = ctx.state === 'running';
      setAudioUnlocked(ready);
      return ready;
    } catch {
      setAudioUnlocked(false);
      return false;
    }
  };

  const playBeep = () => {
    const ctx = audioContextRef.current;
    if (!ctx || ctx.state !== 'running') return;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.value = 800;
    gainNode.gain.setValueAtTime(0.25, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.5);
  };

  const hasLongWaiters = (units: UnitData[]) => {
    return units.some((unit) => {
      const waiters = unit.patients?.filter((p: any) => {
        if (p.status !== 'waiting') return false;
        if (!p.checkInTime) return false;
        const now = new Date();
        const checkInTime = new Date(p.checkInTime);
        const waitTimeMinutes = (now.getTime() - checkInTime.getTime()) / (1000 * 60);
        return waitTimeMinutes > WAIT_ALERT_MINUTES;
      });
      return (waiters?.length || 0) > 0;
    });
  };

  const handleToggleAlerts = async () => {
    if (!alertsEnabled) {
      setAlertsEnabled(true);
      const unlocked = await unlockAudio();
      if (unlocked && hasLongWaiters(medicData)) {
        playBeep();
        alertTriggeredRef.current = true;
      }
      return;
    }
    if (alertsEnabled && !audioUnlocked) {
      const unlocked = await unlockAudio();
      if (unlocked && hasLongWaiters(medicData)) {
        playBeep();
        alertTriggeredRef.current = true;
      }
      return;
    }
    setAlertsEnabled(false);
  };

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
        const parsed = Array.isArray(json) ? json : json?.data;
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMedicData(parsed);
        }
      }

      if (resRecep.ok) {
        const json = await resRecep.json();
        const parsed = json?.data || json;
        if (parsed && Object.keys(parsed).length > 0) {
          setReceptionData(parsed);
        }
      }

      if (resWhats.ok) {
        const json = await resWhats.json();
        if (json?.data) {
          setWhatsAppData(json.data);
        }
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
      setIsDataStale(prev => {
        if (!lastUpdatedTime) return prev;
        return (new Date().getTime() - lastUpdatedTime.getTime()) > 300000;
      });
    }, 5000);

    return () => {
      clearInterval(intervalId);
      clearInterval(staleId);
    };
  }, [fetchData]);

  useEffect(() => {
    if (!alertsEnabled) {
      alertTriggeredRef.current = false;
      return;
    }
    if (medicData.length === 0) return;

    const longWait = hasLongWaiters(medicData);

    if (longWait && !alertTriggeredRef.current) {
      playBeep();
      alertTriggeredRef.current = true;
      setTimeout(() => {
        alertTriggeredRef.current = false;
      }, 5 * 60 * 1000);
    } else if (!longWait) {
      alertTriggeredRef.current = false;
    }
  }, [medicData, alertsEnabled, audioUnlocked]);


  return (
    <div className={`p-4 min-h-screen transition-colors duration-500 ${isDataStale ? 'bg-red-50' : 'bg-slate-100'}`}>
      
      <MonitorHeader 
        isDataStale={isDataStale}
        lastUpdatedString={lastUpdatedString}
        loading={loading}
        onRefresh={fetchData}
        whatsAppData={whatsAppData}
        alertsEnabled={alertsEnabled}
        audioUnlocked={audioUnlocked}
        onToggleAlerts={handleToggleAlerts}
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
