'use client';

import React, { useEffect, useState } from 'react';
import { X, TrendingUp, Target, Activity, Filter } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart } from 'recharts';
import { Goal } from '../constants';

interface GoalWithFilter extends Goal {
    filter_group?: string;
}

interface DetailsModalProps {
    goal: GoalWithFilter | null;
    onClose: () => void;
    currentValue: number;
}

export const GoalDetailsModal = ({ goal, onClose, currentValue }: DetailsModalProps) => {
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (goal) {
            setLoading(true);
            fetch(`/api/admin/goals/history?goal_id=${goal.id}`)
                .then(res => res.json())
                .then(data => {
                    let acc = 0;
                    const chartData = data.map((item: any) => {
                        if (goal.periodicity === 'monthly' || goal.periodicity === 'total') {
                            acc += item.value;
                            return { date: item.date, value: item.value, accumulated: acc };
                        }
                        return { date: item.date, value: item.value, accumulated: item.value };
                    });
                    setHistory(chartData);
                })
                .finally(() => setLoading(false));
        }
    }, [goal]);

    if (!goal) return null;

    // --- LÓGICA DE PROJEÇÃO UNIFICADA ---
    const calculateProjection = () => {
        const today = new Date();
        
        // Diária (08:00 - 18:00)
        if (goal.periodicity === 'daily') {
            const startHour = 8;
            const endHour = 18;
            const currentHour = today.getHours() + (today.getMinutes() / 60);

            if (currentHour < startHour) return 0;
            if (currentHour >= endHour) return currentValue;

            const hoursPassed = currentHour - startHour;
            const totalHours = endHour - startHour;
            return (currentValue / hoursPassed) * totalHours;
        }
        
        // Mensal / Total
        const start = new Date(goal.start_date);
        const end = new Date(goal.end_date);
        const totalDuration = Math.max(1, (end.getTime() - start.getTime()) / 86400000);
        const daysPassed = Math.max(1, (Math.min(today.getTime(), end.getTime()) - start.getTime()) / 86400000);
        
        if (daysPassed <= 0) return 0;
        return (currentValue / daysPassed) * totalDuration;
    };

    const projection = calculateProjection();

    const fmtVal = (v: number) => {
        if (goal.unit === 'currency') return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        return v.toLocaleString('pt-BR');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">{goal.name}</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold uppercase">{goal.sector}</span>
                            
                            {/* FILTRO VISÍVEL NO MODAL */}
                            {goal.filter_group && (
                                <span className="flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-bold border border-purple-200">
                                    <Filter size={10} />
                                    {goal.filter_group}
                                </span>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition"><X size={20}/></button>
                </div>

                <div className="p-6 overflow-y-auto">
                    
                    {/* CARDS KPI */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                            <p className="text-xs text-slate-500 uppercase font-bold flex items-center gap-1">
                                <Target size={14}/> Meta Alvo
                            </p>
                            <p className="text-2xl font-bold text-slate-800 mt-1">{fmtVal(goal.target_value)}</p>
                        </div>
                        <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                            <p className="text-xs text-blue-600 uppercase font-bold flex items-center gap-1">
                                <Activity size={14}/> Realizado
                            </p>
                            <p className="text-2xl font-bold text-blue-700 mt-1">{fmtVal(currentValue)}</p>
                            <p className="text-xs text-blue-500 font-medium">
                                {Math.round((currentValue / goal.target_value) * 100)}% atingido
                            </p>
                        </div>
                        
                        <div className={`p-4 rounded-lg border ${projection >= goal.target_value ? 'bg-green-50 border-green-100' : 'bg-amber-50 border-amber-100'}`}>
                            <p className={`text-xs uppercase font-bold flex items-center gap-1 ${projection >= goal.target_value ? 'text-green-600' : 'text-amber-600'}`}>
                                <TrendingUp size={14}/> Projeção
                            </p>
                            <p className={`text-2xl font-bold mt-1 ${projection >= goal.target_value ? 'text-green-700' : 'text-amber-700'}`}>
                                {fmtVal(projection)}
                            </p>
                            <p className={`text-xs font-medium ${projection >= goal.target_value ? 'text-green-500' : 'text-amber-500'}`}>
                                {projection >= goal.target_value ? 'Tendência de sucesso' : 'Abaixo do esperado'}
                            </p>
                        </div>
                    </div>

                    {/* GRÁFICO */}
                    <div className="h-[300px] w-full bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                        <h3 className="text-sm font-bold text-slate-700 mb-4">Evolução ({goal.periodicity === 'monthly' ? 'Acumulada' : 'Diária'})</h3>
                        {loading ? (
                            <div className="h-full flex items-center justify-center text-slate-400">Carregando histórico...</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={history}>
                                    <defs>
                                        <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                                    <XAxis 
                                        dataKey="date" 
                                        tickFormatter={(d) => d.split('-').reverse().slice(0, 2).join('/')}
                                        tick={{fontSize: 10, fill: '#94a3b8'}}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis 
                                        tickFormatter={(v) => `${v/1000}k`} 
                                        tick={{fontSize: 10, fill: '#94a3b8'}}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip 
                                        formatter={(v: number) => [fmtVal(v), 'Valor']}
                                        labelFormatter={(l) => new Date(l).toLocaleDateString('pt-BR')}
                                    />
                                    <Area 
                                        type="monotone" 
                                        dataKey="accumulated" 
                                        stroke="#3b82f6" 
                                        fill="url(#colorVal)" 
                                        strokeWidth={3}
                                    />
                                </ComposedChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
};