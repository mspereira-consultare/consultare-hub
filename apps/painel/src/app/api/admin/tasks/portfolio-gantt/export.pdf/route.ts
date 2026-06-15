import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getTaskPortfolioGantt } from '@consultare/core/tasks/repository';
import { requireTaskGovernanceAccess } from '@/lib/tasks/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await requireTaskGovernanceAccess('view');
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const portfolio = await getTaskPortfolioGantt(auth.db, auth.viewer);
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const page = pdf.addPage([842, 595]);
    const scheduledSections = portfolio.sections
      .map((section) => ({
        ...section,
        scheduledTasks: section.tasks.filter((task) => task.startDate && task.dueDate),
      }))
      .filter((section) => section.scheduledTasks.length > 0);

    page.drawRectangle({ x: 32, y: 535, width: 778, height: 40, color: rgb(0.09, 0.25, 0.49) });
    page.drawText('Portfólio consolidado global de tarefas', { x: 42, y: 550, size: 18, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText('Resumo dos projetos e das tarefas avulsas visíveis na governança.', {
      x: 42,
      y: 525,
      size: 9,
      font,
      color: rgb(0.34, 0.42, 0.56),
    });
    page.drawText(`Projetos e blocos: ${scheduledSections.length} | Gerado em ${new Date().toLocaleString('pt-BR')}`, {
      x: 42,
      y: 512,
      size: 8,
      font,
      color: rgb(0.34, 0.42, 0.56),
    });

    let cursorY = 490;
    for (const section of scheduledSections.slice(0, 10)) {
      page.drawText(section.project?.name || 'Tarefas avulsas', { x: 42, y: cursorY, size: 11, font: fontBold, color: rgb(0.09, 0.25, 0.49) });
      cursorY -= 14;
      page.drawText(
        `${section.tasks.length} tarefa(s) | ${section.scheduledTasks.length} agendada(s) | ${section.dependencies.length} dependência(s)`,
        { x: 42, y: cursorY, size: 8, font }
      );
      cursorY -= 18;
      for (const task of section.scheduledTasks.slice(0, 4)) {
        page.drawText(
          `${task.protocolId} · ${task.title.slice(0, 42)} · ${task.startDate || '-'} → ${task.dueDate || '-'} · ${task.checklistProgressPercent}%`,
          { x: 52, y: cursorY, size: 8, font }
        );
        cursorY -= 12;
      }
      cursorY -= 8;
      if (cursorY < 90) break;
    }

    page.drawText('Use a exportação XLSX para análise detalhada, manipulação e auditoria do cronograma.', {
      x: 42,
      y: 60,
      size: 8,
      font,
      color: rgb(0.34, 0.42, 0.56),
    });

    const output = await pdf.save();
    return new NextResponse(Buffer.from(output), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="portfolio-consolidado-governanca-${new Date().toISOString().slice(0, 10)}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('Erro ao exportar portfólio gantt do painel em PDF:', error);
    return NextResponse.json({ error: error?.message || 'Erro ao exportar portfólio em PDF.' }, { status: Number(error?.status) || 500 });
  }
}
