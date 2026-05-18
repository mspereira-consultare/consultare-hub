'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AlertCircle, Download, Loader2, RefreshCw } from 'lucide-react';
import { hasPermission } from '@/lib/permissions';
import type { ProfessionalAttendanceMapEntry, ProfessionalAttendanceMapSpecialty } from '@/lib/profissionais/types';

const WEEKDAY_LABELS: Record<string, string> = {
  SEGUNDA: 'Segunda',
  TERCA: 'Terça',
  QUARTA: 'Quarta',
  QUINTA: 'Quinta',
  SEXTA: 'Sexta',
  SABADO: 'Sábado',
};

const RECURRENCE_BADGES: Record<string, string> = {
  SEMANAL: 'Sem.',
  QUINZENAL: 'Quinz.',
};

const SERVICE_UNIT_LABELS: Record<string, string> = {
  'OURO VERDE': 'Ouro Verde',
  'CENTRO CAMBUI': 'Centro Cambuí',
  'SHOPPING CAMPINAS': 'Shopping Campinas',
};

const toTitleCaseWord = (value: string) => {
  const raw = String(value || '').trim().toLocaleLowerCase('pt-BR');
  if (!raw) return '';
  return raw.charAt(0).toLocaleUpperCase('pt-BR') + raw.slice(1);
};

const formatProfessionalDisplayName = (value: string) => {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return '-';
  if (parts.length === 1) return toTitleCaseWord(parts[0]);

  return `${toTitleCaseWord(parts[0])} ${toTitleCaseWord(parts[parts.length - 1])}`;
};

const hasEntries = (entries: ProfessionalAttendanceMapEntry[]) => entries.length > 0;

