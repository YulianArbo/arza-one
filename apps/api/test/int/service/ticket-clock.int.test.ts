import { describe, expect, it } from 'vitest';

import { MINUTE, ServiceScenario } from './support/service-scenario.js';

// Criterios del B28: «El reloj se pausa en espera del cliente» y «Un tiquete al 80 % del plazo
// genera alerta» (ficha 17.9). Con prioridad crítica el acuerdo de fábrica es de 1 hora para la
// primera respuesta y 4 horas corridas para la solución: la alerta llega a los 192 minutos. Datos
// ficticios.

const scenario = new ServiceScenario('mesa de ayuda: reloj');

/** Lo que el reloj del worker dejó en la auditoría del tiquete: alerta y vencimiento. */
async function clockMarks(id: string): Promise<string[]> {
  const actions = await scenario.auditActions(id);
  return actions.filter(
    (action) => action === 'service.ticket.warn' || action === 'service.ticket.breach',
  );
}

function minutesUntil(iso: string | null): number {
  return Math.round((Date.parse(iso ?? '') - scenario.clock.now().getTime()) / MINUTE);
}

describe('el reloj se pausa en espera del cliente', () => {
  it('lo que pasa en espera no cuenta y al reanudar sigue con lo que quedaba', async () => {
    let agent = await scenario.agent();
    const id = await scenario.working(agent);
    expect(minutesUntil((await scenario.ticketOf(agent, id)).resolution_due_at)).toBe(240);

    scenario.advance(60);
    await scenario.stepOk(agent, id, 'wait', { note: 'Envíenos una captura de pantalla.' });
    const paused = await scenario.ticketOf(agent, id);
    expect(paused).toMatchObject({ status: 'waiting_customer', clock: 'paused' });
    expect(paused.resolution_due_at).toBeNull();
    expect(paused.first_response_at).not.toBeNull();

    scenario.advance(10 * 60);
    agent = await scenario.refresh(agent);
    await scenario.clockWork();
    expect(await clockMarks(id)).toEqual([]);
    await scenario.stepOk(agent, id, 'resume');
    const resumed = await scenario.ticketOf(agent, id);
    expect(resumed).toMatchObject({ status: 'in_progress', clock: 'on_time' });
    expect(minutesUntil(resumed.resolution_due_at)).toBe(180);
    expect(await scenario.auditActions(id)).toEqual([
      'service.ticket.create',
      'service.ticket.assign',
      'service.ticket.start',
      'service.ticket.wait',
      'service.ticket.resume',
    ]);
  });

  it('la respuesta del cliente reanuda el reloj', async () => {
    const agent = await scenario.agent();
    const id = await scenario.working(agent);
    await scenario.stepOk(agent, id, 'wait', { note: null });
    const reply = await scenario.write(agent, id, {
      body: 'El cliente respondió por teléfono que ya envió la captura.',
      from_client: true,
    });
    expect(reply.status, reply.text).toBe(201);
    expect((await scenario.ticketOf(agent, id)).status).toBe('in_progress');
  });
});

describe('alerta al 80 % del plazo', () => {
  it('avisa al responsable y al líder, y luego el vencido', async () => {
    let agent = await scenario.agent();
    const leader = await scenario.agent();
    const id = await scenario.working(agent);

    scenario.advance(191);
    await scenario.clockWork();
    expect(await clockMarks(id)).toEqual([]);
    scenario.advance(2);
    await scenario.clockWork();
    await scenario.clockWork();
    expect(await clockMarks(id)).toEqual(['service.ticket.warn']);
    agent = await scenario.refresh(agent);
    expect((await scenario.ticketOf(agent, id)).clock).toBe('at_risk');
    expect((await scenario.inbox(agent, '?view=at_risk')).map((row) => row.id)).toContain(id);

    await scenario.dispatchNotices();
    const alerts = await scenario.noticesFor(leader.id, 'svc_ticket_alert');
    expect(alerts.join(' ')).toContain('80 %');
    expect((await scenario.noticesFor(agent.id, 'svc_ticket_alert')).join(' ')).toContain('80 %');

    scenario.advance(60);
    await scenario.clockWork();
    expect(await clockMarks(id)).toEqual(['service.ticket.warn', 'service.ticket.breach']);
    agent = await scenario.refresh(agent);
    expect((await scenario.ticketOf(agent, id)).clock).toBe('overdue');
    expect((await scenario.inbox(agent, '?view=overdue')).map((row) => row.id)).toContain(id);
    expect(await scenario.auditActions(id)).toContain('service.ticket.breach');
  });

  it('un tiquete en espera del cliente no alerta', async () => {
    const agent = await scenario.agent();
    const id = await scenario.working(agent);
    await scenario.stepOk(agent, id, 'wait', { note: null });
    scenario.advance(24 * 60);
    await scenario.clockWork();
    expect(await clockMarks(id)).toEqual([]);
  });
});

describe('resolver, reabrir y cerrar', () => {
  it('el resuelto se cierra solo pasados cinco días hábiles; reabierto vuelve a contar', async () => {
    let agent = await scenario.agent();
    const id = await scenario.working(agent);
    await scenario.stepOk(agent, id, 'resolve', { resolution: 'Se reconstruyó el índice.' });
    const resolved = await scenario.ticketOf(agent, id);
    expect(resolved).toMatchObject({ status: 'resolved', clock: 'stopped' });
    expect(resolved.auto_close_at).not.toBeNull();

    await scenario.stepOk(agent, id, 'reopen', { reason: 'El reporte volvió a fallar.' });
    expect((await scenario.ticketOf(agent, id)).status).toBe('in_progress');
    await scenario.stepOk(agent, id, 'resolve', { resolution: 'Se corrigió la consulta.' });

    scenario.advance(10 * 24 * 60);
    expect((await scenario.clockWork()).closed).toBeGreaterThanOrEqual(1);
    agent = await scenario.refresh(agent);
    const closed = await scenario.ticketOf(agent, id);
    expect(closed.status).toBe('closed');
    expect((await scenario.step(agent, id, 'reopen', { reason: 'Otra vez.' })).status).toBe(409);
  });
});
