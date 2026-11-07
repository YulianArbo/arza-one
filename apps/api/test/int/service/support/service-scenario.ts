import {
  ticketDetailSchema,
  ticketListResponseSchema,
  ticketMessageListResponseSchema,
  type TicketDetail,
  type TicketMessage,
  type TicketSummary,
} from '@arza/contracts';
import type request from 'supertest';
import { beforeAll, expect } from 'vitest';

import { publishTenantEvents } from '../../../../src/modules/ntf/application/publisher.js';
import { seedNotificationTemplates } from '../../../../src/modules/ntf/index.js';
import {
  followTicketClocks,
  seedService,
  type SlaWorkResult,
} from '../../../../src/modules/service/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import { CrmScenario } from '../../crm/support/crm-scenario.js';
import type { Person } from '../../iam/support/access-scenario.js';
import { tenantScope } from '../../iam/support/iam-fixtures.js';
import { organizationBody } from '../../party/support/party-scenario.js';
import { apiDatabase } from '../../support/integration-database.js';

// Escenario de las pruebas de la mesa de ayuda (B28): personas de Servicio al cliente, tiquetes
// registrados por la API, el reloj de prueba y el trabajo del worker (alertas y cierre automático).
// Datos ficticios.

export const MINUTE = 60_000;

export class ServiceScenario extends CrmScenario {
  constructor(label: string) {
    super(label);
    beforeAll(async () => {
      const tenants = [this.tenant.id, this.otherTenant.id];
      await seedService(this.db, tenants, systemClock);
      await seedNotificationTemplates(this.db, tenants, systemClock);
    });
  }

  agent(tenantId = this.tenant.id): Promise<Person> {
    return this.person('servicio', ['SERVICIO'], { tenantId });
  }

  ticketBody(overrides: object = {}): Record<string, unknown> {
    return {
      subject: 'No carga el reporte de ventas',
      description: 'Desde esta mañana el reporte queda en blanco.',
      category: 'incident',
      priority: 'critical',
      ...overrides,
    };
  }

  async ticket(person: Person, overrides: object = {}): Promise<string> {
    return this.create('/v1/tickets', person, this.ticketBody(overrides));
  }

  /** Cliente nuevo de Terceros, registrado por Comercial. */
  async clientParty(): Promise<string> {
    return this.party(await this.sales(), organizationBody());
  }

  async ticketOf(person: Person, id: string): Promise<TicketDetail> {
    const response = await this.get(`/v1/tickets/${id}`, person.session);
    expect(response.status, response.text).toBe(200);
    return ticketDetailSchema.parse(response.body);
  }

  async inbox(person: Person, query = ''): Promise<TicketSummary[]> {
    const response = await this.get(`/v1/tickets${query}`, person.session);
    expect(response.status, response.text).toBe(200);
    return ticketListResponseSchema.parse(response.body).data;
  }

  /** Paso del tiquete con la versión vigente. */
  async step(
    person: Person,
    id: string,
    action: string,
    body: object = {},
    viewer: Person = person,
  ): Promise<request.Response> {
    const { version } = await this.ticketOf(viewer, id);
    return this.action(`/v1/tickets/${id}/actions/${action}`, person, version, body);
  }

  async stepOk(person: Person, id: string, action: string, body: object = {}): Promise<void> {
    const response = await this.step(person, id, action, body);
    expect(response.status, response.text).toBe(204);
  }

  /** Asignado a la persona y en curso. */
  async working(agent: Person, overrides: object = {}): Promise<string> {
    const id = await this.ticket(agent, overrides);
    await this.stepOk(agent, id, 'assign', { assignee_id: agent.id });
    await this.stepOk(agent, id, 'start');
    return id;
  }

  write(person: Person, id: string, body: object): request.Test {
    return this.post(`/v1/tickets/${id}/messages`, person.session, body);
  }

  async messages(person: Person, id: string): Promise<TicketMessage[]> {
    const response = await this.get(`/v1/tickets/${id}/messages`, person.session);
    expect(response.status, response.text).toBe(200);
    return ticketMessageListResponseSchema.parse(response.body).data;
  }

  advance(minutes: number): void {
    this.clock.advance(minutes * MINUTE);
  }

  /** Una pasada del reloj de los tiquetes en el worker. */
  async clockWork(): Promise<SlaWorkResult> {
    return followTicketClocks({ database: apiDatabase(), clock: this.clock });
  }

  async dispatchNotices(): Promise<void> {
    await publishTenantEvents(
      { database: apiDatabase(), clock: this.clock },
      this.tenant.id,
      this.clock.now(),
    );
  }

  /** Avisos de un tipo para una persona. */
  async noticesFor(userId: string, kind: string): Promise<string[]> {
    const rows = await tenantScope(
      this.db,
      this.tenant.id,
    )((tx) => tx.notification.findMany({ where: { userId, kind }, orderBy: { createdAt: 'asc' } }));
    return rows.map((row) => row.body);
  }

  /** Acciones de la auditoría de un registro, en el orden de la cadena. */
  async auditActions(entityId: string): Promise<string[]> {
    const events = await tenantScope(
      this.db,
      this.tenant.id,
    )((tx) => tx.auditEvent.findMany({ where: { entityId }, orderBy: { seq: 'asc' } }));
    return events.map((event) => event.action);
  }
}
