import { createdResponseSchema, noticeSchema, type Notice } from '@arza/contracts';
import { expect } from 'vitest';

import type { Person } from '../../iam/support/access-scenario.js';
import { tenantScope } from '../../iam/support/iam-fixtures.js';
import {
  PartyScenario,
  contactNoticeId,
  organizationBody,
} from '../../party/support/party-scenario.js';

// Escenario de las pruebas de privacidad (B17): el de terceros, con los textos de privacidad de
// las dos empresas publicados y la persona Oficial de Protección de Datos.

export const NOTICE_BODY =
  'Texto de prueba del aviso de privacidad con la extensión mínima que exige la plataforma.';

export class PrivacyScenario extends PartyScenario {
  /** Oficial de Protección de Datos: administra la privacidad. */
  officer(tenantId = this.tenant.id): Promise<Person> {
    return this.person('oficial-datos', ['OFICIAL_DATOS'], { tenantId });
  }

  /** Publica los textos de la empresa (una vez) y devuelve el de autorización de contactos. */
  contactNotice(tenantId = this.tenant.id): Promise<string> {
    return contactNoticeId(this, tenantId);
  }

  async notice(person: Person, id: string): Promise<Notice> {
    const response = await this.get(`/v1/notices/${id}`, person.session);
    expect(response.status, response.text).toBe(200);
    return noticeSchema.parse(response.body);
  }

  /** Borrador nuevo de la clase, creado por la API. */
  async draft(person: Person, key: string, purposes: string[] = ['COMMERCIAL']): Promise<Notice> {
    const body = { key, title: `Versión de prueba de ${key}`, body: NOTICE_BODY, purposes };
    const response = await this.post('/v1/notices', person.session, body);
    expect(response.status, response.text).toBe(201);
    return this.notice(person, createdResponseSchema.parse(response.body).id);
  }

  /** Publica el borrador con la versión vista. */
  async publish(person: Person, draft: Notice): Promise<Notice> {
    const response = await this.post(`/v1/notices/${draft.id}/actions/publish`, person.session).set(
      'If-Match',
      `"${String(draft.version)}"`,
    );
    expect(response.status, response.text).toBe(200);
    return noticeSchema.parse(response.body);
  }

  /** Organización registrada por la API, para usarla como encargado. */
  async organization(person: Person): Promise<string> {
    return this.party(person, organizationBody({ roles: ['supplier'] }));
  }

  /** Acciones de auditoría que hizo la persona, en orden. */
  async actionsBy(person: Person, tenantId = this.tenant.id): Promise<string[]> {
    const events = await tenantScope(
      this.db,
      tenantId,
    )((tx) => tx.auditEvent.findMany({ where: { actorId: person.id }, orderBy: { seq: 'asc' } }));
    return events.map((event) => event.action);
  }
}
