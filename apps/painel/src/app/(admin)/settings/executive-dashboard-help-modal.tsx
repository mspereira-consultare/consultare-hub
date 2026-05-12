'use client';

import { useEffect, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import { ExecutiveDashboardFlowDiagram } from './executive-dashboard-flow-diagram';

type SectionKey = 'profiles' | 'groups' | 'job_titles' | 'exceptions' | 'preview';
type HelpTopicKey =
  | 'overview'
  | 'flow'
  | 'configuration'
  | 'section_focus'
  | 'validation'
  | 'common_errors';

const topicOrder: HelpTopicKey[] = ['overview', 'flow', 'configuration', 'section_focus', 'validation', 'common_errors'];

const topicMeta: Record<HelpTopicKey, { label: string; title: string; subtitle: string }> = {
  overview: {
    label: 'Visão geral',
    title: 'O que este módulo controla',
    subtitle: 'A governança do dashboard executivo decide o que cada usuário vê dentro do dashboard principal.',
  },
  flow: {
    label: 'Fluxo completo',
    title: 'Como o sistema resolve a visão de cada pessoa',
    subtitle: 'A permissão de entrar no dashboard é apenas o começo. A visão final depende de uma cadeia de configuração.',
  },
  configuration: {
    label: 'Como configurar',
    title: 'Ordem correta de configuração',
    subtitle: 'Seguir a ordem certa evita exceções desnecessárias e reduz o risco de usuários ficarem sem perfil.',
  },
  section_focus: {
    label: 'Abas do módulo',
    title: 'Quando usar cada aba',
    subtitle: 'Cada aba tem um papel diferente. Saber isso evita cadastros redundantes e corrige o problema na origem.',
  },
  validation: {
    label: 'Preview e checagem',
    title: 'Como validar se o fluxo ficou correto',
    subtitle: 'O preview é a auditoria final da governança. Ele deve ser usado antes de liberar o dashboard para a pessoa.',
  },
  common_errors: {
    label: 'Erros comuns',
    title: 'Problemas mais frequentes e como corrigir',
    subtitle: 'A maioria dos erros vem de vínculo incompleto, cargo sem grupo ou uso excessivo de exceções.',
  },
};

const sectionFocusCards: Record<SectionKey, { title: string; description: string; bestFor: string }> = {
  profiles: {
    title: 'Perfis e widgets',
    description: 'Define a composição visual do dashboard: quais blocos cada perfil pode ver e em qual ordem aparecem.',
    bestFor: 'Use quando a dúvida for “o que esse perfil pode enxergar?”.',
  },
  groups: {
    title: 'Grupos',
    description: 'Padroniza famílias executivas e define o perfil padrão e o escopo herdado pela pessoa.',
    bestFor: 'Use quando cargos diferentes devem enxergar a mesma visão.',
  },
  job_titles: {
    title: 'Cargos',
    description: 'É a origem automática do enquadramento. Um cargo mestre sem grupo deixa o usuário sem perfil.',
    bestFor: 'Use quando o preview mostrar “cargo sem grupo executivo atribuído”.',
  },
  exceptions: {
    title: 'Exceções',
    description: 'Ajusta apenas casos fora do padrão, adicionando ou removendo widgets e escopo de uma pessoa específica.',
    bestFor: 'Use quando só uma pessoa precisar fugir do padrão do cargo.',
  },
  preview: {
    title: 'Preview',
    description: 'Mostra o resultado final da cadeia de configuração e a pendência concreta de cada usuário.',
    bestFor: 'Use sempre no fim para validar se a configuração realmente funcionou.',
  },
};

const configurationSteps = [
  'Cadastre ou revise o colaborador com cargo, setor e unidades corretos.',
  'Confirme se o usuário do painel está vinculado ao colaborador certo.',
  'Garanta que o cargo mestre exista no catálogo oficial.',
  'Atribua esse cargo a um grupo executivo.',
  'Confirme se o grupo tem perfil padrão e escopo coerente.',
  'Use exceção individual apenas se o caso fugir do padrão.',
  'Valide tudo no preview antes de pedir para a pessoa acessar o dashboard.',
];

const commonErrors = [
  {
    title: 'Usuário sem colaborador vinculado',
    description: 'O sistema não consegue descobrir cargo, setor nem unidades. Corrija o vínculo em /users.',
  },
  {
    title: 'Cargo sem grupo executivo',
    description: 'O cargo existe, mas ainda não aponta para nenhuma família executiva. Corrija na aba Cargos.',
  },
  {
    title: 'Grupo sem perfil coerente',
    description: 'O grupo existe, mas está apontando para um perfil errado, incompleto ou inativo.',
  },
  {
    title: 'Exceção usada como regra',
    description: 'Se várias pessoas precisam da mesma exceção, o problema está no grupo ou no perfil base.',
  },
  {
    title: 'Achar que a permissão sozinha resolve',
    description: 'Ter acesso ao dashboard não garante visão configurada. O preview precisa resolver o perfil.',
  },
  {
    title: 'Criar grupos demais',
    description: 'Quando dois cargos enxergam quase a mesma coisa, normalmente eles deveriam compartilhar o mesmo grupo.',
  },
];

const realExamples = [
  {
    title: 'Exemplo 1 — TI',
    description: 'Um colaborador com cargo mestre TI pode apontar para o grupo Diretoria e herdar automaticamente o perfil diretoria_gerencia_adm.',
  },
  {
    title: 'Exemplo 2 — Gerente de operações',
    description: 'O cargo mestre pode apontar para o grupo Gerência Operacional, sem criar exceções por pessoa.',
  },
  {
    title: 'Exemplo 3 — Supervisor de unidade',
    description: 'Pode herdar um grupo de Liderança de Unidades com escopo baseado nas unidades do próprio colaborador.',
  },
  {
    title: 'Exemplo 4 — Exceção individual',
    description: 'Se uma gerente específica precisar ver um widget extra de qualidade, faça isso por exceção individual, sem criar outro grupo.',
  },
];

const previewChecks = [
  'Se o preview mostrar “Sem vínculo”, corrija o usuário antes de mexer em grupos.',
  'Se mostrar “Cargo sem grupo”, a correção é na aba Cargos, não em Exceções.',
  'Se o grupo e o perfil estiverem corretos, a pessoa deve aparecer com origem do tipo grupo ou exceção.',
  'Aplique a exceção apenas depois que vínculo, cargo e grupo estiverem corretos.',
];

export function ExecutiveDashboardHelpModal({
  open,
  section,
  onClose,
}: {
  open: boolean;
  section: SectionKey;
  onClose: () => void;
}) {
  const sectionRefs = useRef<Record<HelpTopicKey, HTMLElement | null>>({
    overview: null,
    flow: null,
    configuration: null,
    section_focus: null,
    validation: null,
    common_errors: null,
  });

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  const focusedSection = useMemo(() => sectionFocusCards[section], [section]);

  if (!open) return null;

  const scrollToTopic = (topic: HelpTopicKey) => {
    sectionRefs.current[topic]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="executive-dashboard-help-title"
        className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Ajuda guiada</div>
            <h3 id="executive-dashboard-help-title" className="mt-1 text-lg font-bold text-slate-900">
              Como configurar corretamente a governança do dashboard executivo
            </h3>
            <p className="mt-1 max-w-4xl text-sm text-slate-500">
              Este guia mostra o fluxo completo do módulo, a ordem certa de configuração, os erros mais comuns e quando usar cada aba para evitar usuários sem perfil.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="Fechar ajuda">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[78vh] overflow-y-auto px-5 py-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Navegação rápida</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {topicOrder.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => scrollToTopic(topic)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                >
                  {topicMeta[topic].label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <section ref={(node) => { sectionRefs.current.overview = node; }} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{topicMeta.overview.label}</div>
              <h4 className="mt-1 text-lg font-bold text-slate-900">{topicMeta.overview.title}</h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">{topicMeta.overview.subtitle}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {realExamples.map((example) => (
                  <div key={example.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-900">{example.title}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{example.description}</p>
                  </div>
                ))}
              </div>
            </section>

            <section ref={(node) => { sectionRefs.current.flow = node; }} className="space-y-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{topicMeta.flow.label}</div>
                <h4 className="mt-1 text-lg font-bold text-slate-900">{topicMeta.flow.title}</h4>
                <p className="mt-2 text-sm leading-6 text-slate-600">{topicMeta.flow.subtitle}</p>
              </div>
              <ExecutiveDashboardFlowDiagram />
            </section>

            <section ref={(node) => { sectionRefs.current.configuration = node; }} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{topicMeta.configuration.label}</div>
              <h4 className="mt-1 text-lg font-bold text-slate-900">{topicMeta.configuration.title}</h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">{topicMeta.configuration.subtitle}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {configurationSteps.map((step, index) => (
                  <div key={step} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">Passo {index + 1}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{step}</p>
                  </div>
                ))}
              </div>
            </section>

            <section ref={(node) => { sectionRefs.current.section_focus = node; }} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{topicMeta.section_focus.label}</div>
              <h4 className="mt-1 text-lg font-bold text-slate-900">{topicMeta.section_focus.title}</h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">{topicMeta.section_focus.subtitle}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {Object.values(sectionFocusCards).map((card) => (
                  <div key={card.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-900">{card.title}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
                    <div className="mt-3 rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs text-slate-500">{card.bestFor}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-700">Foco da aba atual</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">{focusedSection.title}</div>
                <p className="mt-1 text-sm leading-6 text-slate-600">{focusedSection.description}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{focusedSection.bestFor}</p>
              </div>
            </section>

            <section ref={(node) => { sectionRefs.current.validation = node; }} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{topicMeta.validation.label}</div>
              <h4 className="mt-1 text-lg font-bold text-slate-900">{topicMeta.validation.title}</h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">{topicMeta.validation.subtitle}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {previewChecks.map((item) => (
                  <div key={item} className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm leading-6 text-slate-600">
                    {item}
                  </div>
                ))}
              </div>
            </section>

            <section ref={(node) => { sectionRefs.current.common_errors = node; }} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{topicMeta.common_errors.label}</div>
              <h4 className="mt-1 text-lg font-bold text-slate-900">{topicMeta.common_errors.title}</h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">{topicMeta.common_errors.subtitle}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {commonErrors.map((error) => (
                  <div key={error.title} className="rounded-xl border border-amber-100 bg-amber-50/70 p-4">
                    <div className="text-sm font-semibold text-slate-900">{error.title}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{error.description}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
