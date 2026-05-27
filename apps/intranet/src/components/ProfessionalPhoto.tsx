import React from 'react';
import type { IntranetProfessionalProfile } from '@consultare/core/intranet/catalog';

/* eslint-disable @next/next/no-img-element -- Fotos vêm do endpoint autenticado de profissionais da intranet. */

const DEFAULT_CROP = {
  zoom: 1,
  focusX: 50,
  focusY: 50,
} as const;

const buildProfessionalPhotoStyle = (
  crop: IntranetProfessionalProfile['photoCrop']
): React.CSSProperties => {
  const safe = crop || DEFAULT_CROP;
  return {
    objectFit: 'cover',
    objectPosition: `${safe.focusX}% ${safe.focusY}%`,
    transform: `scale(${safe.zoom})`,
    transformOrigin: 'center center',
  };
};

type Props = {
  professional: IntranetProfessionalProfile;
  className: string;
  imageClassName?: string;
  fallbackClassName?: string;
};

export function ProfessionalPhoto({
  professional,
  className,
  imageClassName = 'h-full w-full',
  fallbackClassName = 'flex h-full w-full items-center justify-center bg-blue-50 text-3xl font-semibold text-[#17407E]',
}: Props) {
  const initials = professional.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');

  return (
    <div className={className}>
      {professional.photoUrl ? (
        <img
          src={professional.photoUrl}
          alt=""
          className={imageClassName}
          style={buildProfessionalPhotoStyle(professional.photoCrop)}
        />
      ) : (
        <div className={fallbackClassName}>{initials}</div>
      )}
    </div>
  );
}
