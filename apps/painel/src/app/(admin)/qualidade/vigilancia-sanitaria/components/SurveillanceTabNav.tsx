type TabKey = 'gerencial' | 'licenses' | 'documents';

const tabs: Array<{ key: TabKey; title: string; description: string }> = [
  { key: 'gerencial', title: 'Gerencial', description: 'Vencimentos e alertas por unidade.' },
  { key: 'licenses', title: 'Licenças', description: 'Cadastro e controle das licenças.' },
  { key: 'documents', title: 'Documentos', description: 'Documentos regulatórios vinculados ou avulsos.' },
];

export function SurveillanceTabNav({ activeTab, onChange }: { activeTab: TabKey; onChange: (tab: TabKey) => void }) {
  return (
    <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm md:grid-cols-3">
      {tabs.map((tab) => {
        const active = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`rounded-lg px-4 py-3 text-left transition ${
              active ? 'border border-blue-200 bg-blue-50 text-[#17407E]' : 'border border-transparent text-slate-600 hover:bg-slate-50'
            }`}
          >
            <p className="text-sm font-semibold">{tab.title}</p>
            <p className="mt-1 text-xs opacity-80">{tab.description}</p>
          </button>
        );
      })}
    </div>
  );
}
