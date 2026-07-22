'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, CircleAlert, Landmark, TrainFront, Wallet, X } from 'lucide-react';
import type { PayrollBenefitRow, PayrollBenefitsSummary } from '@/lib/payroll/types';
import { formatDateBr, formatMoney } from './formatters';
import { PayrollColumnTooltip } from './PayrollColumnTooltip';
import { PayrollSectionHeader } from './PayrollSectionHeader';

const transportVoucherModeLabelMap: Record<string, string> = {
  PER_DAY: 'Por dia',
  MONTHLY_FIXED: 'Mensal fixo',
  NONE: 'Não se aplica',
};

const summaryCards = [
  {
    key: 'mealVoucherPurchaseTotal',
    title: 'VR a comprar',
    helper: 'Valor estimado para compra/carga do período.',
    icon: Wallet,
    format: (summary: PayrollBenefitsSummary) => formatMoney(summary.mealVoucherPurchaseTotal),
    tone: 'emerald',
  },
  {
    key: 'cashTransportBenefitTotal',
    title: 'VT pago em folha',
    helper: 'Valor em dinheiro junto ao salário.',
    icon: TrainFront,
    format: (summary: PayrollBenefitsSummary) => formatMoney(summary.cashTransportBenefitTotal),
    tone: 'blue',
  },
  {
    key: 'payrollDiscountsTotal',
    title: 'Descontos em folha',
    helper: 'D.V.T., Totalpass e descontos fixos.',
    icon: Landmark,
    format: (summary: PayrollBenefitsSummary) => formatMoney(summary.payrollDiscountsTotal),
    tone: 'slate',
  },
  {
    key: 'pendingEmployees',
    title: 'Pendências',
    helper: 'Cadastros incompletos e alertas operacionais.',
    icon: CircleAlert,
    format: (summary: PayrollBenefitsSummary) =>
      `${summary.pendingEmployees} cadastro(s) | ${summary.attentionEmployees} atenção(ões)`,
    tone: 'amber',
  },
];

const badgeClassByStatus: Record<PayrollBenefitRow['status'], string> = {
  OK: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  ATENCAO: 'border-amber-200 bg-amber-50 text-amber-700',
  PENDENTE_CADASTRO: 'border-rose-200 bg-rose-50 text-rose-700',
};

const badgeLabelByStatus: Record<PayrollBenefitRow['status'], string> = {
  OK: 'Pronto',
  ATENCAO: 'Atenção',
  PENDENTE_CADASTRO: 'Pendente cadastro',
};

