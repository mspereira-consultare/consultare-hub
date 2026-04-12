'use client';

import { BarChart3, FileSpreadsheet, UploadCloud } from 'lucide-react';

export type PayrollTabKey = 'fechamento' | 'comparacao' | 'importacoes';

const tabs: Array<{ key: PayrollTabKey; label: string; helper: string; icon: typeof BarChart3 }> = [
  { key: 'fechamento', label: 'Fechamento', helper: 'Folha operacional por colaborador.', icon: FileSpreadsheet },
  { key: 'comparacao', label: 'Comparação', helper: 'Conferência com a planilha de referência.', icon: BarChart3 },
  { key: 'importacoes', label: 'Importações', helper: 'Arquivos, parsing e histórico do período.', icon: UploadCloud },
];

export function PayrollTabNav({ activeTab, onChange }: { activeTab: PayrollTabKey; onChange: (tab: PayrollTabKey) => void }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="grid gap-2 md:grid-cols-3">
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={[
                'rounded-lg border px-4 py-3 text-left transition',
                active ? 'border-[#17407E] bg-[#17407E] text-white shadow-sm' : 'border-transparent bg-slate-50 text-slate-700 hover:border-slate-200 hover:bg-white',
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
