'use client';

import type { PartyDetail } from '@arza/contracts';
import type { JSX } from 'react';

import { ImageField } from '../media/image-field';
import { partyLogoPath } from '../media/media-queries';
import { usePermissions } from '../session/permissions';
import { PARTY_KEYS } from './queries';

/**
 * Logo de una empresa (B22A): lo ven quienes ven el tercero y, en el portal, las personas de esa
 * empresa; lo cambia quien edita terceros. Las personas no llevan logo.
 */
export function PartyLogo({ party }: { readonly party: PartyDetail }): JSX.Element | null {
  const editable = usePermissions().can('party.update');
  if (party.kind !== 'organization') return null;
  const target = {
    uploads: `${partyLogoPath(party.id)}/uploads`,
    image: partyLogoPath(party.id),
    refresh: [PARTY_KEYS.detail(party.id)],
  };
  return (
    <section
      aria-labelledby="logo-titulo"
      className="flex flex-col gap-2 rounded-xl border bg-card p-4"
    >
      <h2 id="logo-titulo" className="text-sm font-medium">
        Logo
      </h2>
      <ImageField
        target={target}
        name={party.name}
        hasImage={party.has_logo}
        noun="logo"
        editable={editable}
      />
    </section>
  );
}
