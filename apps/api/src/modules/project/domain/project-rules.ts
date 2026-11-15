import { Decimal } from 'decimal.js';
import {
  parentAllowedTypes,
  type ItemType,
  type ProjectProgress,
  type ProjectStatus,
} from '@arza/contracts';

// Reglas de Proyectos (B26, ficha 17.8) que no dependen de la base de datos: estados del proyecto,
// fechas, porcentaje de facturación de los hitos, jerarquía de los ítems y avance.

/** Pasos del estado del proyecto y desde dónde se pueden dar. */
export const PROJECT_STEPS = {
  start: { from: ['planning'], to: 'in_progress' },
  risk: { from: ['in_progress'], to: 'at_risk' },
  pause: { from: ['in_progress', 'at_risk'], to: 'paused' },
  resume: { from: ['at_risk', 'paused', 'closing'], to: 'in_progress' },
  // B27: el cierre. Se entra desde ejecución o riesgo; se cierra desde «en cierre».
  closing: { from: ['in_progress', 'at_risk'], to: 'closing' },
  close: { from: ['closing'], to: 'closed' },
} as const satisfies Record<
  string,
  { readonly from: readonly ProjectStatus[]; readonly to: ProjectStatus }
>;

export type ProjectStep = keyof typeof PROJECT_STEPS;

export function canTakeStep(step: ProjectStep, status: ProjectStatus): boolean {
  const from: readonly ProjectStatus[] = PROJECT_STEPS[step].from;
  return from.includes(status);
}

/** Un periodo con inicio y fin, en fechas AAAA-MM-DD (se comparan como texto). */
export interface Period {
  readonly startsOn: string;
  readonly endsOn: string;
}

export function periodProblem(period: Period, what: string): string | null {
  return period.endsOn < period.startsOn ? `${what} no puede terminar antes de empezar.` : null;
}

/** La iteración cabe dentro de las fechas del proyecto. */
export function sprintPeriodProblem(sprint: Period, project: Period): string | null {
  const own = periodProblem(sprint, 'La iteración');
  if (own !== null) return own;
  if (sprint.startsOn < project.startsOn || sprint.endsOn > project.endsOn) {
    return `La iteración debe quedar entre el ${printed(project.startsOn)} y el ${printed(project.endsOn)}, las fechas del proyecto.`;
  }
  return null;
}

/** dd/mm/aaaa para los mensajes. */
function printed(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

/** Entre todos los hitos se factura como máximo el 100 % del valor. */
export function billingExceeds(others: readonly Decimal.Value[], next: Decimal.Value): boolean {
  const total = others.reduce<Decimal>((sum, pct) => sum.plus(pct), new Decimal(next));
  return total.greaterThan(100);
}

/** El ítem puede colgar de otro de ese tipo (packages/contracts, parentAllowedTypes). */
export function parentAllowed(type: ItemType, parentType: ItemType): boolean {
  return parentAllowedTypes(type).includes(parentType);
}

/** Avance: los terminados sobre los planeados (ficha 17.8), sin contar las épicas. */
export function progressOf(planned: number, done: number): ProjectProgress {
  const percent = planned === 0 ? 0 : Math.floor((done * 100) / planned);
  return { planned, done, percent };
}
