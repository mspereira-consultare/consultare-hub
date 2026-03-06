'use client';

type StatusValue = string;

const CLASS_BY_STATUS: Record<string, string> = {
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  SUCCESS: 'bg-emerald-100 text-emerald-700',
  RUNNING: 'bg-sky-100 text-sky-700',
  FAILED: 'bg-rose-100 text-rose-700',
  ERROR: 'bg-rose-100 text-rose-700',
  PARTIAL: 'bg-amber-100 text-amber-700',
  PENDING: 'bg-slate-100 text-slate-700',
  NO_DATA: 'bg-violet-100 text-violet-700',
  NOT_PROCESSED: 'bg-slate-100 text-slate-700',
};

const LABEL_BY_STATUS: Record<string, string> = {
  COMPLETED: 'Concluído',
  SUCCESS: 'Com dados',
  RUNNING: 'Executando',
  FAILED: 'Falhou',
  ERROR: 'Erro',
  PARTIAL: 'Parcial',
  PENDING: 'Pendente',
  NO_DATA: 'Sem produção',
  NOT_PROCESSED: 'Não processado',
};

export function StatusBadge({ status }: { status: StatusValue }) {
  const normalized = String(status || '').trim().toUpperCase();
  const classes = CLASS_BY_STATUS[normalized] || 'bg-slate-100 text-slate-700';
  const label = LABEL_BY_STATUS[normalized] || normalized || '-';

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${classes}`}>
      {label}
    </span>
  );
}
