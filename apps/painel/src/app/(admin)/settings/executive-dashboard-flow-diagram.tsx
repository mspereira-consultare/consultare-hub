'use client';

import { ArrowDown, ArrowRight } from 'lucide-react';

const steps = [
  {
    title: 'Usuário do painel',
    description: 'Precisa ter acesso ao dashboard e estar vinculado ao colaborador certo.',
    action: 'Onde corrigir: /users',
  },
  {
    title: 'Colaborador',
    description: 'É a origem oficial de setor, cargo e unidades.',
    action: 'Onde corrigir: Colaboradores',
  },
  {
    title: 'Cargo mestre',
    description: 'O cargo do colaborador precisa estar ligado ao catálogo oficial.',
    action: 'Onde corrigir: Colaboradores > Cargo',
  },
  {
    title: 'Grupo executivo',
    description: 'Agrupa cargos diferentes sob a mesma lógica de visão e escopo.',
    action: 'Onde corrigir: Dashboard Executivo > Grupos',
  },
  {
    title: 'Perfil executivo',
    description: 'Define quais widgets e blocos aquela família pode ver.',
    action: 'Onde corrigir: Dashboard Executivo > Perfis',
  },
  {
    title: 'Exceção individual',
    description: 'Só entra quando a pessoa precisa ver algo além ou aquém do padrão.',
    action: 'Onde corrigir: Dashboard Executivo > Exceções',
  },
  {
    title: 'Preview',
    description: 'Mostra se a cadeia toda foi resolvida e qual pendência ainda existe.',
    action: 'Onde validar: Dashboard Executivo > Preview',
  },
  {
    title: 'Dashboard final',
    description: 'Renderiza apenas o que o perfil e o escopo final permitirem.',
    action: 'Resultado para o usuário final',
  },
];

export function ExecutiveDashboardFlowDiagram() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Fluxo de configuração</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        O dashboard não nasce da permissão isolada. Ele depende de uma cadeia de configuração que começa no cadastro oficial do colaborador e termina no preview.
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        {steps.map((step, index) => (
          <div key={step.title} className="relative">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">Etapa {index + 1}</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{step.title}</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
              <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                {step.action}
              </div>
            </div>

            {index < steps.length - 1 ? (
              <>
                <div className="absolute -bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full border border-slate-200 bg-white p-1.5 text-slate-400 lg:hidden">
                  <ArrowDown className="h-3.5 w-3.5" />
                </div>
                <div className="absolute right-[-12px] top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-slate-200 bg-white p-1.5 text-slate-400 lg:block">
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
