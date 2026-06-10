'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Bell, Loader2, MessageCircle } from 'lucide-react';
import type { IntranetNotification, IntranetNotificationSummary } from '@consultare/core/intranet/notifications';

const normalizeError = async (response: Response) => {
  try {
    const json = await response.json();
    return String(json?.error || `Falha HTTP ${response.status}`);
  } catch {
    return `Falha HTTP ${response.status}`;
  }
};

const formatRelativeTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.round(diff / 60000));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return `${days} d`;
};

const playChatTone = async (contextRef: MutableRefObject<AudioContext | null>) => {
  const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const context = contextRef.current || new Ctx();
  contextRef.current = context;
  if (context.state === 'suspended') {
    await context.resume();
  }

  const now = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
  gain.connect(context.destination);

  const first = context.createOscillator();
  first.type = 'sine';
  first.frequency.setValueAtTime(880, now);
  first.connect(gain);
  first.start(now);
  first.stop(now + 0.14);

  const second = context.createOscillator();
  second.type = 'sine';
  second.frequency.setValueAtTime(660, now + 0.16);
  second.connect(gain);
  second.start(now + 0.16);
  second.stop(now + 0.28);
};

export function HeaderActionsClient({
  initialSummary,
}: {
  initialSummary: IntranetNotificationSummary;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState(initialSummary);
  const [items, setItems] = useState<IntranetNotification[]>(initialSummary.items || []);
  const [open, setOpen] = useState(false);
  const [loadingDropdown, setLoadingDropdown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [chatPulse, setChatPulse] = useState(false);
  const [bellPulse, setBellPulse] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const knownIdsRef = useRef(new Set((initialSummary.items || []).map((item) => item.id)));
  const initializedRef = useRef(false);
  const lastSoundAtRef = useRef(0);

  const unreadChatCount = summary.unreadByChannel?.chat || 0;

  const loadSummary = async () => {
    const response = await fetch('/api/notifications/summary', { cache: 'no-store' });
    if (!response.ok) throw new Error(await normalizeError(response));
    const payload = await response.json();
    return payload.data as IntranetNotificationSummary;
  };

  const loadItems = async () => {
    const response = await fetch('/api/notifications?limit=12', { cache: 'no-store' });
    if (!response.ok) throw new Error(await normalizeError(response));
    const payload = await response.json();
    return (Array.isArray(payload.data) ? payload.data : []) as IntranetNotification[];
  };

  useEffect(() => {
    const unlock = () => setAudioUnlocked(true);
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!dropdownRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!chatPulse && !bellPulse) return undefined;
    const timer = window.setTimeout(() => {
      setChatPulse(false);
      setBellPulse(false);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [bellPulse, chatPulse]);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const next = await loadSummary();
        if (cancelled) return;

        const unseenUnreadChat = next.items.filter(
          (item) => item.channel === 'chat' && !item.isRead && !knownIdsRef.current.has(item.id)
        );
        for (const item of next.items) {
          knownIdsRef.current.add(item.id);
        }

        if (initializedRef.current && unseenUnreadChat.length > 0) {
          setChatPulse(true);
          setBellPulse(true);
          if (audioUnlocked && Date.now() - lastSoundAtRef.current > 4000) {
            lastSoundAtRef.current = Date.now();
            void playChatTone(audioContextRef);
          }
        }

        setSummary(next);
        if (!open) setItems(next.items || []);
        initializedRef.current = true;
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Erro ao atualizar notificações.');
      }
    };

    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void refresh();
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [audioUnlocked, open]);

  const unreadItems = useMemo(() => items.filter((item) => !item.isRead), [items]);

  const openDropdown = async () => {
    setOpen((current) => !current);
    if (!open) {
      setLoadingDropdown(true);
      try {
        const nextItems = await loadItems();
        setItems(nextItems);
        for (const item of nextItems) {
          knownIdsRef.current.add(item.id);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar notificações.');
      } finally {
        setLoadingDropdown(false);
      }
    }
  };

  const navigateToNotification = async (item: IntranetNotification) => {
    try {
      if (!item.isRead) {
        await fetch('/api/notifications/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notificationIds: [item.id] }),
        });
        setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, isRead: true, readAt: new Date().toISOString() } : entry)));
        setSummary((current) => ({
          ...current,
          unreadCount: Math.max(0, current.unreadCount - 1),
          unreadByChannel: {
            ...current.unreadByChannel,
            [item.channel]: Math.max(0, (current.unreadByChannel?.[item.channel] || 0) - 1),
          },
        }));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao abrir notificação.');
    } finally {
      setOpen(false);
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (item.href !== currentUrl) {
        router.push(item.href);
      } else {
        router.refresh();
      }
    }
  };

  const markAllRead = async () => {
    try {
      const response = await fetch('/api/notifications/read-all', { method: 'POST' });
      if (!response.ok) throw new Error(await normalizeError(response));
      setItems((current) => current.map((item) => ({ ...item, isRead: true, readAt: item.readAt || new Date().toISOString() })));
      setSummary((current) => ({
        ...current,
        unreadCount: 0,
        unreadByChannel: { chat: 0, task: 0 },
      }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao marcar todas como lidas.');
    }
  };

  return (
    <div className="relative flex items-center gap-2">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => void openDropdown()}
        className={`relative flex h-9 w-9 items-center justify-center rounded-md border text-[#17407E] transition hover:bg-blue-50 ${
          summary.unreadCount || bellPulse ? 'border-blue-200 bg-blue-50' : 'border-slate-200'
        }`}
        aria-label="Notificações"
      >
        <Bell size={18} className={bellPulse ? 'animate-pulse' : ''} />
        {summary.unreadCount ? (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-rose-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">
            {summary.unreadCount > 9 ? '9+' : summary.unreadCount}
          </span>
        ) : null}
      </button>

      <Link
        href="/chat"
        className={`relative flex h-9 w-9 items-center justify-center rounded-md border text-[#17407E] transition hover:bg-blue-50 ${
          unreadChatCount || chatPulse ? 'border-blue-200 bg-blue-50' : 'border-slate-200'
        }`}
        aria-label="Chat interno"
      >
        <MessageCircle size={18} className={chatPulse ? 'animate-pulse' : ''} />
        {unreadChatCount ? (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-rose-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">
            {unreadChatCount > 9 ? '9+' : unreadChatCount}
          </span>
        ) : null}
      </Link>

      {open ? (
        <div ref={dropdownRef} className="absolute right-0 top-12 z-40 w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Notificações</div>
                <div className="mt-1 text-xs text-slate-500">{summary.unreadCount} não lida(s)</div>
              </div>
              <button
                type="button"
                onClick={() => void markAllRead()}
                disabled={!summary.unreadCount}
                className="text-xs font-semibold text-[#17407E] disabled:text-slate-400"
              >
                Marcar todas
              </button>
            </div>
            {error ? <div className="mt-2 text-xs text-rose-600">{error}</div> : null}
          </div>

          <div className="max-h-[420px] overflow-y-auto p-2">
            {loadingDropdown ? (
              <div className="flex items-center justify-center px-4 py-10 text-sm text-slate-500">
                <Loader2 size={16} className="mr-2 animate-spin" />
                Carregando notificações...
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">Nenhuma notificação recente.</div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void navigateToNotification(item)}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-slate-50 ${
                    item.isRead ? 'opacity-75' : 'bg-blue-50/60'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      item.channel === 'chat' ? 'bg-blue-100 text-[#17407E]' : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {item.channel === 'chat' ? <MessageCircle size={16} /> : <Bell size={16} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-slate-900">{item.title}</span>
                      <span className="shrink-0 text-[11px] text-slate-500">{formatRelativeTime(item.createdAt)}</span>
                    </span>
                    <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-600">{item.body}</span>
                    <span className="mt-2 inline-flex rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
                      {item.channel === 'chat' ? 'Chat' : 'Tarefa'}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>

          {unreadItems.length ? (
            <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
              Atualiza automaticamente a cada poucos segundos enquanto a intranet estiver aberta.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
