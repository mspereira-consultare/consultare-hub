import { AlertTriangle, CheckCircle2, Package, Wrench } from 'lucide-react';
import type { EquipmentListSummary } from '@/lib/equipamentos/types';

const cards = [
  {
    key: 'total',
    label: 'Total de equipamentos',
    helper: 'Ativos, inativos e em manutenção.',
    icon: Package,
    accent: 'border-slate-300',
  },
  {
    key: 'calibrationOk',
    label: 'Calibração em dia',
    helper: 'Próxima calibração acima da janela de alerta.',
    icon: CheckCircle2,
    accent: 'border-emerald-300',
  },
  {
    key: 'calibrationDueSoon',
    label: 'Vencendo',
    helper: 'Calibração prevista para os próximos 30 dias.',
    icon: AlertTriangle,
    accent: 'border-amber-300',
  },
  {
    key: 'calibrationOverdue',
    label: 'Vencidos',
    helper: 'Equipamentos com calibração já vencida.',
    icon: AlertTriangle,
    accent: 'border-rose-300',
  },
  {
    key: 'maintenanceCount',
    label: 'Em manutenção',
    helper: 'Status operacional marcado como em manutenção.',
    icon: Wrench,
    accent: 'border-sky-300',
  },
] as const;

type EquipmentSummaryCardsProps = {
  summary: EquipmentListSummary;
};

export function EquipmentSummaryCards({ summary }: EquipmentSummaryCardsProps) {
  const values: Record<(typeof cards)[number]['key'], number> = {
    total: summary.total,
    calibrationOk: summary.calibrationOk,
    calibrationDueSoon: summary.calibrationDueSoon,
    calibrationOverdue: summary.calibrationOverdue,
    maintenanceCount: summary.maintenanceCount,
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.key} className={`rounded-xl border bg-white p-4 shadow-sm ${card.accent}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{card.label}</p>
                <p className="mt-3 text-2xl font-bold text-slate-900">{values[card.key]}</p>
              </div>
              <div className="rounded-full bg-slate-100 p-3 text-slate-600">
                <Icon size={18} />
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-500">{card.helper}</p>
          </div>
        );
      })}
    </div>
  );
}
