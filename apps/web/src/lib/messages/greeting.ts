import { PLATFORM_DEFAULTS } from '@arza/contracts';

// Saludo del Inicio según la hora de Colombia (B22B).

const HOUR = new Intl.DateTimeFormat('en-US', {
  timeZone: PLATFORM_DEFAULTS.timezone,
  hour: 'numeric',
  hourCycle: 'h23',
});

const WEEKDAY = new Intl.DateTimeFormat(PLATFORM_DEFAULTS.locale, {
  timeZone: PLATFORM_DEFAULTS.timezone,
  weekday: 'long',
});

const DATE = new Intl.DateTimeFormat(PLATFORM_DEFAULTS.locale, {
  timeZone: PLATFORM_DEFAULTS.timezone,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function hourInBogota(now: Date): number {
  return Number(HOUR.format(now));
}

/** «Buenos días» de 5 a. m. a 11:59 a. m., «Buenas tardes» hasta las 6:59 p. m., luego «noches». */
export function greetingFor(now: Date): string {
  const hour = hourInBogota(now);
  if (hour >= 5 && hour < 12) return 'Buenos días';
  if (hour >= 12 && hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** El primer nombre de la persona, si lo tiene registrado. */
export function firstName(displayName: string | null | undefined): string | null {
  const name = displayName?.trim().split(/\s+/u)[0];
  return name === undefined || name === '' ? null : name;
}

/** «Buenos días, Andrea · miércoles 19/11/2026». */
export function greetingLine(now: Date, displayName: string | null | undefined): string {
  const name = firstName(displayName);
  const salute = name ? `${greetingFor(now)}, ${name}` : greetingFor(now);
  return `${salute} · ${WEEKDAY.format(now)} ${DATE.format(now)}`;
}
