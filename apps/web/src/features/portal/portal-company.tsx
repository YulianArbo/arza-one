'use client';

import { Avatar } from '@arza/ui';
import type { JSX } from 'react';

import { MY_COMPANY_LOGO_PATH, useImageUrl, useMyCompany } from '../media/media-queries';

/**
 * Empresa cliente de la persona (B22A, boceto final): su logo, o sus iniciales, y su nombre arriba
 * a la derecha del portal. Una cuenta sin empresa ligada no muestra nada.
 */
export function PortalCompany(): JSX.Element | null {
  const company = useMyCompany().data?.company ?? null;
  const logo = useImageUrl(company?.has_logo === true ? MY_COMPANY_LOGO_PATH : null);
  if (company === null) return null;
  return (
    <p className="flex max-w-56 items-center gap-2 rounded-full border bg-card py-1 pr-3 pl-1 text-sm">
      <Avatar name={company.name} src={logo} size="sm" />
      <span className="truncate font-medium">{company.name}</span>
    </p>
  );
}
