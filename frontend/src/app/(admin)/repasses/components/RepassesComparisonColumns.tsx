'use client';

const currency = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

type RepassesComparisonColumnsProps = {
  consolidadoQty: number;
  consolidadoValue: number;
  naoConsolidadoQty: number;
  naoConsolidadoValue: number;
};

export function RepassesComparisonColumns({
  consolidadoQty,
  consolidadoValue,
  naoConsolidadoQty,
  naoConsolidadoValue,
}: RepassesComparisonColumnsProps) {
  return (
    <>
      <td className="px-2 py-1.5 text-right tabular-nums">{consolidadoQty}</td>
      <td className="px-2 py-1.5 text-right font-medium tabular-nums">{currency(consolidadoValue)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{naoConsolidadoQty}</td>
      <td className="px-2 py-1.5 text-right font-medium tabular-nums">{currency(naoConsolidadoValue)}</td>
    </>
  );
}
