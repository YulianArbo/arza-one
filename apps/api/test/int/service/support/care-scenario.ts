import {
  pqrsfDetailSchema,
  pqrsfListResponseSchema,
  publicPqrsfFiledSchema,
  type PqrsfDetail,
  type PqrsfSummary,
  type PublicPqrsfFiled,
} from '@arza/contracts';
import request from 'supertest';
import { expect } from 'vitest';

import {
  followCustomerCareIn,
  type CareWorkDependencies,
  type CareWorkResult,
} from '../../../../src/modules/service/index.js';
import type { Person } from '../../iam/support/access-scenario.js';
import { WEB_ORIGIN, freshIp } from '../../iam/support/iam-fixtures.js';
import { apiDatabase } from '../../support/integration-database.js';
import { ServiceScenario } from './service-scenario.js';

// Escenario de las pruebas de PQRSF y encuestas (B29): el sitio público sin sesión, la bandeja y el
// recorrido de la PQRSF, y el worker que envía los correos a un buzón de prueba. Datos ficticios.

export interface SentMail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export const APP_URL = 'http://localhost:3000/app';

let counter = 0;

/** Correo ficticio único: cada prueba consulta solo lo suyo. */
export function uniqueEmail(label: string): string {
  counter += 1;
  return `${label}.${String(Date.now())}.${String(counter)}@ejemplo.test`;
}

export class CareScenario extends ServiceScenario {
  readonly outbox: SentMail[] = [];

  /** Petición del sitio público, sin sesión. */
  public(path: string, body: object): request.Test {
    return request(this.app.getHttpServer())
      .post(`/v1/public/${path}`)
      .set('Origin', WEB_ORIGIN)
      .set('X-Forwarded-For', freshIp())
      .set('User-Agent', 'Navegador de prueba')
      .send(body);
  }

  pqrsfForm(overrides: object = {}): Record<string, unknown> {
    return {
      type: 'complaint',
      name: 'Ana Pérez',
      email: uniqueEmail('ana'),
      phone: null,
      subject: 'Demora en la entrega',
      description: 'El entregable del portal llegó dos semanas tarde.',
      accepts_privacy: true,
      ...overrides,
    };
  }

  /** Radica en el sitio público y devuelve el acuse en pantalla. */
  async filePublic(overrides: object = {}): Promise<PublicPqrsfFiled & { email: string }> {
    const form = this.pqrsfForm(overrides);
    const response = await this.public('pqrsf', form);
    expect(response.status, response.text).toBe(201);
    return { ...publicPqrsfFiledSchema.parse(response.body), email: String(form['email']) };
  }

  /** El identificador de una PQRSF por su radicado. */
  async pqrsfId(agent: Person, code: string): Promise<string> {
    const list = await this.pqrsfInbox(agent, `?q=${code}&view=open`);
    const found = list.find((row) => row.code === code);
    if (found === undefined) throw new Error(`No aparece ${code}`);
    return found.id;
  }

  async pqrsfOf(person: Person, id: string): Promise<PqrsfDetail> {
    const response = await this.get(`/v1/pqrsf/${id}`, person.session);
    expect(response.status, response.text).toBe(200);
    return pqrsfDetailSchema.parse(response.body);
  }

  async pqrsfInbox(person: Person, query = ''): Promise<PqrsfSummary[]> {
    const response = await this.get(`/v1/pqrsf${query}`, person.session);
    expect(response.status, response.text).toBe(200);
    return pqrsfListResponseSchema.parse(response.body).data;
  }

  /** Paso de la PQRSF con la versión vigente. */
  async pqrsfStep(
    person: Person,
    id: string,
    action: string,
    body: object = {},
    viewer: Person = person,
  ): Promise<request.Response> {
    const { version } = await this.pqrsfOf(viewer, id);
    return this.action(`/v1/pqrsf/${id}/actions/${action}`, person, version, body);
  }

  async pqrsfStepOk(person: Person, id: string, action: string, body: object = {}): Promise<void> {
    const response = await this.pqrsfStep(person, id, action, body);
    expect(response.status, response.text).toBe(204);
  }

  /** Radicada en el sitio, clasificada y asignada a la persona. */
  async classified(agent: Person, overrides: object = {}): Promise<string> {
    const filed = await this.filePublic(overrides);
    const id = await this.pqrsfId(agent, filed.code);
    await this.pqrsfStepOk(agent, id, 'classify', {
      type: (overrides as { type?: string }).type ?? 'complaint',
      assignee_id: agent.id,
    });
    return id;
  }

  /** Con la respuesta redactada por `drafter` y enviada a aprobación. */
  async submitted(drafter: Person, wellFounded: boolean | null = false): Promise<string> {
    const id = await this.classified(drafter);
    await this.pqrsfStepOk(drafter, id, 'draft', {
      response: 'Lamentamos la demora; ajustamos el cronograma y le compensamos.',
      well_founded: wellFounded,
    });
    await this.pqrsfStepOk(drafter, id, 'respond');
    return id;
  }

  /**
   * Una pasada del worker de PQRSF y encuestas en la empresa del escenario; los correos quedan en
   * `outbox`. Solo esta empresa: otro archivo de pruebas no ve cambiar sus registros.
   */
  async careWork(): Promise<CareWorkResult> {
    return followCustomerCareIn(this.careDeps(), [this.tenant.id]);
  }

  careDeps(): CareWorkDependencies {
    return {
      database: apiDatabase(),
      clock: this.clock,
      appUrl: APP_URL,
      mailer: {
        send: (mail) => {
          this.outbox.push(mail);
          return Promise.resolve();
        },
      },
    };
  }

  mailsTo(email: string): SentMail[] {
    return this.outbox.filter((mail) => mail.to === email);
  }
}

/** La llave del enlace de la encuesta, que va después de «#token=» en el correo. */
export function surveyToken(mail: SentMail): string {
  const match = /#token=([A-Za-z0-9_-]+)/u.exec(mail.text);
  if (match?.[1] === undefined) throw new Error('El correo no trae el enlace de la encuesta.');
  return match[1];
}
