'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

export type MarketingFunilTooltipSection = {
  title: string;
  content: string;
};

type MarketingFunilInfoTooltipProps = {
  label: string;
  sections: MarketingFunilTooltipSection[];
  align?: 'left' | 'right';
  widthClassName?: string;
};

type TooltipPosition = {
  top: number;
  left: number;
  width: number;
};

const TOOLTIP_MAX_WIDTH = 352;
const VIEWPORT_PADDING = 16;
const TOOLTIP_GAP = 10;
const CLOSE_DELAY_MS = 140;

export function MarketingFunilInfoTooltip({
  label,
  sections,
  align = 'right',
  widthClassName = 'w-[22rem] max-w-[calc(100vw-2rem)]',
}: MarketingFunilInfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const clearCloseTimer = () => {
    if (!closeTimerRef.current) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const closeWithDelay = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
    }, CLOSE_DELAY_MS);
  };

  const updatePosition = () => {
    if (!triggerRef.current || typeof window === 'undefined') return;

    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(TOOLTIP_MAX_WIDTH, Math.max(260, viewportWidth - VIEWPORT_PADDING * 2));
    const measuredHeight = tooltipRef.current?.offsetHeight || 220;

    let left = align === 'left' ? rect.left : rect.right - width;
    left = Math.max(VIEWPORT_PADDING, Math.min(left, viewportWidth - width - VIEWPORT_PADDING));

    let top = rect.bottom + TOOLTIP_GAP;
    const fitsBelow = top + measuredHeight <= viewportHeight - VIEWPORT_PADDING;
    const fitsAbove = rect.top - TOOLTIP_GAP - measuredHeight >= VIEWPORT_PADDING;

    if (!fitsBelow && fitsAbove) {
      top = rect.top - measuredHeight - TOOLTIP_GAP;
    } else if (!fitsBelow) {
      top = Math.max(VIEWPORT_PADDING, viewportHeight - measuredHeight - VIEWPORT_PADDING);
    }

    setPosition({ top, left, width });
  };

  useEffect(() => {
    if (!open) return undefined;

    updatePosition();

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (tooltipRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    const handleViewportChange = () => updatePosition();

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [align, open]);

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={() => {
        clearCloseTimer();
        setOpen(true);
      }}
      onMouseLeave={closeWithDelay}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onClick={() => {
          clearCloseTimer();
          setOpen((current) => !current);
        }}
        onFocus={() => {
          clearCloseTimer();
          setOpen(true);
        }}
        onBlur={closeWithDelay}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:border-slate-300 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
      >
        <Info size={13} />
      </button>

      {open && position
        ? createPortal(
            <div
              ref={tooltipRef}
              id={tooltipId}
              role="dialog"
              aria-label={label}
              style={{ top: position.top, left: position.left, width: position.width }}
              onMouseEnter={clearCloseTimer}
              onMouseLeave={closeWithDelay}
              className={`fixed z-[120] ${widthClassName} rounded-2xl border border-slate-200 bg-white p-4 shadow-xl`}
            >
              <div className="space-y-3">
                {sections.map((section) => (
                  <div key={section.title}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{section.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-700">{section.content}</p>
                  </div>
                ))}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
