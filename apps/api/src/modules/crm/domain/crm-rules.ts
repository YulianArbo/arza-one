import {
  ACTIVITY_REMINDER_MINUTES,
  DEFAULT_PROBABILITY,
  type OpportunityStage,
} from '@arza/contracts';

// Reglas del CRM (B22) que no dependen de la base de datos.

/** La probabilidad pedida o, si no se pidió, la de la etapa. */
export function probabilityFor(stage: OpportunityStage, requested: number | null): number {
  return requested ?? DEFAULT_PROBABILITY[stage];
}

/** Hasta qué momento se avisan las actividades: las que empiezan en los próximos 30 minutos. */
export function reminderHorizon(now: Date): Date {
  return new Date(now.getTime() + ACTIVITY_REMINDER_MINUTES * 60_000);
}

/** Una actividad cuya hora ya pasó hace más de un día no se recuerda: ya no sirve el aviso. */
export function isStaleReminder(dueAt: Date, now: Date): boolean {
  return now.getTime() - dueAt.getTime() > 24 * 60 * 60_000;
}

/** Colombia está cinco horas detrás de UTC todo el año (sin horario de verano). */
const BOGOTA_OFFSET_MS = 5 * 60 * 60_000;

/** El primer instante de un día de Colombia, como lo guarda la base (UTC). */
export function bogotaDayStart(date: string): Date {
  return new Date(new Date(`${date}T00:00:00.000Z`).getTime() + BOGOTA_OFFSET_MS);
}
