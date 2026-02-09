'use client';

import React from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type ComparisonPoint = {
  key: string;
  label: string;
  totalA: number;
  totalB: number;
  deltaTotal: number;
};

type ComparisonHistoryChartProps = {
  title: string;
  data: ComparisonPoint[];
  labelA: string;
  labelB: string;
  className?: string;
};

const fmtMoney = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export const ComparisonHistoryChart = ({
  title,
  data,
  labelA,
  labelB,
  className = 'h-[300px]',
}: ComparisonHistoryChartProps) => {
  const chartData = [...data]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((item) => ({
      name: item.label,
      periodoA: item.totalA,
      periodoB: item.totalB,
      delta: item.deltaTotal,
    }));

  return (
    <div className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col ${className}`}>
      <h3 className="font-bold text-slate-700 mb-2 text-sm uppercase tracking-wide">{title}</h3>
      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} dy={10} />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              tickFormatter={(value) => `${Math.round(value / 1000)}k`}
            />
            <Tooltip
              formatter={(value: number | string | undefined, name: string | undefined) => {
                if (name === 'periodoA') return [fmtMoney(Number(value || 0)), `Periodo A (${labelA})`];
                if (name === 'periodoB') return [fmtMoney(Number(value || 0)), `Periodo B (${labelB})`];
                return [fmtMoney(Number(value || 0)), 'Delta (A - B)'];
              }}
              contentStyle={{
                borderRadius: '8px',
                border: 'none',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                fontSize: '12px',
              }}
            />
            <Legend
              formatter={(value) => {
                if (value === 'periodoA') return `Periodo A (${labelA})`;
                if (value === 'periodoB') return `Periodo B (${labelB})`;
                return 'Delta (A - B)';
              }}
            />
            <Line type="monotone" dataKey="periodoA" stroke="#1e3a8a" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="periodoB" stroke="#0ea5e9" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="delta" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="5 4" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};


