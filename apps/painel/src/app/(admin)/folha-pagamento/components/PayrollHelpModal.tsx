'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

const flowSteps = [
  {
    title: '1. Selecione ou crie a competência',
    description: 'A competência define o período operacional usado para ponto, fechamento, benefícios, prévia e exportação.',
  },
  {
    title: '2. Importe o relatório de ponto',
    description: 'Na aba Importações, envie o PDF do ponto. A base ativa passa a ser o último arquivo concluído com sucesso.',
  },
  {
    title: '3. Revise a prontidão',
    description: 'Abra Prontidão da competência para ver bloqueios e alertas. Bloqueios impedem Gerar folha; alertas permitem seguir com atenção.',
  },
  {
    title: '4. Gere ou recalcule a folha',
    description: 'O botão Gerar folha também recalcula a competência depois de corrigir cadastro, salário, ponto ou vínculo com colaborador.',
  },
  {
    title: '5. Confira o fechamento operacional',
    description: 'Na aba Fechamento, revise salário, dias, faltas, atrasos, descontos, proventos e abra a memória de cálculo da linha quando necessário.',
  },
  {
    title: '6. Valide benefícios',
    description: 'Na aba Benefícios, confira VR a comprar, VT pago em folha, descontos e pendências por colaborador antes da compra/carga operacional.',
  },
  {
    title: '7. Gere prévia e exporte',
    description: 'Use Prévia para revisar o XLSX esperado pelo RH e Exportar XLSX para baixar o arquivo da competência com os filtros atuais.',
  },
  {
    title: '8. Aprove, envie ou reabra',
    description: 'Após conferência, marque a competência como aprovada/enviada. Se houver ajuste posterior, reabra e gere novamente para manter rastreabilidade.',
  },
];

const quickNotes = [
  'Atrasos são exibidos em minutos; o desconto converte minutos considerados em horas após aplicar a tolerância diária.',
  'VR representa valor para compra/carga. VT é pago em dinheiro junto ao salário. Totalpass permanece como desconto em folha até nova orientação do RH.',
  'Tentativas de importação continuam auditáveis, mesmo quando um novo arquivo substitui a base ativa da competência.',
];

const newPeriodFields = [
  {
    label: 'Competência (mês)',
    description: 'Define o mês de referência e cria automaticamente o período operacional de 21 do mês anterior até 20 do mês selecionado.',
  },
  {
    label: 'Salário mínimo',
    description: 'É usado como base para calcular adicionais vinculados ao mínimo, como insalubridade quando aplicável no cadastro.',
  },
  {
    label: 'Tolerância de atraso (min)',
    description: 'Quantidade de minutos diários ignorados antes de gerar desconto por atraso na competência.',
  },
  {
    label: 'Teto de VT (%)',
    description: 'Percentual máximo do salário básico usado para calcular o desconto de vale-transporte, normalmente 6%.',
  },
];

export function PayrollHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
        aria-labelledby="payroll-help-title"
        className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Ajuda guiada</div>
            <h3 id="payroll-help-title" className="mt-1 text-lg font-bold text-slate-900">
              Como usar a folha de pagamento
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Fluxo recomendado para importar ponto, validar bloqueios, recalcular a competência e conferir a visão gerencial de benefícios.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="Fechar ajuda">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto px-5 py-4">
          <div className="grid gap-3 md:grid-cols-2">
            {flowSteps.map((step) => (
              <div key={step.title} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">{step.title}</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#17407E]">Observações importantes</div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {quickNotes.map((note) => (
                <div key={note} className="rounded-lg border border-blue-100 bg-white/80 px-3 py-2 text-xs leading-5 text-slate-600">
                  {note}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Campos da nova competência</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Esses campos viram as regras da competência e impactam todos os recálculos feitos pelo botão Gerar folha.
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {newPeriodFields.map((field) => (
                <div key={field.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="text-xs font-semibold text-slate-800">{field.label}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{field.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
