'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Users, 
  Clock, 
  DollarSign, 
  MessageCircle, 
  TrendingUp, 
  Activity,
  Phone,
  RefreshCw,
  Building2,
  Star
} from 'lucide-react';

// --- Interfaces ---
interface DashboardData {
  medic: any[];
  reception: any;
  whatsapp: any;
  finance: any;
  financeByUnit?: any;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [goalsData, setGoalsData] = useState<any[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const alertTriggeredRef = useRef<boolean>(false);

  const fetchDashboardData = useCallback(async (isManual = false) => {
    if (isManual) {
      setLoading(true);
      // Ativa o worker de faturamento analítico quando refresh manual é clicado
      try {
        await fetch('/api/admin/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ service: 'worker_faturamento_scraping' })
        });
      } catch (error) {
        console.error("Erro ao ativar worker de faturamento:", error);
      }
    }
    
    try {
      const today = new Date();
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      const monthEnd = new Date().toISOString().split('T')[0];
      
      const [resMedic, resRecep, resWhats, resFinance, resFinanceByUnit, resGoals] = await Promise.all([
        fetch('/api/queue/medic').then(r => r.json()),
        fetch('/api/queue/reception').then(r => r.json()),
        fetch('/api/queue/whatsapp').then(r => r.json()),
        fetch(`/api/admin/financial/history?startDate=${monthStart}&endDate=${monthEnd}`).then(r => r.json()),
        fetch(`/api/admin/financial/history?startDate=${monthStart}&endDate=${monthEnd}&unit=all`).then(r => r.json()),
        fetch('/api/admin/goals/dashboard').then(r => r.json())
      ]);

      setData({
        medic: resMedic.data || [],
        reception: resRecep.data || { global: { total_fila: 0, tempo_medio: 0 }, por_unidade: {} },
        whatsapp: resWhats.data || { global: { queue: 0, avgWaitSeconds: 0 }, groups: [] },
        finance: resFinance || { totals: { total: 0, qtd: 0 } },
        financeByUnit: resFinanceByUnit || { totals: { total: 0, qtd: 0 } }
      });
      setGoalsData(Array.isArray(resGoals) ? resGoals : []);
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Erro ao carregar dashboard:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(() => fetchDashboardData(false), 60000); 
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  // --- EFEITO: VERIFICAR PACIENTES AGUARDANDO HÁ MAIS DE 30 MINUTOS ---
  useEffect(() => {
    if (!data?.medic) return;

    // Verifica se há pacientes aguardando mais de 30 minutos
    const hasLongWaiters = data.medic.some((unit: any) => {
      const waitersOver30 = unit.patients?.filter((p: any) => {
        if (p.status !== 'waiting') return false;
        if (!p.checkInTime) return false;
        
        const now = new Date();
        const checkInTime = new Date(p.checkInTime);
        const waitTimeMinutes = (now.getTime() - checkInTime.getTime()) / (1000 * 60);
        return waitTimeMinutes > 30;
      });
      return (waitersOver30?.length || 0) > 0;
    });

    // Se há pacientes aguardando há mais de 30 minutos e alerta ainda não foi disparado
    if (hasLongWaiters && !alertTriggeredRef.current) {
      // Toca o som de alerta
      try {
        if (!audioRef.current) {
          // Cria um AudioContext para gerar um beep sonoro se nenhum arquivo de áudio estiver disponível
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillator.frequency.value = 800; // Frequência do som
          oscillator.type = 'sine';
          
          gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
          
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.5);
        } else {
          audioRef.current.play().catch(e => console.error("Erro ao tocar som:", e));
        }
        
        alertTriggeredRef.current = true;
        
        // Reseta o alerta após 5 minutos para permitir novo alerta
        setTimeout(() => {
          alertTriggeredRef.current = false;
        }, 5 * 60 * 1000);
      } catch (error) {
        console.error("Erro ao disparar alerta sonoro:", error);
      }
    } else if (!hasLongWaiters) {
      alertTriggeredRef.current = false;
    }
  }, [data?.medic]);

  if (!data && loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="animate-spin text-blue-600" size={32} />
          <p className="text-slate-500 font-medium animate-pulse">Sincronizando Dashboard Geral...</p>
        </div>
      </div>
    );
  }

  // Consolidação de Dados
  const totalFilaMedica = data?.medic.reduce((acc, u) => acc + (u.patients?.filter((p:any) => p.status === 'waiting').length || 0), 0) || 0;
  const totalAtendidosHoje = data?.medic.reduce((acc, u) => acc + (u.totalAttended || 0), 0) || 0;

  // Lógica de Grupos WhatsApp
  const allGroups = data?.whatsapp?.groups || [];
  const centralGroup = allGroups.find((g: any) => g.group_name.trim() === 'Central de relacionamento');
  const otherGroups = allGroups.filter((g: any) => g.group_name.trim() !== 'Central de relacionamento').slice(0, 4);

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Audio element para alerta sonoro */}
      <audio 
        ref={audioRef} 
        src="data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA=="
        style={{ display: 'none' }}
      />
      
