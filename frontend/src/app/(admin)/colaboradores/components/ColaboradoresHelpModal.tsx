'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

const currentFlowSteps = [
  {
    title: '1. Cadastre ou localize o colaborador',
    description: 'Use a lista principal para buscar por nome, CPF ou e-mail. Ao criar um registro, a ficha em colaboradores passa a ser o cadastro oficial da pessoa.',
  },
  {
    title: '2. Complete vínculo e lotação',
    description: 'Regime, status, admissão, cargo, unidade, setor, centro de custo, jornada e salário alimentam folha, benefícios e indicadores de RH.',
  },
  {
    title: '3. Configure benefícios',
    description: 'VR, VT, Totalpass, insalubridade e descontos fixos ficam no cadastro estruturado e são reaproveitados pela folha de pagamento.',
  },
  {
    title: '4. Anexe documentos oficiais',
    description: 'A aba Documentos é a fonte oficial para documentos obrigatórios, ASO e anexos diversos. Substituições e remoções preservam histórico.',
  },
  {
    title: '5. Controle uniforme e armário',
    description: 'Entregas, trocas, devoluções, armários e chaves devem ser registrados nas abas próprias, não em observações soltas.',
  },
  {
    title: '6. Registre recessos',
    description: 'Períodos aquisitivos, férias, saldo e situação ficam na aba Recesso e podem ser usados por outros fluxos operacionais.',
  },
  {
    title: '7. Formalize desligamentos',
    description: 'Para desligar, atualize o status para Desligado e informe data, motivo e observações. O registro não deve ser apagado.',
  },
  {
    title: '8. Acompanhe pendências',
    description: 'A listagem mostra ASO e progresso documental para orientar correções antes de folha, benefícios, admissão, desligamento e indicadores.',
  },
];

const sourceOfTruthRules = [
  'Dados cadastrais, status, salário, admissão e desligamento ficam no cadastro do colaborador.',
  'Documentos obrigatórios, ASO e anexos ficam na aba Documentos.',
  'Uniformes, entregas e devoluções ficam em Uniforme & Armário.',
  'Armário, chave e devolução ficam no controle de armário do colaborador.',
  'O checklist apenas orienta o processo; ele não substitui o cadastro oficial.',
];

const admissionDismissalSteps = [
  {
    title: 'Pré-admissão',
    description: 'Use quando a pessoa já foi selecionada e precisa ter documentos, cadastro e itens iniciais acompanhados antes de virar colaboradora ativa.',
  },
  {
    title: 'Admissão em andamento',
    description: 'Acompanhe cadastro contratual, documentos, benefícios iniciais, ASO, uniforme e armário até a pessoa estar pronta para iniciar.',
  },
  {
    title: 'Desligamento em andamento',
    description: 'Use para colaboradores que estão saindo da empresa, acompanhando devoluções, documentos finais, data, motivo e observações.',
  },
  {
    title: 'Encerrado',
    description: 'Use quando a admissão ou o desligamento já foi concluído e o cadastro oficial ficou atualizado para consultas futuras.',
  },
];

const criticalFields = [
  {
    label: 'Status',
    description: 'Define se o colaborador aparece como ativo ou desligado e impacta filtros, dashboard e fluxos operacionais.',
  },
  {
    label: 'Admissão e regime',
    description: 'Base para folha, benefícios, documentos esperados, tempo de empresa e indicadores de entrada.',
  },
  {
    label: 'Salário, jornada e centro de custo',
    description: 'Campos críticos para cálculo da folha, rateios, prontidão operacional e visão gerencial.',
  },
  {
    label: 'Data e motivo de desligamento',
    description: 'Obrigatórios quando o status for Desligado e usados para turnover, histórico e fechamento do processo.',
  },
];

export function ColaboradoresHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
        aria-labelledby="colaboradores-help-title"
        className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Ajuda guiada</div>
            <h3 id="colaboradores-help-title" className="mt-1 text-lg font-bold text-slate-900">
              Como usar colaboradores sem duplicar informações
            </h3>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Este módulo centraliza o cadastro oficial do RH. A aba Admissões & Demissões acompanha pessoas já selecionadas para admissão ou colaboradores em desligamento.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="Fechar ajuda">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto px-5 py-4">
          <div className="grid gap-3 md:grid-cols-2">
            {currentFlowSteps.map((step) => (
              <div key={step.title} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">{step.title}</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#17407E]">Regra de ouro</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              O checklist de admissão e desligamento orienta o trabalho do RH, mas documentos, uniforme, armário e dados contratuais continuam nos controles oficiais já existentes.
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-5">
              {sourceOfTruthRules.map((rule) => (
                <div key={rule} className="rounded-lg border border-blue-100 bg-white/80 px-3 py-2 text-xs leading-5 text-slate-600">
                  {rule}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Fluxo de Admissões & Demissões</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Esta área não substitui um processo seletivo. Ela começa depois que a pessoa já foi selecionada para admissão, ou quando um colaborador já está em processo de desligamento.
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-4">
              {admissionDismissalSteps.map((step) => (
                <div key={step.title} className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                  <div className="text-xs font-semibold text-slate-800">{step.title}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{step.description}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/70 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">Campos críticos do cadastro</div>
            <div className="mt-3 grid gap-2 md:grid-cols-4">
              {criticalFields.map((field) => (
                <div key={field.label} className="rounded-lg border border-amber-100 bg-white/80 px-3 py-2">
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
