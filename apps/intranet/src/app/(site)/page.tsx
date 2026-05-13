/* eslint-disable @next/next/no-img-element -- Home cards render authenticated intranet asset URLs. */
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import {
  AlertCircle,
  Bot,
  Clock3,
  FileText,
  Megaphone,
  MessageCircle,
  Navigation,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { getDbConnection } from '@consultare/core/db';
import { listPublishedNavigationNodes, listRecentNewsPosts } from '@consultare/core/intranet/repository';
import { listTasks } from '@consultare/core/tasks/repository';
import type { TaskSummary, TaskStatus } from '@consultare/core/tasks/types';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

const cards = [
  { label: 'Buscar informações', href: '/busca', icon: Search },
  { label: 'IA Consultare', href: '/ia', icon: Bot },
  { label: 'Chat interno', href: '/chat', icon: MessageCircle },
  { label: 'POPs e documentos', href: '/qualidade', icon: FileText },
  { label: 'Áreas internas', href: '/', icon: Navigation },
  { label: 'Acesso seguro', href: '/', icon: ShieldCheck },
];

const newsCategoryLabels: Record<string, string> = {
  geral: 'Geral',
  rh: 'RH',
  operacional: 'Operacional',
  comunicado: 'Comunicado',
  qualidade: 'Qualidade',
  ti: 'TI',
  eventos: 'Eventos',
};

const newsTypeLabels: Record<string, string> = {
  news: 'Notícia',
  notice: 'Aviso',
  banner: 'Banner',
};

const highlightStyles: Record<string, { card: string; badge: string; visual: string; label: string }> = {
  info: {
    card: 'border-blue-100',
    badge: 'bg-blue-50 text-[#17407E] ring-blue-100',
    visual: 'bg-blue-50 text-[#17407E]',
    label: 'Informativo',
  },
  attention: {
    card: 'border-amber-200',
    badge: 'bg-amber-50 text-amber-700 ring-amber-100',
    visual: 'bg-amber-50 text-amber-700',
    label: 'Atenção',
  },
  important: {
    card: 'border-indigo-200',
    badge: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
    visual: 'bg-indigo-50 text-indigo-700',
    label: 'Importante',
  },
  urgent: {
    card: 'border-rose-200',
    badge: 'bg-rose-50 text-rose-700 ring-rose-100',
    visual: 'bg-rose-50 text-rose-700',
    label: 'Urgente',
  },
};

const coverUrl = (assetId: string | null | undefined) => assetId ? `/api/intranet/assets/${encodeURIComponent(assetId)}/download` : '';

const formatDate = (value: string | null) => {
  if (!value) return 'Sem prazo';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
};

const isDueSoon = (dueDate: string | null, status: TaskStatus) => {
  if (!dueDate || status === 'CONCLUIDA' || status === 'CANCELADA') return false;
  const due = new Date(`${dueDate}T00:00:00`);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 2);
  return due >= start && due <= end;
};

const isOverdue = (dueDate: string | null, status: TaskStatus) => {
  if (!dueDate || status === 'CONCLUIDA' || status === 'CANCELADA') return false;
  const due = new Date(`${dueDate}T00:00:00`);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return due < start;
};

const priorityRank: Record<TaskSummary['priority'], number> = {
  URGENTE: 0,
  ALTA: 1,
  MEDIA: 2,
  BAIXA: 3,
};

const compareCriticalTasks = (left: TaskSummary, right: TaskSummary) => {
  const leftOverdue = isOverdue(left.dueDate, left.status);
  const rightOverdue = isOverdue(right.dueDate, right.status);
  if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;

  const leftDueSoon = isDueSoon(left.dueDate, left.status);
  const rightDueSoon = isDueSoon(right.dueDate, right.status);
  if (leftDueSoon !== rightDueSoon) return leftDueSoon ? -1 : 1;

  if (left.status === 'AGUARDANDO_APROVACAO' && right.status !== 'AGUARDANDO_APROVACAO') return -1;
  if (right.status === 'AGUARDANDO_APROVACAO' && left.status !== 'AGUARDANDO_APROVACAO') return 1;

  const priorityGap = priorityRank[left.priority] - priorityRank[right.priority];
  if (priorityGap !== 0) return priorityGap;

  if (left.dueDate && right.dueDate) {
    const dueGap = left.dueDate.localeCompare(right.dueDate);
    if (dueGap !== 0) return dueGap;
  } else if (left.dueDate || right.dueDate) {
    return left.dueDate ? -1 : 1;
  }

  return right.updatedAt.localeCompare(left.updatedAt);
};

