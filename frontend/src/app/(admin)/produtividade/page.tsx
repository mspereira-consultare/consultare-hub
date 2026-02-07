'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { 
    UserCheck, Calendar, Trophy, Info, Headphones, Activity,
    RefreshCw, Clock, Loader2, Users, Search, Settings, X
} from 'lucide-react';

export default function ProductivityPage() {
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Filtros
    const today = new Date();
    const todayStr = new Date().toISOString().split('T')[0];
    const monthStartStr = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const [dateRange, setDateRange] = useState({
        start: monthStartStr,
        end: todayStr
    });
    const [selectedTeam, setSelectedTeam] = useState('CRC');
    const [availableTeams, setAvailableTeams] = useState<Array<{ id: string; name: string }>>([]);

    // Dados
    const [rankingData, setRankingData] = useState<any[]>([]);
    const [globalStats, setGlobalStats] = useState<any>(null);
    const [teamStats, setTeamStats] = useState<any>(null);
    const [goalsData, setGoalsData] = useState<any[]>([]);
    const [heartbeat, setHeartbeat] = useState<any>(null);
    const [configUsers, setConfigUsers] = useState<any[]>([]);
    const [loadingConfig, setLoadingConfig] = useState(false);

    const normalizeKey = (value: string) => {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    };

    const parseTeams = (raw: string | null | undefined) => {
        if (!raw) return [] as string[];
        return String(raw)
            .split(',')
            .map(t => t.trim())
            .filter(Boolean);
    };

    const getGoalKpiId = (goal: any) => {
        const raw = String(goal?.linked_kpi_id || '').toLowerCase();
        if (raw) return raw;
        const name = String(goal?.name || '').toLowerCase();
        if (name.includes('confirma')) return 'agendamentos_confirm_rate';
        if (name.includes('agendamento') || name.includes('produtividade')) return 'agendamentos';
        return '';
    };

    const teamMemberCounts = useMemo(() => {
        const map = new Map<string, Set<string>>();
        const add = (teamName: string, userName: string) => {
            const key = normalizeKey(teamName);
            if (!key) return;
            if (!map.has(key)) map.set(key, new Set<string>());
            map.get(key)?.add(userName);
        };

        if (Array.isArray(configUsers) && configUsers.length > 0) {
            configUsers.forEach((u: any) => {
                (u.teams || []).forEach((t: any) => add(t.name, u.user_name));
            });
        } else {
            rankingData.forEach((u: any) => {
                parseTeams(u.team_name).forEach((t) => add(t, u.user));
            });
        }

        const counts: Record<string, number> = {};
        for (const [key, set] of map.entries()) {
            counts[key] = set.size;
        }
        return counts;
    }, [configUsers, rankingData]);

    const teamNames = useMemo(() => {
        const names = availableTeams.map(t => t.name);
        if (!names.includes('CRC')) names.push('CRC');
        return names;
    }, [availableTeams]);

    const teamsByUser = useMemo(() => {
        const map = new Map<string, string[]>();
        if (Array.isArray(configUsers) && configUsers.length > 0) {
            configUsers.forEach((u: any) => {
                const teams = (u.teams || []).map((t: any) => t.name).filter(Boolean);
                if (teams.length > 0) map.set(normalizeKey(u.user_name), teams);
            });
        }
        return map;
    }, [configUsers]);

    const getTeamMemberCount = (teamName: string) => {
        return teamMemberCounts[normalizeKey(teamName)] || 0;
    };

    const getTeamGoalForKpi = (teamName: string, kpiId?: string) => {
        if (!Array.isArray(goalsData)) return null;
        const teamKey = normalizeKey(teamName);
        const candidates = goalsData.filter((g: any) => g.team && normalizeKey(g.team) === teamKey && (!g.collaborator || g.collaborator === 'all'));
        if (kpiId) return candidates.find((g: any) => getGoalKpiId(g) === kpiId) || null;
        return candidates[0] || null;
    };

    const getUserGoalForKpi = (userName: string, userTeams: string[], kpiId: string) => {
        if (!Array.isArray(goalsData)) return null;
        const userKey = normalizeKey(userName);
        const individual = goalsData.find((g: any) => getGoalKpiId(g) === kpiId && g.collaborator && normalizeKey(g.collaborator) === userKey);
        if (individual) return { goal: individual, source: 'individual' as const };

        const teamKeys = userTeams.map(t => normalizeKey(t));
        const teamGoals = goalsData.filter((g: any) => {
            if (!g.team || getGoalKpiId(g) !== kpiId) return false;
            const gKey = normalizeKey(g.team);
            return teamKeys.includes(gKey);
        });

        if (teamGoals.length === 0) return null;
        if (teamKeys.includes(normalizeKey(selectedTeam))) {
            const preferred = teamGoals.find((g: any) => normalizeKey(g.team) === normalizeKey(selectedTeam));
            if (preferred) return { goal: preferred, source: 'team' as const };
        }
        return { goal: teamGoals[0], source: 'team' as const };
    };

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

    const projectDailyValue = (current: number) => {
        const hoursPassed = getWorkingHoursPassed();
        if (hoursPassed <= 0) return 0;
        const hourlyRate = current / hoursPassed;
        return hourlyRate * WORK_HOURS;
    };

    const projectMonthlyValue = (current: number) => {
        const now = new Date();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const daysPassed = Math.min(now.getDate(), daysInMonth);
        const dailyRate = daysPassed > 0 ? current / daysPassed : 0;
        return dailyRate * daysInMonth;
    };
    
    // Controle UI
    const [isUpdating, setIsUpdating] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showTeamGoals, setShowTeamGoals] = useState(true);

    // --- BUSCA DADOS PRINCIPAIS ---
    const fetchData = async (forceFresh = false) => {
        if (!heartbeat) setLoading(true);
        try {
            const params = new URLSearchParams({ 
                startDate: dateRange.start, 
                endDate: dateRange.end,
                team: selectedTeam 
            });
            if (forceFresh) {
                params.set('refresh', Date.now().toString());
            }
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
                const filteredGoals = goalsDataRes.filter((g: any) => {
                    const kpi = String(g.linked_kpi_id || '').toLowerCase();
                    if (kpi === 'agendamentos' || kpi === 'agendamentos_confirm_rate') return true;
                    const name = String(g.name || '').toLowerCase();
                    return name.includes('agendamento') || name.includes('produtividade');
                });
                setGoalsData(filteredGoals);
            }

            if (prodData.heartbeat && (prodData.heartbeat.status === 'RUNNING' || prodData.heartbeat.status === 'PENDING')) {
                setIsUpdating(true);
                setTimeout(() => fetchData(true), 3000); 
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
            
            const teams = Array.isArray(data.teams) ? data.teams : [];
            teams.sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
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
                
                if (!availableTeams.some((t) => t.id === teamId || t.name === teamName)) {
                    setAvailableTeams(prev => [...prev, { id: teamId, name: teamName }].sort((a, b) => String(a.name).localeCompare(String(b.name))));
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
        setTimeout(() => fetchData(true), 1000);
    };

    const filteredUsers = rankingData.filter(u => u.user.toLowerCase().includes(searchTerm.toLowerCase()));
    const formatLastUpdate = (dateString: string) => {
        if (!dateString) return 'Nunca';
        const isoString = dateString.includes('T') ? dateString : dateString.replace(' ', 'T');
        const parsed = new Date(isoString);
        return Number.isNaN(parsed.getTime()) ? dateString : parsed.toLocaleString('pt-BR');
    };

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
                    {heartbeat && (
                        <div className="hidden md:flex flex-col items-end mr-1">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                                Última Atualização
                            </span>
                            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                                <Clock size={12} />
                                {formatLastUpdate(heartbeat.last_run)}
                                {heartbeat.status === 'ERROR' && <span className="text-red-500 font-bold ml-1">Erro</span>}
                            </div>
                        </div>
                    )}
                    
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
                            <div className="text-center">
                                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Não Compareceu</p>
                                <p className="text-3xl font-extrabold text-rose-600 flex items-baseline justify-center gap-2">
                                    <span>{globalStats.nao_compareceu || 0}</span>
                                    <span className="text-base text-slate-500 font-bold">
                                        {globalStats.total > 0 ? ((Number(globalStats.nao_compareceu || 0) / globalStats.total) * 100).toFixed(1) : '0.0'}%
                                    </span>
                                </p>
                            </div>
                            {/* Meta Global (quando disponível) */}
                        {(() => {
                                const globalGoal = goalsData.find((g: any) => {
                                    const name = String(g.name || '').toLowerCase();
                                    return name.includes('global');
                                });
                                if (!globalGoal) return null;
                                const target = Number(globalGoal.target) || 0;
                                const current = Number(globalGoal.current) || 0;
                                const attainment = target > 0 ? (current / target) * 100 : 0;
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
                                        {teamNames.map(t => <option key={t} value={t}>{t}</option>)}
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
                                const g = getTeamGoalForKpi(selectedTeam || 'team', 'agendamentos') || getTeamGoalForKpi(selectedTeam || 'team', 'agendamentos_confirm_rate');
                                if (!g) return null;
                                const kpiId = getGoalKpiId(g);
                                const isPercent = kpiId === 'agendamentos_confirm_rate';
                                const target = Number(g.target) || 0;
                                const current = Number(g.current) || 0;
                                const attainment = target > 0 ? (current / target) * 100 : 0;
                                return (
                                    <div className="text-center">
                                        <p className="text-xs font-bold text-indigo-400 uppercase mb-1">Meta</p>
                                        <p className="text-lg font-bold text-indigo-900">
                                            {isPercent
                                                ? `${target.toFixed(1)}%`
                                                : (typeof target === 'number' && !Number.isNaN(target) ? target.toFixed(0) : target)
                                            }
                                        </p>
                                        <p className="text-[11px] text-slate-500">
                                            Ating.: {attainment.toFixed(1)}%
                                        </p>
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
                    <div className="flex items-center justify-between gap-2 mb-4 border-b border-slate-50 pb-3">
                        <div className="flex items-center gap-2">
                            <Trophy size={18} className="text-slate-400" />
                            <h2 className="font-bold text-slate-700">Metas de Agendamentos (Equipe)</h2>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowTeamGoals(prev => !prev)}
                            className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                        >
                            {showTeamGoals ? 'Ocultar' : 'Mostrar'}
                        </button>
                    </div>

                    {showTeamGoals && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {goalsData
                          .filter((g: any) => g.team && g.team !== 'all' && (!g.collaborator || g.collaborator === 'all'))
                          .map((goal: any) => {
                          const currentValue = Number(goal.current) || 0;
                          const projectedValue = goal.periodicity === 'daily'
                            ? projectDailyValue(currentValue)
                            : projectMonthlyValue(currentValue);

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
                    )}
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
                        const userTeams = teamsByUser.get(normalizeKey(u.user)) || parseTeams(u.team_name);
                        const isInSelectedTeam = userTeams.some(t => normalizeKey(t) === normalizeKey(selectedTeam));

                        const userGoals = (['agendamentos', 'agendamentos_confirm_rate'] as const)
                            .map((kpiId) => {
                                const found = getUserGoalForKpi(u.user, userTeams, kpiId);
                                if (!found) return null;

                                const goal = found.goal;
                                const source = found.source;
                                const isConfirmRate = kpiId === 'agendamentos_confirm_rate';
                                const current = isConfirmRate
                                    ? (u.total > 0 ? (u.confirmados / u.total) * 100 : 0)
                                    : Number(u.total || 0);

                                let target = Number(goal?.target) || 0;
                                const isTeamGoal = Boolean(goal?.team && normalizeKey(goal.team) !== 'all');
                                const sourceLabel = isTeamGoal ? 'team' : source;
                                if (!isConfirmRate && isTeamGoal && goal?.team) {
                                    const members = getTeamMemberCount(goal.team);
                                    if (members > 0) target = target / members;
                                }

                                const attainment = target > 0 ? (current / target) * 100 : 0;

                                return {
                                    kpiId,
                                    label: isConfirmRate ? 'Meta Confirmação' : 'Meta Agendamentos',
                                    current,
                                    target,
                                    attainment,
                                    source: sourceLabel,
                                    color: isConfirmRate ? 'bg-emerald-500' : 'bg-blue-500'
                                };
                            })
                            .filter(Boolean)
                            .slice(0, 2) as any[];

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

                                {/* Metas do colaborador (máx. 2) */}
                                {userGoals.length > 0 && (
                                    <div className="space-y-2">
                                        {userGoals.map((g: any) => {
                                            const currentLabel = g.kpiId === 'agendamentos_confirm_rate'
                                                ? `${g.current.toFixed(1)}%`
                                                : g.current.toFixed(0);
                                            const targetLabel = g.kpiId === 'agendamentos_confirm_rate'
                                                ? `${g.target.toFixed(1)}%`
                                                : g.target.toFixed(0);
                                            const progress = Math.min(g.attainment, 100);
                                            return (
                                                <div key={g.kpiId} className="space-y-1">
                                                    <div className="flex justify-between text-[10px] text-slate-500">
                                                        <span className="font-semibold text-slate-600">{g.label}</span>
                                                        <span className="font-bold text-slate-700">
                                                            {currentLabel} / {targetLabel}
                                                        </span>
                                                    </div>
                                                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                                        <div className={`h-full ${g.color}`} style={{ width: `${progress}%` }} />
                                                    </div>
                                                    <div className="flex justify-between text-[9px] text-slate-400">
                                                        <span>{g.source === 'team' ? 'Equipe (rateio)' : 'Individual'}</span>
                                                        <span>{g.attainment.toFixed(1)}%</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
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
                                                {availableTeams.map((team) => {
                                                    const teamName = team.name;
                                                    const teamId = team.id;
                                                    const userTeams = u.teams || [];
                                                    const isInTeam = userTeams.some((t: any) => t.id === teamId);
                                                    
                                                    return (
                                                        <label key={teamId} className="flex items-center gap-2 cursor-pointer">
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
