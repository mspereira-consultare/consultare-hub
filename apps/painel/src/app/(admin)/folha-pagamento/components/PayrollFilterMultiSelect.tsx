'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

const buttonClassName =
  'flex h-9 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 text-left text-sm text-slate-800 outline-none transition hover:border-slate-300 focus:border-[#17407E] focus:ring-2 focus:ring-blue-100';

export function PayrollFilterMultiSelect({
  options,
  value,
  onChange,
  allLabel,
}: {
  options: string[];
  value: string[];
  onChange: (nextValue: string[]) => void;
  allLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const summary = useMemo(() => {
    if (value.length === 0) return allLabel;
    if (value.length === 1) return value[0];
    return `${value.length} selecionados`;
  }, [allLabel, value]);

  const toggleValue = (item: string) => {
    onChange(value.includes(item) ? value.filter((current) => current !== item) : [...value, item]);
  };

  return (
    <div ref={containerRef} className="relative">
      <button type="button" onClick={() => setOpen((current) => !current)} className={buttonClassName}>
        <span className="truncate">{summary}</span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-30 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
          >
            <span>{allLabel}</span>
            {value.length === 0 ? <Check size={14} className="text-[#17407E]" /> : null}
          </button>

          <div className="mt-1 max-h-52 overflow-y-auto">
            {options.map((item) => {
              const selected = value.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggleValue(item)}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                >
                  <span className="truncate pr-3">{item}</span>
                  {selected ? <Check size={14} className="shrink-0 text-[#17407E]" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
