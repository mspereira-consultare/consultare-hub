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
  Star,
  Loader2
} from 'lucide-react';

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
  const [heartbeat, setHeartbeat] = useState<any>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchDashboardData = useCallback(async (isManual = false, forceFresh = false) => {
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
      const shouldRefresh = forceFresh || isManual;
      const withRefresh = (url: string) => {
        if (!shouldRefresh) return url;
        const joiner = url.includes('?') ? '&' : '?';
        return `${url}${joiner}refresh=${Date.now()}`;
      };
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      const monthEnd = todayStr;
      
      const [resMedic, resRecep, resWhats, resFinanceDaily, resFinanceMonth, resFinanceByUnitDaily, resFinanceByUnitMonth, resGoals] = await Promise.all([
        fetch(withRefresh('/api/queue/medic')).then(r => r.json()),
        fetch(withRefresh('/api/queue/reception')).then(r => r.json()),
        fetch(withRefresh('/api/queue/whatsapp')).then(r => r.json()),
        fetch(withRefresh(`/api/admin/financial/history?startDate=${todayStr}&endDate=${todayStr}`)).then(r => r.json()),
        fetch(withRefresh(`/api/admin/financial/history?startDate=${monthStart}&endDate=${monthEnd}`)).then(r => r.json()),
        fetch(withRefresh(`/api/admin/financial/history?startDate=${todayStr}&endDate=${todayStr}&unit=all`)).then(r => r.json()),
        fetch(withRefresh(`/api/admin/financial/history?startDate=${monthStart}&endDate=${monthEnd}&unit=all`)).then(r => r.json()),
        fetch(withRefresh('/api/admin/goals/dashboard')).then(r => r.json())
      ]);

      setData({
        medic: resMedic.data || [],
        reception: resRecep.data || { global: { total_fila: 0, tempo_medio: 0 }, por_unidade: {} },
        whatsapp: resWhats.data || { global: { queue: 0, avgWaitSeconds: 0 }, groups: [] },
        finance: { daily: resFinanceDaily, monthly: resFinanceMonth },
        financeByUnit: { daily: resFinanceByUnitDaily, monthly: resFinanceByUnitMonth }
      });
      setGoalsData(Array.isArray(resGoals) ? resGoals : []);
      
      // Extrai heartbeat dos dados de faturamento
      if (resFinanceDaily && resFinanceDaily.heartbeat) {
        setHeartbeat(resFinanceDaily.heartbeat);
        if (resFinanceDaily.heartbeat.status === 'RUNNING' || resFinanceDaily.heartbeat.status === 'PENDING') {
          setIsUpdating(true);
          setTimeout(() => fetchDashboardData(false, true), 3000);
        } else {
          setIsUpdating(false);
        }
      }
      
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

  // Função para atualizar faturamento analítico manualmente
  const handleManualFinanceUpdate = async () => {
    setIsUpdating(true);
    try {
      await fetch('/api/admin/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: 'worker_faturamento_scraping' })
      });
      setTimeout(() => fetchDashboardData(false, true), 1000);
    } catch (e) {
      console.error(e);
      setIsUpdating(false);
    }
  };

  // Formatador de Data do Status
  const formatLastUpdate = (dateString: string) => {
    if (!dateString) return 'Nunca';
    const isoString = dateString.includes('T') ? dateString : dateString.replace(' ', 'T');
    try {
      const parsed = new Date(isoString);
      return Number.isNaN(parsed.getTime()) ? dateString : parsed.toLocaleString('pt-BR');
    } catch (e) {
      return dateString;
    }
  };

  const WAIT_ALERT_MINUTES = 30;

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

  const normalizeKey = (value: string) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  const WORK_START_HOUR = 8;
  const WORK_END_HOUR = 19;
  const WORK_HOURS = WORK_END_HOUR - WORK_START_HOUR;
  const getWorkingHoursPassed = () => {
    const now = new Date();
    const hoursNow = now.getHours() + now.getMinutes() / 60;
    if (hoursNow <= WORK_START_HOUR) return 0;
    if (hoursNow >= WORK_END_HOUR) return WORK_HOURS;
    return hoursNow - WORK_START_HOUR;
  };
  const projectDaily = (current: number) => {
    const hoursPassed = getWorkingHoursPassed();
    if (hoursPassed <= 0) return 0;
    const hourlyRate = current / hoursPassed;
    return hourlyRate * WORK_HOURS;
  };
  const projectMonthly = (current: number) => {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysPassed = Math.min(now.getDate(), daysInMonth);
    const dailyRate = daysPassed > 0 ? current / daysPassed : 0;
    return dailyRate * daysInMonth;
  };
  const formatMoney = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

  const isBillingGoal = (g: any) => {
    const kpi = String(g.linked_kpi_id || '').toLowerCase();
    const name = String(g.name || '').toLowerCase();
    return kpi === 'revenue' || name.includes('faturamento') || name.includes('receita');
  };
  const hasNoGroupFilter = (g: any) => !g.filter_group || g.filter_group === 'all';
  const isGlobalScope = (g: any) =>
    (!g.clinic_unit || g.clinic_unit === 'all') &&
    (!g.team || g.team === 'all') &&
    (!g.collaborator || g.collaborator === 'all');

  const billingGoals = (goalsData || []).filter(isBillingGoal);
  const billingGoalsNoGroup = billingGoals.filter(hasNoGroupFilter);
  const dailyBillingGoals = billingGoalsNoGroup.filter((g: any) => g.periodicity === 'daily');
  const monthlyBillingGoals = billingGoalsNoGroup.filter((g: any) => g.periodicity === 'monthly');
  const dailyGlobalGoal = dailyBillingGoals.find((g: any) => isGlobalScope(g));
  const monthlyGlobalGoal = monthlyBillingGoals.find((g: any) => isGlobalScope(g));
  const dailyUnitGoals = new Map<string, any>();
  const monthlyUnitGoals = new Map<string, any>();
  dailyBillingGoals.forEach((g: any) => {
    if (g.clinic_unit && g.clinic_unit !== 'all') dailyUnitGoals.set(normalizeKey(g.clinic_unit), g);
  });
  monthlyBillingGoals.forEach((g: any) => {
    if (g.clinic_unit && g.clinic_unit !== 'all') monthlyUnitGoals.set(normalizeKey(g.clinic_unit), g);
  });

  // Consolidação de Dados
  const totalFilaMedica = data?.medic.reduce((acc, u) => acc + (u.patients?.filter((p:any) => p.status === 'waiting').length || 0), 0) || 0;
  const totalAtendidosHoje = data?.medic.reduce((acc, u) => acc + (u.totalAttended || 0), 0) || 0;

  // Lógica de Grupos WhatsApp
  const allGroups = data?.whatsapp?.groups || [];
  const centralGroup = allGroups.find((g: any) => g.group_name.trim() === 'Central de relacionamento');
  const otherGroups = allGroups.filter((g: any) => g.group_name.trim() !== 'Central de relacionamento').slice(0, 4);

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Header Clean */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard Geral</h1>
          <p className="text-sm text-slate-500">Acompanhamento operacional em tempo real</p>
        </div>
        <div className="flex items-center gap-4">
          {/* HEARTBEAT STATUS COM DATA */}
          {heartbeat && (
            <div className="hidden sm:flex flex-col items-end text-xs border-r border-slate-200 pr-4">
              <span className="font-bold uppercase text-slate-400 tracking-wider mb-0.5">Última Sincronização (Faturamento)</span>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${isUpdating ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                <span className="font-medium text-slate-600">{formatLastUpdate(heartbeat.last_run)}</span>
              </div>
            </div>
          )}
          
          {/* BOTÃO ATUALIZAR FATURAMENTO */}
          <button 
            onClick={handleManualFinanceUpdate}
            disabled={isUpdating}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition-all shadow-sm border ${isUpdating ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
            title="Atualizar dados de faturamento analítico"
          >
            {isUpdating ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
            {isUpdating ? 'Atualizando...' : 'Atualizar Faturamento'}
          </button>

          <button 
            onClick={() => fetchDashboardData(true)}
            className="p-2.5 bg-white rounded-full border border-slate-200 shadow-sm hover:bg-slate-50 active:scale-95 transition-all group"
            title="Atualizar Dashboard completo"
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
              const waitersOver = unit.patients?.filter((p: any) => {
                if (p.status !== 'waiting') return false;
                if (!p.checkInTime) return false;
                const now = new Date();
                const checkInTime = new Date(p.checkInTime);
                const waitTimeMinutes = (now.getTime() - checkInTime.getTime()) / (1000 * 60);
                return waitTimeMinutes > WAIT_ALERT_MINUTES;
              });
              return (waitersOver?.length || 0) > 0;
            }) && (
              <span className="ml-auto px-2 py-1 text-[9px] font-bold bg-red-500 text-white rounded-full animate-pulse">
                Alerta {WAIT_ALERT_MINUTES}+ min
              </span>
            )}
          </div>
          <div className="space-y-3">
            {data?.medic.map((unit: any) => {
              const waiting = unit.patients?.filter((p:any) => p.status === 'waiting').length || 0;
              const waitersOver10 = unit.patients?.filter((p: any) => {
                if (p.status !== 'waiting') return false;
                if (!p.checkInTime) return false;
                const now = new Date();
                const checkInTime = new Date(p.checkInTime);
                const waitTimeMinutes = (now.getTime() - checkInTime.getTime()) / (1000 * 60);
                return waitTimeMinutes > WAIT_ALERT_MINUTES;
              }).length || 0;
              
              return (
                <div 
                  key={unit.id} 
                  className={`flex justify-between items-center p-3 rounded-lg border ${
                    waitersOver10 > 0
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
                      waitersOver10 > 0 ? 'text-red-600' : 'text-amber-600'
                    }`}>
                      {waiting}
                    </p>
                    <p className="text-[9px] uppercase font-bold text-slate-400 mt-1">Pacientes</p>
                    {waitersOver10 > 0 && (
                      <p className="text-[8px] text-red-600 font-bold mt-1">{waitersOver10} {WAIT_ALERT_MINUTES}+ min</p>
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

      {/* --- FATURAMENTO: HOJE vs MÊS (LADO A LADO) --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* COLUNA 1: FATURAMENTO HOJE */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-50 pb-3">
            <DollarSign size={18} className="text-slate-400" />
            <h2 className="font-bold text-slate-700">Faturamento Hoje</h2>
          </div>
          
          <div className="space-y-4">
            {/* Consolidado */}
            <div className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100/30 border border-emerald-200 rounded-lg">
              <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">Total Consolidado</p>
              <p className="text-2xl font-black text-emerald-900">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data?.finance?.daily?.totals?.total || 0)}
              </p>
              <p className="text-xs text-emerald-600 mt-1">Guias: {data?.finance?.daily?.totals?.qtd || 0}</p>
            </div>

            {/* Ticket Médio */}
            <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100/30 border border-blue-200 rounded-lg">
              <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1">Ticket Médio</p>
              <p className="text-2xl font-black text-blue-900">
                {data?.finance?.daily?.totals?.qtd && data?.finance?.daily?.totals?.qtd > 0
                  ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((data?.finance?.daily?.totals?.total || 0) / data?.finance?.daily?.totals?.qtd)
                  : 'R$ 0,00'
                }
              </p>
            </div>

            {/* Meta Diária de Faturamento */}
            {dailyGlobalGoal && (() => {
              const current = typeof dailyGlobalGoal.current === 'number' ? dailyGlobalGoal.current : (data?.finance?.daily?.totals?.total || 0);
              const target = Number(dailyGlobalGoal.target) || 0;
              const percent = target > 0 ? (current / target) * 100 : 0;
              const projection = projectDaily(current);
              return (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Meta Diária</p>
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Real: <strong>{formatMoney(current)}</strong></span>
                    <span>Meta: <strong>{formatMoney(target)}</strong></span>
                    <span className="font-bold text-slate-700">{percent.toFixed(1)}%</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Projeção: <strong>{formatMoney(projection)}</strong></p>
                </div>
              );
            })()}

            {/* Tabela por unidade - Hoje */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="px-2 py-1.5 font-bold text-slate-600">Unidade</th>
                    <th className="px-2 py-1.5 text-right font-bold text-slate-600">Faturado</th>
                    <th className="px-2 py-1.5 text-right font-bold text-slate-600">Guias</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(() => {
                    const unitsBilling = data?.financeByUnit?.daily?.unitsBilling || [];
                    if (unitsBilling && unitsBilling.length > 0) {
                      return unitsBilling.map((unit: any, idx: number) => {
                        const unitGoal = dailyUnitGoals.get(normalizeKey(unit.name));
                        const unitCurrent = Number(unitGoal?.current || 0);
                        const unitTarget = Number(unitGoal?.target || 0);
                        const unitPercent = unitTarget > 0 ? (unitCurrent / unitTarget) * 100 : (Number(unitGoal?.percentage) || 0);
                        const unitProjection = unitGoal ? projectDaily(unitCurrent) : 0;
                        return (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="px-2 py-1.5 font-medium text-slate-700 text-xs">
                              <div className="flex flex-col">
                                <span>{unit.name?.substring(0, 12) || 'N/A'}</span>
                                {unitGoal && (
                                  <span className="text-[9px] text-slate-400">
                                    Meta: {formatMoney(unitTarget)} • {unitPercent.toFixed(0)}% • Proj: {formatMoney(unitProjection)}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-right text-emerald-600 font-bold text-xs">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(unit.total || 0)}
                            </td>
                            <td className="px-2 py-1.5 text-right text-slate-600 text-xs">{unit.qtd || 0}</td>
                          </tr>
                        );
                      });
                    }
                    return <tr><td colSpan={3} className="px-2 py-2 text-center text-slate-400 text-xs">Sem dados</td></tr>;
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* COLUNA 2: FATURAMENTO MÊS */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-50 pb-3">
            <DollarSign size={18} className="text-slate-400" />
            <h2 className="font-bold text-slate-700">Faturamento Mês Atual</h2>
          </div>
          
          <div className="space-y-4">
            {/* Consolidado */}
            <div className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100/30 border border-emerald-200 rounded-lg">
              <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">Total Consolidado</p>
              <p className="text-2xl font-black text-emerald-900">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data?.finance?.monthly?.totals?.total || 0)}
              </p>
              <p className="text-xs text-emerald-600 mt-1">Guias: {data?.finance?.monthly?.totals?.qtd || 0}</p>
            </div>

            {/* Ticket Médio */}
            <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100/30 border border-blue-200 rounded-lg">
              <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1">Ticket Médio</p>
              <p className="text-2xl font-black text-blue-900">
                {data?.finance?.monthly?.totals?.qtd && data?.finance?.monthly?.totals?.qtd > 0
                  ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((data?.finance?.monthly?.totals?.total || 0) / data?.finance?.monthly?.totals?.qtd)
                  : 'R$ 0,00'
                }
              </p>
            </div>

            {/* Meta Mensal de Faturamento */}
            {monthlyGlobalGoal && (() => {
              const current = typeof monthlyGlobalGoal.current === 'number' ? monthlyGlobalGoal.current : (data?.finance?.monthly?.totals?.total || 0);
              const target = Number(monthlyGlobalGoal.target) || 0;
              const percent = target > 0 ? (current / target) * 100 : 0;
              const projection = projectMonthly(current);
              return (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Meta Mensal</p>
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Real: <strong>{formatMoney(current)}</strong></span>
                    <span>Meta: <strong>{formatMoney(target)}</strong></span>
                    <span className="font-bold text-slate-700">{percent.toFixed(1)}%</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Projeção: <strong>{formatMoney(projection)}</strong></p>
                </div>
              );
            })()}

            {/* Tabela por unidade - Mês */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="px-2 py-1.5 font-bold text-slate-600">Unidade</th>
                    <th className="px-2 py-1.5 text-right font-bold text-slate-600">Faturado</th>
                    <th className="px-2 py-1.5 text-right font-bold text-slate-600">Guias</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(() => {
                    const unitsBilling = data?.financeByUnit?.monthly?.unitsBilling || [];
                    if (unitsBilling && unitsBilling.length > 0) {
                      return unitsBilling.map((unit: any, idx: number) => {
                        const unitGoal = monthlyUnitGoals.get(normalizeKey(unit.name));
                        const unitCurrent = Number(unitGoal?.current || 0);
                        const unitTarget = Number(unitGoal?.target || 0);
                        const unitPercent = unitTarget > 0 ? (unitCurrent / unitTarget) * 100 : (Number(unitGoal?.percentage) || 0);
                        const unitProjection = unitGoal ? projectMonthly(unitCurrent) : 0;
                        return (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="px-2 py-1.5 font-medium text-slate-700 text-xs">
                              <div className="flex flex-col">
                                <span>{unit.name?.substring(0, 12) || 'N/A'}</span>
                                {unitGoal && (
                                  <span className="text-[9px] text-slate-400">
                                    Meta: {formatMoney(unitTarget)} • {unitPercent.toFixed(0)}% • Proj: {formatMoney(unitProjection)}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-right text-emerald-600 font-bold text-xs">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(unit.total || 0)}
                            </td>
                            <td className="px-2 py-1.5 text-right text-slate-600 text-xs">{unit.qtd || 0}</td>
                          </tr>
                        );
                      });
                    }
                    return <tr><td colSpan={3} className="px-2 py-2 text-center text-slate-400 text-xs">Sem dados</td></tr>;
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

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
