import { describe, expect, it } from 'vitest';

import { errorCode, tenantScope } from '../iam/support/iam-fixtures.js';
import { QuoteScenario } from './support/quote-scenario.js';

// No se acepta una cotización vencida (ficha 17.6, anexo D). El reloj de la prueba avanza dos días,
// así que este archivo va aparte para no mover el reloj de las demás pruebas.

const scenario = new QuoteScenario('crm cotizaciones vencidas');
const TWO_DAYS = 2 * 86_400_000;

describe('vencimiento', () => {
  it('pasado su último día no se acepta y el trabajo diario la vence y avisa', async () => {
    const sales = await scenario.sales();
    const { id, token } = await scenario.sent(sales, { valid_until: scenario.day(0) });
    expect(await scenario.expire()).toBe(0);
    scenario.clock.advance(TWO_DAYS);
    const view = await scenario.public('view', { token });
    expect((view.body as { state: string }).state).toBe('expired');
    const accept = await scenario.public('accept', {
      token,
      accepted_by_name: 'Clara Cliente',
      accept: true,
    });
    expect(errorCode(accept)).toBe('QUOTE_EXPIRED');
    expect((accept.body as { error: { message: string } }).error.message).toMatch(
      /^La cotización venció el \d{2}\/\d{2}\/\d{4} y no puede aceptarse\.$/u,
    );
    expect(await scenario.expire()).toBeGreaterThanOrEqual(1);
    const reader = await scenario.sales();
    expect((await scenario.quoteDetail(reader, id)).status).toBe('expired');
    const events = await tenantScope(
      scenario.db,
      scenario.tenant.id,
    )((tx) => tx.outboxEvent.findMany({ where: { eventType: 'crm.quote.expired' } }));
    expect(events.map((event) => (event.payload as { id: string }).id)).toContain(id);
  });
});

describe('vencimiento', () => {
  it('una aprobada cuya vigencia pasó no se envía: se crea una versión nueva', async () => {
    const sales = await scenario.sales();
    const id = await scenario.approved(sales, { valid_until: scenario.day(0) });
    scenario.clock.advance(TWO_DAYS);
    const writer = await scenario.sales();
    const send = await scenario.step(writer, id, 'send', {
      recipient_name: 'Clara Cliente',
      recipient_email: 'clara@example.com',
    });
    expect(errorCode(send)).toBe('QUOTE_EXPIRED');
    const next = await scenario.step(writer, id, 'new-version');
    expect(next.status, next.text).toBe(201);
    const second = await scenario.quoteDetail(writer, (next.body as { id: string }).id);
    expect(second.valid_until > scenario.day(0)).toBe(true);
  });
});