      {/* Header Clean */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard Geral</h1>
          <p className="text-sm text-slate-500">Acompanhamento operacional em tempo real</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-bold text-slate-400 uppercase leading-none">Última Atualização</p>
            <p className="text-sm font-medium text-slate-600">{lastUpdate.toLocaleTimeString()}</p>
          </div>
          <button 
            onClick={() => fetchDashboardData(true)}
            className="p-2.5 bg-white rounded-full border border-slate-200 shadow-sm hover:bg-slate-50 active:scale-95 transition-all group"
            title="Atualizar Dashboard e ativar worker de faturamento analítico"
          >
            <RefreshCw size={20} className={`${loading ? 'animate-spin' : 'group-hover:rotate-180'} text-blue-600 transition-transform duration-500`} />
          </button>
        </div>
      </div>

      {/* --- LINHA 1: CARDS DE KPI (Filas primeiro) --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard 
          title="Fila Médica" 
          value={totalFilaMedica}
          icon={<Activity size={20} />}
          trend={`${totalAtendidosHoje} concluídos hoje`}
          color="amber"
        />
        <KpiCard 
          title="Fila Recepção" 
          value={data?.reception?.global?.total_fila || 0}
          icon={<Users size={20} />}
          trend={`Tempo médio: ${data?.reception?.global?.tempo_medio || 0} min`}
          color="blue"
        />
        <KpiCard 
          title="WhatsApp Digital" 
          value={data?.whatsapp?.global?.queue || 0}
          icon={<MessageCircle size={20} />}
          trend="Pacientes ativos no hub"
          color="cyan"
        />
        <KpiCard 
          title="Fila Telefone" 
          value={'-'}
          icon={<Phone size={20} />}
          trend="Placeholder: integrações telefônicas"
          color="emerald"
        />
      </div>

      {/* --- LINHA 2: DETALHES --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Coluna 1: Recepção */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-50 pb-3">
            <Building2 size={18} className="text-slate-400" />
            <h2 className="font-bold text-slate-700">Fluxo de Recepção</h2>
          </div>
          <div className="space-y-3">
            {Object.entries(data?.reception?.por_unidade || {}).map(([id, info]: [string, any]) => (
              <div key={id} className="flex justify-between items-center p-3 bg-slate-50/50 rounded-lg border border-slate-100">
                <div>
                  <p className="text-sm font-bold text-slate-700">{info.nome_unidade}</p>
                  <p className="text-[10px] text-slate-400 font-medium">{info.total_passaram} ATENDIMENTOS HOJE</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-blue-600 leading-none">{info.fila}</p>
                  <p className="text-[9px] uppercase font-bold text-slate-400 mt-1">Fila</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Coluna 2: Médicos */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-50 pb-3">
            <Activity size={18} className="text-slate-400" />
            <h2 className="font-bold text-slate-700">Aguardando Médico</h2>
            {data?.medic?.some((unit: any) => {
              const waitersOver30 = unit.patients?.filter((p: any) => {
                if (p.status !== 'waiting') return false;
                if (!p.checkInTime) return false;
                const now = new Date();
                const checkInTime = new Date(p.checkInTime);
                const waitTimeMinutes = (now.getTime() - checkInTime.getTime()) / (1000 * 60);
                return waitTimeMinutes > 30;
              });
              return (waitersOver30?.length || 0) > 0;
            }) && (
              <span className="ml-auto px-2 py-1 text-[9px] font-bold bg-red-500 text-white rounded-full animate-pulse">
                ⚠️ ALERTA 30+min
              </span>
            )}
          </div>
          <div className="space-y-3">
            {data?.medic.map((unit: any) => {
              const waiting = unit.patients?.filter((p:any) => p.status === 'waiting').length || 0;
              const waitersOver30 = unit.patients?.filter((p: any) => {
                if (p.status !== 'waiting') return false;
                if (!p.checkInTime) return false;
                const now = new Date();
                const checkInTime = new Date(p.checkInTime);
                const waitTimeMinutes = (now.getTime() - checkInTime.getTime()) / (1000 * 60);
                return waitTimeMinutes > 30;
              }).length || 0;
              
              return (
                <div 
                  key={unit.id} 
                  className={`flex justify-between items-center p-3 rounded-lg border ${
                    waitersOver30 > 0
                      ? 'bg-red-50 border-red-200'
                      : 'bg-slate-50/50 border-slate-100'
                  }`}
                >
                  <div>
                    <p className="text-sm font-bold text-slate-700">{unit.name}</p>
                    <p className="text-[10px] text-slate-400 font-medium">ESPERA MÉDIA: {unit.averageWaitDay} MIN</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xl font-black leading-none ${
                      waitersOver30 > 0 ? 'text-red-600' : 'text-amber-600'
                    }`}>
                      {waiting}
                    </p>
                    <p className="text-[9px] uppercase font-bold text-slate-400 mt-1">Pacientes</p>
                    {waitersOver30 > 0 && (
                      <p className="text-[8px] text-red-600 font-bold mt-1">{waitersOver30} 30+ min</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Coluna 3: WhatsApp (Com Destaque na Central) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-50 pb-3">
            <MessageCircle size={18} className="text-slate-400" />
            <h2 className="font-bold text-slate-700">Demanda WhatsApp</h2>
          </div>
          
          <div className="space-y-4">
            {/* DESTAQUE: CENTRAL DE RELACIONAMENTO */}
            {centralGroup && (
              <div className="p-4 bg-cyan-50 border border-cyan-100 rounded-xl relative group overflow-hidden">
                <div className="absolute right-0 top-0 p-1 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Star size={40} className="text-cyan-600" />
                </div>
                <div className="flex justify-between items-center relative z-10">
                  <div className="flex items-center gap-2">
                    <Star size={14} className="text-cyan-600 fill-cyan-600" />
                    <span className="text-xs font-black text-cyan-800 uppercase tracking-tighter">
                      {centralGroup.group_name}
                    </span>
                  </div>
                  <span className="text-2xl font-black text-cyan-700">{centralGroup.queue_size}</span>
                </div>
                <div className="mt-2 w-full bg-cyan-200/50 h-1.5 rounded-full overflow-hidden">
                   <div className="bg-cyan-600 h-full" style={{ width: `${Math.min((centralGroup.queue_size / 15) * 100, 100)}%` }} />
                </div>
              </div>
            )}

            {/* Outros Grupos */}
            <div className="space-y-3 pt-2">
              {otherGroups.map((group: any) => (
                <div key={group.group_id} className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 font-medium truncate max-w-[160px]">{group.group_name}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-16 bg-slate-100 h-1.5 rounded-full hidden sm:block">
                      <div className="bg-slate-300 h-full rounded-full" style={{ width: `${Math.min((group.queue_size / 15) * 100, 100)}%` }} />
                    </div>
                    <span className="font-bold text-slate-700 w-5 text-right">{group.queue_size}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* --- LINHA 3: FATURAMENTO POR UNIDADE --- */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 mb-4 border-b border-slate-50 pb-3">
          <DollarSign size={18} className="text-slate-400" />
          <h2 className="font-bold text-slate-700">Faturamento Consolidado (Mês Atual)</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Card: Consolidado */}
          <div className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100/30 border border-emerald-200 rounded-lg">
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">Total Consolidado (Mês)</p>
            <p className="text-3xl font-black text-emerald-900">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data?.finance?.totals?.total || 0)}
            </p>
            <p className="text-xs text-emerald-600 mt-2">Guias processadas: <strong>{data?.finance?.totals?.qtd || 0}</strong></p>
          </div>
          
          {/* Card: Ticket Médio */}
          <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100/30 border border-blue-200 rounded-lg">
            <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1">Ticket Médio (Mês)</p>
            <p className="text-3xl font-black text-blue-900">
              {data?.finance?.totals?.qtd && data?.finance?.totals?.qtd > 0
                ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((data?.finance?.totals?.total || 0) / data?.finance?.totals?.qtd)
                : 'R$ 0,00'
              }
            </p>
            <p className="text-xs text-blue-600 mt-2">Valor médio por guia</p>
          </div>
        </div>

        {/* Tabela de Unidades - Faturamento do Mês */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="px-3 py-2 font-bold text-slate-600">Unidade</th>
                <th className="px-3 py-2 text-right font-bold text-slate-600">Faturado (Mês)</th>
                <th className="px-3 py-2 text-right font-bold text-slate-600">Guias</th>
                <th className="px-3 py-2 text-right font-bold text-slate-600">Ticket Médio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(() => {
                const unitsBilling = data?.financeByUnit?.unitsBilling || [];
                
                if (unitsBilling && unitsBilling.length > 0) {
                  return unitsBilling.map((unit: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2.5 font-medium text-slate-700">{unit.name || 'N/A'}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-600 font-bold">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(unit.total || 0)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-600 font-medium">{unit.qtd || 0}</td>
                      <td className="px-3 py-2.5 text-right text-slate-500 text-xs">
                        {unit.qtd && unit.qtd > 0
                          ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(unit.total / unit.qtd)
                          : 'R$ 0,00'
                        }
                      </td>
                    </tr>
                  ));
                } else {
                  return (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-slate-400 text-sm">Sem dados de faturamento por unidade disponíveis</td>
                    </tr>
                  );
                }
              })()}
            </tbody>
            </tbody>
          </table>
        </div>
      </div>

      {/* --- LINHA 4: MONITORAMENTO DE METAS --- */}
      {goalsData && goalsData.length > 0 && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-50 pb-3">
            <TrendingUp size={18} className="text-slate-400" />
            <h2 className="font-bold text-slate-700">Monitoramento de Metas</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {goalsData.map((goal: any) => {
              // Calcula projeção considerando a periodicidade
              let projLabel = 'Projeção (mês):';
              let projectedValue = 0;
              
              if (goal.periodicity === 'daily') {
                const now = new Date();
                const hoursPassed = now.getHours();
                const hoursInDay = 11;
                const hourlyRate = hoursPassed > 0 ? goal.current / hoursPassed : 0;
                projectedValue = hourlyRate * hoursInDay;
                projLabel = `Projeção (hoje - ${hoursInDay}h):`;
              } else {
                const daysInMonth = 30;
                const daysPassed = Math.min(new Date().getDate(), daysInMonth);
                const dailyRate = daysPassed > 0 ? goal.current / daysPassed : 0;
                projectedValue = dailyRate * daysInMonth;
                projLabel = `Projeção (mês - ${daysInMonth}d):`;
              }
              
              return (
                <div 
                  key={goal.goal_id}
                  className={`p-4 rounded-lg border ${
                    goal.status === 'SUCCESS' 
                      ? 'bg-emerald-50 border-emerald-200' 
                      : goal.status === 'WARNING' 
                      ? 'bg-amber-50 border-amber-200' 
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <p className={`text-xs font-bold uppercase tracking-wider ${
                      goal.status === 'SUCCESS' 
                        ? 'text-emerald-700' 
                        : goal.status === 'WARNING' 
                        ? 'text-amber-700' 
                        : 'text-red-700'
                    }`}>
                      {goal.name}
                    </p>
                    <span className={`text-xs font-bold px-2 py-1 rounded ${
                      goal.status === 'SUCCESS' 
                        ? 'bg-emerald-200 text-emerald-900' 
                        : goal.status === 'WARNING' 
                        ? 'bg-amber-200 text-amber-900' 
                        : 'bg-red-200 text-red-900'
                    }`}>
                      {goal.percentage}%
                    </span>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-2">
                    <div 
                      className={`h-full transition-all ${
                        goal.status === 'SUCCESS' 
                          ? 'bg-emerald-600' 
                          : goal.status === 'WARNING' 
                          ? 'bg-amber-600' 
                          : 'bg-red-600'
                      }`}
                      style={{ width: `${Math.min(goal.percentage, 100)}%` }}
                    />
                  </div>

                  {/* Values */}
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-slate-600 font-medium">
                      {typeof goal.current === 'number' && goal.unit === 'currency'
                        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(goal.current)
                        : typeof goal.current === 'number' 
                        ? goal.current.toFixed(0)
                        : goal.current
                      }
                    </span>
                    <span className="text-slate-500">
                      / {typeof goal.target === 'number' && goal.unit === 'currency'
                        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(goal.target)
                        : typeof goal.target === 'number'
                        ? goal.target.toFixed(0)
                        : goal.target
                      }
                    </span>
                  </div>

                  {/* Projeção */}
                  <div className="pt-2 border-t border-slate-300/50 text-[10px]">
                    <p className="text-slate-500 mb-1">{projLabel}</p>
                    <p className="font-bold text-slate-700">
                      {typeof goal.current === 'number' && goal.unit === 'currency'
                        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(projectedValue)
                        : projectedValue.toFixed(0)
                      }
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Componente de Apoio: KpiCard (Visual Clean) ---
function KpiCard({ title, value, icon, trend, color }: any) {
  const colorMap: any = {
    blue: "text-blue-600 bg-blue-50",
    emerald: "text-emerald-600 bg-emerald-50",
    amber: "text-amber-600 bg-amber-50",
    cyan: "text-cyan-600 bg-cyan-50",
  };

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 transition-all group">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</p>
          <h3 className="text-2xl font-black text-slate-800 mt-1 tracking-tight">{value}</h3>
        </div>
        <div className={`p-2.5 rounded-xl transition-colors ${colorMap[color] || 'bg-slate-50 text-slate-500'}`}>
          {icon}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-1.5">
        <TrendingUp size={14} className="text-slate-300" />
        <span className="text-[11px] font-bold text-slate-500 uppercase">{trend}</span>
      </div>
    </div>
  );
}