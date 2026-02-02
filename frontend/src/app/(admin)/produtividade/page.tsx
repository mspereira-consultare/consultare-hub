'use client';

import React, { useEffect, useState } from 'react';
import { 
    UserCheck, Calendar, Trophy, Info, Headphones, Activity,
    RefreshCw, Clock, Loader2, Users, Search, Settings, X
} from 'lucide-react';

export default function ProductivityPage() {
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Filtros
    const today = new Date();
    const [dateRange, setDateRange] = useState({
        start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });
    const [selectedTeam, setSelectedTeam] = useState('CRC');
    const [availableTeams, setAvailableTeams] = useState<string[]>(['CRC']);

    // Dados
    const [rankingData, setRankingData] = useState<any[]>([]);
    const [globalStats, setGlobalStats] = useState<any>(null);
    const [teamStats, setTeamStats] = useState<any>(null);
    const [goalsData, setGoalsData] = useState<any[]>([]);
    const [heartbeat, setHeartbeat] = useState<any>(null);

    // Helpers: match goals by collaborator or name heuristics
    const findGoalFor = (key: string) => {
        if (!Array.isArray(goalsData)) return null;
        const byCollaborator = goalsData.find((g: any) => g.collaborator && String(g.collaborator).toLowerCase() === String(key).toLowerCase());
        if (byCollaborator) return byCollaborator;
        const byName = goalsData.find((g: any) => g.name && String(g.name).toLowerCase().includes(String(key).toLowerCase()));
        if (byName) return byName;
        return goalsData[0] || null;
    };
    
    // Controle UI
    const [isUpdating, setIsUpdating] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // Dados do Modal
    const [configUsers, setConfigUsers] = useState<any[]>([]);
    const [loadingConfig, setLoadingConfig] = useState(false);

    // --- BUSCA DADOS PRINCIPAIS ---
    const fetchData = async () => {
        if (!heartbeat) setLoading(true);
        try {
            const params = new URLSearchParams({ 
                startDate: dateRange.start, 
                endDate: dateRange.end,
                team: selectedTeam 
            });
            const [prodRes, goalsRes] = await Promise.all([
                fetch(`/api/admin/produtividade?${params.toString()}`),
                fetch('/api/admin/goals/dashboard')
            ]);
            
            const prodData = await prodRes.json();
            const goalsDataRes = await goalsRes.json();
            
            if (prodData.userStats) setRankingData(prodData.userStats);
            if (prodData.globalStats) setGlobalStats(prodData.globalStats);
            if (prodData.teamStats) setTeamStats(prodData.teamStats);
            if (prodData.heartbeat) setHeartbeat(prodData.heartbeat);
            
            // Filtra apenas metas relacionadas a agendamentos/produtividade
            if (Array.isArray(goalsDataRes)) {
                const filteredGoals = goalsDataRes.filter((g: any) => 
                    g.name && (g.name.toLowerCase().includes('agendamento') || g.name.toLowerCase().includes('produtividade'))
                );
                setGoalsData(filteredGoals);
            }

            if (prodData.heartbeat && (prodData.heartbeat.status === 'RUNNING' || prodData.heartbeat.status === 'PENDING')) {
                setIsUpdating(true);
                setTimeout(fetchData, 3000); 
            } else {
                setIsUpdating(false);
            }
        } catch (error) { console.error(error); } finally { setLoading(false); }
    };

    // --- GERENCIAMENTO DE EQUIPES (MODAL) ---
    const fetchConfigUsers = async () => {
        setLoadingConfig(true);
        try {
            const res = await fetch('/api/admin/user-teams');
            const data = await res.json();
            setConfigUsers(data.users || []);
            
            const teams = data.teams?.map((t: any) => t.name || t) || [];
            if (!teams.includes('CRC')) teams.push('CRC'); 
            setAvailableTeams(teams);

        } catch (e) { console.error(e); } finally { setLoadingConfig(false); }
    };

    const handleToggleTeam = async (userName: string, teamId: string, teamName: string, isAdding: boolean) => {
        try {
            const res = await fetch('/api/admin/user-teams', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    user_name: userName, 
                    team_id: teamId,
                    action: isAdding ? 'add' : 'remove'
                })
            });

            if (res.ok) {
                // Atualiza estado local
                setConfigUsers(prev => 
                    prev.map(u => {
                        if (u.user_name !== userName) return u;
                        const updatedTeams = isAdding 
                            ? [...(u.teams || []), { id: teamId, name: teamName }]
                            : (u.teams || []).filter((t: any) => t.id !== teamId);
                        return { ...u, teams: updatedTeams };
                    })
                );
                
                if (!availableTeams.includes(teamName)) {
                    setAvailableTeams(prev => [...prev, teamName].sort());
                }
            } else {
                console.error('Erro ao atualizar equipe');
            }
        } catch (e) { 
            console.error(e); 
        }
    };

    useEffect(() => { fetchData(); }, [dateRange, selectedTeam]);
    useEffect(() => { if (!isModalOpen) fetchConfigUsers(); }, [isModalOpen]);

    const handleManualUpdate = async () => {
        setIsUpdating(true);
        await fetch('/api/admin/produtividade', { method: 'POST' });
        setTimeout(fetchData, 1000);
    };

    const filteredUsers = rankingData.filter(u => u.user.toLowerCase().includes(searchTerm.toLowerCase()));
    const formatLastUpdate = (d: string) => d ? new Date(d.replace(' ', 'T') + 'Z').toLocaleString('pt-BR') : 'Nunca';

    if (loading && !rankingData.length) return (
        <div className="flex flex-col items-center justify-center min-h-screen text-slate-400">
            <Loader2 className="animate-spin mb-2" size={32} /> <p>Carregando dados...</p>
        </div>
    );

    return (
        <div className="p-6 bg-slate-50 min-h-screen space-y-6 relative">
            
            {/* HEADER */}
            <div className="flex flex-col xl:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200 gap-4">
                <div className="flex items-center gap-3 w-full xl:w-auto">
                    <div className="p-3 bg-blue-600 text-white rounded-lg shadow-md">
                        <UserCheck size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">Produtividade</h1>
                        <p className="text-slate-500 text-xs">Métricas por data de agendamento.</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto justify-end">
                    
                    <button 
                        onClick={() => { setIsModalOpen(true); fetchConfigUsers(); }}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200 transition"
                    >
                        <Settings size={16} />
                        <span className="hidden sm:inline">Equipes</span>
                    </button>

                    <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block"></div>

                    <button 
                        onClick={handleManualUpdate}
                        disabled={isUpdating}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition-all shadow-sm border ${isUpdating ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                    >
                        {isUpdating ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                        {isUpdating ? 'Atualizando...' : 'Atualizar'}
                    </button>
                    
                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                        <Calendar size={16} className="text-slate-500" />
                        <input type="date" value={dateRange.start} onChange={(e) => setDateRange(p => ({...p, start:e.target.value}))} className="bg-transparent text-sm outline-none w-28 text-slate-700" />
                        <span className="text-slate-400">até</span>
                        <input type="date" value={dateRange.end} onChange={(e) => setDateRange(p => ({...p, end:e.target.value}))} className="bg-transparent text-sm outline-none w-28 text-slate-700" />
                    </div>
                </div>
            </div>

            {/* CARDS DE DESTAQUE */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* 1. CARD VISÃO GERAL */}
                {globalStats && (
                    <div className="p-5 bg-white rounded-xl border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
                                <div className="flex items-center gap-4">
                            <div className="p-3 bg-slate-100 text-slate-600 rounded-lg"><Activity size={28} /></div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">Visão Geral</h3>
                                <p className="text-xs text-slate-500">Resultados globais da clínica.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-8">
                            <div className="text-center">
                                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Total</p>
                                <p className="text-3xl font-extrabold text-slate-800">{globalStats.total}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Confirmação</p>
                                <p className="text-3xl font-extrabold text-blue-600">
                                    {globalStats.total > 0 ? ((globalStats.confirmados / globalStats.total) * 100).toFixed(1) : '0.0'}%
                                </p>
                            </div>
                            {/* Meta Global (quando disponível) */}
                            {(() => {
                                const g = findGoalFor('global');
                                if (!g) return null;
                                const target = Number(g.target) || 0;
                                const attainment = target > 0 ? ((globalStats.confirmados || 0) / target) * 100 : 0;
                                return (
                                    <div className="text-center">
                                        <p className="text-xs font-bold text-slate-400 uppercase mb-1">Meta</p>
                                        <p className="text-lg font-bold text-slate-700">{typeof target === 'number' && !Number.isNaN(target) ? target.toFixed(0) : target}</p>
                                        <p className="text-[11px] text-slate-500">Ating.: {attainment.toFixed(1)}%</p>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                )}

                {/* 2. CARD EQUIPE */}
                {teamStats && (
                    <div className="p-5 bg-indigo-50 rounded-xl border border-indigo-100 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg"><Headphones size={28} /></div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="font-bold text-indigo-900 text-lg">Equipe:</h3>
                                    <select 
                                        value={selectedTeam}
                                        onChange={(e) => setSelectedTeam(e.target.value)}
                                        className="bg-white border border-indigo-200 text-indigo-900 text-sm rounded px-2 py-0.5 outline-none font-bold cursor-pointer hover:border-indigo-400"
                                    >
                                        {availableTeams.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <p className="text-xs text-indigo-600">
                                    <strong>{teamStats.active_members}</strong> membros ativos no período.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-8">
                            <div className="text-center">
                                <p className="text-xs font-bold text-indigo-400 uppercase mb-1">Agendados</p>
                                <p className="text-3xl font-extrabold text-indigo-900">{teamStats.total}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-xs font-bold text-indigo-400 uppercase mb-1">Confirmação</p>
                                <p className="text-3xl font-extrabold text-emerald-600">
                                    {teamStats.total > 0 ? ((teamStats.confirmados / teamStats.total) * 100).toFixed(1) : '0.0'}%
                                </p>
                            </div>
                            {/* Meta de Equipe (quando disponível) */}
                            {(() => {
                                const g = findGoalFor(selectedTeam || 'team');
                                if (!g) return null;
                                const target = Number(g.target) || 0;
                                const attainment = target > 0 ? ((teamStats.confirmados || 0) / target) * 100 : 0;
                                return (
                                    <div className="text-center">
                                        <p className="text-xs font-bold text-indigo-400 uppercase mb-1">Meta</p>
                                        <p className="text-lg font-bold text-indigo-900">{typeof target === 'number' && !Number.isNaN(target) ? target.toFixed(0) : target}</p>
                                        <p className="text-[11px] text-slate-500">Ating.: {attainment.toFixed(1)}%</p>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                )}
            </div>

            {/* METAS DE AGENDAMENTOS */}
            {goalsData && goalsData.length > 0 && (
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-4 border-b border-slate-50 pb-3">
                        <Trophy size={18} className="text-slate-400" />
                        <h2 className="font-bold text-slate-700">Metas de Agendamentos</h2>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {goalsData.map((goal: any) => {
                          // Calcula projeção baseada na percentagem
                          const daysInMonth = 30;
                          const daysPassed = Math.min(new Date().getDate(), daysInMonth);
                          const dailyRate = daysPassed > 0 ? goal.current / daysPassed : 0;
                          const projectedValue = dailyRate * daysInMonth;

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
                                        {typeof goal.current === 'number' ? goal.current.toFixed(0) : goal.current}
                                    </span>
                                    <span className="text-slate-500">
                                        / {typeof goal.target === 'number' ? goal.target.toFixed(0) : goal.target}
                                    </span>
                                </div>

                                {/* Projeção */}
                                <div className="pt-2 border-t border-slate-300/50 text-[10px]">
                                    <p className="text-slate-500 mb-1">Projeção:</p>
                                    <p className="font-bold text-slate-700">
                                        {projectedValue.toFixed(0)}
                                    </p>
                                </div>
                            </div>
                          );
                        })}
                    </div>
                </div>
            )}

            {/* RANKING INDIVIDUAL */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-slate-100 pb-4 gap-4">
                    <div className="flex items-center gap-2">
                        <Trophy size={20} className="text-amber-500" />
                        <h2 className="font-bold text-slate-700">Ranking Individual</h2>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                        <div className="relative group">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input 
                                type="text" placeholder="Buscar usuário..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400 w-full sm:w-48 transition-all"
                            />
                        </div>
                        <div className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-lg border border-blue-100">
                            <Info size={16} className="text-blue-500" />
                            <p className="text-[10px] sm:text-xs text-blue-700"><strong>Taxa de Confirmação =</strong> Confirmados + Atendidos.</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                    {filteredUsers.map((u, idx) => {
                        const rate = u.total > 0 ? ((u.confirmados / u.total) * 100).toFixed(0) : 0;
                        const isTop3 = idx < 3 && !searchTerm;
                        const isInSelectedTeam = u.team_name === selectedTeam;

                        // Goal lookup for this user (by collaborator or name)
                        const userGoal = findGoalFor(u.user);
                        const userTarget = Number(userGoal?.target) || 0;
                        const userAttainment = userTarget > 0 ? ((u.confirmados || 0) / userTarget) * 100 : 0;
                        
                        let progressColor = 'bg-slate-400';
                        if (Number(rate) >= 80) progressColor = 'bg-emerald-500';
                        else if (Number(rate) >= 50) progressColor = 'bg-blue-500';
                        else progressColor = 'bg-amber-500';

                        return (
                            <div key={u.user} className={`relative flex flex-col p-4 rounded-xl border transition-all hover:shadow-md ${isTop3 ? 'bg-amber-50/30 border-amber-100' : 'bg-white border-slate-100'} ${isInSelectedTeam ? 'ring-2 ring-indigo-100' : ''}`}>
                                
                                {/* CABEÇALHO DO CARD: RANKING + ETIQUETA DA EQUIPE */}
                                <div className="flex justify-between items-center mb-3">
                                    <span className={`h-6 px-2 rounded-md flex items-center justify-center text-[10px] font-bold ${isTop3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                                        #{idx + 1}
                                    </span>
                                    
                                    {/* --- ETIQUETA DA EQUIPE (NOVO) --- */}
                                    {u.team_name && (
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                            u.team_name === 'CRC' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 
                                            u.team_name === 'Recepção' ? 'bg-pink-50 text-pink-600 border-pink-100' :
                                            'bg-slate-50 text-slate-500 border-slate-100'
                                        }`}>
                                            {u.team_name}
                                        </span>
                                    )}
                                </div>

                                <h3 className="font-bold text-slate-700 text-sm mb-4 truncate" title={u.user}>{u.user}</h3>
                                
                                <div className="grid grid-cols-2 gap-2 mb-2">
                                    <div>
                                        <p className="text-[10px] text-slate-400 uppercase font-semibold">Agendados</p>
                                        <p className="text-xl font-bold text-slate-700">{u.total}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] text-slate-400 uppercase font-semibold">Taxa Conf.</p>
                                        <p className={`text-xl font-bold ${Number(rate) > 70 ? 'text-emerald-600' : 'text-slate-600'}`}>{rate}%</p>
                                    </div>
                                </div>

                                {/* Meta do colaborador (se disponível) */}
                                {userGoal && (
                                    <div className="flex justify-between text-xs text-slate-500 mb-2">
                                        <div>
                                            <p className="text-[10px] uppercase">Meta</p>
                                            <p className="font-bold text-slate-700">{typeof userTarget === 'number' && !Number.isNaN(userTarget) ? userTarget.toFixed(0) : userTarget}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] uppercase">Ating.</p>
                                            <p className="font-bold">{userAttainment.toFixed(1)}%</p>
                                        </div>
                                    </div>
                                )}

                                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden"><div className={`h-full ${progressColor}`} style={{ width: `${rate}%` }} /></div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* MODAL (Atualizado para multi-select de equipes) */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                            <div><h2 className="text-xl font-bold text-slate-800">Gerenciar Equipes</h2><p className="text-sm text-slate-500">Atribua colaboradores a múltiplas equipes.</p></div>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white rounded-full transition text-slate-400 hover:text-red-500"><X size={20} /></button>
                        </div>
                        <div className="p-4 bg-slate-50 border-b border-slate-100 flex gap-4">
                             <div className="relative flex-1">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input type="text" placeholder="Filtrar nome..." className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm outline-none" onChange={(e) => {
                                    const term = e.target.value.toLowerCase();
                                    document.querySelectorAll('.user-row-multi').forEach((row: any) => {
                                        row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none';
                                    });
                                }} />
                             </div>
                        </div>
                        <div className="overflow-y-auto flex-1 p-6 custom-scrollbar">
                            {loadingConfig ? <div className="text-center py-10"><Loader2 className="animate-spin mx-auto text-blue-500" /></div> : (
                                <div className="space-y-4">
                                    {configUsers.map((u) => (
                                        <div key={u.user_name} className="user-row-multi p-4 rounded-lg border border-slate-200 bg-slate-50 hover:bg-white transition-colors">
                                            <div className="flex items-center gap-3 mb-3">
                                                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">{u.user_name.charAt(0)}</div>
                                                <span className="text-sm font-bold text-slate-800">{u.user_name}</span>
                                            </div>
                                            
                                            {/* Checkboxes de equipes */}
                                            <div className="ml-11 space-y-2">
                                                {availableTeams.map((teamName: string) => {
                                                    const userTeams = u.teams || [];
                                                    const isInTeam = userTeams.some((t: any) => t.name === teamName);
                                                    const teamId = userTeams.find((t: any) => t.name === teamName)?.id || teamName;
                                                    
                                                    return (
                                                        <label key={teamName} className="flex items-center gap-2 cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={isInTeam}
                                                                onChange={(e) => {
                                                                    handleToggleTeam(u.user_name, teamId, teamName, e.target.checked);
                                                                }}
                                                                className="rounded border-slate-300"
                                                            />
                                                            <span className={`text-sm font-medium ${isInTeam ? 'text-blue-600' : 'text-slate-600'}`}>
                                                                {teamName}
                                                            </span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}