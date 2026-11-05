import { publicQuoteSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { errorCode, tenantScope } from '../iam/support/iam-fixtures.js';
import { QuoteScenario } from './support/quote-scenario.js';

// El cliente abre la cotización desde el enlace del correo, sin sesión (B23, anexo D): la ve,
// descarga el PDF y la acepta o la rechaza una sola vez. Queda la evidencia de fecha, IP, navegador,
// versión y huella del PDF (ficha 17.6).

const scenario = new QuoteScenario('crm cotizaciones del cliente');

describe('ver la cotización', () => {
  it('muestra lo que el cliente necesita, sin datos internos, y registra que la abrió', async () => {
    const sales = await scenario.sales();
    const { id, token } = await scenario.sent(sales);
    const response = await scenario.public('view', { token });
    expect(response.status, response.text).toBe(200);
    const view = publicQuoteSchema.parse(response.body);
    expect(view).toMatchObject({ state: 'open', version_number: 1, total: '1011500.00' });
    expect(JSON.stringify(response.body)).not.toContain(sales.email);
    const opened = await tenantScope(
      scenario.db,
      scenario.tenant.id,
    )((tx) => tx.auditEvent.findMany({ where: { entityId: id, action: 'crm.quote.client_view' } }));
    expect(opened).toHaveLength(1);
  });
});

describe('ver la cotización', () => {
  it('un enlace inventado o incompleto no sirve', async () => {
    const fake = 'a'.repeat(43);
    expect(errorCode(await scenario.public('view', { token: fake }))).toBe(
      'CRM_QUOTE_LINK_INVALID',
    );
    expect((await scenario.public('view', { token: 'corto' })).status).toBe(422);
  });
});

describe('descargar el PDF', () => {
  it('entrega el PDF FT-COM-001 de la versión enviada como adjunto', async () => {
    const sales = await scenario.sales();
    const { token } = await scenario.sent(sales);
    const response = await scenario.public('pdf', { token });
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toMatch(/attachment; filename=".*-v1\.pdf"/u);
  });
});

describe('aceptar', () => {
  it('queda aceptada con la evidencia y avisa a quien la elaboró', async () => {
    const sales = await scenario.sales();
    const { id, token } = await scenario.sent(sales);
    expect((await scenario.public('accept', { token, accepted_by_name: 'Clara' })).status).toBe(
      422,
    );
    const body = { token, accepted_by_name: 'Clara Cliente', accept: true };
    const response = await scenario.public('accept', body);
    expect(response.status, response.text).toBe(204);
    const quote = await scenario.quoteDetail(sales, id);
    const pdf = await tenantScope(
      scenario.db,
      scenario.tenant.id,
    )((tx) => tx.crmQuote.findUniqueOrThrow({ where: { id }, select: { pdfSha256: true } }));
    expect(quote.status).toBe('accepted');
    expect(quote.response).toMatchObject({
      decision: 'accepted',
      by_name: 'Clara Cliente',
      user_agent: 'Navegador de prueba',
      pdf_sha256: pdf.pdfSha256,
    });
    expect(quote.response?.ip).not.toBeNull();
    const again = await scenario.public('accept', body);
    expect(errorCode(again)).toBe('CRM_STATUS_INVALID');
    const events = await tenantScope(
      scenario.db,
      scenario.tenant.id,
    )((tx) => tx.outboxEvent.findMany({ where: { eventType: 'crm.quote.accepted' } }));
    const payload = events.map((event) => event.payload as { id: string; author_id: string });
    expect(payload.find((item) => item.id === id)?.author_id).toBe(sales.id);
    const view = publicQuoteSchema.parse((await scenario.public('view', { token })).body);
    expect(view).toMatchObject({ state: 'accepted', responded_by: 'Clara Cliente' });
  });
});

describe('rechazar', () => {
  it('queda rechazada con el motivo opcional y ya no se puede aceptar', async () => {
    const sales = await scenario.sales();
    const { id, token } = await scenario.sent(sales);
    const reason = 'Encontramos una opción más económica.';
    expect((await scenario.public('reject', { token, reason })).status).toBe(204);
    expect((await scenario.quoteDetail(sales, id)).response).toMatchObject({
      decision: 'rejected',
      reason,
    });
    const accept = await scenario.public('accept', {
      token,
      accepted_by_name: 'Clara Cliente',
      accept: true,
    });
    expect(errorCode(accept)).toBe('CRM_STATUS_INVALID');
    const next = await scenario.step(sales, id, 'new-version');
    expect(next.status, next.text).toBe(201);
  });
});

describe('aislamiento entre empresas', () => {
  it('el enlace de una empresa solo abre su cotización, aunque se use otra sesión', async () => {
    const sales = await scenario.sales();
    const { id } = await scenario.sent(sales);
    const other = await scenario.sales(scenario.otherTenant.id);
    expect(errorCode(await scenario.get(`/v1/crm/quotes/${id}`, other.session))).toBe(
      'CRM_NOT_FOUND',
    );
    const link = await scenario.post(`/v1/crm/quotes/${id}/pdf`, other.session);
    expect(errorCode(link)).toBe('CRM_NOT_FOUND');
  });
});
