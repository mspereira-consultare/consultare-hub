'use client';

import { CircleHelp, Loader2, X } from 'lucide-react';
import type { PayrollDataSource, PayrollLine, PayrollLineDetail } from '@/lib/payroll/types';
import { formatDateBr, formatMoney, formatSheetInsalubrity, pendingDataCodeDescriptionMap, pendingDataCodeLabelMap, statusLabelMap } from './formatters';
import { PayrollColumnTooltip } from './PayrollColumnTooltip';
import { PayrollSourceBadge } from './PayrollSourceBadge';

type DraftState = {
  adjustmentsAmount: string;
  adjustmentsNotes: string;
  payrollNotes: string;
  lineStatus: string;
};

export function PayrollLineDrawer({
  line,
  detail,
  open,
  canEdit,
  saving,
  onClose,
  onSave,
}: {
  line: PayrollLine | null;
  detail: PayrollLineDetail | null;
  open: boolean;
  canEdit: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (draft: DraftState) => void;
}) {
  if (!open || !line) return null;

  const current = detail?.line || line;
  const draft: DraftState = {
    adjustmentsAmount: String(current.adjustmentsAmount ?? 0),
    adjustmentsNotes: current.adjustmentsNotes || '',
    payrollNotes: current.payrollNotes || '',
    lineStatus: current.lineStatus,
  };
  const preview = detail?.previewRow || null;
  const hasPendingRegistration = current.pendingDataCodes.length > 0;
  const detailSources: PayrollLineDetail['sources'] = detail?.sources || {
    adjustments: ['PAINEL'],
    preview: ['PAINEL'],
    hoursBalance: ['SOLIDES'],
    signature: ['SOLIDES'],
    pointDays: ['SOLIDES'],
    occurrences: ['PAINEL'],
    calculationMemory: ['PAINEL'],
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30">
      <div className="h-full w-full max-w-3xl overflow-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{line.employeeName}</h2>
            <p className="mt-1 text-sm text-slate-500">
              Revise aqui o cálculo da linha, os dados sincronizados da Sólides e os ajustes manuais que impactam o total deste colaborador.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-6 px-6 py-6">
          <section className="grid gap-4 md:grid-cols-3">
            <Stat label="Salário base" value={current.pendingDataCodes.includes('MISSING_SALARY') ? '-' : formatMoney(current.salaryBase)} />
            <Stat label="Proventos" value={hasPendingRegistration ? '-' : formatMoney(current.totalProvents)} />
            <Stat label="Líquido operacional" value={hasPendingRegistration ? '-' : formatMoney(current.netOperational)} />
          </section>

          {hasPendingRegistration ? (
            <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="font-semibold">Linha gerada com pendência cadastral</div>
              <div className="mt-1 text-amber-800">
                Esta linha entrou na geração parcial da folha, mas continua bloqueando aprovação e envio até a regularização dos dados.
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {current.pendingDataCodes.map((code) => (
                  <span key={code} className="rounded-full border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800">
                    {pendingDataCodeLabelMap[code]}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {current.requiresRecalculation ? (
            <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="font-semibold">Linha desatualizada após mudança no VT</div>
              <div className="mt-1 text-amber-800">
                O cadastro de vale-transporte deste colaborador mudou depois que a linha foi gerada. Use <strong>Recalcular selecionados</strong> ou gere a folha novamente antes de aprovar esta linha.
              </div>
            </section>
          ) : null}

          <section className="grid gap-4 md:grid-cols-2">
            <Card title="Ajustes manuais" sources={detailSources.adjustments}>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    <span>Valor do ajuste</span>
                    <span className="group relative inline-flex items-center">
                      <CircleHelp size={13} className="text-slate-400" />
                      <span className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-72 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] normal-case tracking-normal text-slate-600 shadow-lg group-hover:block">
                        Valor positivo acrescenta aos proventos. Valor negativo aumenta os descontos. Este campo ajusta o cálculo atual da linha e não substitui manualmente o valor final integral do pagamento.
                      </span>
                    </span>
                  </label>
                  <input defaultValue={draft.adjustmentsAmount} disabled={!canEdit || saving} id="payroll-adjustments-amount" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Observações do ajuste</label>
                  <textarea defaultValue={draft.adjustmentsNotes} disabled={!canEdit || saving} id="payroll-adjustments-notes" rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Observações da folha</label>
                  <textarea defaultValue={draft.payrollNotes} disabled={!canEdit || saving} id="payroll-notes" rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Status da linha</label>
                  <select
                    defaultValue={draft.lineStatus}
                    disabled={!canEdit || saving || hasPendingRegistration}
                    id="payroll-line-status"
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  >
                    <option value="RASCUNHO">Rascunho</option>
                    <option value="EM_REVISAO">Em revisão</option>
                    <option value="PENDENTE_CADASTRO">Pendência cadastral</option>
                    <option value="APROVADO">Aprovado</option>
                  </select>
                </div>
                {hasPendingRegistration ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    O status fica travado em {statusLabelMap.PENDENTE_CADASTRO.toLowerCase()} até resolver as pendências desta linha.
                  </div>
                ) : null}
                {canEdit ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      const amount = (document.getElementById('payroll-adjustments-amount') as HTMLInputElement | null)?.value || '';
                      const notes = (document.getElementById('payroll-adjustments-notes') as HTMLTextAreaElement | null)?.value || '';
                      const payrollNotes = (document.getElementById('payroll-notes') as HTMLTextAreaElement | null)?.value || '';
                      const lineStatus = (document.getElementById('payroll-line-status') as HTMLSelectElement | null)?.value || 'RASCUNHO';
                      onSave({ adjustmentsAmount: amount, adjustmentsNotes: notes, payrollNotes, lineStatus });
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-4 py-2 text-sm font-semibold text-white"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                    Salvar ajustes
                  </button>
                ) : null}
              </div>
            </Card>

            <Card title="Prévia da linha exportada" sources={detailSources.preview}>
              {preview ? (
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <Info label="E-mail" value={preview.email || '-'} />
                  <Info label="Função" value={preview.roleName || '-'} />
                  <Info label="Centro de custo" value={preview.centerCost || '-'} />
                  <Info label="Contrato" value={preview.contractType || '-'} />
                  <Info label="Salário base" value={preview.salaryBase === null ? '-' : formatMoney(preview.salaryBase)} />
                  <Info label="VT por dia" value={preview.vtPerDay === null ? '-' : formatMoney(preview.vtPerDay)} />
                  <Info label="VT total no mês" value={preview.vtMonth === null ? '-' : formatMoney(preview.vtMonth)} />
                  <Info label="D.V.T." value={preview.vtDiscount === null ? '-' : formatMoney(preview.vtDiscount)} />
                  <Info label="Insalubridade" value={formatSheetInsalubrity(preview.insalubrityValue)} />
                  <div className="sm:col-span-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                      `VT por dia` mostra o valor atual cadastrado no colaborador. `VT total no mês` mostra o total calculado para esta competência com base nos dias elegíveis da folha.
                    </div>
                  </div>
                  {preview.pendingDataCodes.length ? (
                    <div className="sm:col-span-2">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Pendências da linha</div>
                      <div className="flex flex-wrap gap-2">
                        {preview.pendingDataCodes.map((code) => (
                          <span key={code} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                            {pendingDataCodeLabelMap[code]}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-slate-600">
                        {preview.pendingDataCodes.map((code) => (
                          <div key={`${code}-description`}>{pendingDataCodeDescriptionMap[code]}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="sm:col-span-2">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Observação</div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">{preview.observation || '-'}</div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">A prévia da planilha ficará disponível depois da geração da folha.</div>
              )}
            </Card>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <Card title="Banco de horas" sources={detailSources.hoursBalance}>
              {detail?.hoursBalance ? (
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <Info label="Saldo do mês" value={`${detail.hoursBalance.balanceMinutes} min`} />
                  <Info label="Referência" value={`${detail.hoursBalance.referenceStart || '-'} a ${detail.hoursBalance.referenceEnd || '-'}`} />
                </div>
              ) : (
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Nenhum saldo sincronizado para este colaborador na competência.</div>
              )}
            </Card>

            <Card title="Assinatura" sources={detailSources.signature}>
              {detail?.signature ? (
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <Info label="Status" value={detail.signature.status} />
                  <Info label="Documento" value={detail.signature.documentType || '-'} />
                  <Info label="Vigência" value={`${formatDateBr(detail.signature.startDate)} a ${formatDateBr(detail.signature.endDate)}`} />
                  <Info label="Assinado em" value={formatDateBr(detail.signature.signedAt)} />
                  <div className="sm:col-span-2">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Mensagem</div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">{detail.signature.message || '-'}</div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Nenhum registro de assinatura sincronizado para este colaborador.</div>
              )}
            </Card>
          </section>

          <Card title="Ocorrências da competência" sources={detailSources.occurrences} sourceNote="Férias sincronizadas aparecem como integração; demais lançamentos desta fase continuam locais do painel.">
            {detail?.occurrences?.length ? (
              <div className="space-y-2">
                {detail.occurrences.map((occurrence) => (
                  <div key={occurrence.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>{occurrence.occurrenceType}</strong>
                      <PayrollSourceBadge source={occurrence.source} />
                    </div>
                    <div className="mt-2">
                      {formatDateBr(occurrence.dateStart)}
                      {occurrence.dateEnd && occurrence.dateEnd !== occurrence.dateStart ? ` a ${formatDateBr(occurrence.dateEnd)}` : ''}
                      {occurrence.notes ? ` · ${occurrence.notes}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Nenhuma ocorrência lançada para esta linha.</div>
            )}
          </Card>

          <Card title="Ponto do período" sources={detailSources.pointDays}>
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left"><PayrollColumnTooltip label="Data" description="Dia da competência analisado no ponto." source="Sólides" /></th>
                    <th className="px-3 py-2 text-left"><PayrollColumnTooltip label="Marcações" description="Batidas registradas no dia para o colaborador." source="Sólides" /></th>
                    <th className="px-3 py-2 text-center"><PayrollColumnTooltip label="Trabalhado" description="Minutos trabalhados registrados no dia." source="Sólides" align="center" /></th>
                    <th className="px-3 py-2 text-center"><PayrollColumnTooltip label="Atraso (min)" description="Minutos de atraso apontados no dia antes da consolidação da competência." source="Sólides" align="center" /></th>
                    <th className="px-3 py-2 text-center"><PayrollColumnTooltip label="Saldo do dia" description="Saldo diário de minutos em relação à jornada prevista." source="Sólides" align="center" /></th>
                    <th className="px-3 py-2 text-center"><PayrollColumnTooltip label="Pausa excedida" description="Minutos de pausa acima do esperado no dia." source="Sólides" align="center" /></th>
                    <th className="px-3 py-2 text-left"><PayrollColumnTooltip label="Observação" description="Justificativas, ausências ou observações trazidas do ponto sincronizado." source="Sólides" /></th>
                  </tr>
                </thead>
                <tbody>
                  {(detail?.pointDays || []).map((day) => (
                    <tr key={day.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">{formatDateBr(day.pointDate)}</td>
                      <td className="px-3 py-2">{day.marks.join(' · ') || '-'}</td>
                      <td className="px-3 py-2 text-center">{day.workedMinutes} min</td>
                      <td className="px-3 py-2 text-center">{day.lateMinutes} min</td>
                      <td className="px-3 py-2 text-center">{day.dayBalanceMinutes} min</td>
                      <td className="px-3 py-2 text-center">{day.breakOverrunMinutes} min</td>
                      <td className="px-3 py-2 text-slate-600">{day.justificationText || (day.absenceFlag ? 'Falta apontada no relatório' : '-')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Memória de cálculo" sources={detailSources.calculationMemory}>
            <pre className="overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{detail?.line?.calculationMemoryJson || current.calculationMemoryJson || '{}'}</pre>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  sources = [],
  sourceNote,
  children,
}: {
  title: string;
  sources?: PayrollDataSource[];
  sourceNote?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {sourceNote ? <div className="mt-1 text-xs text-slate-500">{sourceNote}</div> : null}
        </div>
        {sources.length ? (
          <div className="flex flex-wrap gap-2">
            {sources.map((source, index) => (
              <PayrollSourceBadge key={`${title}-${source}-${index}`} source={source} />
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">{value}</div>
    </div>
  );
}
