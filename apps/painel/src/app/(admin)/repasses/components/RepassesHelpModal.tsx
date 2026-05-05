'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

const operationalFlowSteps = [
  {
    title: '1. Escolha o período correto',
    description:
      'O painel sempre trabalha por competência mensal. Antes de qualquer análise, confirme o mês no filtro principal para evitar comparar profissionais com períodos diferentes.',
  },
  {
    title: '2. Atualize os dados do repasse',
    description:
      'Selecione os profissionais desejados e use “Atualizar dados de repasse”. Esse processo consulta o Feegow, cruza Repasses a Consolidar e Repasses Consolidados e atualiza o comparativo do painel.',
  },
  {
    title: '3. Use os filtros para reduzir o recorte',
    description:
      'Você pode filtrar por nome do profissional, status de processamento, data do atendimento, nome do paciente, situação de consolidação e presença de divergência.',
  },
  {
    title: '4. Leia primeiro os cards do topo',
    description:
      'Eles mostram o panorama do período: total de profissionais, quantidade com dados, divergências, total de atendimentos, consolidado, não consolidado e não recebido.',
  },
  {
    title: '5. Analise a linha do profissional',
    description:
      'A tabela principal resume produção do Feegow, consolidação a conferir, valores finais e indicadores operacionais. A linha pode ser destacada por divergência ou por possível duplicidade.',
  },
  {
    title: '6. Abra os detalhes com duplo clique',
    description:
      'No detalhe você vê atendimento por atendimento, o vínculo com a consolidação, notas do relatório, observação interna e marcações manuais para auditoria.',
  },
  {
    title: '7. Ajuste campos financeiros com critério',
    description:
      'Repasse final e produtividade podem receber ajuste manual. Esses campos devem ser usados apenas quando a regra operacional exigir correção fora do cálculo padrão.',
  },
  {
    title: '8. Gere relatórios só depois da conferência',
    description:
      'O ideal é revisar pendências, duplicidades e divergências primeiro. Depois disso, selecione os profissionais e gere os relatórios em PDF.',
  },
];

const sourceRules = [
  'Repasses a Consolidar é a visão operacional que mostra itens consolidados, não consolidados e não recebidos.',
  'Repasses Consolidados mostra apenas o que já foi efetivamente consolidado no Feegow.',
  'O painel cruza essas duas fontes para exibir divergências e pendências por profissional.',
  'Observação do relatório entra no PDF; observação interna fica apenas para uso operacional.',
  'Marcações coloridas servem para classificar linhas no detalhe e orientar revisão futura.',
];

const columnGuides = [
  {
    title: 'Execução',
    description:
      'Reserva espaço para a leitura operacional final do fechamento. Quando não houver base externa correspondente, pode aparecer como N/D.',
  },
  {
    title: 'Produção (Feegow)',
    description:
      'Resume o que foi encontrado em Repasses Consolidados, ou seja, o que já aparece como consolidado no Feegow para o profissional.',
  },
  {
    title: 'Consolidação (A conferir)',
    description:
      'Mostra a leitura de Repasses a Consolidar separando consolidado, não consolidado e não recebido.',
  },
  {
    title: 'Cálculo final',
    description:
      'Exibe repasse final, produtividade, 5% da produtividade e total final. É a área de fechamento financeiro do profissional.',
  },
  {
    title: 'Controle',
    description:
      'Concentra divergência, último processamento, PDF gerado e indicadores como observações, pagamento mínimo e possível duplicidade.',
  },
];

const statusRules = [
  {
    title: 'Consolidado',
    description:
      'O atendimento apareceu na consolidação e também está refletido como consolidado na base do Feegow.',
  },
  {
    title: 'Não consolidado',
    description:
      'O atendimento existe em Repasses a Consolidar, mas ainda não virou repasse consolidado na outra tela do Feegow.',
  },
  {
    title: 'Não recebido',
    description:
      'O atendimento existe, mas o repasse ainda não entrou como recebido na consolidação operacional.',
  },
  {
    title: 'Divergência',
    description:
      'A soma consolidada em Repasses Consolidados não bate com a soma consolidada encontrada em Repasses a Consolidar.',
  },
  {
    title: 'Possível duplicidade',
    description:
      'O painel encontrou mais de um lançamento com o mesmo paciente, data e procedimento. Isso não prova erro sozinho, mas exige conferência operacional.',
  },
];

const goodPractices = [
  'Sempre atualize os dados antes de concluir o fechamento do mês.',
  'Quando houver possível duplicidade, abra os detalhes e valide recibo, paciente, data e procedimento.',
  'Quando houver divergência, compare Produção (Feegow) com Consolidação (A conferir) antes de mexer em valores manuais.',
  'Evite gerar relatório enquanto ainda houver linha pendente de revisão relevante.',
  'Use a observação do relatório para justificar decisões que precisam acompanhar o PDF.',
];

export function RepassesHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="repasses-help-title"
        className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Ajuda guiada</div>
            <h3 id="repasses-help-title" className="mt-1 text-lg font-bold text-slate-900">
              Como funciona a página de repasses
            </h3>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Esta página compara o que já está consolidado no Feegow com o que ainda está em conferência operacional, para ajudar o fechamento por profissional.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
            aria-label="Fechar ajuda"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto px-5 py-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {operationalFlowSteps.map((step) => (
              <div key={step.title} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">{step.title}</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#17407E]">Fontes e regra de leitura</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              O painel não inventa um terceiro número. Ele cruza duas visões do Feegow e mostra onde elas batem, onde ainda não batem e onde existe risco operacional.
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
              {sourceRules.map((rule) => (
                <div key={rule} className="rounded-lg border border-blue-100 bg-white/80 px-3 py-2 text-xs leading-5 text-slate-600">
                  {rule}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Como ler os blocos da tabela</div>
            <div className="mt-3 grid gap-2 md:grid-cols-5">
              {columnGuides.map((item) => (
                <div key={item.title} className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                  <div className="text-xs font-semibold text-slate-800">{item.title}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{item.description}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/70 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">Status e alertas importantes</div>
            <div className="mt-3 grid gap-2 md:grid-cols-5">
              {statusRules.map((item) => (
                <div key={item.title} className="rounded-lg border border-amber-100 bg-white/80 px-3 py-2">
                  <div className="text-xs font-semibold text-slate-800">{item.title}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{item.description}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Boas práticas de fechamento</div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
              {goodPractices.map((item) => (
                <div key={item} className="rounded-lg border border-emerald-100 bg-white/80 px-3 py-2 text-xs leading-5 text-slate-600">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
