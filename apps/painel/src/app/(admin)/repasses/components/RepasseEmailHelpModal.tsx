'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

const flowSteps = [
  {
    title: '1. Escolha a competência',
    description:
      'Confirme o mês do fechamento no topo da página. Cada competência pode ter um ou mais lotes de importação.',
  },
  {
    title: '2. Importe a planilha',
    description:
      'Selecione a planilha de fechamento, informe a data limite para envio da nota fiscal e clique em Importar planilha. Isso apenas prepara o lote; nenhum e-mail é enviado nessa etapa.',
  },
  {
    title: '3. Vincule os anexos quando houver',
    description:
      'Depois da planilha, envie os PDFs ou um ZIP. O sistema tenta vincular cada arquivo ao profissional pelo código, nome do arquivo ou nome do profissional.',
  },
  {
    title: '4. Confira a tabela',
    description:
      'Veja se o cadastro, o anexo e a conferência estão corretos. Registros com atenção ou erro devem ser revisados antes do envio.',
  },
  {
    title: '5. Use os filtros',
    description:
      'Filtre por profissional, status de envio ou conferência. Isso ajuda a selecionar somente falhas, pendências ou registros prontos.',
  },
  {
    title: '6. Selecione os destinatários',
    description:
      'Marque os profissionais desejados. O botão Selecionar aptos respeita os filtros visíveis na tabela.',
  },
  {
    title: '7. Veja a prévia',
    description:
      'Antes de enviar, use Prévia na linha do profissional para conferir o texto do e-mail, valor, prazo da NF e observações.',
  },
  {
    title: '8. Envie e acompanhe',
    description:
      'Clique em Enviar selecionados. Depois disso, acompanhe os status: na fila, enviado, entregue ou falhou.',
  },
];

const statusGuides = [
  {
    title: 'Pronto',
    description: 'O destinatário está apto para envio.',
  },
  {
    title: 'Pronto para reenviar',
    description: 'A última tentativa falhou, mas o registro já pode ser tentado novamente.',
  },
  {
    title: 'Na fila',
    description: 'O envio foi solicitado e aguarda o worker processar.',
  },
  {
    title: 'Enviado',
    description: 'O provedor aceitou o e-mail. Ainda não é confirmação de entrega.',
  },
  {
    title: 'Entregue',
    description: 'O provedor confirmou entrega no servidor de e-mail do destinatário.',
  },
  {
    title: 'Falhou',
    description: 'A tentativa não foi concluída. Verifique a última atualização antes de reenviar.',
  },
];

const importantNotes = [
  'Importar a planilha não dispara e-mails.',
  'Profissionais sem PDF podem receber e-mail, mas a mensagem não promete anexo.',
  'Use a coluna Conferência para revisar cadastro, e-mail, anexos e avisos antes do envio.',
  'O limite do provedor pode impedir muitos envios em sequência. Nesses casos, espere liberar e reenvie apenas as falhas.',
  'A cópia interna para o financeiro é tratada separadamente do envio principal ao profissional.',
];

const filterTips = [
  'Para reenviar falhas, filtre Status de envio por Pronto ou Falhou e confira a Última atualização.',
  'Para revisar problemas antes de enviar, filtre Conferência por Atenção ou Erro.',
  'Para encontrar um médico específico, busque pelo nome ou e-mail.',
  'Ao usar Selecionar aptos, apenas os registros visíveis pelos filtros entram na seleção.',
];

export function RepasseEmailHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
        aria-labelledby="repasse-email-help-title"
        className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Ajuda guiada</div>
            <h3 id="repasse-email-help-title" className="mt-1 text-lg font-bold text-slate-900">
              Como fazer envios de fechamento
            </h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              Esta página prepara, confere e envia os e-mails de fechamento mensal para os profissionais. O envio só acontece quando alguém seleciona os destinatários e confirma o disparo.
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
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {flowSteps.map((step) => (
              <div key={step.title} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">{step.title}</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#17407E]">O que cada status quer dizer</div>
            <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
              {statusGuides.map((item) => (
                <div key={item.title} className="rounded-lg border border-blue-100 bg-white/80 px-3 py-3">
                  <div className="text-xs font-semibold text-slate-800">{item.title}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{item.description}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Pontos importantes</div>
              <div className="mt-3 grid gap-2">
                {importantNotes.map((item) => (
                  <div key={item} className="rounded-lg border border-emerald-100 bg-white/80 px-3 py-2 text-xs leading-5 text-slate-600">
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">Como usar os filtros</div>
              <div className="mt-3 grid gap-2">
                {filterTips.map((item) => (
                  <div key={item} className="rounded-lg border border-amber-100 bg-white/80 px-3 py-2 text-xs leading-5 text-slate-600">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
