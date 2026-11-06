import type { Prisma, SlaPolicy, SvcTicket } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { businessHoursDeadline, businessMinutesElapsed } from '../../core/index.js';
import { remainingMinutes, termsOf } from '../domain/ticket-clock.js';

// El reloj del tiquete con el calendario de su acuerdo (B28): horas hábiles de la empresa (horario
// laboral y festivos) o corridas. Pausar suma lo consumido; reanudar recalcula los vencimientos con
// lo que queda.

const MINUTE_MS = 60 * 1000;

async function addMinutes(
  tx: TenantTransaction,
  policy: SlaPolicy,
  from: Date,
  minutes: number,
): Promise<Date> {
  if (policy.calendar === 'continuous') return new Date(from.getTime() + minutes * MINUTE_MS);
  return businessHoursDeadline(tx, from, minutes / 60);
}

/** Minutos del acuerdo que corrieron entre dos instantes. */
export async function minutesRun(
  tx: TenantTransaction,
  policy: SlaPolicy,
  from: Date,
  to: Date,
): Promise<number> {
  if (to <= from) return 0;
  if (policy.calendar === 'continuous') {
    return Math.round((to.getTime() - from.getTime()) / MINUTE_MS);
  }
  return businessMinutesElapsed(tx, from, to);
}

export interface DueDates {
  readonly responseDueAt: Date | null;
  readonly resolutionDueAt: Date;
  readonly warnAt: Date;
}

type ClockTicket = Pick<SvcTicket, 'slaConsumedMinutes' | 'firstResponseAt' | 'responseDueAt'>;

/**
 * Vencimientos desde `from` con lo que queda del plazo. La primera respuesta ya dada conserva el
 * vencimiento que tenía.
 */
export async function dueDates(
  tx: TenantTransaction,
  policy: SlaPolicy,
  ticket: ClockTicket,
  from: Date,
): Promise<DueDates> {
  const terms = termsOf(policy.firstResponseHours.toNumber(), policy.resolutionHours.toNumber());
  const left = remainingMinutes(terms, ticket.slaConsumedMinutes);
  return {
    responseDueAt:
      ticket.firstResponseAt === null
        ? await addMinutes(tx, policy, from, left.response)
        : ticket.responseDueAt,
    resolutionDueAt: await addMinutes(tx, policy, from, left.resolution),
    warnAt: await addMinutes(tx, policy, from, left.warn),
  };
}

/** Un tiquete nuevo: el reloj arranca ahora, sin consumo. */
export async function freshClock(
  tx: TenantTransaction,
  policy: SlaPolicy,
  at: Date,
): Promise<DueDates & { readonly slaConsumedMinutes: number; readonly slaResumedAt: Date }> {
  const dues = await dueDates(
    tx,
    policy,
    { slaConsumedMinutes: 0, firstResponseAt: null, responseDueAt: null },
    at,
  );
  return { slaConsumedMinutes: 0, slaResumedAt: at, ...dues };
}

interface PausedClock {
  readonly slaConsumedMinutes: number;
  readonly slaResumedAt: null;
  readonly pausedAt: Date;
  readonly resolutionDueAt: null;
  readonly warnAt: null;
}

/** Pausa: suma lo que corrió desde que se reanudó y deja los vencimientos en suspenso. */
export async function pausedClock(
  tx: TenantTransaction,
  policy: SlaPolicy,
  ticket: SvcTicket,
  at: Date,
): Promise<PausedClock> {
  const since = ticket.slaResumedAt ?? at;
  const run = await minutesRun(tx, policy, since, at);
  return {
    slaConsumedMinutes: ticket.slaConsumedMinutes + run,
    slaResumedAt: null,
    pausedAt: at,
    resolutionDueAt: null,
    warnAt: null,
  };
}

/** Reanuda: los vencimientos se calculan desde ahora con lo que queda. */
export async function resumedClock(
  tx: TenantTransaction,
  policy: SlaPolicy,
  ticket: SvcTicket,
  at: Date,
): Promise<DueDates & { readonly slaResumedAt: Date; readonly pausedAt: null }> {
  return { slaResumedAt: at, pausedAt: null, ...(await dueDates(tx, policy, ticket, at)) };
}

/**
 * Cambió la prioridad: el plazo consumido se conserva y los vencimientos se recalculan con el nuevo
 * acuerdo. En pausa, solo cambia el acuerdo; los vencimientos llegan al reanudar.
 */
export async function reprioritizedClock(
  tx: TenantTransaction,
  previous: SlaPolicy,
  next: SlaPolicy,
  ticket: SvcTicket,
  at: Date,
): Promise<Prisma.SvcTicketUncheckedUpdateManyInput> {
  if (ticket.slaResumedAt === null) return { slaPolicyId: next.id };
  const consumed =
    ticket.slaConsumedMinutes + (await minutesRun(tx, previous, ticket.slaResumedAt, at));
  const moved = { ...ticket, slaConsumedMinutes: consumed };
  return {
    slaPolicyId: next.id,
    slaConsumedMinutes: consumed,
    slaResumedAt: at,
    warnedAt: null,
    breachedAt: null,
    ...(await dueDates(tx, next, moved, at)),
  };
}