export function PayrollBenefitsPanel({
  rows,
  summary,
  loading,
  onOpenLine,
}: {
  rows: PayrollBenefitRow[];
  summary: PayrollBenefitsSummary | null;
  loading: boolean;
  onOpenLine: (lineId: string) => void;
}) {
  const [selectedIssueRow, setSelectedIssueRow] = useState<PayrollBenefitRow | null>(null);
  const data = summary || {
    totalEmployees: 0,
    totalMealVoucher: 0,
    totalTransportVoucher: 0,
    totalBenefitDiscounts: 0,
    mealVoucherPurchaseTotal: 0,
    cashTransportBenefitTotal: 0,
    transportVoucherPayrollDiscountTotal: 0,
    totalpassPayrollDiscountTotal: 0,
    otherPayrollDiscountTotal: 0,
    payrollDiscountsTotal: 0,
    companyProvisionTotal: 0,
    transportNetPayrollImpact: 0,
    pendingEmployees: 0,
    attentionEmployees: 0,
    costCenters: [],
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <PayrollSectionHeader
          title="Benefícios da competência"
          description="Visão gerencial da competência para os colaboradores elegíveis: VR a comprar, VT pago em folha e descontos lançados na folha operacional."
          countLabel={`${rows.length} colaborador(es)`}
          sources={['PAINEL']}
          sourceNote="VR representa compra/carga. VT é pago em dinheiro na folha. Totalpass permanece como desconto em folha até confirmação da regra operacional."
          className="border-b border-slate-200 px-4 py-3"
        />

        <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            const toneClass = card.tone === 'emerald'
              ? 'border-emerald-200 bg-emerald-50/70'
              : card.tone === 'amber'
                ? 'border-amber-200 bg-amber-50/70'
                : card.tone === 'blue'
                  ? 'border-blue-200 bg-blue-50/70'
                  : 'border-slate-200 bg-white';

            return (
              <div key={card.key} className={`rounded-xl border ${toneClass} p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{card.title}</div>
                    <div className="mt-3 text-lg font-bold text-slate-900">{card.format(data)}</div>
                    <div className="mt-1 text-xs text-slate-500">{card.helper}</div>
                  </div>
                  <div className="rounded-full border border-white/70 bg-white/90 p-3 text-slate-600 shadow-sm">
                    <Icon size={16} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-3 border-t border-slate-200 bg-slate-50/70 p-4 lg:grid-cols-3">
          <MetricLine
            label="Total a providenciar"
            value={formatMoney(data.companyProvisionTotal)}
            helper="VR a comprar + VT pago em folha."
          />
          <MetricLine
            label="Total descontado em folha"
            value={formatMoney(data.payrollDiscountsTotal)}
            helper={`D.V.T. ${formatMoney(data.transportVoucherPayrollDiscountTotal)} | Totalpass ${formatMoney(data.totalpassPayrollDiscountTotal)} | Outros ${formatMoney(data.otherPayrollDiscountTotal)}`}
          />
          <MetricLine
            label="Impacto líquido do VT"
            value={formatMoney(data.transportNetPayrollImpact)}
            helper="VT pago em folha menos D.V.T."
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Consolidado por centro de custo</h3>
          <p className="mt-1 text-xs text-slate-500">Resumo para conferência gerencial antes de acionar compra/carga de VR e fechamento da folha.</p>
        </div>
        <div className="overflow-auto">
          <table className="min-w-[760px] w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left"><PayrollColumnTooltip label="Centro de custo" description="Agrupamento gerencial dos benefícios por centro de custo." source="Painel" /></th>
                <th className="px-3 py-3 text-center"><PayrollColumnTooltip label="Colab." description="Quantidade de colaboradores elegíveis nesse centro de custo." source="Cálculo da folha" align="center" /></th>
                <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="VR a comprar" description="Total estimado para compra ou carga de vale-refeição." source="Painel + cálculo da folha" formula="VR por dia x dias elegíveis" align="right" /></th>
                <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="VT pago em folha" description="Total de VT provisionado para pagamento em dinheiro na competência." source="Painel + cálculo da folha" formula="Mensal fixo ou VT por dia x dias elegíveis" align="right" /></th>
                <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="Descontos em folha" description="Soma dos descontos de benefícios lançados na folha." source="Cálculo da folha" formula="D.V.T. + Totalpass + outros descontos fixos" align="right" /></th>
                <th className="px-3 py-3 text-center"><PayrollColumnTooltip label="Pendências" description="Quantidade de colaboradores com cadastro incompleto nesse centro de custo." source="Painel" align="center" /></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    Carregando consolidado por centro de custo...
                  </td>
                </tr>
              ) : data.costCenters.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    Nenhum centro de custo consolidado para a competência atual.
                  </td>
                </tr>
              ) : (
                data.costCenters.map((center) => (
                  <tr key={center.centerCost} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold text-slate-800">{center.centerCost}</td>
                    <td className="px-3 py-3 text-center text-slate-700">{center.totalEmployees}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(center.mealVoucherPurchaseTotal)}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(center.cashTransportBenefitTotal)}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(center.payrollDiscountsTotal)}</td>
                    <td className="px-3 py-3 text-center text-slate-700">{center.pendingEmployees}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Memória mensal por colaborador</h3>
          <p className="mt-1 text-xs text-slate-500">Dias elegíveis desta aba representam apenas os dias que contam para benefícios. Dias só abonados ou justificados continuam no salário, mas não entram automaticamente em VT e VR.</p>
        </div>

        <div className="max-h-[560px] overflow-auto">
          <table className="min-w-[1660px] w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="sticky left-0 z-20 bg-slate-50 px-4 py-3 text-left"><PayrollColumnTooltip label="Colaborador" description="Memória mensal de benefícios por colaborador elegível." source="Painel + cálculo da folha" /></th>
                <th className="px-3 py-3 text-left"><PayrollColumnTooltip label="Centro de custo" description="Centro de custo atual do colaborador." source="Painel" /></th>
                <th className="px-3 py-3 text-left"><PayrollColumnTooltip label="Regime" description="Regime contratual atual do colaborador." source="Painel" /></th>
                <th className="px-3 py-3 text-center"><PayrollColumnTooltip label="Dias elegíveis" description="Dias que contam para benefícios nesta competência. Por padrão, esta coluna considera apenas dias com trabalho efetivo; dias apenas abonados ou justificados não entram automaticamente em VT e VR." source="Sólides + cálculo da folha" formula="Dias efetivamente trabalhados válidos para benefício" align="center" /></th>
                <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="VR / dia" description="Valor diário de vale-refeição cadastrado para o colaborador." source="Painel" align="right" /></th>
                <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="VR a comprar" description="Total de VR estimado para compra ou carga. Dias só abonados ou justificados não entram automaticamente nesse cálculo." source="Painel + cálculo da folha" formula="VR por dia x dias elegíveis de benefício" align="right" /></th>
                <th className="px-3 py-3 text-left"><PayrollColumnTooltip label="Modo VT" description="Define se o VT do colaborador é mensal fixo ou por dia trabalhado." source="Painel" /></th>
                <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="VT por dia" description="Valor diário atual do cadastro do colaborador." source="Painel" align="right" /></th>
                <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="VT total no mês" description="Valor total de VT provisionado na competência. Dias só abonados ou justificados não entram automaticamente nesse total." source="Painel + cálculo da folha" formula="Mensal fixo do cadastro ou VT por dia x dias elegíveis de benefício" align="right" /></th>
                <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="VT pago em folha" description="Valor de VT provisionado para pagamento em dinheiro junto à folha, respeitando apenas os dias elegíveis de benefício." source="Cálculo da folha" align="right" /></th>
                <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="D.V.T." description="Desconto efetivo de vale-transporte aplicado na folha." source="Cálculo da folha" formula="Menor valor entre VT provisionado e teto percentual da competência" align="right" /></th>
                <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="Desconto Totalpass" description="Desconto fixo de Totalpass lançado na linha." source="Painel" align="right" /></th>
                <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="Outros desc." description="Outros descontos fixos cadastrados para o colaborador." source="Painel" align="right" /></th>
                <th className="px-3 py-3 text-right"><PayrollColumnTooltip label="Total desc." description="Total de descontos de benefícios na competência." source="Cálculo da folha" align="right" /></th>
                <th className="w-[250px] px-3 py-3 text-left"><PayrollColumnTooltip label="Status e pendências" description="Mostra se a memória mensal está pronta, exige atenção ou possui cadastro incompleto." source="Painel + cálculo da folha" /></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={15} className="px-4 py-16 text-center text-slate-500">
                    Carregando memória mensal de benefícios...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-4 py-16 text-center text-slate-500">
                    Nenhum benefício consolidado para a competência atual. Gere a folha após validar o ponto para montar a memória mensal desta aba.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.key}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50/70"
                    onClick={() => onOpenLine(row.lineId)}
                  >
                    <td className="sticky left-0 z-[1] bg-white px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">{row.employeeName}</div>
                          <div className="mt-1 text-xs text-slate-500">{row.employeeCpf || '-'}</div>
                        </div>
                        <ChevronRight size={16} className="text-slate-400" />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{row.centerCost || '-'}</td>
                    <td className="px-3 py-3 text-slate-700">{row.contractType || '-'}</td>
                    <td className="px-3 py-3 text-center text-slate-700">{row.daysEligible}</td>
                    <td className="px-3 py-3 text-right">{row.mealVoucherPerDay === null ? '-' : formatMoney(row.mealVoucherPerDay)}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(row.mealVoucherPurchaseAmount)}</td>
                    <td className="px-3 py-3 text-slate-700">{transportVoucherModeLabelMap[row.transportVoucherMode] || row.transportVoucherMode}</td>
                    <td className="px-3 py-3 text-right">{row.transportVoucherPerDay === null ? '-' : formatMoney(row.transportVoucherPerDay)}</td>
                    <td className="px-3 py-3 text-right">{row.transportVoucherMonthlyFixed === null ? '-' : formatMoney(row.transportVoucherMonthlyFixed)}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(row.cashTransportBenefitAmount)}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(row.transportVoucherPayrollDiscount)}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(row.totalpassPayrollDiscount)}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(row.otherPayrollDiscount)}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(row.payrollDiscountsTotal)}</td>
                    <td className="px-3 py-3 align-middle">
                      <div className="flex min-w-[210px] items-center gap-2">
                        <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClassByStatus[row.status]}`}>
                          {badgeLabelByStatus[row.status]}
                        </span>
                        {row.issues.length ? (
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                              {row.issues.length} pend.
                            </span>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedIssueRow(row);
                              }}
                              className="inline-flex h-6 items-center whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-600 hover:border-[#17407E] hover:text-[#17407E]"
                            >
                              Detalhes
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">Sem pendências</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <BenefitIssuesModal row={selectedIssueRow} onClose={() => setSelectedIssueRow(null)} />
    </div>
  );
}

function MetricLine({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-2 text-base font-bold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{helper}</div>
    </div>
  );
}

function BenefitIssuesModal({ row, onClose }: { row: PayrollBenefitRow | null; onClose: () => void }) {
  useEffect(() => {
    if (!row) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, row]);

  if (!row) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="benefit-issues-title"
        className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Pendências do colaborador</div>
            <h3 id="benefit-issues-title" className="mt-1 text-lg font-bold text-slate-900">
              {row.employeeName}
            </h3>
            <div className="mt-1 text-xs text-slate-500">
              {row.employeeCpf || 'CPF não informado'} · {row.centerCost || 'Centro de custo não informado'} · {row.contractType || 'Contrato não informado'}
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="Fechar modal">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClassByStatus[row.status]}`}>
              {badgeLabelByStatus[row.status]}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              {row.issues.length} pendência(s)
            </span>
          </div>

          {row.issues.length ? (
            <div className="space-y-3">
              {row.issues.map((issue) => (
                <div key={`${row.key}-${issue.code}`} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{issue.message}</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {issue.severity === 'CADASTRO' ? 'Cadastro' : 'Operacional'}
                    </span>
                  </div>

                  {issue.details?.length ? (
                    <div className="mt-3 space-y-2">
                      {issue.details.map((detail, index) => (
                        <div key={`${issue.code}-${detail.date || index}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                          <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                            <span className="font-semibold text-slate-800">Data: {formatDateBr(detail.date)}</span>
                            <span>Motivo: {detail.reason}</span>
                          </div>
                          {detail.marks.length ? (
                            <div className="mt-2 text-xs text-slate-500">
                              <span className="font-semibold text-slate-700">Marcações:</span> {detail.marks.join(' · ')}
                            </div>
                          ) : null}
                          {detail.rawText ? (
                            <div className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-500">
                              <span className="font-semibold text-slate-700">Trecho do relatório:</span> {detail.rawText}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Cadastro e memória do período sem pendências para esta primeira etapa.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