function PlannerCell({ entries }: { entries: ProfessionalAttendanceMapEntry[] }) {
  if (!hasEntries(entries)) {
    return <span className="text-sm text-slate-300">-</span>;
  }

  return (
    <div className="space-y-1">
      {entries.map((entry, index) => (
        <div
          key={`${entry.professionalId}-${entry.recurrence}-${index}`}
          className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5"
        >
          <span className="truncate text-[13px] font-medium text-slate-700">
            {formatProfessionalDisplayName(entry.professionalName)}
          </span>
          <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#17407E] ring-1 ring-slate-200">
            {RECURRENCE_BADGES[entry.recurrence] || entry.recurrence}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ProfissionaisMapasPage() {
  const { data: session } = useSession();
  const role = String((session?.user as any)?.role || 'OPERADOR');
  const canView = hasPermission((session?.user as any)?.permissions, 'profissionais_mapas', 'view', role);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState<ProfessionalAttendanceMapSpecialty[]>([]);
  const [specialtyFilter, setSpecialtyFilter] = useState('all');
  const [unitFilter, setUnitFilter] = useState('all');
  const [exporting, setExporting] = useState(false);

  const loadData = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/profissionais/mapas', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Falha ao carregar mapa lista.');
      }
      setItems(Array.isArray(data?.data) ? data.data : []);
    } catch (err: any) {
      setItems([]);
      setError(err?.message || 'Falha ao carregar mapa lista.');
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    loadData().catch(() => null);
  }, [loadData]);

  const specialtyOptions = useMemo(
    () => items.map((item) => item.specialty).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [items]
  );

  const unitOptions = useMemo(() => {
    const values = new Set<string>();
    for (const specialty of items) {
      for (const unit of specialty.units) {
        values.add(unit.serviceUnit);
      }
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [items]);

  const filteredItems = useMemo(() => {
    return items
      .filter((specialty) => specialtyFilter === 'all' || specialty.specialty === specialtyFilter)
      .map((specialty) => ({
        ...specialty,
        units: specialty.units.filter((unit) => unitFilter === 'all' || unit.serviceUnit === unitFilter),
      }))
      .filter((specialty) => specialty.units.length > 0);
  }, [items, specialtyFilter, unitFilter]);

  const hasData = filteredItems.length > 0;

  const onExportXlsx = async () => {
    setExporting(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (specialtyFilter !== 'all') qs.set('specialty', specialtyFilter);
      if (unitFilter !== 'all') qs.set('unit', unitFilter);

      const response = await fetch(`/api/admin/profissionais/mapas/export?${qs.toString()}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || 'Falha ao exportar XLSX.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'profissionais-mapa-lista.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || 'Falha ao exportar XLSX.');
    } finally {
      setExporting(false);
    }
  };

  if (!canView) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Sem permissao para visualizar este modulo.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Mapas de Profissionais</h1>
            <p className="text-xs text-slate-500">
              Visualização gerencial das grades fixas de atendimento por especialidade e unidade.
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Formato planner compacto para leitura rápida das escalas recorrentes.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[260px_220px_140px]">
            <select
              value={specialtyFilter}
              onChange={(e) => setSpecialtyFilter(e.target.value)}
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
            >
              <option value="all">Todas as especialidades</option>
              {specialtyOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
            >
              <option value="all">Todas as unidades</option>
              {unitOptions.map((option) => (
                <option key={option} value={option}>
                  {SERVICE_UNIT_LABELS[option] || option}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => loadData()}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
            >
              Atualizar tela
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
            >
              MAPA LISTA
            </button>
          </div>

          <button
            type="button"
            onClick={onExportXlsx}
            disabled={exporting || loading}
            className="inline-flex items-center gap-2 rounded-lg bg-[#17407E] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Baixar XLSX
          </button>

          <button
            type="button"
            onClick={() => {
              setSpecialtyFilter('all');
              setUnitFilter('all');
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
          >
            <RefreshCw size={14} />
            Limpar filtros
          </button>

          <span className="text-xs text-slate-500">
            {filteredItems.length} especialidade(s) exibida(s)
          </span>
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <span className="inline-flex items-center gap-2">
            <AlertCircle size={14} />
            {error}
          </span>
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center text-slate-500 shadow-sm">
          <span className="inline-flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            Carregando mapa lista...
          </span>
        </div>
      ) : !hasData ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center text-slate-500 shadow-sm">
          Nenhum horario fixo encontrado para os filtros selecionados.
        </div>
      ) : (
        <div className="space-y-8">
          {filteredItems.map((specialty) => (
            <section key={specialty.specialty} className="space-y-4">
              <div className="rounded-2xl bg-slate-950 px-5 py-3 text-center text-lg font-semibold uppercase tracking-[0.08em] text-white shadow-sm">
                {specialty.specialty}
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                {specialty.units.map((unit) => (
                  <div
                    key={`${specialty.specialty}-${unit.serviceUnit}`}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                  >
                    <div className="bg-[#17407E] px-4 py-3 text-center text-sm font-semibold uppercase tracking-[0.08em] text-white">
                      {SERVICE_UNIT_LABELS[unit.serviceUnit] || unit.serviceUnit}
                    </div>

                    <div className="grid grid-cols-[130px_minmax(0,1fr)_minmax(0,1fr)] border-t border-slate-200">
                      <div className="border-r border-slate-200 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Dia
                      </div>
                      <div className="border-r border-slate-200 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Manhã
                      </div>
                      <div className="bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Tarde
                      </div>

                      {unit.rows.map((row) => (
                        <React.Fragment key={`${unit.serviceUnit}-${row.weekday}`}>
                          <div
                            className="border-r border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600"
                          >
                            {WEEKDAY_LABELS[row.weekday] || row.weekday}
                          </div>
                          <div
                            className="border-r border-t border-slate-200 px-3 py-2"
                          >
                            <PlannerCell entries={row.morning} />
                          </div>
                          <div
                            className="border-t border-slate-200 px-3 py-2"
                          >
                            <PlannerCell entries={row.afternoon} />
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
