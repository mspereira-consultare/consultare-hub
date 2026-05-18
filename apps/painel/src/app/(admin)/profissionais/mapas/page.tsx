'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { ProfessionalAttendanceMapSpecialty } from '@/lib/profissionais/types';

const WEEKDAY_LABELS: Record<string, string> = {
  SEGUNDA: 'Segunda',
  TERCA: 'Terça',
  QUARTA: 'Quarta',
  QUINTA: 'Quinta',
  SEXTA: 'Sexta',
  SABADO: 'Sábado',
};

const RECURRENCE_LABELS: Record<string, string> = {
  SEMANAL: 'Semanal',
  QUINZENAL: 'Quinzenal',
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

  const firstName = toTitleCaseWord(parts[0]);
  const lastName = toTitleCaseWord(parts[parts.length - 1]);
  return `${firstName} ${lastName}`;
};

const renderCellLines = (values: string[]) => {
  if (values.length === 0) return <span className="text-slate-300">-</span>;
  return (
    <div className="space-y-1">
      {values.map((value, index) => (
        <div key={`${value}-${index}`} className="leading-5 text-slate-700">
          {value}
        </div>
      ))}
    </div>
  );
};

export default function ProfissionaisMapasPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState<ProfessionalAttendanceMapSpecialty[]>([]);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/admin/profissionais/mapas', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'Falha ao carregar mapa lista.');
        }
        if (!isMounted) return;
        setItems(Array.isArray(data?.data) ? data.data : []);
      } catch (err: any) {
        if (!isMounted) return;
        setItems([]);
        setError(err?.message || 'Falha ao carregar mapa lista.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load().catch(() => null);
    return () => {
      isMounted = false;
    };
  }, []);

  const hasData = useMemo(() => items.length > 0, [items]);

  return (
    <div className="p-8 max-w-[1800px] mx-auto space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Mapas de Profissionais</h1>
          <p className="text-slate-500">
            Visualização gerencial das grades fixas de atendimento por especialidade e unidade.
          </p>
        </div>
      </div>

      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800"
        >
          MAPA LISTA
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <span className="inline-flex items-center gap-2">
            <AlertCircle size={15} />
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
          Nenhum horário fixo cadastrado até o momento.
        </div>
      ) : (
        <div className="space-y-8">
          {items.map((specialty) => (
            <section key={specialty.specialty} className="space-y-4">
              <div className="rounded-2xl bg-slate-950 px-5 py-3 text-center text-lg font-semibold uppercase tracking-[0.08em] text-white shadow-sm">
                {specialty.specialty}
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                {specialty.units.map((unit) => (
                  <div key={`${specialty.specialty}-${unit.serviceUnit}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="bg-[#17407E] px-4 py-3 text-center text-sm font-semibold uppercase tracking-[0.08em] text-white">
                      {SERVICE_UNIT_LABELS[unit.serviceUnit] || unit.serviceUnit}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] border-collapse text-sm">
                        <thead>
                          <tr className="bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-600">
                            <th className="border-b border-r border-slate-200 px-3 py-2 text-left">Dia</th>
                            <th className="border-b border-r border-slate-200 px-3 py-2 text-left">Manhã</th>
                            <th className="border-b border-r border-slate-200 px-3 py-2 text-left">Frequência</th>
                            <th className="border-b border-r border-slate-200 px-3 py-2 text-left">Tarde</th>
                            <th className="border-b border-slate-200 px-3 py-2 text-left">Frequência</th>
                          </tr>
                        </thead>
                        <tbody>
                          {unit.rows.map((row) => (
                            <tr key={`${unit.serviceUnit}-${row.weekday}`} className="align-top">
                              <td className="border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                                {WEEKDAY_LABELS[row.weekday] || row.weekday}
                              </td>
                              <td className="border-b border-r border-slate-200 px-3 py-2">
                                {renderCellLines(
                                  row.morning.map((entry) => formatProfessionalDisplayName(entry.professionalName))
                                )}
                              </td>
                              <td className="border-b border-r border-slate-200 px-3 py-2">
                                {renderCellLines(
                                  row.morning.map((entry) => RECURRENCE_LABELS[entry.recurrence] || entry.recurrence)
                                )}
                              </td>
                              <td className="border-b border-r border-slate-200 px-3 py-2">
                                {renderCellLines(
                                  row.afternoon.map((entry) => formatProfessionalDisplayName(entry.professionalName))
                                )}
                              </td>
                              <td className="border-b border-slate-200 px-3 py-2">
                                {renderCellLines(
                                  row.afternoon.map(
                                    (entry) => RECURRENCE_LABELS[entry.recurrence] || entry.recurrence
                                  )
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
