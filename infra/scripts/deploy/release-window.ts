// Ventanas de publicación en producción (numeral 10.6, B44): de martes a jueves antes de las
// 4:00 p. m. (hora de Colombia); nunca viernes, fin de semana, festivo ni víspera de festivo,
// salvo una corrección urgente de seguridad, que se declara al lanzar el despliegue.

/** Colombia no cambia de hora: siempre UTC−5. */
const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LAST_HOUR = 16;
/** Martes (2), miércoles (3) y jueves (4). */
const ALLOWED_WEEKDAYS = new Set([2, 3, 4]);
const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function bogota(now: Date): Date {
  return new Date(now.getTime() + BOGOTA_OFFSET_MS);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Devuelve por qué no se puede publicar ahora, o undefined si está dentro de la ventana.
 * `holidays` son las fechas de los festivos (aaaa-mm-dd) del año actual y del siguiente.
 */
export function releaseWindowProblem(now: Date, holidays: ReadonlySet<string>): string | undefined {
  const local = bogota(now);
  const weekday = local.getUTCDay();
  const today = isoDate(local);
  const tomorrow = isoDate(new Date(local.getTime() + DAY_MS));
  if (!ALLOWED_WEEKDAYS.has(weekday)) {
    return `hoy es ${WEEKDAY_NAMES[weekday] ?? '?'}: solo se publica de martes a jueves`;
  }
  if (holidays.has(today)) return `hoy (${today}) es festivo`;
  if (holidays.has(tomorrow)) return `hoy es víspera de festivo (${tomorrow})`;
  if (local.getUTCHours() >= LAST_HOUR) {
    return 'ya pasaron las 4:00 p. m. (hora de Colombia)';
  }
  return undefined;
}
