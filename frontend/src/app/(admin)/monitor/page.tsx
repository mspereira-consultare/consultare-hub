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
  const [alertIntervalSeconds, setAlertIntervalSeconds] = useState(30);
  const [isAlertConfigOpen, setIsAlertConfigOpen] = useState(false);
  const [alertIntervalInput, setAlertIntervalInput] = useState('30');
  const audioContextRef = useRef<AudioContext | null>(null);
  const alertIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alertIntervalMsRef = useRef<number | null>(null);
  const WAIT_ALERT_MINUTES = 30;
  const ALERT_INTERVAL_MIN = 1;
  const ALERT_INTERVAL_MAX = 300;

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
        const waitMinutes = Number(p?.waitTime ?? 0);
        return waitMinutes > WAIT_ALERT_MINUTES;
      });
      return (waiters?.length || 0) > 0;
    });
  };

  const stopAlertLoop = () => {
    if (alertIntervalRef.current) {
      clearInterval(alertIntervalRef.current);
      alertIntervalRef.current = null;
    }
  };

  const getAlertIntervalMs = () => {
    const seconds = Number(alertIntervalSeconds);
    const safeSeconds = Number.isFinite(seconds)
      ? Math.min(Math.max(seconds, ALERT_INTERVAL_MIN), ALERT_INTERVAL_MAX)
      : 30;
    return Math.round(safeSeconds * 1000);
  };

  const startAlertLoop = () => {
    const intervalMs = getAlertIntervalMs();
    if (alertIntervalRef.current && alertIntervalMsRef.current === intervalMs) return;
    if (alertIntervalRef.current) {
      clearInterval(alertIntervalRef.current);
      alertIntervalRef.current = null;
    }
    alertIntervalMsRef.current = intervalMs;
    playBeep();
    alertIntervalRef.current = setInterval(() => {
      playBeep();
    }, intervalMs);
  };

  const handleToggleAlerts = async () => {
    if (!alertsEnabled) {
      setAlertsEnabled(true);
      const unlocked = await unlockAudio();
      if (unlocked && hasLongWaiters(medicData)) {
        startAlertLoop();
      }
      return;
    }
    if (alertsEnabled && !audioUnlocked) {
      const unlocked = await unlockAudio();
      if (unlocked && hasLongWaiters(medicData)) {
        startAlertLoop();
      }
      return;
    }
    setAlertsEnabled(false);
    stopAlertLoop();
  };

  const openAlertConfig = () => {
    setAlertIntervalInput(String(alertIntervalSeconds));
    setIsAlertConfigOpen(true);
  };

  const applyAlertInterval = () => {
    const raw = Number(String(alertIntervalInput).replace(',', '.'));
    const safeSeconds = Number.isFinite(raw)
      ? Math.min(Math.max(raw, ALERT_INTERVAL_MIN), ALERT_INTERVAL_MAX)
      : alertIntervalSeconds;
    setAlertIntervalSeconds(safeSeconds);
    setIsAlertConfigOpen(false);
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
    if (!alertsEnabled || !audioUnlocked) {
      stopAlertLoop();
      return;
    }
    if (medicData.length === 0) {
      stopAlertLoop();
      return;
    }

    const longWait = hasLongWaiters(medicData);

    if (longWait) {
      startAlertLoop();
    } else {
      stopAlertLoop();
    }
  }, [medicData, alertsEnabled, audioUnlocked, alertIntervalSeconds]);

  useEffect(() => {
    return () => {
      stopAlertLoop();
    };
  }, []);


  return (
    <>
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
        alertIntervalSeconds={alertIntervalSeconds}
        onOpenAlertConfig={openAlertConfig}
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
    {isAlertConfigOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-sm border border-slate-200">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700">Intervalo do Alerta Sonoro</h3>
            <button
              onClick={() => setIsAlertConfigOpen(false)}
              className="text-slate-400 hover:text-slate-600 text-sm"
            >
              Fechar
            </button>
          </div>
          <div className="p-4 space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">
                Intervalo (segundos)
              </label>
              <input
                type="number"
                min={ALERT_INTERVAL_MIN}
                max={ALERT_INTERVAL_MAX}
                value={alertIntervalInput}
                onChange={(e) => setAlertIntervalInput(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[11px] text-slate-400">
                Mínimo {ALERT_INTERVAL_MIN}s • Máximo {ALERT_INTERVAL_MAX}s
              </p>
            </div>
          </div>
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50">
            <button
              onClick={() => setIsAlertConfigOpen(false)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800"
            >
              Cancelar
            </button>
            <button
              onClick={applyAlertInterval}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Salvar
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
