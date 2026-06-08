'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

const workflowCards = [
  {
    title: '1. Acompanhe pela consulta',
    description: 'Cada linha representa um atendimento de consulta, usando o responsável operacional vindo de faturamento_analitico via usuario_da_conta.',
  },
  {
    title: '2. Confira as propostas do mesmo dia',
    description: 'A página cruza a consulta com propostas geradas no mesmo dia para o mesmo paciente, agrupando múltiplas propostas em uma única linha operacional.',
  },
  {
    title: '3. Registre o 1º contato',
    description: 'Use os campos de pós-consulta para marcar se houve fechamento e quando o primeiro contato foi feito pela recepção.',
  },
  {
    title: '4. Registre o 2º contato',
    description: 'Se o paciente ainda não fechou, registre a segunda tentativa e documente data, hora e resultado do novo contato.',
  },
  {
    title: '5. Use observações com contexto',
    description: 'Anote objeções, retorno prometido, canal usado e próximos passos para a equipe conseguir retomar o caso sem perder contexto.',
  },
  {
    title: '6. Leia os indicadores corretamente',
    description: 'Conversão, pendências e insucessos são calculados por paciente + consulta, enquanto total de propostas mede o volume agrupado dentro das linhas.',
  },
];

const sourceRules = [
  'Origem operacional: faturamento_analitico, filtrando procedimentos do tipo Consulta.',
  'Responsável da linha: usuario_da_conta do atendimento, não o usuário do agendamento.',
  'Período e unidade: sempre vêm da consulta, não da proposta.',
  'Vínculo com proposta: mesmo dia da consulta, priorizando patient_id/prontuário.',
  'Fallback: quando existir nome do paciente na origem da proposta, o sistema também tenta o vínculo por nome normalizado.',
  'Os campos de pós-consulta são manuais e independentes do status externo da proposta.',
];

const usageRules = [
  {
    title: 'Filtro Fechou?',
    description: 'A linha fica como Sim quando o fechamento foi marcado em qualquer um dos dois contatos. Caso contrário, permanece como Não.',
  },
  {
    title: 'Status da proposta',
    description: 'Se houver propostas com status diferentes no mesmo atendimento, a linha mostra Múltiplos status e o detalhe aparece na expansão.',
  },
  {
    title: 'Expansão da linha',
    description: 'Use o botão Ver para abrir as propostas agrupadas, enxergando IDs, unidade, profissional, valor e status individual.',
  },
  {
    title: 'Auditoria',
    description: 'Toda edição manual grava usuário e data da última atualização do acompanhamento de pós-consulta.',
  },
];

export function PostConsultHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
        aria-labelledby="post-consult-help-title"
        className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Ajuda guiada</div>
            <h3 id="post-consult-help-title" className="mt-1 text-lg font-bold text-slate-900">
              Como usar a base operacional de pós-consulta
            </h3>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Esta página acompanha pacientes que passaram em consulta e tiveram proposta vinculada no mesmo dia, para que a recepção recupere oportunidades após o atendimento.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="Fechar ajuda">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto px-5 py-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {workflowCards.map((item) => (
              <div key={item.title} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#17407E]">Origem dos dados</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              A base nasce da consulta operacional e não do orçamento isolado. O objetivo é orientar a recepção sobre quais pacientes precisam de acompanhamento pós-consulta.
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {sourceRules.map((rule) => (
                <div key={rule} className="rounded-lg border border-blue-100 bg-white/80 px-3 py-2 text-xs leading-5 text-slate-600">
                  {rule}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Como operar a página</div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {usageRules.map((rule) => (
                <div key={rule.title} className="rounded-lg border border-emerald-100 bg-white/80 px-3 py-2">
                  <div className="text-xs font-semibold text-slate-800">{rule.title}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{rule.description}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/70 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">Leitura dos indicadores</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Total de propostas mostra volume vinculado. Fechamentos, taxa de conversão, pendências e insucessos após o 2º contato são contados por atendimento operacional, sempre no nível paciente + consulta.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
