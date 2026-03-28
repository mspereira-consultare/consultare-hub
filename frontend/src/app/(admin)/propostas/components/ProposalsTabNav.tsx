type ProposalsTabKey = 'workqueue' | 'overview';

type ProposalsTabNavProps = {
  activeTab: ProposalsTabKey;
  onChange: (tab: ProposalsTabKey) => void;
};

const tabs: Array<{ key: ProposalsTabKey; label: string; description: string }> = [
  {
    key: 'workqueue',
    label: 'Base de trabalho',
    description: 'Fila operacional para follow-up, conversão e responsável.',
  },
  {
    key: 'overview',
    label: 'Visão gerencial',
    description: 'Cards, status e rankings consolidados do período.',
  },
];

export function ProposalsTabNav({ activeTab, onChange }: ProposalsTabNavProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="grid gap-2 lg:grid-cols-2">
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={`rounded-xl border px-4 py-3 text-left transition ${
                active
                  ? 'border-blue-200 bg-blue-50 text-[#17407E] shadow-sm ring-1 ring-blue-100'
                  : 'border-transparent bg-white text-slate-700 hover:border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="text-sm font-semibold">{tab.label}</div>
              <div className={`mt-1 text-xs ${active ? 'text-blue-700' : 'text-slate-500'}`}>{tab.description}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
