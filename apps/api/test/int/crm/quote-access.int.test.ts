import {
  quoteListResponseSchema,
  serviceListResponseSchema,
  taxParameterListResponseSchema,
} from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { errorCode, tenantScope } from '../iam/support/iam-fixtures.js';
import { QuoteScenario, item } from './support/quote-scenario.js';

// Permiso denegado y aislamiento entre empresas del portafolio, las cotizaciones y los parámetros
// tributarios (B23, capítulo 21 y numeral 15.5).

const scenario = new QuoteScenario('crm cotizaciones acceso');

describe('permiso denegado', () => {
  it('el colaborador, el Contador y el portal no ven cotizaciones ni el portafolio', async () => {
    const people = [
      await scenario.person('colaborador', ['COLABORADOR']),
      await scenario.person('contador', ['CONTADOR']),
      await scenario.person('portal', ['CLIENTE_ADMIN'], { kind: 'portal' }),
    ];
    for (const person of people) {
      for (const path of ['/v1/crm/quotes', '/v1/crm/services']) {
        expect(errorCode(await scenario.get(path, person.session)), path).toBe('PERMISSION_DENIED');
      }
    }
  });
});

describe('permiso denegado', () => {
  it('Calidad lee pero no crea, envía ni administra el portafolio', async () => {
    const sales = await scenario.sales();
    const id = await scenario.approved(sales);
    const quality = await scenario.person('calidad', ['CALIDAD']);
    expect((await scenario.get('/v1/crm/quotes', quality.session)).status).toBe(200);
    const writes = [
      scenario.post('/v1/crm/quotes', quality.session, scenario.quoteBody(id)),
      scenario.action(`/v1/crm/quotes/${id}/actions/send`, quality, 1, {
        recipient_name: 'Clara',
        recipient_email: 'clara@example.com',
      }),
      scenario.post('/v1/crm/services', quality.session, {
        name: 'Servicio',
        unit: 'hour',
        base_price: '1',
        tax_key: 'IVA_GENERAL',
      }),
    ];
    for (const response of await Promise.all(writes)) {
      expect(errorCode(response)).toBe('PERMISSION_DENIED');
    }
  });
});

describe('permiso denegado', () => {
  it('sin crm.quote.send la API responde 403 y queda el evento de seguridad', async () => {
    const sales = await scenario.sales();
    const id = await scenario.approved(sales);
    const director = await scenario.director();
    const response = await scenario.step(director, id, 'send', {
      recipient_name: 'Clara',
      recipient_email: 'clara@example.com',
    });
    expect(response.status).toBe(403);
    expect(errorCode(response)).toBe('PERMISSION_DENIED');
    const denied = await tenantScope(
      scenario.db,
      scenario.tenant.id,
    )((tx) =>
      tx.securityEvent.findMany({
        where: { type: 'access.permission_denied', userId: director.id },
      }),
    );
    expect(denied.map((event) => event.detail)).toContainEqual({
      permission: 'crm.quote.send',
      method: 'POST',
      path: `/v1/crm/quotes/${id}/actions/send`,
    });
  });
});

describe('permiso denegado', () => {
  it('solo el Contador y Finanzas administran los parámetros tributarios', async () => {
    const sales = await scenario.sales();
    expect(errorCode(await scenario.get('/v1/finance/tax-parameters', sales.session))).toBe(
      'PERMISSION_DENIED',
    );
    const accountant = await scenario.person('contador-impuestos', ['CONTADOR']);
    const list = await scenario.get('/v1/finance/tax-parameters', accountant.session);
    expect(taxParameterListResponseSchema.parse(list.body).data.map((tax) => tax.key)).toEqual(
      expect.arrayContaining(['IVA_GENERAL', 'IVA_EXENTO']),
    );
  });
});

describe('aislamiento entre empresas', () => {
  it('otra empresa no ve ni cambia las cotizaciones ni el portafolio de esta', async () => {
    const sales = await scenario.sales();
    const id = await scenario.quote(sales, { items: [item({ discount_percent: '20' })] });
    const serviceName = `Servicio aislado ${String(Date.now())}`;
    await scenario.create('/v1/crm/services', sales, {
      name: serviceName,
      unit: 'hour',
      base_price: '100000',
      tax_key: 'IVA_GENERAL',
    });
    await scenario.step(sales, id, 'submit');
    const other = await scenario.sales(scenario.otherTenant.id);
    const otherDirector = await scenario.director(scenario.otherTenant.id);
    const missing = [
      scenario.get(`/v1/crm/quotes/${id}`, other.session),
      scenario.action(`/v1/crm/quotes/${id}/actions/new-version`, other, 1),
      scenario.action(`/v1/crm/quotes/${id}/actions/approve`, otherDirector, 1),
    ];
    for (const response of await Promise.all(missing)) {
      expect(errorCode(response)).toBe('CRM_NOT_FOUND');
    }
    const quotes = quoteListResponseSchema.parse(
      (await scenario.get('/v1/crm/quotes?view=all', other.session)).body,
    );
    expect(quotes.data.map((row) => row.id)).not.toContain(id);
    const services = serviceListResponseSchema.parse(
      (await scenario.get('/v1/crm/services?view=all', other.session)).body,
    );
    expect(services.data.map((row) => row.name)).not.toContain(serviceName);
  });
});

describe('aislamiento entre empresas', () => {
  it('una cotización no usa el servicio de otra empresa', async () => {
    const other = await scenario.sales(scenario.otherTenant.id);
    const foreign = await scenario.create('/v1/crm/services', other, {
      name: `Servicio ajeno ${String(Date.now())}`,
      unit: 'hour',
      base_price: '1000',
      tax_key: 'IVA_GENERAL',
    });
    const sales = await scenario.sales();
    const opportunityId = await scenario.opportunity(sales);
    const body = scenario.quoteBody(opportunityId, { items: [item({ service_id: foreign })] });
    const response = await scenario.post('/v1/crm/quotes', sales.session, body);
    expect(errorCode(response)).toBe('CRM_SERVICE_INVALID');
  });
});