export default async function IntranetHomePage() {
  const session = await getServerSession(authOptions);
  const user = {
    id: String(session?.user?.id || ''),
    role: String(session?.user?.role || 'OPERADOR'),
    department: String(session?.user?.department || ''),
  };
  const db = getDbConnection();
  const [navItems, newsPosts, visibleTasks] = await Promise.all([
    listPublishedNavigationNodes(db, user),
    listRecentNewsPosts(db, 4, user),
    user.id ? listTasks(db, { userId: user.id, canViewAll: false }) : Promise.resolve([]),
  ]);
  const taskSummary = {
    total: visibleTasks.length,
    dueSoon: visibleTasks.filter((task) => isDueSoon(task.dueDate, task.status)).length,
    overdue: visibleTasks.filter((task) => isOverdue(task.dueDate, task.status)).length,
    awaitingApproval: visibleTasks.filter((task) => task.status === 'AGUARDANDO_APROVACAO').length,
    approved: visibleTasks.filter((task) => task.latestApproval?.decisionStatus === 'APROVADA').length,
  };
  const criticalTasks = visibleTasks
    .filter((task) => isOverdue(task.dueDate, task.status) || isDueSoon(task.dueDate, task.status) || task.status === 'AGUARDANDO_APROVACAO')
    .sort(compareCriticalTasks)
    .slice(0, 6);

  return (
    <div className="px-4 py-6 lg:px-8">
      <section className="rounded-lg bg-[#053F74] p-6 text-white shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">Intranet Consultare</p>
        <h1 className="mt-3 text-3xl font-semibold">Referência interna para o dia a dia</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-50">
          Acesse páginas, comunicados, documentos e ferramentas internas publicadas pela Consultare.
        </p>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-0 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="border-b border-slate-200 p-6 xl:border-b-0 xl:border-r">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#17407E]">Minhas tarefas</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">O que precisa da sua atenção agora</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Acompanhe seus prazos, aprovações e pendências do dia sem sair da home da intranet.
                </p>
              </div>
              <Link
                href="/tarefas"
                className="inline-flex shrink-0 items-center justify-center rounded-lg bg-[#17407E] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#123463]"
              >
                Abrir board completo
              </Link>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <TaskMetricCard label="Total" value={taskSummary.total} helper="Tudo que você acompanha" tone="neutral" />
              <TaskMetricCard label="A vencer" value={taskSummary.dueSoon} helper="Próximos 2 dias" tone="warning" />
              <TaskMetricCard label="Vencidas" value={taskSummary.overdue} helper="Prazo expirado" tone="danger" />
              <TaskMetricCard label="Aguardando aprovação" value={taskSummary.awaitingApproval} helper="Em revisão" tone="info" />
              <TaskMetricCard label="Aprovadas" value={taskSummary.approved} helper="Última decisão aprovada" tone="success" />
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Tarefas críticas</h3>
                <p className="mt-1 text-sm text-slate-500">Vencidas, a vencer ou esperando aprovação.</p>
              </div>
              <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                {criticalTasks.length}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {criticalTasks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  Nenhuma tarefa crítica no momento.
                </div>
              ) : (
                criticalTasks.map((task) => (
                  <Link
                    key={task.id}
                    href="/tarefas"
                    className="block rounded-xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-[#17407E] hover:bg-blue-50/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#17407E]">{task.protocolId}</p>
                        <h4 className="mt-1 line-clamp-2 font-semibold text-slate-900">{task.title}</h4>
                      </div>
                      <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 ring-1 ring-slate-200">
                        {task.priority}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                      {task.status === 'AGUARDANDO_APROVACAO' ? (
                        <span className="rounded-full bg-violet-100 px-2 py-1 font-semibold text-violet-700 ring-1 ring-violet-200">
                          Aguardando aprovação
                        </span>
                      ) : null}
                      {isOverdue(task.dueDate, task.status) ? (
                        <span className="rounded-full bg-rose-100 px-2 py-1 font-semibold text-rose-700 ring-1 ring-rose-200">
                          Vencida
                        </span>
                      ) : null}
                      {!isOverdue(task.dueDate, task.status) && isDueSoon(task.dueDate, task.status) ? (
                        <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-700 ring-1 ring-amber-200">
                          A vencer
                        </span>
                      ) : null}
                      <span className="rounded-full bg-white px-2 py-1 font-semibold text-slate-600 ring-1 ring-slate-200">
                        {task.department}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 size={13} />
                        {formatDate(task.dueDate)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle size={13} />
                        {task.commentCount} comentário(s)
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.label} href={card.href} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#17407E]">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-[#17407E]">
                <Icon size={20} />
              </div>
              <h2 className="font-semibold text-slate-900">{card.label}</h2>
            </Link>
          );
        })}
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Navegação publicada</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {navItems.length === 0 ? <p className="text-sm text-slate-500">Nenhum item publicado ainda.</p> : null}
            {navItems.filter((item) => item.href).slice(0, 8).map((item) => (
              <Link key={item.id} href={item.href || '#'} className="rounded-md border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-blue-50 hover:text-[#17407E]">
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Notícias e avisos</h2>
          <div className="mt-4 grid gap-3">
            {newsPosts.length === 0 ? <p className="text-sm text-slate-500">Nenhum aviso publicado ainda.</p> : null}
            {newsPosts.map((post) => {
              const style = highlightStyles[post.highlightLevel] || highlightStyles.info;
              const imageUrl = coverUrl(post.coverAssetId);
              return (
                <article key={post.id} className={`overflow-hidden rounded-lg border bg-white shadow-sm ${style.card}`}>
                  <div className="grid gap-0 sm:grid-cols-[112px_minmax(0,1fr)]">
                    {imageUrl ? (
                      <img src={imageUrl} alt="" className="h-28 w-full object-cover sm:h-full" />
                    ) : (
                      <div className={`flex min-h-24 items-center justify-center ${style.visual}`}>
                        {post.isFeatured ? <Sparkles size={24} /> : <Megaphone size={24} />}
                      </div>
                    )}
                    <div className="p-4">
                      <div className="mb-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-slate-100">
                          {newsCategoryLabels[post.category] || 'Geral'}
                        </span>
                        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ${style.badge}`}>
                          {style.label}
                        </span>
                      </div>
                      <p className="text-xs font-semibold uppercase text-[#229A8A]">{newsTypeLabels[post.postType] || post.postType}</p>
                      <h3 className="mt-1 font-semibold text-slate-900">{post.title}</h3>
                      {post.summary ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{post.summary}</p> : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

function TaskMetricCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: number;
  helper: string;
  tone: 'neutral' | 'warning' | 'danger' | 'info' | 'success';
}) {
  const styles: Record<typeof tone, { border: string; icon: string; bg: string; Icon: typeof AlertCircle }> = {
    neutral: { border: 'border-slate-200', icon: 'text-slate-700', bg: 'bg-slate-50', Icon: FileText },
    warning: { border: 'border-amber-200', icon: 'text-amber-700', bg: 'bg-amber-50', Icon: Clock3 },
    danger: { border: 'border-rose-200', icon: 'text-rose-700', bg: 'bg-rose-50', Icon: AlertCircle },
    info: { border: 'border-blue-200', icon: 'text-[#17407E]', bg: 'bg-blue-50', Icon: ShieldCheck },
    success: { border: 'border-emerald-200', icon: 'text-emerald-700', bg: 'bg-emerald-50', Icon: Sparkles },
  };
  const style = styles[tone];
  const Icon = style.Icon;

  return (
    <div className={`rounded-xl border p-4 ${style.border}`}>
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${style.bg} ${style.icon}`}>
        <Icon size={18} />
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2 text-3xl font-semibold text-slate-900">{value}</div>
      <p className="mt-2 text-sm text-slate-500">{helper}</p>
    </div>
  );
}
