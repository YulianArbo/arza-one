// Mensaje del día del acceso (B22A): uno fijo por día de la semana, en hora de Colombia.

const MESSAGES: Readonly<Record<string, string>> = {
  domingo: 'Descanse: el lunes seguimos construyendo juntos.',
  lunes: 'Una semana nueva para dejar todo documentado.',
  martes: 'Lo que se mide se mejora: revise sus indicadores.',
  miércoles: 'Mitad de semana: ¿quedó alguna aprobación pendiente?',
  jueves: 'Cada versión vigente es un acuerdo cumplido.',
  viernes: 'Cierre la semana con sus tareas al día.',
  sábado: 'Su trabajo diario, en un solo lugar.',
};

export const DEFAULT_MESSAGE = 'Su trabajo diario, en un solo lugar.';

const WEEKDAY = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'long' });

export interface DailyMessage {
  /** Día de la semana en Colombia, por ejemplo «sábado». */
  readonly day: string;
  readonly text: string;
}

/** Mensaje del día para una fecha, según el día de la semana en Colombia. */
export function dailyMessage(now: Date): DailyMessage {
  const day = WEEKDAY.format(now);
  return { day, text: MESSAGES[day] ?? DEFAULT_MESSAGE };
}
