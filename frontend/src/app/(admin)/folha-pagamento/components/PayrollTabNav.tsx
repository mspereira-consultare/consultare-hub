'use client';

import { FileSpreadsheet, LayoutTemplate, Ticket, UploadCloud } from 'lucide-react';

export type PayrollTabKey = 'fechamento' | 'beneficios' | 'previa' | 'importacoes';

const tabs: Array<{ key: PayrollTabKey; label: string; helper: string; icon: typeof FileSpreadsheet }> = [
  { key: 'fechamento', label: 'Fechamento', helper: 'Folha operacional por colaborador.', icon: FileSpreadsheet },
  { key: 'beneficios', label: 'Benefícios', helper: 'VR, VT e descontos da competência.', icon: Ticket },
  { key: 'previa', label: 'Prévia da planilha', helper: 'Estrutura final do XLSX mensal do RH.', icon: LayoutTemplate },
  { key: 'importacoes', label: 'Importações', helper: 'Arquivos, parsing e histórico do período.', icon: UploadCloud },
];

export function PayrollTabNav({
  activeTab,
  onChange,
}: {
  activeTab: PayrollTabKey;
  onChange: (tab: PayrollTabKey) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="grid gap-2 md:grid-cols-4">
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
