'use client';

import { useEffect, useId, useRef, useState } from 'react';
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

export function MarketingFunilInfoTooltip({
  label,
  sections,
  align = 'right',
  widthClassName = 'w-[22rem] max-w-[calc(100vw-2rem)]',
}: MarketingFunilInfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const tooltipId = useId();

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current) return;
      if (wrapperRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [open]);

  const positionClassName = align === 'left' ? 'left-0' : 'right-0';

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onFocus={() => setOpen(true)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:border-slate-300 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
      >
        <Info size={13} />
      </button>

      {open ? (
        <div
          id={tooltipId}
          role="dialog"
          aria-label={label}
          className={`absolute ${positionClassName} top-full z-40 mt-2 ${widthClassName} rounded-2xl border border-slate-200 bg-white p-4 shadow-xl`}
        >
          <div className="space-y-3">
            {sections.map((section) => (
              <div key={section.title}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{section.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-700">{section.content}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
