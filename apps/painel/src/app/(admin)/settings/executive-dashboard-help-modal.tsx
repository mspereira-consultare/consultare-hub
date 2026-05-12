'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

type SectionKey = 'profiles' | 'groups' | 'job_titles' | 'exceptions' | 'preview';

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
      'Pense nesta aba como a composição visual do dashboard. Ela não decide quem recebe o perfil; isso é feito em Grupos, Cargos e Exceções.',
  },
  groups: {
    title: 'Como configurar grupos executivos',
    subtitle:
      'Os grupos padronizam vários cargos diferentes sob a mesma visão executiva e o mesmo comportamento de escopo.',
    cards: [
      {
        title: '1. Pense no grupo como uma família',
        description: 'Exemplos: Diretoria, Liderança Operacional, CRC, Financeiro. O grupo representa uma lógica estável de visualização.',
      },
      {
        title: '2. Defina o perfil padrão',
        description: 'O perfil é a visão do dashboard. O grupo aponta para esse perfil automaticamente.',
      },
      {
        title: '3. Configure o escopo',
        description: 'Você pode herdar departamento e unidades do próprio colaborador, ou usar um escopo customizado do grupo.',
      },
      {
        title: '4. Evite grupos demais',
        description: 'Se cargos diferentes enxergam a mesma visão, mantenha todos no mesmo grupo e use exceção individual apenas quando necessário.',
      },
    ],
    note:
      'O grupo é a camada de simplificação. Em vez de criar dezenas de regras textuais, você passa a gerir poucas famílias executivas.',
  },
  job_titles: {
    title: 'Como vincular cargos aos grupos',
    subtitle:
      'O cargo mestre do colaborador é a origem principal da visão executiva. Aqui você diz a qual grupo cada cargo pertence.',
    cards: [
      {
        title: '1. Revise os cargos sem grupo',
        description: 'Esses são os cargos que ainda não conseguem resolver automaticamente a visão do dashboard.',
      },
      {
        title: '2. Atribua em massa',
        description: 'Quando vários cargos equivalentes existem, todos podem apontar para o mesmo grupo executivo.',
      },
      {
        title: '3. Use os números de impacto',
        description: 'As colunas de colaboradores e usuários mostram quantas pessoas serão afetadas por cada vínculo.',
      },
      {
        title: '4. Resolva a origem, não a exceção',
        description: 'Sempre que possível, ajuste o cargo mestre aqui em vez de compensar tudo com exceções individuais.',
      },
    ],
    note:
      'Se o cargo está certo e o grupo está correto, o dashboard passa a funcionar automaticamente para todo mundo daquele mesmo padrão.',
  },
  exceptions: {
    title: 'Como usar exceções individuais',
    subtitle:
      'As exceções individuais servem para casos fora do padrão. Elas devem complementar o grupo, não substituir a governança principal.',
    cards: [
      {
        title: '1. Use só quando necessário',
        description: 'Se várias pessoas precisam do mesmo ajuste, o ideal é rever o grupo ou o perfil, e não multiplicar exceções.',
      },
      {
        title: '2. Perfil específico',
        description: 'Você pode trocar o perfil daquele usuário sem alterar o grupo do cargo dele.',
      },
      {
        title: '3. Widgets extras ou ocultos',
        description: 'A exceção pode adicionar ou esconder itens sem a necessidade de criar um perfil novo.',
      },
      {
        title: '4. Escopo próprio',
        description: 'Também é possível alterar o recorte de unidades, departamentos e equipes apenas daquela pessoa.',
      },
    ],
    note:
      'A recomendação é: grupo como padrão, exceção como raridade. Isso mantém o painel escalável e fácil de manter.',
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
        description: 'O usuário tem acesso ao dashboard, mas ainda não encontrou um grupo válido ou um colaborador vinculado corretamente.',
      },
      {
        title: 'Origem',
        description: 'Indica se o perfil veio do grupo executivo do cargo, de uma exceção individual ou se ainda está sem configuração.',
      },
      {
        title: 'Vínculo com colaborador',
        description: 'Quando faltar vínculo com colaborador, cargo e unidades podem não existir, e o enquadramento automático tende a falhar.',
      },
    ],
    note:
      'Use o preview como validação final: ele mostra quem está pronto, quem está sem acesso e quem ainda depende de ajuste no vínculo, no cargo ou no grupo.',
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
