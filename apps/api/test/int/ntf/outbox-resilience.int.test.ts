import { describe, expect, it } from 'vitest';

import type { DatabaseService } from '../../../src/platform/database/database.service.js';
import { apiDatabase } from '../support/integration-database.js';
import { NtfScenario } from './support/ntf-scenario.js';

// Criterio del bloque B16: ningún evento se pierde si el worker se reinicia. Se simula que el
// worker se detiene a mitad de una publicación: los avisos ya escritos se revierten con la
// transacción, el evento sigue pendiente y la siguiente pasada lo publica una sola vez.

const scenario = new NtfScenario('bandeja de salida');

/** Martes 13 de octubre de 2026, 9:30 a. m. en Bogotá: dentro de la jornada. */
const WORKDAY = new Date('2026-10-13T14:30:00Z');

/** Base de datos que «se apaga» justo antes de confirmar las primeras `crashes` publicaciones. */
function crashingDatabase(crashes: number): Pick<DatabaseService, 'withTenant' | 'withoutTenant'> {
  const real = apiDatabase();
  let left = crashes;
  return {
    withoutTenant: async (work) => real.withoutTenant(work),
    withTenant: async (context, work, unaudited) =>
      real.withTenant(
        context,
        async (tx) => {
          const result = await work(tx);
          if (unaudited === 'notification_delivery' && left > 0) {
            left -= 1;
            throw new Error('El worker se detuvo (simulado)');
          }
          return result;
        },
        unaudited,
      ),
  };
}

async function alertEvent(): Promise<string> {
  await scenario.people('admin-bandeja', ['ADMIN_PLATAFORMA']);
  return scenario.event('security.alert', { type: 'iam.account.locked' }, WORKDAY);
}

async function stateOf(eventId: string) {
  return scenario.inTenant(async (tx) => ({
    event: await tx.outboxEvent.findUniqueOrThrow({ where: { id: eventId } }),
    notices: await tx.notification.count({ where: { eventId } }),
  }));
}

describe('ningún evento se pierde si el worker se reinicia (criterio del bloque)', () => {
  it('un corte a mitad de camino no deja avisos y el evento sigue pendiente', async () => {
    const eventId = await alertEvent();
    const crashed = await scenario.publishOutbox(scenario.tenant.id, crashingDatabase(1));
    expect(crashed.failed).toBeGreaterThanOrEqual(1);
    const after = await stateOf(eventId);
    expect(after.event.publishedAt).toBeNull();
    expect(after.notices).toBe(0);
  });

  it('la siguiente pasada lo publica una sola vez, aunque se repita', async () => {
    const eventId = await alertEvent();
    await scenario.publishOutbox(scenario.tenant.id, crashingDatabase(1));
    await scenario.publishOutbox();
    const first = await stateOf(eventId);
    expect(first.event.publishedAt).not.toBeNull();
    expect(first.notices).toBeGreaterThan(0);
    await scenario.publishOutbox();
    expect((await stateOf(eventId)).notices).toBe(first.notices);
  });

  it('dos pasadas a la vez no duplican los avisos', async () => {
    const eventId = await alertEvent();
    await Promise.all([scenario.publishOutbox(), scenario.publishOutbox()]);
    const { event, notices } = await stateOf(eventId);
    expect(event.publishedAt).not.toBeNull();
    const admins = await scenario.inTenant((tx) =>
      tx.notification.groupBy({ by: ['userId'], where: { eventId }, _count: true }),
    );
    expect(admins.every((row) => row._count === 1)).toBe(true);
    expect(notices).toBe(admins.length);
  });
});

describe('eventos que fallan', () => {
  it('un evento dañado se reintenta sin detener a los demás y al quinto intento se deja', async () => {
    const broken = await scenario.event('wf.task.assigned', { task_id: 'no' }, WORKDAY);
    const good = await alertEvent();
    const result = await scenario.publishOutbox();
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect((await stateOf(good)).event.publishedAt).not.toBeNull();
    for (let pass = 0; pass < 6; pass += 1) await scenario.publishOutbox();
    const { event } = await stateOf(broken);
    expect(event.publishedAt).toBeNull();
    expect(event.attempts).toBe(5);
  });

  it('un evento que nadie consume se publica sin avisos', async () => {
    const eventId = await scenario.event('party.merged', { survivor_id: 'x' }, WORKDAY);
    await scenario.publishOutbox();
    const { event, notices } = await stateOf(eventId);
    expect(event.publishedAt).not.toBeNull();
    expect(notices).toBe(0);
  });
});
