import type { MarketingControleGrid as MarketingControleGridData } from './types';
import { formatValueByKind } from './formatters';

type MarketingControleGridProps = {
  grid: MarketingControleGridData;
};

export function MarketingControleGrid({ grid }: MarketingControleGridProps) {
  return (
    <div className="space-y-5">
      {grid.sections.map((section) => {
        if (section.availability === 'planned') {
          return (
            <section
              key={section.key}
              className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">{section.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{section.subtitle}</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  Em planejamento
                </span>
              </div>
            </section>
          );
        }

        return (
          <section key={section.key} className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">{section.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{section.subtitle}</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Dados reais
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em]">
                      Métrica
                    </th>
                    {grid.columns.map((column) => (
                      <th
                        key={column.key}
                        className="min-w-[140px] px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.16em]"
                      >
                        <div>{column.label}</div>
                        <div className="mt-1 text-[10px] font-medium normal-case tracking-normal text-slate-400">
                          {column.startDate.slice(8, 10)}/{column.startDate.slice(5, 7)} a{' '}
                          {column.endDate.slice(8, 10)}/{column.endDate.slice(5, 7)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row) => (
                    <tr key={row.key} className="border-t border-slate-100">
                      <td className="px-5 py-3 font-medium text-slate-700">{row.label}</td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {formatValueByKind(row.format, row.week1)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {formatValueByKind(row.format, row.week2)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {formatValueByKind(row.format, row.week3)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {formatValueByKind(row.format, row.week4)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
                        {formatValueByKind(row.format, row.monthly)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
