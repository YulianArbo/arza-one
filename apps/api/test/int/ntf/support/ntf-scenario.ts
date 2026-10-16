import {
  createdResponseSchema,
  notificationListResponseSchema,
  type Notification,
  type RecordRef,
} from '@arza/contracts';
import request from 'supertest';
import { beforeAll, expect } from 'vitest';

import type { Prisma } from '../../../../src/generated/prisma/client.js';
import {
  seedNotificationTemplates,
  type PublishResult,
} from '../../../../src/modules/ntf/index.js';
import { publishTenantEvents } from '../../../../src/modules/ntf/application/publisher.js';
import type { DatabaseService } from '../../../../src/platform/database/database.service.js';
import { organizationBody } from '../../party/support/party-scenario.js';
import type { Person } from '../../iam/support/access-scenario.js';
import { WEB_ORIGIN, freshIp, tenantScope, type SignedIn } from '../../iam/support/iam-fixtures.js';
import { apiDatabase } from '../../support/integration-database.js';
import { WfScenario } from '../../wf/support/wf-scenario.js';

// Escenario de las pruebas de avisos, comentarios y adjuntos (B16): el de flujos, con las
// plantillas de aviso de las dos empresas.

export class NtfScenario extends WfScenario {
  constructor(label: string) {
    super(label);
    beforeAll(async () => {
      const tenants = [this.tenant.id, this.otherTenant.id];
      await seedNotificationTemplates(apiDatabase(), tenants, this.clock);
    });
  }

  put(path: string, session: SignedIn, body: object, version?: number): request.Test {
    let call = request(this.app.getHttpServer())
      .put(path)
      .set('Origin', WEB_ORIGIN)
      .set('X-Forwarded-For', freshIp())
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.session.csrf_token);
    if (version !== undefined) call = call.set('If-Match', `"${String(version)}"`);
    return call.send(body);
  }

  /** Evento de la bandeja de salida guardado directamente, como lo haría un módulo. */
  async event(
    eventType: string,
    payload: Prisma.InputJsonObject,
    occurredAt: Date,
    tenantId = this.tenant.id,
  ): Promise<string> {
    const row = await tenantScope(
      this.db,
      tenantId,
    )((tx) => tx.outboxEvent.create({ data: { tenantId, eventType, payload, occurredAt } }));
    return row.id;
  }

  /** Publica la bandeja de salida de la empresa, como el worker. */
  async publishOutbox(
    tenantId = this.tenant.id,
    database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'> = apiDatabase(),
  ): Promise<PublishResult> {
    return publishTenantEvents({ database, clock: this.clock }, tenantId, this.clock.now());
  }

  async notifications(person: Person, query = ''): Promise<Notification[]> {
    const response = await this.get(`/v1/me/notifications${query}`, person.session);
    expect(response.status, response.text).toBe(200);
    return notificationListResponseSchema.parse(response.body).items;
  }

  /** Tercero creado por la API por una persona de finanzas; devuelve su registro y su sesión. */
  async party(): Promise<{ ref: RecordRef; owner: Person }> {
    const owner = await this.people('finanzas', ['ADMIN_FINANCIERO']);
    const response = await this.post('/v1/parties', owner.session, organizationBody());
    expect(response.status, response.text).toBe(201);
    const id = createdResponseSchema.parse(response.body).id;
    return { ref: { entity_type: 'party', entity_id: id }, owner };
  }

  /** Acciones de auditoría que hizo la persona, en orden. */
  async actionsBy(person: Person, tenantId = this.tenant.id): Promise<string[]> {
    const events = await tenantScope(
      this.db,
      tenantId,
    )((tx) =>
      tx.auditEvent.findMany({ where: { actorId: person.id }, orderBy: { occurredAt: 'asc' } }),
    );
    return events.map((event) => event.action);
  }
}
