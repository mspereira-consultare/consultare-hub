'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';

type Props = {
  label: string;
  options: string[];
  value: string | null;
  onChange: (value: string | null) => void;
  helper?: string;
  placeholder?: string;
  emptyLabel?: string;
  dropdownClassName?: string;
  optionTextClassName?: string;
};

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export function ExecutiveDashboardSearchableSelect({
  label,
  options,
  value,
  onChange,
  helper,
  placeholder,
  emptyLabel = 'Sem restrição',
  dropdownClassName,
  optionTextClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDropdownStyle({
        top: rect.bottom + 8,
        left: rect.left,
        minWidth: rect.width,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
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

  const displayValue = value || placeholder || emptyLabel;

  return (
    <div ref={containerRef} className="space-y-1.5">
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>

      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:border-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        >
          <span className={`truncate ${value ? 'text-slate-800' : 'text-slate-400'}`}>{displayValue}</span>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && dropdownStyle
          ? createPortal(
              <div
                ref={dropdownRef}
                style={{
                  position: 'fixed',
                  top: dropdownStyle.top,
                  left: dropdownStyle.left,
                  minWidth: dropdownStyle.minWidth,
                }}
                className={`z-[80] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl ${
                  dropdownClassName || ''
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

                <div className="max-h-64 overflow-y-auto p-2">
                  <button
                    type="button"
                    onClick={() => {
                      onChange(null);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
                      !value ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>{emptyLabel}</span>
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                        !value ? 'border-slate-500 bg-slate-500 text-white' : 'border-slate-300 bg-white text-transparent'
                      }`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </span>
                  </button>

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
                          className={`mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
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
              </div>,
              document.body
            )
          : null}
      </div>

      <p className="text-xs text-slate-500">
        {helper || 'Use opções oficiais do cadastro. Se deixar vazio, a regra não restringe esse campo.'}
      </p>
    </div>
  );
}
