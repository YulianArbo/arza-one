import type { SvcTicket } from '../../../generated/prisma/client.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { recordServiceChange, type ServiceActor } from './service-support.js';
import { applyStep, closeStep } from './ticket-flow.js';
import { ticketAudit, ticketPayload } from './tickets.js';

// El reloj de los tiquetes en el worker (B28, ficha 17.9). Cada cinco minutos, en cada empresa con
// trabajo: el tiquete que consumió el 80 % de su plazo de solución alerta al responsable y al líder;
// el que lo superó queda vencido y vuelve a alertar; el resuelto que nadie reabrió en cinco días
// hábiles se cierra. Un tiquete en espera del cliente no alerta: su reloj está pausado. Repetirlo
// no cambia nada.

export interface SlaWorkDependencies {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
}

export interface SlaWorkResult {
  readonly warned: number;
  readonly breached: number;
  readonly closed: number;
}

/** Cuántos tiquetes revisa por empresa y por clase en cada pasada. */
const BATCH = 200;
const RUNNING = { in: ['new', 'assigned', 'in_progress'] };

type Mark = 'warned' | 'breached';

async function markTicket(
  tx: TenantTransaction,
  actor: ServiceActor,
  id: string,
  mark: Mark,
): Promise<boolean> {
  const due =
    mark === 'warned'
      ? { warnedAt: null, warnAt: { lte: actor.at } }
      : { breachedAt: null, resolutionDueAt: { lte: actor.at } };
  const { count } = await tx.svcTicket.updateMany({
    where: { id, status: RUNNING, deletedAt: null, ...due },
    data: mark === 'warned' ? { warnedAt: actor.at } : { breachedAt: actor.at, warnedAt: actor.at },
  });
  if (count === 0) return false;
  const ticket = await tx.svcTicket.findUniqueOrThrow({ where: { id } });
  await recordServiceChange(tx, actor, {
    action: mark === 'warned' ? 'service.ticket.warn' : 'service.ticket.breach',
    event: `service.ticket.${mark}`,
    entityType: 'svc_ticket',
    entityId: id,
    changes: ticketAudit(ticket),
    payload: ticketPayload(ticket),
  });
  return true;
}

async function autoClose(tx: TenantTransaction, actor: ServiceActor, id: string): Promise<boolean> {
  const ticket: SvcTicket | null = await tx.svcTicket.findFirst({
    where: { id, status: 'resolved', autoCloseAt: { lte: actor.at }, deletedAt: null },
  });
  if (ticket === null) return false;
  await applyStep(tx, actor, ticket, ticket.version, closeStep(actor.at));
  return true;
}

async function idsOf(
  deps: SlaWorkDependencies,
  tenantId: string,
  now: Date,
): Promise<Record<'warn' | 'breach' | 'close', string[]>> {
  return deps.database.withTenant({ tenantId, userId: null }, async (tx) => {
    const pick = async (where: object) =>
      (
        await tx.svcTicket.findMany({
          where: { deletedAt: null, ...where },
          select: { id: true },
          take: BATCH,
        })
      ).map((row) => row.id);
    return {
      warn: await pick({ status: RUNNING, warnedAt: null, warnAt: { lte: now } }),
      breach: await pick({ status: RUNNING, breachedAt: null, resolutionDueAt: { lte: now } }),
      close: await pick({ status: 'resolved', autoCloseAt: { lte: now } }),
    };
  });
}

async function workTenant(
  deps: SlaWorkDependencies,
  tenantId: string,
  now: Date,
): Promise<SlaWorkResult> {
  const actor: ServiceActor = { tenantId, userId: null, meta: null, at: now };
  const system = { tenantId, userId: null };
  const ids = await idsOf(deps, tenantId, now);
  // Una transacción corta por tiquete: una falla no deshace las demás.
  const count = async (
    list: string[],
    work: (tx: TenantTransaction, id: string) => Promise<boolean>,
  ) => {
    let done = 0;
    for (const id of list)
      if (await deps.database.withTenant(system, (tx) => work(tx, id))) done += 1;
    return done;
  };
  // Primero el vencido: si ya pasó el plazo, alerta una vez como vencido, no dos.
  const breached = await count(ids.breach, (tx, id) => markTicket(tx, actor, id, 'breached'));
  const warned = await count(ids.warn, (tx, id) => markTicket(tx, actor, id, 'warned'));
  const closed = await count(ids.close, (tx, id) => autoClose(tx, actor, id));
  return { warned, breached, closed };
}

/** Revisa los tiquetes de las empresas dadas. */
export async function followTicketClocksIn(
  deps: SlaWorkDependencies,
  tenantIds: readonly string[],
): Promise<SlaWorkResult> {
  const now = deps.clock.now();
  const total = { warned: 0, breached: 0, closed: 0 };
  for (const id of tenantIds) {
    const result = await workTenant(deps, id, now);
    total.warned += result.warned;
    total.breached += result.breached;
    total.closed += result.closed;
  }
  return total;
}

/** Revisa los tiquetes de todas las empresas con trabajo. */
export async function followTicketClocks(deps: SlaWorkDependencies): Promise<SlaWorkResult> {
  const now = deps.clock.now();
  const tenants = await deps.database.withoutTenant(
    (tx) => tx.$queryRaw<{ id: string }[]>`SELECT svc_tenants_with_sla_work(${now}) AS id`,
  );
  return followTicketClocksIn(
    deps,
    tenants.map((row) => row.id),
  );
}
