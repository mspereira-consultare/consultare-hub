import { Buffer } from 'node:buffer';
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { requireEmployeePortalProductionManagementPermission } from '@/lib/employee_portal_management/auth';
import { getEmployeePortalProductionManagementData } from '@consultare/core/employee-portal/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const getErrorStatus = (error: unknown, fallback = 500) => {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = Number((error as { status?: unknown }).status);
    if (Number.isFinite(status) && status > 0) return status;
  }
  return fallback;
};

const normalizeEntryType = (value: string | null) =>
  value === 'RESOLVE' || value === 'CHECKUP' || value === 'ALL' ? value : undefined;

const normalizeMatchStatus = (value: string | null) =>
  value === 'MATCHED' || value === 'PENDING_MATCH' || value === 'MULTIPLE_MATCHES' || value === 'NO_MATCH' || value === 'ALL'
    ? value
    : undefined;

const normalizePositiveNumber = (value: string | null, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toUint8Array = (buffer: ArrayBuffer | Uint8Array) => {
  if (buffer instanceof Uint8Array) return buffer;
  return new Uint8Array(buffer);
};

const toNodeBuffer = (buffer: ArrayBuffer | Uint8Array) => Buffer.from(toUint8Array(buffer));

const formatDateBr = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
};

const cleanText = (value: unknown) => String(value ?? '').trim() || '—';

const buildWorkbook = async (data: Awaited<ReturnType<typeof getEmployeePortalProductionManagementData>>) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Hub Consultare';
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('Resumo');
  summarySheet.columns = [
    { header: 'Indicador', key: 'label', width: 30 },
    { header: 'Valor', key: 'value', width: 20 },
  ];
  summarySheet.addRows([
    { label: 'Período', value: `${formatDateBr(data.filters.startDate)} a ${formatDateBr(data.filters.endDate)}` },
    { label: 'Total lançado', value: data.summary.totalEntries },
    { label: 'Total vinculado', value: data.summary.matchedEntries },
    { label: 'Resolve contabilizado', value: data.summary.resolveMatchedEntries },
    { label: 'Check-up contabilizado', value: data.summary.checkupMatchedEntries },
    { label: 'Pendentes / não contabilizados', value: data.summary.pendingEntries },
    { label: 'Taxa de vínculo', value: `${data.summary.matchRate}%` },
  ]);

  const collaboratorSheet = workbook.addWorksheet('Ranking colaboradores');
  collaboratorSheet.columns = [
    { header: 'Colaborador', key: 'employeeName', width: 30 },
    { header: 'Unidade', key: 'unit', width: 20 },
    { header: 'Equipe', key: 'team', width: 20 },
    { header: 'Lançado', key: 'totalEntries', width: 14 },
    { header: 'Vinculado', key: 'matchedEntries', width: 14 },
    { header: 'Resolve vinculado', key: 'resolveMatchedEntries', width: 18 },
    { header: 'Check-up vinculado', key: 'checkupMatchedEntries', width: 18 },
    { header: 'Pendências', key: 'pendingEntries', width: 14 },
    { header: 'Taxa vínculo', key: 'matchRate', width: 14 },
  ];
  data.collaboratorRanking.forEach((row) => collaboratorSheet.addRow({
    ...row,
    matchRate: `${row.matchRate}%`,
  }));

  const teamSheet = workbook.addWorksheet('Ranking equipes');
  teamSheet.columns = [
    { header: 'Equipe', key: 'team', width: 24 },
    { header: 'Lançado', key: 'totalEntries', width: 14 },
    { header: 'Vinculado', key: 'matchedEntries', width: 14 },
    { header: 'Resolve vinculado', key: 'resolveMatchedEntries', width: 18 },
    { header: 'Check-up vinculado', key: 'checkupMatchedEntries', width: 18 },
    { header: 'Pendências', key: 'pendingEntries', width: 14 },
    { header: 'Taxa vínculo', key: 'matchRate', width: 14 },
  ];
  data.teamRanking.forEach((row) => teamSheet.addRow({
    ...row,
    matchRate: `${row.matchRate}%`,
  }));

  const entriesSheet = workbook.addWorksheet('Lançamentos');
  entriesSheet.columns = [
    { header: 'Data', key: 'serviceDate', width: 14 },
    { header: 'Colaborador', key: 'employeeName', width: 28 },
    { header: 'Unidade', key: 'unitSnapshot', width: 20 },
    { header: 'Equipe', key: 'teamSnapshot', width: 20 },
    { header: 'Tipo', key: 'entryType', width: 14 },
    { header: 'Paciente informado', key: 'patientNameRaw', width: 34 },
    { header: 'Status vínculo', key: 'matchStatus', width: 18 },
    { header: 'Paciente Feegow', key: 'feegowPatientName', width: 34 },
    { header: 'Criado em', key: 'createdAt', width: 22 },
  ];
  data.entries.forEach((entry) => entriesSheet.addRow({
    serviceDate: formatDateBr(entry.serviceDate),
    employeeName: cleanText(entry.employeeName),
    unitSnapshot: cleanText(entry.unitSnapshot),
    teamSnapshot: cleanText(entry.teamSnapshot),
    entryType: entry.entryType,
    patientNameRaw: cleanText(entry.patientNameRaw),
    matchStatus: entry.matchStatus,
    feegowPatientName: cleanText(entry.feegowPatientName),
    createdAt: entry.createdAt.replace('T', ' ').slice(0, 19),
  }));

  return workbook.xlsx.writeBuffer();
};

