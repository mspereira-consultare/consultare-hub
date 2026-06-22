'use client';

import { PayrollSourceBadge } from './PayrollSourceBadge';

const items = [
  {
    source: 'SOLIDES' as const,
    description: 'Ponto, banco de horas, férias sincronizadas e assinaturas mensais.',
  },
  {
    source: 'PAINEL' as const,
    description: 'Cadastro local, regras da competência, benefícios, prévia e ajustes manuais.',
  },
  {
    source: 'LEGADO' as const,
    description: 'Artefatos e registros preservados de competências anteriores para auditoria.',
  },
];

export function PayrollSourceLegend() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-800">Origem dos dados na tela</h2>
        <p className="mt-1 text-xs text-slate-500">
          As etiquetas abaixo mostram quando a informação vem da integração, do cadastro operacional do painel ou de histórico legado.
        </p>
      </div>
      <div className="grid gap-3 p-4 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.source} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <PayrollSourceBadge source={item.source} />
            <p className="mt-3 text-xs leading-5 text-slate-600">{item.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
