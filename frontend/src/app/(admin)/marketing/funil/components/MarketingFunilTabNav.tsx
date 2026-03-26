type MarketingFunilTabKey = 'overview' | 'campaigns' | 'google-ads-health';

type MarketingFunilTabNavProps = {
  activeTab: MarketingFunilTabKey;
  onChange: (tab: MarketingFunilTabKey) => void;
};

const tabs: Array<{ key: MarketingFunilTabKey; label: string; description: string }> = [
  {
    key: 'overview',
    label: 'Visão geral',
    description: 'KPIs, funil, Clinia Ads e canais.',
  },
  {
    key: 'campaigns',
    label: 'Campanhas',
    description: 'Performance consolidada por campanha.',
  },
  {
    key: 'google-ads-health',
    label: 'Saúde Google Ads',
    description: 'Status, orçamento e diagnósticos atuais.',
  },
];

export function MarketingFunilTabNav({ activeTab, onChange }: MarketingFunilTabNavProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="grid gap-2 lg:grid-cols-3">
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={`rounded-xl border px-4 py-3 text-left transition ${
                active
                  ? 'border-blue-900 bg-blue-900 text-white shadow-sm'
                  : 'border-transparent bg-white text-slate-700 hover:border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="text-sm font-semibold">{tab.label}</div>
              <div className={`mt-1 text-xs ${active ? 'text-blue-100' : 'text-slate-500'}`}>{tab.description}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
