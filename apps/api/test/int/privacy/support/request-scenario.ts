import {
  createdResponseSchema,
  privacyIncidentSchema,
  privacyRequestReceiptSchema,
  privacyRequestSchema,
  type PrivacyIncident,
  type PrivacyRequest,
  type PrivacyRequestReceipt,
} from '@arza/contracts';
import request from 'supertest';
import { expect } from 'vitest';

import {
  runPrivacyWork,
  type PrivacyWorkDependencies,
} from '../../../../src/modules/privacy/index.js';
import type { PrivacyMail } from '../../../../src/modules/privacy/application/privacy-work.js';
import type { Clock } from '../../../../src/platform/clock/clock.js';
import { samplePdf, storage } from '../../doc/support/file-scenario.js';
import type { Person } from '../../iam/support/access-scenario.js';
import { WEB_ORIGIN, freshIp, type SignedIn } from '../../iam/support/iam-fixtures.js';
import { apiDatabase } from '../../support/integration-database.js';
import { PrivacyScenario } from './privacy-scenario.js';

// Escenario de las solicitudes de titulares, la entrega y supresión de datos y los incidentes
// (B42): el de privacidad, con el formulario público de la empresa del sitio, un buzón de prueba
// para los correos al titular y un convertidor de PDF ficticio. Datos ficticios.

export const REQUESTS = '/v1/privacy-requests';
export const INCIDENTS = '/v1/privacy-incidents';

let sequence = 0;

export function uniqueDocument(): string {
  sequence += 1;
  return `10${String(Date.now()).slice(-6)}${String(sequence).padStart(2, '0')}`;
}

export class RequestScenario extends PrivacyScenario {
  readonly outbox: PrivacyMail[] = [];

  /** Petición del sitio público, sin sesión. */
  public(path: string, body: object): request.Test {
    return request(this.app.getHttpServer())
      .post(`/v1/public/privacy-requests${path}`)
      .set('Origin', WEB_ORIGIN)
      .set('X-Forwarded-For', freshIp())
      .send(body);
  }

  publicBody(overrides: object = {}): Record<string, unknown> {
    return {
      right: 'know',
      name: 'Titular De Prueba',
      document_number: uniqueDocument(),
      email: `titular${uniqueDocument()}@ejemplo.test`,
      phone: null,
      description: 'Quiero conocer los datos que tienen de mí.',
      accepts_privacy: true,
      ...overrides,
    };
  }

  async filePublic(overrides: object = {}): Promise<PrivacyRequestReceipt & { email: string }> {
    const body = this.publicBody(overrides);
    const response = await this.public('', body);
    expect(response.status, response.text).toBe(201);
    return { ...privacyRequestReceiptSchema.parse(response.body), email: String(body['email']) };
  }

  today(): string {
    return this.clock.now().toISOString().slice(0, 10);
  }

  internalBody(overrides: object = {}): Record<string, unknown> {
    return {
      channel: 'email',
      right: 'know',
      requester_name: 'Titular Interno',
      requester_email: `interno${uniqueDocument()}@ejemplo.test`,
      requester_phone: null,
      document_number: uniqueDocument(),
      description: 'Pido conocer los datos que tienen de mí.',
      received_on: this.today(),
      ...overrides,
    };
  }

  async fileInternal(dpo: Person, overrides: object = {}): Promise<string> {
    const response = await this.post(REQUESTS, dpo.session, this.internalBody(overrides));
    expect(response.status, response.text).toBe(201);
    return createdResponseSchema.parse(response.body).id;
  }

  async privacyRequest(person: Person, id: string): Promise<PrivacyRequest> {
    const response = await this.get(`${REQUESTS}/${id}`, person.session);
    expect(response.status, response.text).toBe(200);
    return privacyRequestSchema.parse(response.body);
  }

  /** POST con If-Match. */
  act(path: string, session: SignedIn, version: number, body: object = {}): request.Test {
    return this.post(path, session, body).set('If-Match', `"${String(version)}"`);
  }

  /** Un paso de la solicitud con su versión vigente; espera 204. */
  async step(dpo: Person, id: string, action: string, body: object = {}): Promise<PrivacyRequest> {
    const before = await this.privacyRequest(dpo, id);
    const response = await this.act(
      `${REQUESTS}/${id}/actions/${action}`,
      dpo.session,
      before.version,
      body,
    );
    expect(response.status, response.text).toBe(204);
    return this.privacyRequest(dpo, id);
  }

  /** Persona registrada en Terceros por comercial, con su autorización. */
  async holder(overrides: object = {}): Promise<string> {
    const sales = await this.sales();
    return this.party(sales, await this.personWithConsent(overrides));
  }

  /** Solicitud registrada por el Oficial y verificada contra la ficha del titular. */
  async verified(dpo: Person, partyId: string, overrides: object = {}): Promise<string> {
    const id = await this.fileInternal(dpo, overrides);
    const note = 'Revisé la copia de la cédula.';
    await this.step(dpo, id, 'verify', { party_id: partyId, method: 'document', note });
    return id;
  }

  async incident(dpo: Person, overrides: object = {}): Promise<string> {
    const body = {
      title: 'Correo enviado a un destinatario equivocado',
      description: 'Se envió un archivo con datos de contacto a una persona externa por error.',
      detected_at: this.clock.now().toISOString(),
      affected_count: 12,
      data_categories: ['contact'],
      ...overrides,
    };
    const response = await this.post(INCIDENTS, dpo.session, body);
    expect(response.status, response.text).toBe(201);
    return createdResponseSchema.parse(response.body).id;
  }

  async incidentDetail(dpo: Person, id: string): Promise<PrivacyIncident> {
    const response = await this.get(`${INCIDENTS}/${id}`, dpo.session);
    expect(response.status, response.text).toBe(200);
    return privacyIncidentSchema.parse(response.body);
  }

  workDeps(clock: Clock = this.clock): PrivacyWorkDependencies {
    return {
      database: apiDatabase(),
      clock,
      storage: storage(),
      convertHtml: () => Promise.resolve(samplePdf('Datos del titular')),
      mailer: {
        send: (mail) => {
          this.outbox.push(mail);
          return Promise.resolve();
        },
      },
    };
  }

  /** Corre el worker de privacidad solo en la empresa del escenario. */
  async work(): Promise<void> {
    await runPrivacyWork(this.workDeps(), [this.tenant.id]);
  }

  mailsTo(email: string): PrivacyMail[] {
    return this.outbox.filter((mail) => mail.to === email);
  }
}
