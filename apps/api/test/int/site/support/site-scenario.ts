import {
  formReceiptSchema,
  siteCreatedResponseSchema,
  type FormReceipt,
  type LegalTextKey,
} from '@arza/contracts';
import request from 'supertest';
import { expect } from 'vitest';

import {
  sendSiteMailIn,
  type SiteMail,
  type SiteWorkDependencies,
} from '../../../../src/modules/web/index.js';
import type { Person } from '../../iam/support/access-scenario.js';
import { WEB_ORIGIN, freshIp, type SignedIn } from '../../iam/support/iam-fixtures.js';
import { CrmScenario } from '../../crm/support/crm-scenario.js';
import { contactNoticeId, uniqueNumber } from '../../party/support/party-scenario.js';
import { apiDatabase } from '../../support/integration-database.js';

// Escenario de las pruebas del sitio público (B41): dos empresas con catálogos, textos de
// autorización publicados y el flujo «Contactar al prospecto»; el sitio público es la empresa
// principal (PUBLIC_SITE_TAX_ID). El worker envía los acuses a un buzón de prueba. Datos ficticios.

const APP_URL = 'https://app.arza.test';

export const LEGAL_BODY =
  'Texto de prueba de los términos.\n\n## Uso permitido\n\n- Solo para fines lícitos.';

export class SiteScenario extends CrmScenario {
  readonly outbox: SiteMail[] = [];

  /** Petición del sitio público, sin sesión. */
  public(path: string, body: object): request.Test {
    return request(this.app.getHttpServer())
      .post(`/v1/public/${path}`)
      .set('Origin', WEB_ORIGIN)
      .set('X-Forwarded-For', freshIp())
      .set('User-Agent', 'Navegador de prueba')
      .send(body);
  }

  publicGet(path: string): request.Test {
    return request(this.app.getHttpServer())
      .get(`/v1/public/${path}`)
      .set('X-Forwarded-For', freshIp());
  }

  /** POST con If-Match. */
  act(path: string, session: SignedIn, version: number, body: object = {}): request.Test {
    return this.post(path, session, body).set('If-Match', `"${String(version)}"`);
  }

  /** El Oficial de datos redacta y la Dirección aprueba y publica (decisión 2). */
  async publishText(
    key: LegalTextKey,
    staff: { readonly drafter: Person; readonly approver: Person },
    title = 'Texto de prueba',
  ): Promise<string> {
    const response = await this.post('/v1/site/legal-texts', staff.drafter.session, {
      key,
      title,
      body: LEGAL_BODY,
    });
    expect(response.status, response.text).toBe(201);
    const { id } = siteCreatedResponseSchema.parse(response.body);
    const base = `/v1/site/legal-texts/${id}/actions`;
    const approved = await this.act(`${base}/approve`, staff.approver.session, 1);
    expect(approved.status, approved.text).toBe(204);
    const published = await this.act(`${base}/publish`, staff.approver.session, 2);
    expect(published.status, published.text).toBe(204);
    return id;
  }

  async visitor(): Promise<Record<string, unknown>> {
    return {
      first_name: 'Visitante',
      last_name: `De Prueba ${uniqueNumber()}`,
      email: `visitante${uniqueNumber()}@ejemplo.test`,
      phone: null,
      company: 'Empresa Ficticia S.A.S.',
      notice_id: await contactNoticeId(this),
      accept_privacy: true,
    };
  }

  async contactForm(overrides: object = {}): Promise<Record<string, unknown>> {
    return {
      ...(await this.visitor()),
      message: 'Quiero conocer sus servicios de software a la medida.',
      ...overrides,
    };
  }

  async quoteForm(overrides: object = {}): Promise<Record<string, unknown>> {
    return {
      ...(await this.visitor()),
      service: 'cloud',
      timeframe: 'quarter',
      description: 'Migrar dos servidores a la nube con monitoreo.',
      ...overrides,
    };
  }

  async submit(kind: 'contact' | 'quote', body: object): Promise<FormReceipt> {
    const response = await this.public(`forms/${kind}`, body);
    expect(response.status, response.text).toBe(201);
    return formReceiptSchema.parse(response.body);
  }

  /** Corre el worker del sitio solo para la empresa del escenario. */
  async siteWork(): Promise<number> {
    return sendSiteMailIn(this.siteDeps(), [this.tenant.id]);
  }

  siteDeps(): SiteWorkDependencies {
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

  mailsTo(email: string): SiteMail[] {
    return this.outbox.filter((mail) => mail.to === email);
  }
}

/** La llave de baja, que va después de «#token=» en el correo. */
export function unsubscribeToken(mail: SiteMail): string {
  const match = /\/baja#token=([A-Za-z0-9_-]+)/u.exec(mail.text);
  if (match?.[1] === undefined) throw new Error('El correo no trae el enlace de baja.');
  return match[1];
}
