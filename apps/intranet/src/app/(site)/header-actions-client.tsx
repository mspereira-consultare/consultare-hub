'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MutableRefObject } from 'react';
import { Bell, Loader2, MessageCircle, X } from 'lucide-react';
import type { IntranetNotification, IntranetNotificationSummary } from '@consultare/core/intranet/notifications';

type NotificationToast = IntranetNotification & {
  toastKey: string;
};

type DynamicFaviconState = {
  baseHref: string;
  baseType: string;
  link: HTMLLinkElement;
  originalTitle: string;
};

const DYNAMIC_FAVICON_SELECTOR = 'link[data-dynamic-favicon="true"]';
const MAX_TITLE_BADGE = 99;
const MAX_FAVICON_BADGE = 9;

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

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Falha ao carregar ícone base: ${src}`));
    image.src = src;
  });

const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

const drawFallbackFaviconBase = (ctx: CanvasRenderingContext2D, size: number) => {
  drawRoundedRect(ctx, 4, 4, size - 8, size - 8, 14);
  ctx.fillStyle = '#17407E';
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('C', size / 2, size / 2 + 1);
};

const buildBadgedFavicon = async (baseHref: string, count: number) => {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  try {
    const image = await loadImage(baseHref);
    ctx.drawImage(image, 0, 0, size, size);
  } catch {
    drawFallbackFaviconBase(ctx, size);
  }

  const badgeLabel = count > MAX_FAVICON_BADGE ? '9+' : String(count);
  const badgeRadius = 16;
  const badgeX = size - 18;
  const badgeY = 18;

  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#dc2626';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = badgeLabel.length > 1 ? 'bold 18px system-ui, sans-serif' : 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeLabel, badgeX, badgeY + 1);

  return canvas.toDataURL('image/png');
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
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.07, now + 0.18);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.52);
  gain.connect(context.destination);

  const first = context.createOscillator();
  first.type = 'sine';
  first.frequency.setValueAtTime(1046, now);
  first.connect(gain);
  first.start(now);
  first.stop(now + 0.16);

  const second = context.createOscillator();
  second.type = 'sine';
  second.frequency.setValueAtTime(1318, now + 0.2);
  second.connect(gain);
  second.start(now + 0.2);
  second.stop(now + 0.34);

  const third = context.createOscillator();
  third.type = 'triangle';
  third.frequency.setValueAtTime(1568, now + 0.38);
  third.connect(gain);
  third.start(now + 0.38);
  third.stop(now + 0.52);
};

export function HeaderActionsClient({
  initialSummary,
}: {
  initialSummary: IntranetNotificationSummary;
}) {
  const router = useRouter();
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [summary, setSummary] = useState(initialSummary);
  const [items, setItems] = useState<IntranetNotification[]>(initialSummary.items || []);
  const [open, setOpen] = useState(false);
  const [loadingDropdown, setLoadingDropdown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [, forceNotificationPermissionRefresh] = useState(0);
  const [notificationPromptDismissed, setNotificationPromptDismissed] = useState(false);
  const [chatPulse, setChatPulse] = useState(false);
  const [bellPulse, setBellPulse] = useState(false);
  const [toasts, setToasts] = useState<NotificationToast[]>([]);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const toastTimersRef = useRef(new Map<string, number>());
  const desktopNotifiedIdsRef = useRef(new Set<string>());
  const desktopNotificationsRef = useRef(new Map<string, Notification>());
  const dynamicFaviconRef = useRef<DynamicFaviconState | null>(null);
  const seenUnreadIdsRef = useRef(new Set((initialSummary.items || []).filter((item) => !item.isRead).map((item) => item.id)));
  const seenUnreadChatIdsRef = useRef(
    new Set((initialSummary.items || []).filter((item) => item.channel === 'chat' && !item.isRead).map((item) => item.id))
  );
  const lastUnreadChatCountRef = useRef(initialSummary.unreadByChannel?.chat || 0);
  const lastSoundAtRef = useRef(0);

  const notificationsSupported = isClient && 'Notification' in window;
  const notificationPermission: NotificationPermission = notificationsSupported ? window.Notification.permission : 'default';
  const unreadChatCount = summary.unreadByChannel?.chat || 0;
  const faviconBadgeCount = unreadChatCount > 0 ? unreadChatCount : summary.unreadCount;

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

  const markNotificationReadLocally = useCallback((item: IntranetNotification) => {
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, isRead: true, readAt: new Date().toISOString() } : entry)));
    setSummary((current) => ({
      ...current,
      unreadCount: Math.max(0, current.unreadCount - 1),
      unreadByChannel: {
        ...current.unreadByChannel,
        [item.channel]: Math.max(0, (current.unreadByChannel?.[item.channel] || 0) - 1),
      },
    }));
  }, []);

  const closeDesktopNotification = useCallback((notificationId: string) => {
    const notification = desktopNotificationsRef.current.get(notificationId);
    if (!notification) return;
    notification.close();
    desktopNotificationsRef.current.delete(notificationId);
  }, []);

  const dismissToast = useCallback((toastKey: string) => {
    const timerId = toastTimersRef.current.get(toastKey);
    if (timerId) {
      window.clearTimeout(timerId);
      toastTimersRef.current.delete(toastKey);
    }
    setToasts((current) => current.filter((toast) => toast.toastKey !== toastKey));
  }, []);

  useEffect(() => {
    const unlock = () => {
      setAudioUnlocked(true);
      const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const context = audioContextRef.current || new Ctx();
      audioContextRef.current = context;
      if (context.state === 'suspended') {
        void context.resume();
      }
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    const toastTimers = toastTimersRef.current;
    const desktopNotifications = desktopNotificationsRef.current;
    const faviconState = dynamicFaviconRef.current;
    return () => {
      for (const timerId of toastTimers.values()) {
        window.clearTimeout(timerId);
      }
      toastTimers.clear();
      for (const notification of desktopNotifications.values()) {
        notification.close();
      }
      desktopNotifications.clear();
      if (faviconState) {
        faviconState.link.remove();
        document.title = faviconState.originalTitle;
      }
    };
  }, []);

  useEffect(() => {
    if (!isClient) return undefined;

    const existingIcon =
      document.querySelector<HTMLLinkElement>(`${DYNAMIC_FAVICON_SELECTOR}`) ||
      document.querySelector<HTMLLinkElement>('link[rel="icon"]') ||
      document.querySelector<HTMLLinkElement>('link[rel="shortcut icon"]') ||
      document.querySelector<HTMLLinkElement>('link[rel*="icon"]');

    const dynamicLink = document.createElement('link');
    dynamicLink.rel = 'icon';
    dynamicLink.type = existingIcon?.type || 'image/x-icon';
    dynamicLink.href = existingIcon?.href || '/favicon.ico';
    dynamicLink.dataset.dynamicFavicon = 'true';
    document.head.appendChild(dynamicLink);

    dynamicFaviconRef.current = {
      baseHref: dynamicLink.href,
      baseType: dynamicLink.type || 'image/x-icon',
      link: dynamicLink,
      originalTitle: document.title,
    };

    return () => {
      dynamicLink.remove();
      if (dynamicFaviconRef.current?.link === dynamicLink) {
        document.title = dynamicFaviconRef.current.originalTitle;
        dynamicFaviconRef.current = null;
      }
    };
  }, [isClient]);

  useEffect(() => {
    if (!isClient) return undefined;
    const faviconState = dynamicFaviconRef.current;
    if (!faviconState) return undefined;

    let cancelled = false;
    const titleBadge = faviconBadgeCount > MAX_TITLE_BADGE ? `${MAX_TITLE_BADGE}+` : String(faviconBadgeCount);
    document.title = faviconBadgeCount > 0 ? `(${titleBadge}) ${faviconState.originalTitle}` : faviconState.originalTitle;

    const updateFavicon = async () => {
      if (!faviconBadgeCount) {
        faviconState.link.href = faviconState.baseHref;
        faviconState.link.type = faviconState.baseType;
        return;
      }

      const badgedHref = await buildBadgedFavicon(faviconState.baseHref, faviconBadgeCount);
      if (cancelled || !badgedHref) return;
      faviconState.link.href = badgedHref;
      faviconState.link.type = 'image/png';
    };

    void updateFavicon();
    return () => {
      cancelled = true;
    };
  }, [faviconBadgeCount, isClient]);

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

  const navigateToNotification = useCallback(async (item: IntranetNotification) => {
    try {
      closeDesktopNotification(item.id);
      if (!item.isRead) {
        await fetch('/api/notifications/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notificationIds: [item.id] }),
        });
        markNotificationReadLocally(item);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao abrir notificação.');
    } finally {
      setToasts((current) => current.filter((toast) => toast.id !== item.id));
      setOpen(false);
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (item.href !== currentUrl) {
        router.push(item.href);
      } else {
        router.refresh();
      }
    }
  }, [closeDesktopNotification, markNotificationReadLocally, router]);

  useEffect(() => {
    let cancelled = false;

    const isBackgroundContext = () => document.visibilityState !== 'visible' || !document.hasFocus();

    const showDesktopNotification = (item: IntranetNotification) => {
      if (!notificationsSupported || notificationPermission !== 'granted') return;
      if (!isBackgroundContext()) return;
      if (desktopNotifiedIdsRef.current.has(item.id)) return;

      desktopNotifiedIdsRef.current.add(item.id);
      closeDesktopNotification(item.id);
      const notification = new window.Notification(item.title, {
        body: item.body,
        tag: item.id,
      });

      desktopNotificationsRef.current.set(item.id, notification);
      notification.onclick = () => {
        notification.close();
        desktopNotificationsRef.current.delete(item.id);
        window.focus();
        void navigateToNotification(item);
      };
      notification.onclose = () => {
        desktopNotificationsRef.current.delete(item.id);
      };
    };

    const refresh = async () => {
      try {
        const next = await loadSummary();
        if (cancelled) return;

        const unseenUnread = next.items.filter((item) => !item.isRead && !seenUnreadIdsRef.current.has(item.id));
        const unreadChatItems = next.items.filter((item) => item.channel === 'chat' && !item.isRead);
        const unseenUnreadChat = unreadChatItems.filter((item) => !seenUnreadChatIdsRef.current.has(item.id));
        const nextUnreadChatCount = next.unreadByChannel?.chat || 0;
        const hasNewActivity = unseenUnread.length > 0;
        const hasNewChatActivity = unseenUnreadChat.length > 0 || nextUnreadChatCount > lastUnreadChatCountRef.current;

        if (hasNewActivity) {
          const nextToasts = unseenUnread.slice(0, 3).map((item) => ({
            ...item,
            toastKey: `${item.id}:${Date.now()}`,
          }));
          setToasts((current) => [...nextToasts, ...current].slice(0, 4));
          for (const toast of nextToasts) {
            const timeoutId = window.setTimeout(() => {
              dismissToast(toast.toastKey);
            }, 10000);
            toastTimersRef.current.set(toast.toastKey, timeoutId);
          }
        }

        if (hasNewActivity) {
          setBellPulse(true);
          unseenUnread.forEach(showDesktopNotification);
          if (isBackgroundContext() && audioUnlocked && Date.now() - lastSoundAtRef.current > 4000) {
            lastSoundAtRef.current = Date.now();
            void playChatTone(audioContextRef);
          }
        }
        if (hasNewChatActivity) {
          setChatPulse(true);
        }

        seenUnreadIdsRef.current = new Set(next.items.filter((item) => !item.isRead).map((item) => item.id));
        seenUnreadChatIdsRef.current = new Set(unreadChatItems.map((item) => item.id));
        lastUnreadChatCountRef.current = nextUnreadChatCount;

        setSummary(next);
        if (!open) setItems(next.items || []);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Erro ao atualizar notificações.');
      }
    };

    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 5000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [audioUnlocked, closeDesktopNotification, dismissToast, navigateToNotification, notificationPermission, notificationsSupported, open]);

  const unreadItems = useMemo(() => items.filter((item) => !item.isRead), [items]);
  const showNotificationPrompt = notificationsSupported && notificationPermission === 'default' && !notificationPromptDismissed;

  const openDropdown = async () => {
    setOpen((current) => !current);
    if (!open) {
      setLoadingDropdown(true);
      try {
        const nextItems = await loadItems();
        setItems(nextItems);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar notificações.');
      } finally {
        setLoadingDropdown(false);
      }
    }
  };

  const requestDesktopNotificationPermission = async () => {
    if (!notificationsSupported || notificationPermission !== 'default') return;
    try {
      await window.Notification.requestPermission();
      forceNotificationPermissionRefresh((current) => current + 1);
      if (window.Notification.permission !== 'default') {
        setNotificationPromptDismissed(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível ativar as notificações do navegador.');
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
      setToasts([]);
      for (const timerId of toastTimersRef.current.values()) {
        window.clearTimeout(timerId);
      }
      toastTimersRef.current.clear();
      for (const notificationId of desktopNotificationsRef.current.keys()) {
        closeDesktopNotification(notificationId);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao marcar todas como lidas.');
    }
  };

  return (
    <div className="relative flex items-center gap-2">
      {showNotificationPrompt ? (
        <div className="absolute right-0 top-12 z-40 w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-blue-200 bg-white p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[#17407E]">
              <Bell size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">Ative alertas do navegador</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Receba avisos de chat e tarefas mesmo quando estiver trabalhando em outra tela.
              </p>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNotificationPromptDismissed(true)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Agora não
                </button>
                <button
                  type="button"
                  onClick={() => void requestDesktopNotificationPermission()}
                  className="rounded-lg bg-[#17407E] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#123463]"
                >
                  Ativar alertas
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {toasts.length ? (
        <div className="pointer-events-none fixed right-5 top-20 z-[70] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-3">
          {toasts.map((toast) => (
            <div
              key={toast.toastKey}
              className="pointer-events-auto animate-[fade-in_180ms_ease-out] overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur"
            >
              <div className="flex items-start gap-3 p-4">
                <button
                  type="button"
                  onClick={() => void navigateToNotification(toast)}
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                >
                  <span
                    className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      toast.channel === 'chat' ? 'bg-blue-100 text-[#17407E]' : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {toast.channel === 'chat' ? <MessageCircle size={18} /> : <Bell size={18} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-slate-900">{toast.title}</span>
                      <span className="shrink-0 text-[11px] text-slate-500">{formatRelativeTime(toast.createdAt)}</span>
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-600">{toast.body}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.toastKey)}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Fechar notificação"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

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
            {notificationsSupported && notificationPermission !== 'granted' ? (
              <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-800">
                  {notificationPermission === 'denied' ? 'Alertas bloqueados no navegador' : 'Alertas do navegador desativados'}
                </p>
                <p className="mt-1 leading-5">
                  {notificationPermission === 'denied'
                    ? 'Libere as notificações nas permissões do navegador para receber avisos fora da intranet.'
                    : 'Ative as notificações para receber avisos de chat e tarefas mesmo em outra tela.'}
                </p>
                {notificationPermission === 'default' ? (
                  <button
                    type="button"
                    onClick={() => void requestDesktopNotificationPermission()}
                    className="mt-3 rounded-lg bg-[#17407E] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#123463]"
                  >
                    Ativar alertas
                  </button>
                ) : null}
              </div>
            ) : null}
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
