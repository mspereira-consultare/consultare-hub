'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, CircleAlert } from 'lucide-react';
import type { PayrollPeriodReadiness, PayrollReadinessIssue, PayrollReadinessStatus } from '@/lib/payroll/types';
import { formatDateBr } from './formatters';

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

const mergeIssues = (issues: PayrollReadinessIssue[]) => {
  const map = new Map<string, PayrollReadinessIssue>();

  issues.forEach((issue) => {
    const issueKey = `${issue.severity}:${issue.code}:${issue.title}`;
    const current = map.get(issueKey);
    if (!current) {
      map.set(issueKey, {
        ...issue,
        sampleEmployees: [...issue.sampleEmployees],
        details: issue.details ? [...issue.details] : [],
      });
      return;
    }

    const sampleKeys = new Set(current.sampleEmployees.map((sample) => `${sample.employeeId || ''}:${sample.employeeCpf || ''}:${sample.employeeName}`));
    issue.sampleEmployees.forEach((sample) => {
      const key = `${sample.employeeId || ''}:${sample.employeeCpf || ''}:${sample.employeeName}`;
      if (!sampleKeys.has(key)) {
        current.sampleEmployees.push(sample);
        sampleKeys.add(key);
      }
    });

    const existingDetails = new Set((current.details || []).map((detail) => `${detail.date || ''}:${detail.reason || ''}:${detail.rawText || ''}:${detail.marks.join('|')}`));
    (issue.details || []).forEach((detail) => {
      const key = `${detail.date || ''}:${detail.reason || ''}:${detail.rawText || ''}:${detail.marks.join('|')}`;
      if (!existingDetails.has(key)) {
        current.details = [...(current.details || []), detail];
        existingDetails.add(key);
      }
    });

    current.count = Math.max(current.count, issue.count);
  });

  return Array.from(map.values());
};

const resolveOverallStatus = (
  generateReadiness: PayrollPeriodReadiness,
  approvalReadiness: PayrollPeriodReadiness,
): PayrollReadinessStatus => {
  if (generateReadiness.status === 'BLOCKED' || approvalReadiness.status === 'BLOCKED') return 'BLOCKED';
  if (generateReadiness.status === 'ATTENTION' || approvalReadiness.status === 'ATTENTION') return 'ATTENTION';
  return 'READY';
};

export function PayrollReadinessPanel({
  generateReadiness,
  approvalReadiness,
  title = 'Prontidão da competência',
}: {
  generateReadiness: PayrollPeriodReadiness;
  approvalReadiness: PayrollPeriodReadiness;
  title?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const mergedIssues = useMemo(
    () => mergeIssues([...generateReadiness.issues, ...approvalReadiness.issues]),
    [approvalReadiness.issues, generateReadiness.issues],
  );
  const overallStatus = resolveOverallStatus(generateReadiness, approvalReadiness);
  const statusConfig = readinessStatusMap[overallStatus];
  const blockingIssues = mergedIssues.filter((issue) => issue.severity === 'BLOCKING');
  const warningIssues = mergedIssues.filter((issue) => issue.severity === 'WARNING');
  const hasIssues = mergedIssues.length > 0;
  const guidance = overallStatus === 'BLOCKED'
    ? approvalReadiness.status === 'BLOCKED'
      ? approvalReadiness.guidance
      : generateReadiness.guidance
    : overallStatus === 'ATTENTION'
      ? approvalReadiness.status === 'ATTENTION'
        ? approvalReadiness.guidance
        : generateReadiness.guidance
      : generateReadiness.guidance;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className={`rounded-full border p-2 ${statusConfig.iconTone}`}>
            {overallStatus === 'READY' ? <CheckCircle2 size={16} /> : overallStatus === 'BLOCKED' ? <AlertTriangle size={16} /> : <CircleAlert size={16} />}
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{title}</div>
            <div className="mt-1 text-sm font-semibold text-slate-800">{guidance}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusConfig.tone}`}>{statusConfig.label}</span>
          <StatusChip label="Gerar" readiness={generateReadiness} />
          <StatusChip label="Aprovar" readiness={approvalReadiness} />
          {hasIssues ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:border-[#17407E] hover:text-[#17407E]"
            >
              {expanded ? 'Ocultar pendências' : 'Ver pendências'}
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          ) : null}
        </div>
      </div>

      {expanded && hasIssues ? (
        <div className="grid gap-3 p-4 lg:grid-cols-2">
          <IssueGroup title="Bloqueios críticos" emptyLabel="Nenhum bloqueio crítico identificado." issues={blockingIssues} severity="BLOCKING" />
          <IssueGroup title="Alertas operacionais" emptyLabel="Nenhum alerta operacional identificado." issues={warningIssues} severity="WARNING" />
        </div>
      ) : null}
    </section>
  );
}

function StatusChip({ label, readiness }: { label: string; readiness: PayrollPeriodReadiness }) {
  return (
    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
      {label}: {readiness.blockingCount} bloqueio(s) · {readiness.warningCount} alerta(s)
    </span>
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
            {issue.details?.length ? (
              <div className="mt-3 space-y-2">
                {issue.details.map((detail, index) => (
                  <div key={`${issue.code}-${detail.date || index}-${index}`} className="rounded-lg border border-white/80 bg-white/70 px-3 py-2 text-xs leading-5 text-slate-600">
                    <div>
                      <span className="font-semibold text-slate-800">Data:</span> {formatDateBr(detail.date)}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800">Motivo:</span> {detail.reason}
                    </div>
                    {detail.marks.length ? (
                      <div>
                        <span className="font-semibold text-slate-800">Marcações:</span> {detail.marks.join(' · ')}
                      </div>
                    ) : null}
                    {detail.rawText ? (
                      <div>
                        <span className="font-semibold text-slate-800">Trecho:</span> {detail.rawText}
                      </div>
                    ) : null}
                  </div>
                ))}
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
