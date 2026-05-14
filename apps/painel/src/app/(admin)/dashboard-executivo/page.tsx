import Link from 'next/link';
import { ArrowRight, ClipboardList, ShieldCheck } from 'lucide-react';
import ExecutiveDashboardSettingsTab from '../settings/executive-dashboard-settings-tab';

export default function DashboardExecutivoPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <section className="rounded-2xl bg-[#053F74] p-6 text-white shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">
              <ShieldCheck className="h-4 w-4" />
              Governança executiva
            </div>
            <h1 className="mt-3 text-3xl font-semibold">Acompanhamento gerencial da operação</h1>
            <p className="mt-3 text-sm leading-6 text-blue-50">
              Use esta área para acompanhar a execução das demandas da equipe, identificar atrasos, monitorar aprovações e analisar a carga operacional das tarefas criadas no intranet.
            </p>
          </div>
          <Link
            href="/dashboard-executivo/tarefas"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-[#17407E] transition hover:bg-blue-50"
          >
            <ClipboardList className="h-4 w-4" />
            Abrir governança de tarefas
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Visão global das tarefas</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            A página de tarefas do painel consolida tudo o que foi criado pelos usuários no intranet, com filtros por setor, responsável, criador, aprovador, prioridade, status e prazo.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gestão de execução</div>
              <p className="mt-2 text-sm text-slate-700">Kanban e lista analítica para acompanhar andamento, gargalos e tarefas fora do prazo.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Controle de aprovações</div>
              <p className="mt-2 text-sm text-slate-700">Identifique rapidamente itens aguardando decisão, aprovados e devolvidos para retrabalho.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Leitura gerencial</div>
              <p className="mt-2 text-sm text-slate-700">Cards-resumo de total, a vencer, vencidas, aguardando aprovação e aprovadas.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Escopo restrito</div>
              <p className="mt-2 text-sm text-slate-700">Acesso exclusivo para perfis gerenciais e ADM dentro da governança executiva do painel.</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Acesso rápido</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Entre na visão global para acompanhar entregas, SLA interno, atrasos e distribuição das demandas entre os colaboradores.
          </p>
          <Link
            href="/dashboard-executivo/tarefas"
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#17407E] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0F2F5F]"
          >
            Ir para tarefas da equipe
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 shadow-sm">
        <ExecutiveDashboardSettingsTab />
      </section>
    </div>
  );
}
