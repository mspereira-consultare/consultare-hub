'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { PayrollSourceBadge } from './PayrollSourceBadge';

const sections = [
  {
    title: 'O que vem da Sólides/Tangerino',
    description:
      'A integração é a fonte oficial para ponto diário, banco de horas, férias sincronizadas e pendências de assinatura. Esses dados entram no painel por sincronização, sem depender de upload manual para competências novas.',
    sources: ['SOLIDES'] as const,
  },
  {
    title: 'O que continua no Painel',
    description:
      'O painel segue responsável pelo cadastro operacional local, regras da competência, salário base, benefícios, descontos fixos, observações da folha e ajustes manuais feitos pela equipe.',
    sources: ['PAINEL'] as const,
  },
  {
    title: 'O que ainda pode aparecer como legado',
    description:
      'Competências antigas podem continuar exibindo artefatos importados e registros preservados para auditoria. Eles ficam visíveis para consulta, mas não representam o fluxo padrão da integração atual.',
    sources: ['LEGADO'] as const,
  },
  {
    title: 'Quando a competência fica pronta',
    description:
      'A competência fica apta para gerar folha quando a sincronização conclui sem bloqueios críticos de prontidão. Alertas operacionais continuam aparecendo para conferência, mas não substituem a revisão do fechamento, benefícios e prévia.',
    sources: ['SOLIDES', 'PAINEL'] as const,
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
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Ajuda contextual</div>
            <h3 id="payroll-help-title" className="mt-1 text-lg font-bold text-slate-900">
              Fontes e regras da competência
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Resumo rápido do que a tela consome da integração, do que continua vindo do painel e de como interpretar as etiquetas de origem.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="Fechar ajuda">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto px-5 py-4">
          <div className="grid gap-3 md:grid-cols-2">
            {sections.map((section) => (
              <div key={section.title} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {section.sources.map((source) => (
                    <PayrollSourceBadge key={`${section.title}-${source}`} source={source} />
                  ))}
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-900">{section.title}</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{section.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Leitura rápida</div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                `Controle diário` e `Fechamento` combinam dados sincronizados com cadastros e cálculos locais do painel.
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                `Banco de horas` e `Assinaturas` são consultas da integração. `Benefícios` e `Prévia` continuam sendo memória operacional do painel.
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                Sempre que aparecer `Legado`, a tela está preservando histórico útil para auditoria e não o fluxo padrão da competência atual.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
