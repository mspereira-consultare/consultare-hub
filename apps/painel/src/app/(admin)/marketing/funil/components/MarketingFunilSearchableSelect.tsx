'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { MarketingFunilFilterOption } from './types';

type MarketingFunilSearchableSelectProps = {
  label: string;
  value: string;
  options: MarketingFunilFilterOption[];
  placeholder: string;
  allLabel?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function MarketingFunilSearchableSelect({
  label,
  value,
  options,
  placeholder,
  allLabel = 'Todos',
  disabled = false,
  onChange,
}: MarketingFunilSearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) setSearchTerm('');
  }, [open]);

  const filteredOptions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return options;
    return options.filter((option) => `${option.label} ${option.value}`.toLowerCase().includes(term));
  }, [options, searchTerm]);

  const selectedLabel =
    options.find((option) => option.value === value)?.label || (value ? value : placeholder);

  return (
    <div className="space-y-2" ref={wrapperRef}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((prev) => !prev)}
          className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm text-slate-700 outline-none transition hover:bg-white focus:border-slate-300 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          <span className={value ? 'text-slate-700' : 'text-slate-400'}>{selectedLabel}</span>
          <ChevronDown size={16} className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
        </button>

        {open ? (
          <div className="absolute left-0 top-full z-30 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-100 bg-slate-50 p-2">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
                <Search size={14} className="text-slate-400" />
                <input
                  autoFocus
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={`Pesquisar ${label.toLowerCase()}...`}
                  className="w-full bg-transparent py-2 text-sm text-slate-700 outline-none"
                />
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto py-1">
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition hover:bg-blue-50 hover:text-blue-700 ${
                  !value ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-600'
                }`}
              >
                <span>{allLabel}</span>
                {!value ? <Check size={14} /> : null}
              </button>

              {filteredOptions.length ? (
                filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between border-t border-slate-50 px-4 py-2 text-left text-sm transition hover:bg-blue-50 hover:text-blue-700 ${
                      value === option.value ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-600'
                    }`}
                  >
                    <span className="truncate pr-3">{option.label}</span>
                    {value === option.value ? <Check size={14} className="shrink-0" /> : null}
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-center text-xs text-slate-400">Nenhuma opção encontrada.</div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