const buildPdf = async (data: Awaited<ReturnType<typeof getEmployeePortalProductionManagementData>>) => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([842, 595]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = 555;
  page.drawText('Produção do Portal do Colaborador - Relatório Gerencial', {
    x: 40,
    y,
    size: 18,
    font: bold,
    color: rgb(0.09, 0.25, 0.49),
  });
  y -= 24;
  page.drawText(`Período: ${formatDateBr(data.filters.startDate)} a ${formatDateBr(data.filters.endDate)}`, {
    x: 40,
    y,
    size: 10,
    font,
    color: rgb(0.35, 0.4, 0.46),
  });
  y -= 24;

  const summaryItems = [
    ['Total lançado', String(data.summary.totalEntries)],
    ['Total vinculado', String(data.summary.matchedEntries)],
    ['Resolve contabilizado', String(data.summary.resolveMatchedEntries)],
    ['Check-up contabilizado', String(data.summary.checkupMatchedEntries)],
    ['Pendências', String(data.summary.pendingEntries)],
    ['Taxa de vínculo', `${data.summary.matchRate}%`],
  ];

  summaryItems.forEach(([label, value], index) => {
    const x = 40 + (index % 3) * 250;
    const boxY = y - Math.floor(index / 3) * 60;
    page.drawRectangle({ x, y: boxY, width: 220, height: 46, color: rgb(0.97, 0.98, 0.99), borderColor: rgb(0.88, 0.9, 0.93), borderWidth: 1 });
    page.drawText(label, { x: x + 12, y: boxY + 28, size: 9, font, color: rgb(0.38, 0.43, 0.5) });
    page.drawText(value, { x: x + 12, y: boxY + 10, size: 16, font: bold, color: rgb(0.1, 0.12, 0.15) });
  });

  y -= 140;
  page.drawText('Top colaboradores', { x: 40, y, size: 13, font: bold, color: rgb(0.09, 0.25, 0.49) });
  y -= 16;
  data.collaboratorRanking.slice(0, 10).forEach((row, index) => {
    page.drawText(
      `${index + 1}. ${cleanText(row.employeeName)} · ${row.matchedEntries} vinculados · ${row.totalEntries} lançados · ${row.matchRate}%`,
      { x: 48, y, size: 9, font, color: rgb(0.2, 0.24, 0.28) }
    );
    y -= 14;
  });

  y -= 10;
  page.drawText('Top equipes', { x: 40, y, size: 13, font: bold, color: rgb(0.09, 0.25, 0.49) });
  y -= 16;
  data.teamRanking.slice(0, 10).forEach((row, index) => {
    page.drawText(
      `${index + 1}. ${cleanText(row.team)} · ${row.matchedEntries} vinculados · ${row.totalEntries} lançados · ${row.matchRate}%`,
      { x: 48, y, size: 9, font, color: rgb(0.2, 0.24, 0.28) }
    );
    y -= 14;
  });

  return pdf.save();
};

export async function GET(request: Request) {
  try {
    const auth = await requireEmployeePortalProductionManagementPermission('view');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const format = String(searchParams.get('format') || 'xlsx').toLowerCase();
    const data = await getEmployeePortalProductionManagementData(auth.db, {
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      employeeId: searchParams.get('employeeId') || undefined,
      team: searchParams.get('team') || undefined,
      unit: searchParams.get('unit') || undefined,
      entryType: normalizeEntryType(searchParams.get('entryType')),
      matchStatus: normalizeMatchStatus(searchParams.get('matchStatus')),
      page: normalizePositiveNumber(searchParams.get('page'), 1),
      pageSize: normalizePositiveNumber(searchParams.get('pageSize'), 5000),
    });

    if (format === 'pdf') {
      const buffer = await buildPdf(data);
      return new NextResponse(toNodeBuffer(buffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="portal-colaborador-producao-gerencial.pdf"',
        },
      });
    }

    const buffer = await buildWorkbook(data);
    return new NextResponse(toNodeBuffer(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="portal-colaborador-producao-gerencial.xlsx"',
      },
    });
  } catch (error: unknown) {
    console.error('Erro ao exportar produção gerencial do portal:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Erro interno ao exportar produção gerencial.') },
      { status: getErrorStatus(error) }
    );
  }
}
