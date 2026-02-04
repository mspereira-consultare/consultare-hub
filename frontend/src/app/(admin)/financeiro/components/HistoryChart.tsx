'use client';
import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ChartProps {
    title: string;
    data: any[];
    color?: string;
    className?: string;
}

export const HistoryChart = ({ 
    title, 
    data, 
    color = "#1e3a8a", 
    className = "h-[300px]" 
}: ChartProps) => {
    
    // CORREÇÃO: Cria um ID único e válido para o SVG (sem espaços ou parenteses)
    // "Curva Diária (30 dias)" vira "curvadiaria30dias"
    const gradientId = title.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    const chartData = [...data]
        .sort((a: any, b: any) => {
            const aKey = String(a.sortKey ?? a.label ?? '');
            const bKey = String(b.sortKey ?? b.label ?? '');
            return aKey.localeCompare(bKey);
        })
        .map(item => ({
            name: item.label,
            Faturamento: item.total,
            Atendimentos: item.qtd
        }));

    const fmtMoney = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

    return (
        <div className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col ${className}`}>
            <h3 className="font-bold text-slate-700 mb-2 text-sm uppercase tracking-wide">{title}</h3>
            
            <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            {/* Define o gradiente com o ID limpo */}
                            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={color} stopOpacity={0.3}/> {/* Aumentei opacidade pra ficar mais bonito */}
                                <stop offset="95%" stopColor={color} stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                            dataKey="name" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{fill: '#94a3b8', fontSize: 10}} 
                            dy={10}
                            interval="preserveStartEnd"
                        />
                        <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{fill: '#94a3b8', fontSize: 10}} 
                            tickFormatter={(value) => `${value/1000}k`} 
                        />
                        <Tooltip 
                            formatter={(value?: number) => [fmtMoney(value ?? 0), 'Faturamento']}
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                            labelStyle={{ color: '#64748b', marginBottom: '2px', fontSize: '10px' }}
                        />
                        <Area 
                            type="monotone" 
                            dataKey="Faturamento" 
                            stroke={color} 
                            strokeWidth={2}
                            fillOpacity={1} 
                            // Usa o ID limpo na URL
                            fill={`url(#${gradientId})`} 
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
