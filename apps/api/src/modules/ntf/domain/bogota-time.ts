const BOGOTA_DATE_TIME = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** «09/10/2026, 3:00 p. m.», en hora de Colombia, para el texto de los avisos. */
export function bogotaDateTime(moment: Date): string {
  return BOGOTA_DATE_TIME.format(moment);
}
