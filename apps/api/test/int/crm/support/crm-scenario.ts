import {
  leadDetailSchema,
  opportunityDetailSchema,
  type LeadDetail,
  type OpportunityDetail,
} from '@arza/contracts';
import request from 'supertest';
import { beforeAll, expect } from 'vitest';

import type { WorkflowInstance, WorkflowTask } from '../../../../src/generated/prisma/client.js';
import { seedCrmWorkflows } from '../../../../src/modules/crm/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import type { Person } from '../../iam/support/access-scenario.js';
import { WEB_ORIGIN, freshIp, tenantScope } from '../../iam/support/iam-fixtures.js';
import { PartyScenario, consentFor, uniqueNumber } from '../../party/support/party-scenario.js';
import { apiDatabase } from '../../support/integration-database.js';

// Escenario de las pruebas del CRM (B22): dos empresas con la semilla del núcleo (catálogos del
// CRM), los textos de autorización publicados y el flujo «Contactar al prospecto». Datos ficticios.

/** El trámite de la tarea de contacto y sus tareas. */
export interface ContactTasks {
  readonly instance: WorkflowInstance | null;
  readonly tasks: WorkflowTask[];
}

export class CrmScenario extends PartyScenario {
  constructor(label: string) {
    super(label);
    beforeAll(async () => {
      await seedCrmWorkflows(apiDatabase(), [this.tenant.id, this.otherTenant.id], systemClock);
    });
  }

  /** Cuerpo de un prospecto con una persona nueva y su autorización. */
  async leadBody(overrides: object = {}, tenantId = this.tenant.id): Promise<object> {
    return {
      person: {
        first_name: 'Prospecto',
        last_name: `De Prueba ${uniqueNumber()}`,
        email: `prospecto${uniqueNumber()}@example.com`,
        phone: null,
      },
      need: 'Necesita un portal de autogestión para sus clientes.',
      source: 'WEBSITE',
      consent: await consentFor(this, tenantId),
      ...overrides,
    };
  }

  async lead(person: Person, overrides: object = {}): Promise<string> {
    return this.create('/v1/crm/leads', person, await this.leadBody(overrides));
  }

  async leadDetail(person: Person, id: string): Promise<LeadDetail> {
    const response = await this.get(`/v1/crm/leads/${id}`, person.session);
    expect(response.status, response.text).toBe(200);
    return leadDetailSchema.parse(response.body);
  }

  async opportunityDetail(person: Person, id: string): Promise<OpportunityDetail> {
    const response = await this.get(`/v1/crm/opportunities/${id}`, person.session);
    expect(response.status, response.text).toBe(200);
    return opportunityDetailSchema.parse(response.body);
  }

  /** Acción con la versión que se vio. */
  action(path: string, person: Person, version: number, body: object = {}): request.Test {
    return this.post(path, person.session, body).set('If-Match', `"${String(version)}"`);
  }

  /** Reemplazo completo con la versión que se vio, como editar una campaña. */
  put(path: string, person: Person, body: object, version: number): request.Test {
    return request(this.app.getHttpServer())
      .put(path)
      .set('Origin', WEB_ORIGIN)
      .set('X-Forwarded-For', freshIp())
      .set('Cookie', person.session.cookie)
      .set('X-CSRF-Token', person.session.session.csrf_token)
      .set('If-Match', `"${String(version)}"`)
      .send(body);
  }

  /** Prospecto calificado, listo para convertir. */
  async qualifiedLead(person: Person): Promise<LeadDetail> {
    const id = await this.lead(person);
    const lead = await this.leadDetail(person, id);
    const response = await this.action(`/v1/crm/leads/${id}/actions/qualify`, person, lead.version);
    expect(response.status, response.text).toBe(204);
    return this.leadDetail(person, id);
  }

  /** Oportunidad abierta para una organización nueva de Terceros. */
  async opportunity(person: Person, overrides: object = {}): Promise<string> {
    const partyId = await this.party(person);
    return this.create('/v1/crm/opportunities', person, {
      party_id: partyId,
      title: 'Desarrollo del portal de clientes',
      estimated_value: '25000000.00',
      expected_close: '2026-12-15',
      ...overrides,
    });
  }

  /** Tareas abiertas del trámite de un prospecto. */
  async contactTasks(leadId: string, tenantId = this.tenant.id): Promise<ContactTasks> {
    return tenantScope(
      this.db,
      tenantId,
    )(async (tx) => {
      const instance = await tx.workflowInstance.findFirst({ where: { entityId: leadId } });
      if (instance === null) return { instance, tasks: [] };
      const tasks = await tx.workflowTask.findMany({ where: { instanceId: instance.id } });
      return { instance, tasks };
    });
  }
}
