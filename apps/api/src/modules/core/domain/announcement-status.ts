import type { AnnouncementAudience, AnnouncementStatus } from '@arza/contracts';

// Vigencia de un comunicado (B36A), con las fechas de Colombia: del primer al último día, ambos
// incluidos, salvo que alguien lo termine antes.

export interface AnnouncementDates {
  readonly startsOn: string;
  readonly endsOn: string;
  readonly ended: boolean;
}

export function announcementStatus(dates: AnnouncementDates, today: string): AnnouncementStatus {
  if (dates.ended) return 'ended';
  if (today < dates.startsOn) return 'scheduled';
  return today > dates.endsOn ? 'expired' : 'active';
}

/** Los públicos que ve cada pestaña del acceso: los suyos y los de ambos. */
export function audiencesFor(tab: 'staff' | 'clients'): readonly AnnouncementAudience[] {
  return [tab, 'both'];
}
