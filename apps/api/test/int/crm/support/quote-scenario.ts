import { quoteDetailSchema, type QuoteDetail } from '@arza/contracts';
import { beforeAll, expect } from 'vitest';

import {
  expireQuotes,
  processPendingQuotes,
  type QuoteMail,
} from '../../../../src/modules/crm/index.js';
import { seedTaxParameters } from '../../../../src/modules/fin/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import { samplePdf, storage } from '../../doc/support/file-scenario.js';
import type { Person } from '../../iam/support/access-scenario.js';
import { WEB_ORIGIN, freshIp } from '../../iam/support/iam-fixtures.js';
import { apiDatabase } from '../../support/integration-database.js';
import { CrmScenario } from './crm-scenario.js';
import request from 'supertest';

// Escenario de las pruebas de cotizaciones (B23): el del CRM más los parámetros tributarios (IVA
// 19 % y 0 %), el tope de descuento de la semilla (10 %) y un worker de prueba que genera el PDF y
// guarda los correos en vez de enviarlos. Datos ficticios.

export const APP_URL = 'https://app.arza.test';

/** Un ítem del cuerpo de una cotización. */
export function item(overrides: object = {}): Record<string, unknown> {
  return {
    service_id: null,
    description: 'Desarrollo del portal de clientes',
    unit: 'hour',
    quantity: '10',
    unit_price: '85000',
    discount_percent: '0',
    tax_key: 'IVA_GENERAL',
    ...overrides,
  };
}

/** Lo que el cliente recibió: el correo y la llave del enlace. */
export interface ReceivedQuote {
  readonly mail: QuoteMail;
  readonly token: string;
}

export class QuoteScenario extends CrmScenario {
  /** Correos que el worker de prueba «envió». */
  readonly mails: QuoteMail[] = [];

  constructor(label: string) {
    super(label);
    beforeAll(async () => {
      await seedTaxParameters(apiDatabase(), [this.tenant.id, this.otherTenant.id], systemClock);
    });
  }

  director(tenantId = this.tenant.id): Promise<Person> {
    return this.person('direccion', ['DIRECCION'], { tenantId });
  }

  /** Fecha de Colombia a tantos días de hoy, según el reloj de la prueba. */
  day(offset: number): string {
    const bogota = new Date(this.clock.now().getTime() - 5 * 3_600_000 + offset * 86_400_000);
    return bogota.toISOString().slice(0, 10);
  }

  quoteBody(opportunityId: string, overrides: object = {}): Record<string, unknown> {
    return { opportunity_id: opportunityId, ...this.draft(overrides) };
  }

  /** Cuerpo del borrador sin la oportunidad, como se guarda con PUT. */
  draft(overrides: object = {}): Record<string, unknown> {
    return {
      valid_until: this.day(30),
      conditions: {
        payment_terms: '50 % al iniciar y 50 % a la entrega',
        delivery_terms: 'Treinta días calendario',
        warranty: null,
      },
      notes: null,
      items: [item()],
      ...overrides,
    };
  }

  /** Cotización en borrador para una oportunidad nueva. */
  async quote(person: Person, overrides: object = {}): Promise<string> {
    const opportunityId = await this.opportunity(person);
    return this.create('/v1/crm/quotes', person, this.quoteBody(opportunityId, overrides));
  }

  async quoteDetail(person: Person, id: string): Promise<QuoteDetail> {
    const response = await this.get(`/v1/crm/quotes/${id}`, person.session);
    expect(response.status, response.text).toBe(200);
    return quoteDetailSchema.parse(response.body);
  }

  /** Paso de la cotización con la versión vigente. */
  async step(
    person: Person,
    id: string,
    action: string,
    body: object = {},
  ): Promise<request.Response> {
    const quote = await this.quoteDetail(person, id);
    return this.action(`/v1/crm/quotes/${id}/actions/${action}`, person, quote.version, body);
  }

  /** Guarda el borrador completo con la versión vigente. */
  async saveDraft(person: Person, id: string, body: object): Promise<request.Response> {
    const quote = await this.quoteDetail(person, id);
    return this.put(`/v1/crm/quotes/${id}`, person, body, quote.version);
  }

  /** Una pasada del worker: PDF de las aprobadas y correo de las enviadas. */
  async work(): Promise<{ pdfs: number; emails: number }> {
    return processPendingQuotes({
      database: apiDatabase(),
      clock: this.clock,
      storage: storage(),
      convertHtml: async () => Promise.resolve(samplePdf('Propuesta comercial')),
      mailer: {
        send: async (mail) => {
          this.mails.push(mail);
          return Promise.resolve();
        },
      },
      appUrl: APP_URL,
    });
  }

  async expire(): Promise<number> {
    return expireQuotes({ database: apiDatabase(), clock: this.clock });
  }

  /** Borrador → aprobada (sin descuento sobre el tope) con su PDF listo. */
  async approved(person: Person, overrides: object = {}): Promise<string> {
    const id = await this.quote(person, overrides);
    const submitted = await this.step(person, id, 'submit');
    expect(submitted.status, submitted.text).toBe(204);
    await this.work();
    expect((await this.quoteDetail(person, id)).pdf.status).toBe('ready');
    return id;
  }

  /** Enviada al cliente, con el correo ya «entregado». Devuelve el id y lo que recibió el cliente. */
  async sent(person: Person, overrides: object = {}): Promise<{ id: string } & ReceivedQuote> {
    const id = await this.approved(person, overrides);
    const recipient = { recipient_name: 'Clara Cliente', recipient_email: 'clara@example.com' };
    const response = await this.step(person, id, 'send', recipient);
    expect(response.status, response.text).toBe(204);
    await this.work();
    const mail = this.mails.at(-1);
    if (mail === undefined) throw new Error('El worker no envió el correo');
    return { id, mail, token: tokenOf(mail) };
  }

  /** Petición del cliente, sin sesión. */
  public(path: string, body: object): request.Test {
    return request(this.app.getHttpServer())
      .post(`/v1/public/quotes/${path}`)
      .set('Origin', WEB_ORIGIN)
      .set('X-Forwarded-For', freshIp())
      .set('User-Agent', 'Navegador de prueba')
      .send(body);
  }
}

/** La llave del enlace, que va después de «#token=» en el correo. */
export function tokenOf(mail: QuoteMail): string {
  const match = /#token=([A-Za-z0-9_-]+)/u.exec(mail.text);
  if (match?.[1] === undefined) throw new Error('El correo no trae el enlace');
  return match[1];
}
