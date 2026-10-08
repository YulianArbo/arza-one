import { PLATFORM_DEFAULTS } from '@arza/contracts';

// Fechas como se muestran a la persona (numeral 16.6 y ADR-020): dd/mm/aaaa, hora de 12 horas con
// a. m. y p. m., en la hora de Colombia, aunque la base de datos las guarde en UTC.

const DATE_TIME = new Intl.DateTimeFormat(PLATFORM_DEFAULTS.locale, {
  timeZone: PLATFORM_DEFAULTS.timezone,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** «09/10/2026, 3:15 p. m.»; un guion si no hay fecha. */
export function formatDateTime(iso: string | null): string {
  return iso === null ? '—' : DATE_TIME.format(new Date(iso));
}
