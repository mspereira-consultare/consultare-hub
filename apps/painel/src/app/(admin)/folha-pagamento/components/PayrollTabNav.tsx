'use client';

import { CalendarRange, FileSpreadsheet, LayoutTemplate, RefreshCw, Ticket, TimerReset, UserCheck } from 'lucide-react';

export type PayrollTabKey =
  | 'sincronizacao'
  | 'controle_diario'
  | 'banco_horas'
  | 'ferias'
  | 'assinaturas'
  | 'fechamento'
  | 'beneficios'
  | 'previa';

const tabs: Array<{ key: PayrollTabKey; label: string; helper: string; icon: typeof FileSpreadsheet }> = [
  { key: 'sincronizacao', label: 'Sincronização', helper: 'Worker, histórico e base oficial da API.', icon: RefreshCw },
  { key: 'controle_diario', label: 'Controle diário', helper: 'Atrasos, faltas e pausas da competência.', icon: TimerReset },
  { key: 'banco_horas', label: 'Banco de horas', helper: 'Saldo mensal retornado pela integração.', icon: CalendarRange },
  { key: 'ferias', label: 'Férias', helper: 'Ausências justificadas sincronizadas.', icon: CalendarRange },
  { key: 'assinaturas', label: 'Assinaturas', helper: 'Pendências mensais de folha.', icon: UserCheck },
  { key: 'fechamento', label: 'Fechamento', helper: 'Folha operacional por colaborador.', icon: FileSpreadsheet },
  { key: 'beneficios', label: 'Benefícios', helper: 'VR, VT e descontos da competência.', icon: Ticket },
  { key: 'previa', label: 'Prévia da planilha', helper: 'Estrutura final do XLSX mensal do RH.', icon: LayoutTemplate },
];

export const PAYROLL_POINT_TABS = tabs.filter((tab) =>
  ['controle_diario', 'banco_horas', 'ferias', 'assinaturas'].includes(tab.key),
);

export const PAYROLL_CLOSING_TABS = tabs.filter((tab) =>
  ['fechamento', 'beneficios', 'previa'].includes(tab.key),
);

export function PayrollTabNav({
  activeTab,
  onChange,
  tabs: visibleTabs = tabs,
}: {
  activeTab: PayrollTabKey;
  onChange: (tab: PayrollTabKey) => void;
  tabs?: Array<{ key: PayrollTabKey; label: string; helper: string; icon: typeof FileSpreadsheet }>;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {visibleTabs.map((tab) => {
          const active = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={[
                'rounded-lg border px-4 py-3 text-left transition',
                active
                  ? 'border-[#17407E] bg-[#17407E] text-white shadow-sm'
                  : 'border-transparent bg-slate-50 text-slate-700 hover:border-slate-200 hover:bg-white',
              ].join(' ')}
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Icon size={16} /> {tab.label}
              </div>
              <div className={active ? 'mt-1 text-xs text-blue-100' : 'mt-1 text-xs text-slate-500'}>{tab.helper}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
