'use client';

import { Avatar } from '@arza/ui';
import type { JSX } from 'react';

import { useImageUrl } from '../media/media-queries';
import { BRANDING_LOGO_PATH } from './labels';
import { useBranding } from './queries';

/**
 * Marca de la empresa en la barra superior (B48, decisión 11): su logo, o sus iniciales, y su nombre.
 * El color principal va en una línea fina bajo el nombre; el texto conserva los colores del sistema
 * para no perder contraste en el tema oscuro.
 */
export function CompanyBrand(): JSX.Element | null {
  const brand = useBranding().data;
  const logo = useImageUrl(brand?.has_logo === true ? BRANDING_LOGO_PATH : null);
  if (brand === undefined) return null;
  return (
    <p
      className="flex max-w-56 items-center gap-2 rounded-full border bg-card py-1 pr-3 pl-1 text-sm"
      aria-label={`Empresa: ${brand.display_name}`}
    >
      <Avatar name={brand.display_name} src={logo} size="sm" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{brand.display_name}</span>
        {brand.primary_color === null ? null : (
          <span
            aria-hidden="true"
            data-testid="color-de-marca"
            className="h-0.5 w-full rounded-full"
            style={{ backgroundColor: brand.primary_color }}
          />
        )}
      </span>
    </p>
  );
}
