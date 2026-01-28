'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, 
  Clock, 
  DollarSign, 
  MessageCircle, 
  TrendingUp, 
  Activity,
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
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const fetchDashboardData = useCallback(async (isManual = false) => {
    if (isManual) setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const [resMedic, resRecep, resWhats, resFinance] = await Promise.all([
        fetch('/api/queue/medic').then(r => r.json()),
        fetch('/api/queue/reception').then(r => r.json()),
        fetch('/api/queue/whatsapp').then(r => r.json()),
        fetch(`/api/admin/financial/history?startDate=${today}&endDate=${today}`).then(r => r.json())
      ]);

      setData({
        medic: resMedic.data || [],
        reception: resRecep.data || { global: { total_fila: 0, tempo_medio: 0 }, por_unidade: {} },
        whatsapp: resWhats.data || { global: { queue: 0, avgWaitSeconds: 0 }, groups: [] },
        finance: resFinance || { totals: { total: 0, qtd: 0 } }
      });
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
            title="Atualizar agora"
          >
            <RefreshCw size={20} className={`${loading ? 'animate-spin' : 'group-hover:rotate-180'} text-blue-600 transition-transform duration-500`} />
          </button>
        </div>
      </div>

      {/* --- LINHA 1: CARDS DE KPI (Estilo Clean) --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard 
          title="Faturamento (Hoje)" 
          value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data?.finance?.totals?.total || 0)}
          icon={<DollarSign size={20} />}
          trend={`${data?.finance?.totals?.qtd || 0} guias processadas`}
          color="emerald"
        />
        <KpiCard 
          title="Fila Recepção" 
          value={data?.reception?.global?.total_fila || 0}
          icon={<Users size={20} />}
          trend={`Tempo médio: ${data?.reception?.global?.tempo_medio || 0} min`}
          color="blue"
        />
        <KpiCard 
          title="Fila Médica" 
          value={totalFilaMedica}
          icon={<Activity size={20} />}
          trend={`${totalAtendidosHoje} concluídos hoje`}
          color="amber"
        />
        <KpiCard 
          title="WhatsApp Digital" 
          value={data?.whatsapp?.global?.queue || 0}
          icon={<MessageCircle size={20} />}
          trend="Pacientes ativos no hub"
          color="cyan"
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
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-50 pb-3">
            <Activity size={18} className="text-slate-400" />
            <h2 className="font-bold text-slate-700">Aguardando Médico</h2>
          </div>
          <div className="space-y-3">
            {data?.medic.map((unit: any) => {
              const waiting = unit.patients?.filter((p:any) => p.status === 'waiting').length || 0;
              return (
                <div key={unit.id} className="flex justify-between items-center p-3 bg-slate-50/50 rounded-lg border border-slate-100">
                  <div>
                    <p className="text-sm font-bold text-slate-700">{unit.name}</p>
                    <p className="text-[10px] text-slate-400 font-medium">ESPERA MÉDIA: {unit.averageWaitDay} MIN</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black text-amber-600 leading-none">{waiting}</p>
                    <p className="text-[9px] uppercase font-bold text-slate-400 mt-1">Pacientes</p>
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