import { quoteListResponseSchema, quoteOptionsSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { auditActions, errorCode, tenantScope } from '../iam/support/iam-fixtures.js';
import { APP_URL, QuoteScenario, item } from './support/quote-scenario.js';

// Cotizaciones (B23, ficha 17.6): borrador con totales calculados con la tarifa vigente,
// aprobación de la Dirección cuando un descuento pasa el tope, PDF, envío y versiones. Una
// cotización enviada no se edita.

const scenario = new QuoteScenario('crm cotizaciones');

describe('borrador', () => {
  it('nace con su código, la versión 1 y los totales calculados por la API', async () => {
    const sales = await scenario.sales();
    const id = await scenario.quote(sales, {
      items: [item({ quantity: '1.5', unit_price: '120000.50', discount_percent: '7.5' })],
    });
    const quote = await scenario.quoteDetail(sales, id);
    expect(quote.code).toMatch(/^COT-\d{4}-\d{4}$/u);
    expect(quote).toMatchObject({
      version_number: 1,
      status: 'draft',
      subtotal: '180000.75',
      discount_total: '13500.06',
      tax_total: '31635.13',
      total: '198135.82',
      taxes: [{ tax_rate: '19.00', base: '166500.69', tax: '31635.13' }],
      pdf: { status: 'none' },
    });
    expect(quote.items[0]).toMatchObject({ tax_rate: '19.00', line_total: '198135.82' });
    expect(quote.author?.id).toBe(sales.id);
  });
});

describe('borrador', () => {
  it('se guarda completo y recalcula; no acepta impuestos sin tarifa ni vigencias pasadas', async () => {
    const sales = await scenario.sales();
    const id = await scenario.quote(sales);
    const draft = scenario.draft({
      items: [
        item(),
        item({
          description: 'Licencia anual',
          unit: 'license',
          tax_key: 'IVA_EXENTO',
          unit_price: '3000000',
          quantity: '1',
        }),
      ],
    });
    expect((await scenario.saveDraft(sales, id, draft)).status).toBe(204);
    const saved = await scenario.quoteDetail(sales, id);
    expect(saved.items).toHaveLength(2);
    expect(saved).toMatchObject({
      subtotal: '3850000.00',
      tax_total: '161500.00',
      total: '4011500.00',
    });
    const badTax = { ...draft, items: [item({ tax_key: 'NO_EXISTE' })] };
    expect(errorCode(await scenario.saveDraft(sales, id, badTax))).toBe('CRM_TAX_INVALID');
    const past = { ...draft, valid_until: scenario.day(-1) };
    expect(errorCode(await scenario.saveDraft(sales, id, past))).toBe('CRM_VALID_UNTIL_INVALID');
    const empty = { ...draft, items: [] };
    expect((await scenario.saveDraft(sales, id, empty)).status).toBe(422);
  });
});

describe('borrador', () => {
  it('solo para una oportunidad abierta', async () => {
    const sales = await scenario.sales();
    const opportunityId = await scenario.opportunity(sales);
    const opportunity = await scenario.opportunityDetail(sales, opportunityId);
    const lose = `/v1/crm/opportunities/${opportunityId}/actions/lose`;
    await scenario.action(lose, sales, opportunity.version, { reason: 'PRICE' });
    const response = await scenario.post(
      '/v1/crm/quotes',
      sales.session,
      scenario.quoteBody(opportunityId),
    );
    expect(errorCode(response)).toBe('CRM_STATUS_INVALID');
  });
});

describe('opciones del asistente', () => {
  it('trae los servicios activos, los impuestos vigentes y el tope de descuento', async () => {
    const sales = await scenario.sales();
    const name = `Soporte mensual ${String(Date.now())}`;
    const serviceBody = { name, unit: 'month', base_price: '2500000', tax_key: 'IVA_GENERAL' };
    await scenario.create('/v1/crm/services', sales, serviceBody);
    const options = quoteOptionsSchema.parse(
      (await scenario.get('/v1/crm/quotes/options', sales.session)).body,
    );
    expect(options.discount_cap).toBe('10.00');
    expect(options.taxes.map((tax) => [tax.key, tax.rate]).sort()).toEqual([
      ['IVA_EXENTO', '0.00'],
      ['IVA_GENERAL', '19.00'],
    ]);
    expect(options.services.find((service) => service.name === name)).toMatchObject({
      code: expect.stringMatching(/^SRV-\d{4}$/u) as string,
      tax_label: 'IVA general',
    });
  });
});

describe('pedir el envío', () => {
  it('sin descuento sobre el tope queda aprobada y el worker prepara el PDF', async () => {
    const sales = await scenario.sales();
    const id = await scenario.quote(sales, { items: [item({ discount_percent: '10' })] });
    expect((await scenario.step(sales, id, 'submit')).status).toBe(204);
    expect(await scenario.quoteDetail(sales, id)).toMatchObject({
      status: 'approved',
      approval: { required: false, discount_cap: '10.00', largest_discount: '10.00' },
      pdf: { status: 'pending' },
    });
    expect((await scenario.work()).pdfs).toBeGreaterThanOrEqual(1);
    const ready = await scenario.quoteDetail(sales, id);
    expect(ready.pdf).toEqual({ status: 'ready', file_name: `${ready.code}-v1.pdf` });
    const link = await scenario.post(`/v1/crm/quotes/${id}/pdf`, sales.session);
    expect(link.status, link.text).toBe(201);
  });
});

describe('aprobación de la Dirección', () => {
  it('un descuento sobre el tope va a Mis tareas de la Dirección, que la aprueba', async () => {
    const sales = await scenario.sales();
    const id = await scenario.quote(sales, { items: [item({ discount_percent: '15' })] });
    expect((await scenario.step(sales, id, 'submit')).status).toBe(204);
    const pending = await scenario.quoteDetail(sales, id);
    expect(pending).toMatchObject({ status: 'in_approval', approval: { required: true } });
    const tasks = await tenantScope(
      scenario.db,
      scenario.tenant.id,
    )((tx) => tx.workflowTask.findMany({ where: { instance: { entityId: id } } }));
    expect(tasks).toHaveLength(1);
    expect(
      errorCode(
        await scenario.step(sales, id, 'send', {
          recipient_name: 'Ana',
          recipient_email: 'a@example.com',
        }),
      ),
    ).toBe('CRM_STATUS_INVALID');
    const director = await scenario.director();
    const approved = await scenario.step(director, id, 'approve', {
      comment: 'Cliente estratégico.',
    });
    expect(approved.status, approved.text).toBe(204);
    expect(await scenario.quoteDetail(sales, id)).toMatchObject({
      status: 'approved',
      approval: { decided_by: { id: director.id }, note: 'Cliente estratégico.' },
      pdf: { status: 'pending' },
    });
    const closed = await tenantScope(
      scenario.db,
      scenario.tenant.id,
    )((tx) => tx.workflowTask.findFirstOrThrow({ where: { instance: { entityId: id } } }));
    expect(closed.completedAt).not.toBeNull();
  });
});

describe('aprobación de la Dirección', () => {
  it('la devuelve con un comentario y vuelve a borrador; Comercial no puede aprobar', async () => {
    const sales = await scenario.sales();
    const id = await scenario.quote(sales, { items: [item({ discount_percent: '30' })] });
    await scenario.step(sales, id, 'submit');
    expect(errorCode(await scenario.step(sales, id, 'approve'))).toBe('PERMISSION_DENIED');
    const director = await scenario.director();
    expect((await scenario.step(director, id, 'return', {})).status).toBe(422);
    const back = await scenario.step(director, id, 'return', {
      comment: 'Baje el descuento al 10 %.',
    });
    expect(back.status, back.text).toBe(204);
    expect(await scenario.quoteDetail(sales, id)).toMatchObject({
      status: 'draft',
      approval: { note: 'Baje el descuento al 10 %.' },
    });
  });
});

describe('aprobación de la Dirección', () => {
  it('quien elaboró la cotización no la aprueba, aunque tenga el rol de Dirección', async () => {
    const both = await scenario.person('comercial-y-direccion', ['COMERCIAL', 'DIRECCION']);
    const id = await scenario.quote(both, { items: [item({ discount_percent: '20' })] });
    await scenario.step(both, id, 'submit');
    expect(errorCode(await scenario.step(both, id, 'approve'))).toBe('CRM_SELF_APPROVAL');
  });
});

describe('enviar', () => {
  it('envía la aprobada: el cliente recibe el enlace y queda «enviada» con su auditoría', async () => {
    const sales = await scenario.sales();
    const { id, mail } = await scenario.sent(sales);
    const quote = await scenario.quoteDetail(sales, id);
    expect(quote).toMatchObject({
      status: 'sent',
      recipient: { name: 'Clara Cliente', email: 'clara@example.com' },
    });
    expect(quote.email_sent_at).not.toBeNull();
    expect(mail.to).toBe('clara@example.com');
    expect(mail.subject).toContain(quote.code);
    expect(mail.text).toContain(`${APP_URL}/cotizacion#token=`);
    const actions = await auditActions(scenario.db, scenario.tenant.id, id);
    expect(actions).toEqual(
      expect.arrayContaining([
        'crm.quote.create:success',
        'crm.quote.submit:success',
        'crm.quote.render:success',
        'crm.quote.send:success',
        'crm.quote.email:success',
      ]),
    );
    const sendEvent = await tenantScope(
      scenario.db,
      scenario.tenant.id,
    )((tx) =>
      tx.auditEvent.findFirstOrThrow({ where: { entityId: id, action: 'crm.quote.send' } }),
    );
    expect(sendEvent.changes).toMatchObject({
      recipient_email: 'clara@example.com',
      version_number: 1,
    });
  });
});

describe('una cotización enviada no se edita', () => {
  it('ni por la API ni directo en la base de datos', async () => {
    const sales = await scenario.sales();
    const { id } = await scenario.sent(sales);
    const quote = await scenario.quoteDetail(sales, id);
    const draft = scenario.draft();
    expect(errorCode(await scenario.saveDraft(sales, id, draft))).toBe('CRM_STATUS_INVALID');
    const inTenant = tenantScope(scenario.db, scenario.tenant.id);
    await expect(
      inTenant((tx) =>
        tx.crmQuote.update({
          where: { id },
          data: { total: '1.00', subtotal: '1.00', taxTotal: '0', discountTotal: '0' },
        }),
      ),
    ).rejects.toThrow(/crm_quotes_content_keep|fuera de borrador/u);
    const [first] = quote.items;
    await expect(
      inTenant((tx) =>
        tx.crmQuoteItem.update({
          where: { id: first?.id ?? '' },
          data: { description: 'Cambiada' },
        }),
      ),
    ).rejects.toThrow(/crm_quote_items_keep|fuera de borrador/u);
  });
});

/** Enviada y luego su versión 2: lo que necesitan las pruebas de versiones. */
async function secondVersion() {
  const sales = await scenario.sales();
  const first = await scenario.sent(sales);
  const original = await scenario.quoteDetail(sales, first.id);
  const response = await scenario.step(sales, first.id, 'new-version');
  expect(response.status, response.text).toBe(201);
  const second = await scenario.quoteDetail(sales, (response.body as { id: string }).id);
  return { sales, first, original, second };
}

describe('versiones', () => {
  it('la versión 2 copia la enviada como borrador y la deja reemplazada', async () => {
    const { sales, original, second } = await secondVersion();
    expect(second).toMatchObject({
      code: original.code,
      version_number: 2,
      status: 'draft',
      total: original.total,
    });
    expect(second.versions.map((version) => [version.version_number, version.status])).toEqual([
      [2, 'draft'],
      [1, 'superseded'],
    ]);
    const path = `/v1/crm/quotes?opportunity_id=${original.opportunity.id}`;
    const latest = quoteListResponseSchema.parse((await scenario.get(path, sales.session)).body);
    expect(latest.data.map((row) => row.version_number)).toEqual([2]);
  });
});

describe('versiones', () => {
  it('el enlace de la versión 1 ya no sirve para aceptar ni sale otra versión de ella', async () => {
    const { sales, first } = await secondVersion();
    const view = await scenario.public('view', { token: first.token });
    expect((view.body as { state: string }).state).toBe('replaced');
    const accept = await scenario.public('accept', {
      token: first.token,
      accepted_by_name: 'Clara Cliente',
      accept: true,
    });
    expect(errorCode(accept)).toBe('CRM_STATUS_INVALID');
    expect(errorCode(await scenario.step(sales, first.id, 'new-version'))).toBe(
      'CRM_STATUS_INVALID',
    );
  });
});
