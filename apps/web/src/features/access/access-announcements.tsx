'use client';

import type { JSX } from 'react';

import { AnnouncementCarousel, type CarouselTone } from '../announcements/announcement-carousel';
import { useAudience } from './audience-context';

/** Comunicados de la pestaña elegida: «Ingreso plataforma» ve los del personal (B36A). */
export function AccessAnnouncements(props: {
  readonly tone: CarouselTone;
  readonly className?: string;
}): JSX.Element | null {
  const { audience } = useAudience();
  return (
    <AnnouncementCarousel
      tab={audience === 'clientes' ? 'clients' : 'staff'}
      tone={props.tone}
      {...(props.className === undefined ? {} : { className: props.className })}
    />
  );
}
