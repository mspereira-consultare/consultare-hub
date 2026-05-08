'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

type SectionKey = 'profiles' | 'rules' | 'overrides' | 'preview';

const sectionContent: Record<
  SectionKey,
  {
    title: string;
    subtitle: string;
    cards: Array<{ title: string; description: string }>;
    note: string;
  }
> = {
  profiles: {
    title: 'Como configurar perfis e widgets',
    subtitle:
      'Esta aba define o que cada perfil pode visualizar no dashboard executivo e em qual ordem os blocos devem aparecer.',
    cards: [
      {
        title: '1. Escolha o perfil',
        description: 'Selecione um perfil como Diretoria, Financeiro, RH ou CRC para editar a visão daquele grupo.',
      },
      {
        title: '2. Revise os widgets',
        description: 'Cada linha representa um indicador ou bloco possível. Marque apenas o que faz sentido para esse perfil.',
      },
      {
        title: '3. Ajuste a ordem',
        description: 'Use a coluna de ordem para priorizar o que deve aparecer primeiro na leitura executiva.',
      },
      {
        title: '4. Diferencie disponível e planejado',
        description: 'Itens disponíveis já têm fonte no sistema. Itens planejados podem ficar cadastrados, mas não precisam ser ativados agora.',
      },
    ],
    note:
      'Pense nesta aba como a composição visual do dashboard. Ela não decide quem recebe o perfil; isso é feito em Regras ou Overrides.',
  },
  rules: {
    title: 'Como configurar regras automáticas',
    subtitle:
      'As regras ligam o cadastro do usuário e do colaborador a um perfil executivo. Elas são a forma principal de enquadramento automático.',
    cards: [
      {
        title: 'Origem principal',
        description: 'A regra compara departamento, cargo e unidades do colaborador vinculado ao usuário.',
      },
      {
        title: 'Departamento',
        description: 'Deve corresponder ao campo de setor/departamento no cadastro oficial de colaboradores.',
      },
      {
        title: 'Cargo',
        description: 'Deve corresponder ao campo de cargo do colaborador. Quanto mais preciso, mais confiável o match.',
      },
      {
        title: 'Unidades',
        description: 'Use quando o mesmo cargo e setor existem em mais de uma unidade e você precisa diferenciar a visão.',
      },
    ],
    note:
      'Se um usuário aparece como “Sem configuração”, normalmente falta vínculo com colaborador, ou os valores de cargo/setor ainda não batem com uma regra ativa.',
  },
  overrides: {
    title: 'Como usar overrides por usuário',
    subtitle:
      'Overrides servem para exceções. Use quando um usuário precisa enxergar algo diferente do padrão do cargo ou do setor.',
    cards: [
      {
        title: '1. Escolha o usuário',
        description: 'A lista mostra somente usuários do painel com acesso ao dashboard. Usuários da Intranet não entram aqui.',
      },
      {
        title: '2. Defina o perfil',
        description: 'O override pode substituir a regra automática e forçar um perfil específico para aquela pessoa.',
      },
      {
        title: '3. Restrinja o recorte',
        description: 'Departamentos, equipes e unidades limitam os dados que entram no dashboard daquele usuário.',
      },
      {
        title: '4. Prefira listas coerentes',
        description: 'As opções vêm do banco, para evitar divergência de grafia e problemas de correspondência.',
      },
    ],
    note:
      'Se a pessoa precisa ver tudo, deixe departamentos, equipes e unidades vazios. Se preencher, o dashboard passa a respeitar esse recorte.',
  },
  preview: {
    title: 'Como ler o preview',
    subtitle:
      'O preview mostra como o sistema está interpretando cada usuário do painel com base no que já foi configurado.',
    cards: [
      {
        title: 'Sem acesso',
        description: 'O usuário não tem permissão para entrar no dashboard, então não participa da visão executiva.',
      },
      {
        title: 'Sem perfil',
        description: 'O usuário tem acesso ao dashboard, mas não encontrou regra ativa nem override.',
      },
      {
        title: 'Origem',
        description: 'Indica se o perfil veio de uma regra automática, de um override manual ou se ainda está sem configuração.',
      },
      {
        title: 'Vínculo com colaborador',
        description: 'Quando faltar vínculo com colaborador, cargo e unidades podem não existir, e o enquadramento automático tende a falhar.',
      },
    ],
    note:
      'Use o preview como validação final: ele mostra quem está pronto, quem está sem acesso e quem ainda depende de ajuste no cadastro ou nas regras.',
  },
};

export function ExecutiveDashboardHelpModal({
  open,
  section,
  onClose,
}: {
  open: boolean;
  section: SectionKey;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const content = sectionContent[section];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="executive-dashboard-help-title"
        className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Ajuda guiada</div>
            <h3 id="executive-dashboard-help-title" className="mt-1 text-lg font-bold text-slate-900">
              {content.title}
            </h3>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">{content.subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="Fechar ajuda">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto px-5 py-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {content.cards.map((card) => (
              <div key={card.title} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">{card.title}</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#17407E]">Resumo prático</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{content.note}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
