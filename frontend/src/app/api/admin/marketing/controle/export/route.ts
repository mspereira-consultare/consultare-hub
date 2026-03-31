import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import { requireMarketingControlePermission } from '@/lib/marketing_controle/auth';
import {
  getMarketingControleGrid,
  getMarketingControleSummary,
  normalizeMarketingControleFilters,
  MarketingControleValidationError,
  type MarketingControleFilters,
} from '@/lib/marketing_controle/repository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const getFilters = (request: Request): MarketingControleFilters => {
  const { searchParams } = new URL(request.url);
  return {
    monthRef: searchParams.get('monthRef') || undefined,
    brand: searchParams.get('brand') || undefined,
  };
};

const formatCurrency = (value: number) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatNumber = (value: number, digits = 0) =>
  Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const formatDuration = (value: number) => {
  const totalSeconds = Math.max(0, Math.round(Number(value || 0)));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
      2,
      '0'
    )}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const formatValue = (format: string, value: number | null) => {
  if (value == null) return '—';
  if (format === 'currency') return formatCurrency(value);
  if (format === 'percentage') return `${formatNumber(value, 2)}%`;
  if (format === 'duration') return formatDuration(value);
  if (format === 'multiplier') return `${formatNumber(value, 2)}x`;
  return formatNumber(value, format === 'integer' ? 0 : 2);
};

export async function GET(request: Request) {
  try {
    const auth = await requireMarketingControlePermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const filters = getFilters(request);
    const normalized = normalizeMarketingControleFilters(filters);
    const [summary, grid] = await Promise.all([
      getMarketingControleSummary(auth.db, filters),
      getMarketingControleGrid(auth.db, filters),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Hub Consultare';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Controle');
    worksheet.columns = [
      { header: 'Métrica', key: 'metric', width: 38 },
      { header: 'Semana 1', key: 'week1', width: 18 },
      { header: 'Semana 2', key: 'week2', width: 18 },
      { header: 'Semana 3', key: 'week3', width: 18 },
      { header: 'Semana 4', key: 'week4', width: 18 },
      { header: 'Mensal', key: 'monthly', width: 18 },
    ];

    worksheet.mergeCells('A1:F1');
    worksheet.getCell('A1').value = 'Marketing / Controle';
    worksheet.getCell('A1').font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } };
    worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17407E' } };

    worksheet.mergeCells('A2:F2');
    worksheet.getCell('A2').value = `Marca: ${normalized.brand} | Mês: ${normalized.monthRef} | Período: ${normalized.startDate} até ${normalized.endDate}`;
    worksheet.getCell('A2').font = { size: 10 };

    worksheet.mergeCells('A3:F3');
    worksheet.getCell('A3').value = `Gerado em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
    worksheet.getCell('A3').font = { size: 10 };

    worksheet.mergeCells('A5:F5');
    worksheet.getCell('A5').value = 'Resumo do mês';
    worksheet.getCell('A5').font = { bold: true, color: { argb: 'FF17407E' } };

    const summaryRows = [
      ['Visitantes do site', formatNumber(summary.cards.visitors)],
      ['Cliques em WhatsApp', formatNumber(summary.cards.whatsappClicks)],
      ['Novos contatos Clinia (Google)', formatNumber(summary.cards.cliniaNewContacts)],
      ['Agendamentos Clinia (Google)', formatNumber(summary.cards.cliniaAppointments)],
      ['Investimento Google Ads', formatCurrency(summary.cards.googleSpend)],
      ['Custo por novo contato', summary.cards.costPerNewContact == null ? '—' : formatCurrency(summary.cards.costPerNewContact)],
      ['Custo por agendamento', summary.cards.costPerAppointment == null ? '—' : formatCurrency(summary.cards.costPerAppointment)],
    ];

    let rowIndex = 6;
    for (const [label, value] of summaryRows) {
      worksheet.getCell(`A${rowIndex}`).value = label;
      worksheet.getCell(`A${rowIndex}`).font = { bold: true };
      worksheet.getCell(`B${rowIndex}`).value = value;
      rowIndex += 1;
    }

    rowIndex += 1;

    for (const section of grid.sections) {
      worksheet.mergeCells(`A${rowIndex}:F${rowIndex}`);
      worksheet.getCell(`A${rowIndex}`).value = section.title;
      worksheet.getCell(`A${rowIndex}`).font = {
        bold: true,
        color: { argb: section.availability === 'available' ? 'FFFFFFFF' : 'FF475569' },
      };
      worksheet.getCell(`A${rowIndex}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: section.availability === 'available' ? 'FF17407E' : 'FFE2E8F0' },
      };
      rowIndex += 1;

      worksheet.mergeCells(`A${rowIndex}:F${rowIndex}`);
      worksheet.getCell(`A${rowIndex}`).value = section.subtitle;
      worksheet.getCell(`A${rowIndex}`).font = { italic: true, size: 10, color: { argb: 'FF64748B' } };
      rowIndex += 1;

      if (section.availability === 'planned') {
        worksheet.mergeCells(`A${rowIndex}:F${rowIndex}`);
        worksheet.getCell(`A${rowIndex}`).value = 'Em planejamento';
        worksheet.getCell(`A${rowIndex}`).font = { color: { argb: 'FF64748B' } };
        rowIndex += 2;
        continue;
      }

      const headerRow = worksheet.getRow(rowIndex);
      headerRow.values = ['Métrica', 'Semana 1', 'Semana 2', 'Semana 3', 'Semana 4', 'Mensal'];
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      rowIndex += 1;

      for (const metricRow of section.rows) {
        worksheet.getCell(`A${rowIndex}`).value = metricRow.label;
        worksheet.getCell(`B${rowIndex}`).value = formatValue(metricRow.format, metricRow.week1);
        worksheet.getCell(`C${rowIndex}`).value = formatValue(metricRow.format, metricRow.week2);
        worksheet.getCell(`D${rowIndex}`).value = formatValue(metricRow.format, metricRow.week3);
        worksheet.getCell(`E${rowIndex}`).value = formatValue(metricRow.format, metricRow.week4);
        worksheet.getCell(`F${rowIndex}`).value = formatValue(metricRow.format, metricRow.monthly);
        rowIndex += 1;
      }

      rowIndex += 1;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const output = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);

    return new NextResponse(output, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="marketing-controle-${normalized.brand}-${normalized.monthRef}.xlsx"`,
      },
    });
  } catch (error: unknown) {
    const status = error instanceof MarketingControleValidationError ? error.status : 500;
    console.error('Erro API marketing/controle export:', error);
    const message = error instanceof Error ? error.message : 'Erro interno.';
    return NextResponse.json({ error: message }, { status });
  }
}
