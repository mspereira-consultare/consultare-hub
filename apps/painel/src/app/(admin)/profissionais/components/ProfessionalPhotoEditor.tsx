'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Grip, ZoomIn, ZoomOut } from 'lucide-react';
import type { ProfessionalPhotoCrop } from '@/lib/profissionais/types';

export const DEFAULT_PROFESSIONAL_PHOTO_CROP: ProfessionalPhotoCrop = {
  aspectRatio: '4:5',
  zoom: 1,
  focusX: 50,
  focusY: 50,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const buildProfessionalPhotoStyle = (
  crop: ProfessionalPhotoCrop | null | undefined
): React.CSSProperties => {
  const safe = crop || DEFAULT_PROFESSIONAL_PHOTO_CROP;
  return {
    objectFit: 'cover',
    objectPosition: `${safe.focusX}% ${safe.focusY}%`,
    transform: `scale(${safe.zoom})`,
    transformOrigin: 'center center',
  };
};

type Props = {
  imageUrl: string;
  value: ProfessionalPhotoCrop | null;
  onChange: (crop: ProfessionalPhotoCrop) => void;
};

export function ProfessionalPhotoEditor({ imageUrl, value, onChange }: Props) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<ProfessionalPhotoCrop>(value || DEFAULT_PROFESSIONAL_PHOTO_CROP);
  const dragStateRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setDraft(value || DEFAULT_PROFESSIONAL_PHOTO_CROP);
  }, [value]);

  const previewStyle = useMemo(() => buildProfessionalPhotoStyle(draft), [draft]);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      if (!dragStateRef.current || !frameRef.current) return;
      const rect = frameRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const dx = event.clientX - dragStateRef.current.x;
      const dy = event.clientY - dragStateRef.current.y;
      dragStateRef.current = { x: event.clientX, y: event.clientY };

      const next = {
        ...draft,
        focusX: clamp(draft.focusX - (dx / rect.width) * 100, 0, 100),
        focusY: clamp(draft.focusY - (dy / rect.height) * 100, 0, 100),
      };
      setDraft(next);
      onChange(next);
    };

    const handleUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [draft, onChange]);

  const startDrag = (clientX: number, clientY: number) => {
    dragStateRef.current = { x: clientX, y: clientY };
  };

  return (
    <div className="space-y-3">
      <div className="mx-auto w-full max-w-[420px]">
        <div
          ref={frameRef}
          onMouseDown={(event) => startDrag(event.clientX, event.clientY)}
          className="relative aspect-[4/5] overflow-hidden rounded-xl border bg-slate-100 select-none cursor-grab active:cursor-grabbing"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Ajuste de foto do profissional"
            className="h-full w-full transition-transform duration-75"
            style={previewStyle}
            draggable={false}
          />
          <div className="pointer-events-none absolute inset-x-3 bottom-3 inline-flex items-center gap-2 self-end rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
            <Grip size={14} />
            Arraste para reenquadrar
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>Zoom</span>
            <span>{draft.zoom.toFixed(2)}x</span>
          </div>
          <div className="flex items-center gap-3">
            <ZoomOut size={16} className="text-slate-400" />
            <input
              type="range"
              min={1}
              max={2.5}
              step={0.05}
              value={draft.zoom}
              onChange={(event) => {
                const next = { ...draft, zoom: clamp(Number(event.target.value), 1, 2.5) };
                setDraft(next);
                onChange(next);
              }}
              className="w-full accent-[#17407E]"
            />
            <ZoomIn size={16} className="text-slate-400" />
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setDraft(DEFAULT_PROFESSIONAL_PHOTO_CROP);
            onChange(DEFAULT_PROFESSIONAL_PHOTO_CROP);
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Centralizar
        </button>
      </div>
    </div>
  );
}
