'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

type MultiOption = {
  value: string;
  label: string;
};

type SurveillanceLicenseMultiSelectProps = {
  value: string[];
  options: MultiOption[];
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string[]) => void;
};

export function SurveillanceLicenseMultiSelect({
  value,
  options,
  placeholder,
  disabled = false,
  onChange,
}: SurveillanceLicenseMultiSelectProps) {
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

  const selectedOptions = useMemo(
    () => value.map((item) => options.find((option) => option.value === item)).filter(Boolean) as MultiOption[],
    [options, value],
  );

  const toggleValue = (nextValue: string) => {
    if (value.includes(nextValue)) {
      onChange(value.filter((item) => item !== nextValue));
      return;
    }
    onChange([...value, nextValue]);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-800 outline-none transition hover:bg-slate-50 focus:border-[#17407E] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      >
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          {selectedOptions.length ? (
            <>
              {selectedOptions.slice(0, 2).map((option) => (
                <span
                  key={option.value}
                  className="inline-flex max-w-full items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-[#17407E]"
                >
                  <span className="truncate">{option.label}</span>
                </span>
              ))}
              {selectedOptions.length > 2 ? (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                  +{selectedOptions.length - 2} licença(s)
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </div>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-40 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="space-y-2 border-b border-slate-100 bg-slate-50 p-2">
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

            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-slate-500">{selectedOptions.length} selecionada(s)</span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs font-medium text-slate-500 transition hover:text-rose-600"
              >
                Limpar seleção
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {filteredOptions.length ? (
              filteredOptions.map((option) => {
                const checked = value.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleValue(option.value)}
                    className={`flex w-full items-center justify-between gap-3 border-t border-slate-50 px-4 py-2 text-left text-sm transition hover:bg-blue-50 hover:text-blue-700 ${
                      checked ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-600'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded border ${
                          checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-transparent'
                        }`}
                      >
                        <Check size={11} />
                      </span>
                      <span className="truncate">{option.label}</span>
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="px-4 py-3 text-center text-xs text-slate-400">Nenhuma licença encontrada.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
