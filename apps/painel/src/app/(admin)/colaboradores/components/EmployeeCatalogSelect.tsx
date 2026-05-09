'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';

type Props = {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  onCreateNew: () => void;
  createLabel: string;
  helper?: string;
  disabled?: boolean;
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

export function EmployeeCatalogSelect({
  label,
  options,
  value,
  onChange,
  onCreateNew,
  createLabel,
  helper,
  disabled,
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

  const mergedOptions = useMemo(() => {
    const set = new Set(options);
    if (value.trim()) set.add(value.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [options, value]);

  const filteredOptions = useMemo(() => {
    if (!searchTerm) return mergedOptions;
    const normalized = normalizeText(searchTerm);
    return mergedOptions.filter((option) => normalizeText(option).includes(normalized));
  }, [mergedOptions, searchTerm]);

  const displayValue = value.trim() || placeholder || 'Selecione';

  return (
    <div ref={containerRef} className="space-y-1.5">
      <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</label>

      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-[42px] w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:border-slate-300 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className={`truncate ${value.trim() ? 'text-slate-800' : 'text-slate-400'}`}>{displayValue}</span>
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

            <div className="max-h-72 overflow-y-auto p-2">
              {filteredOptions.length ? (
                filteredOptions.map((option) => {
                  const checked = option === value;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        onChange(option);
                        setOpen(false);
                      }}
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

            <div className="border-t border-slate-100 p-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onCreateNew();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              >
                <Plus className="h-4 w-4" />
                {createLabel}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <p className="text-xs text-slate-500">
        {helper || 'Selecione uma opção oficial. Se não existir, cadastre uma nova antes de salvar o colaborador.'}
      </p>
    </div>
  );
}
