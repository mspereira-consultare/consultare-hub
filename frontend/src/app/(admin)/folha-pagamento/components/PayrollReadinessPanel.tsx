'use client';

import { AlertTriangle, CheckCircle2, CircleAlert } from 'lucide-react';
import type { PayrollPeriodReadiness, PayrollReadinessIssue, PayrollReadinessStatus } from '@/lib/payroll/types';

const readinessStatusMap: Record<
  PayrollReadinessStatus,
  {
    label: string;
    tone: string;
    iconTone: string;
  }
> = {
  READY: {
    label: 'Pronta',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    iconTone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  ATTENTION: {
    label: 'Atenção',
    tone: 'border-amber-200 bg-amber-50 text-amber-700',
    iconTone: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  BLOCKED: {
    label: 'Bloqueada',
    tone: 'border-rose-200 bg-rose-50 text-rose-700',
    iconTone: 'border-rose-200 bg-rose-50 text-rose-700',
  },
};

const issueGroupToneMap = {
  BLOCKING: {
    card: 'border-rose-200 bg-rose-50/60',
    badge: 'border-rose-200 bg-white text-rose-700',
    title: 'text-rose-800',
  },
  WARNING: {
    card: 'border-amber-200 bg-amber-50/60',
    badge: 'border-amber-200 bg-white text-amber-700',
    title: 'text-amber-800',
  },
} as const;

const formatSampleEmployee = (issue: PayrollReadinessIssue) =>
  issue.sampleEmployees
    .map((sample) => (sample.employeeCpf ? `${sample.employeeName} (${sample.employeeCpf})` : sample.employeeName))
    .join(', ');

export function PayrollReadinessPanel({ readiness }: { readiness: PayrollPeriodReadiness }) {
  const statusConfig = readinessStatusMap[readiness.status];
  const blockingIssues = readiness.issues.filter((issue) => issue.severity === 'BLOCKING');
  const warningIssues = readiness.issues.filter((issue) => issue.severity === 'WARNING');

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className={`rounded-full border p-2 ${statusConfig.iconTone}`}>
            {readiness.status === 'READY' ? <CheckCircle2 size={18} /> : readiness.status === 'BLOCKED' ? <AlertTriangle size={18} /> : <CircleAlert size={18} />}
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Prontidão da competência</div>
            <div className="mt-1 text-sm font-semibold text-slate-800">{readiness.guidance}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusConfig.tone}`}>{statusConfig.label}</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
            {readiness.blockingCount} bloqueio(s)
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
            {readiness.warningCount} alerta(s)
          </span>
        </div>
      </div>

      {readiness.issues.length ? (
        <div className="grid gap-3 p-4 lg:grid-cols-2">
          <IssueGroup
            title="Bloqueios críticos"
            emptyLabel="Nenhum bloqueio crítico identificado."
            issues={blockingIssues}
            severity="BLOCKING"
          />
          <IssueGroup
            title="Alertas operacionais"
            emptyLabel="Nenhum alerta operacional identificado."
            issues={warningIssues}
            severity="WARNING"
          />
        </div>
      ) : (
        <div className="px-4 py-4 text-sm text-slate-600">Nenhuma pendência foi encontrada. A competência está pronta para geração.</div>
      )}
    </section>
  );
}

function IssueGroup({
  title,
  emptyLabel,
  issues,
  severity,
}: {
  title: string;
  emptyLabel: string;
  issues: PayrollReadinessIssue[];
  severity: 'BLOCKING' | 'WARNING';
}) {
  const tone = issueGroupToneMap[severity];

  return (
    <div className="space-y-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{title}</div>

      {issues.length ? (
        issues.map((issue) => (
          <div key={issue.code} className={`rounded-xl border p-3 ${tone.card}`}>
            <div className="flex items-start justify-between gap-3">
              <div className={`text-sm font-semibold ${tone.title}`}>{issue.title}</div>
              <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${tone.badge}`}>{issue.count}</span>
            </div>
            <div className="mt-2 text-xs leading-5 text-slate-600">{issue.description}</div>
            {issue.sampleEmployees.length ? (
              <div className="mt-2 text-xs leading-5 text-slate-500">
                <span className="font-semibold text-slate-700">Exemplos:</span> {formatSampleEmployee(issue)}
              </div>
            ) : null}
          </div>
        ))
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">{emptyLabel}</div>
      )}
    </div>
  );
}
