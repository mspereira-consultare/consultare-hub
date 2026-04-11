'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

type SearchableOption = {
  value: string;
  label: string;
};

type SurveillanceSearchableSelectProps = {
  value: string;
  options: SearchableOption[];
  placeholder: string;
  allLabel: string;
  allValue?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function SurveillanceSearchableSelect({
  value,
  options,
  placeholder,
  allLabel,
  allValue = 'all',
  disabled = false,
  onChange,
}: SurveillanceSearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const filteredOptions = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => `${option.label} ${option.value}`.toLowerCase().includes(normalized));
  }, [options, search]);

  const selectedLabel = options.find((option) => option.value === value)?.label || (value === allValue ? allLabel : placeholder);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-800 outline-none transition hover:bg-slate-50 focus:border-[#17407E] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      >
        <span className={value === allValue ? 'text-slate-500' : 'text-slate-800'}>{selectedLabel || placeholder}</span>
        <ChevronDown size={16} className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-40 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 bg-slate-50 p-2">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
              <Search size={14} className="text-slate-400" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Pesquisar licença..."
                className="w-full bg-transparent py-2 text-sm text-slate-700 outline-none"
              />
              {search ? (
                <button type="button" onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              ) : null}
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => {
                onChange(allValue);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition hover:bg-blue-50 hover:text-blue-700 ${
                value === allValue ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-600'
              }`}
            >
              <span>{allLabel}</span>
              {value === allValue ? <Check size={14} /> : null}
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
              <div className="px-4 py-3 text-center text-xs text-slate-400">Nenhuma licença encontrada.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
