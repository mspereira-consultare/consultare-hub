'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

type Props = {
  label: string;
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  helper?: string;
  placeholder?: string;
  dropdownClassName?: string;
  optionTextClassName?: string;
};

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export function ExecutiveDashboardMultiSelect({
  label,
  options,
  value,
  onChange,
  helper,
  placeholder,
  dropdownClassName,
  optionTextClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options;
    const normalized = normalizeText(searchTerm);
    return options.filter((option) => normalizeText(option).includes(normalized));
  }, [options, searchTerm]);

  const toggleValue = (option: string) => {
    if (value.includes(option)) {
      onChange(value.filter((item) => item !== option));
      return;
    }
    onChange([...value, option]);
  };

  const summary =
    value.length === 0
      ? placeholder || 'Sem restrição'
      : value.length <= 2
        ? value.join(', ')
        : `${value.length} selecionados`;

  return (
    <div ref={containerRef} className="space-y-1.5">
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:border-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        >
          <span className={`truncate ${value.length ? 'text-slate-800' : 'text-slate-400'}`}>{summary}</span>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
        </button>

        {open ? (
          <div
            className={`absolute left-0 top-[calc(100%+8px)] z-30 min-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl ${
              dropdownClassName || 'right-0'
            }`}
          >
            <div className="border-b border-slate-100 p-3">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={`Buscar ${label.toLowerCase()}`}
                  className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                />
              </label>
            </div>

            {value.length ? (
              <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
                {value.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleValue(item)}
                    className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
                  >
                    {item}
                    <X className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            ) : null}

            <div className="max-h-64 overflow-y-auto p-2">
              {filteredOptions.length ? (
                filteredOptions.map((option) => {
                  const checked = value.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggleValue(option)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
                        checked ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className={optionTextClassName || ''}>{option}</span>
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                          checked ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300 bg-white text-transparent'
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-6 text-center text-sm text-slate-500">Nenhuma opção encontrada.</div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <p className="text-xs text-slate-500">
        {helper || 'Selecione uma ou mais opções. Se deixar vazio, o sistema não aplica restrição nesse campo.'}
      </p>
    </div>
  );
}
