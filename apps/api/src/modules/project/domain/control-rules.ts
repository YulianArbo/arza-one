import { Decimal } from 'decimal.js';
import { TIME_RULES, type CheckAnswer, type ReviewResult } from '@arza/contracts';

// Reglas del control de proyectos (B27, ficha 17.8) que no dependen de la base de datos: el plazo
// para registrar horas, el tope diario, el resultado de una revisión de código, el valor que se
// factura de un hito y los indicadores de avance, desviación y rentabilidad.

const DAY_MS = 86_400_000;

/** AAAA-MM-DD menos tantos días. */
export function daysBefore(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);
}

/** El día más antiguo que todavía se puede registrar: siete días atrás. */
export function earliestWorkDate(today: string): string {
  return daysBefore(today, TIME_RULES.maxLateDays);
}

/** El día trabajado no es futuro ni tiene más de siete días de atraso. */
export function workDateProblem(workDate: string, today: string): string | null {
  if (workDate > today) return 'No se registran horas de días que aún no llegan.';
  if (workDate < earliestWorkDate(today)) {
    return 'Las horas se registran máximo con siete días de atraso. Pida al líder del proyecto que deje la novedad en la auditoría con una nota.';
  }
  return null;
}

/** Entre todos sus registros, una persona no pasa de 24 horas en un día. */
export function dayTotalExceeds(others: readonly Decimal.Value[], next: Decimal.Value): boolean {
  const total = others.reduce<Decimal>((sum, hours) => sum.plus(hours), new Decimal(next));
  return total.greaterThan(TIME_RULES.maxPerDay);
}

/** Una revisión con algún punto que no cumple no puede quedar aprobada. */
export function reviewProblem(
  answers: readonly CheckAnswer[],
  result: ReviewResult,
): string | null {
  if (result === 'approved' && answers.includes('no')) {
    return 'Una revisión con puntos que no cumplen no se aprueba: marque «Requiere cambios».';
  }
  return null;
}

/** Lo que se factura del hito: su porcentaje sobre el valor del contrato o el presupuesto. */
export function billableAmount(base: Decimal.Value, pct: Decimal.Value): Decimal {
  return new Decimal(base).times(pct).dividedBy(100).toDecimalPlaces(2);
}

/** Porcentaje entero de una parte sobre un total; 0 si el total es cero. */
export function percentOf(part: Decimal.Value, total: Decimal.Value): number {
  const whole = new Decimal(total);
  if (whole.isZero()) return 0;
  return new Decimal(part).times(100).dividedBy(whole).floor().toNumber();
}

/** Tiempo transcurrido del proyecto, de 0 % a 100 %. */
export function elapsedPct(startsOn: string, endsOn: string, today: string): number {
  if (today <= startsOn) return 0;
  if (today >= endsOn) return 100;
  const span = Date.parse(endsOn) - Date.parse(startsOn);
  return Math.floor(((Date.parse(today) - Date.parse(startsOn)) * 100) / span);
}

export interface Profitability {
  readonly cost: Decimal;
  readonly margin: Decimal;
  readonly marginPct: number | null;
}

/** Costo de las horas aprobadas, margen en pesos y en porcentaje del ingreso. */
export function profitabilityOf(
  income: Decimal.Value,
  approvedHours: Decimal.Value,
  hourCost: Decimal.Value,
): Profitability {
  const cost = new Decimal(approvedHours).times(hourCost).toDecimalPlaces(2);
  const margin = new Decimal(income).minus(cost);
  const marginPct = new Decimal(income).isZero()
    ? null
    : margin.times(100).dividedBy(income).truncated().toNumber();
  return { cost, margin, marginPct };
}

/** Lo que impide cerrar el proyecto, en palabras para la persona; vacío si se puede cerrar. */
export interface ClosingCounts {
  readonly deliverablesOpen: number;
  readonly incidentsOpen: number;
  readonly hoursPending: number;
}

export function closingProblems(counts: ClosingCounts): string[] {
  const problems: string[] = [];
  if (counts.deliverablesOpen > 0) {
    problems.push(`${String(counts.deliverablesOpen)} entregable(s) sin aceptar por el cliente`);
  }
  if (counts.incidentsOpen > 0) {
    problems.push(`${String(counts.incidentsOpen)} incidente(s) sin resolver`);
  }
  if (counts.hoursPending > 0) {
    problems.push(`${String(counts.hoursPending)} registro(s) de horas sin aprobar`);
  }
  return problems;
}
