import type { User } from '../../../generated/prisma/client.js';

// Formato común de los correos de la cuenta: saludo, firma y fechas en hora de Colombia.

export interface AccountEmail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

const BOGOTA_DATE_TIME = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

export const SIGNATURE =
  'ARZA ONE · ARZA TECH S.A.S.\nEste es un correo automático; no lo responda.';

export function greeting(user: User): string {
  return user.displayName === null ? 'Hola:' : `Hola, ${user.displayName}:`;
}

/** «09/10/2026, 3:00 p. m.», en hora de Colombia. */
export function bogotaDateTime(moment: Date): string {
  return BOGOTA_DATE_TIME.format(moment);
}
