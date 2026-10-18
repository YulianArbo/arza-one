import {
  acknowledgementReportSchema,
  changeRequestSchema,
  createdResponseSchema,
  masterListResponseSchema,
  type AcknowledgementReport,
  type ChangeRequest,
  type MasterListEntry,
} from '@arza/contracts';
import type request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { expect } from 'vitest';

import type { OutboxEvent } from '../../../../src/generated/prisma/client.js';
import type { Person } from '../../iam/support/access-scenario.js';
import { DocScenario } from './doc-scenario.js';

// Escenario del control documental del SGC (B19): Solicitud de Acción Documental por la API,
// tareas del trámite atendidas desde «Mis tareas», cargos destinatarios con sus personas,
// constancia de lectura y Listado Maestro.

export type RequestStep = 'analyze' | 'approve' | 'reject';

export class SgcScenario extends DocScenario {
  /** Radica una solicitud de creación de un procedimiento del proceso SGC (o lo que se indique). */
  async fileRequest(person: Person, overrides: Record<string, unknown> = {}): Promise<string> {
    const response = await this.post('/v1/change-requests', person.session, {
      action: 'create',
      document_id: null,
      doc_type: 'PR',
      process_id: await this.processId('SGC'),
      title: 'Control de registros',
      justification: 'El proceso necesita un procedimiento para sus registros.',
      ...overrides,
    });
    expect(response.status, response.text).toBe(201);
    return createdResponseSchema.parse(response.body).id;
  }

  async changeRequest(person: Person, id: string): Promise<ChangeRequest> {
    const response = await this.get(`/v1/change-requests/${id}`, person.session);
    expect(response.status, response.text).toBe(200);
    return changeRequestSchema.parse(response.body);
  }

  async requestStep(
    person: Person,
    id: string,
    step: RequestStep,
    comment: string | null = null,
  ): Promise<request.Response> {
    const seen = await this.changeRequest(person, id);
    return this.post(`/v1/change-requests/${id}/actions/${step}`, person.session, { comment }).set(
      'If-Match',
      `"${String(seen.version)}"`,
    );
  }

  /** Radicada, analizada y aprobada por otra persona de Calidad. */
  async approvedByFlow(
    requester: Person,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const id = await this.fileRequest(requester, overrides);
    const decider = await this.quality('decide');
    expect((await this.requestStep(decider, id, 'analyze')).status).toBe(204);
    expect((await this.requestStep(decider, id, 'approve')).status).toBe(204);
    return id;
  }

  /** La tarea abierta del trámite que se atiende en «Mis tareas». */
  async openTask(instanceId: string): Promise<string> {
    const task = await this.inTenant((tx) =>
      tx.workflowTask.findFirstOrThrow({
        where: { instanceId, status: { in: ['pending', 'in_progress'] } },
      }),
    );
    return task.id;
  }

  /** Aprueba desde «Mis tareas», como lo haría la persona en la bandeja. */
  approveTask(person: Person, taskId: string): request.Test {
    return this.post(`/v1/tasks/${taskId}/actions/approve`, person.session, {});
  }

  /** Un cargo nuevo del proceso con las personas dadas. */
  async positionWith(people: readonly Person[], processCode = 'SGC'): Promise<string> {
    const processId = await this.processId(processCode);
    return this.inTenant(async (tx) => {
      const position = await tx.position.create({
        data: { tenantId: this.tenant.id, orgUnitId: processId, name: `Cargo ${uuidv7()}` },
      });
      for (const person of people) {
        await tx.user.update({ where: { id: person.id }, data: { positionId: position.id } });
      }
      return position.id;
    });
  }

  /** El cargo queda como destinatario del documento («Aplica a»). */
  async target(person: Person, documentId: string, positionId: string): Promise<void> {
    const body = { entity_type: 'position', entity_id: positionId, relation: 'applies_to' };
    const response = await this.post(`/v1/documents/${documentId}/links`, person.session, body);
    expect(response.status, response.text).toBe(201);
  }

  async readingReport(person: Person, documentId: string): Promise<AcknowledgementReport> {
    const response = await this.get(`/v1/documents/${documentId}/acknowledgements`, person.session);
    expect(response.status, response.text).toBe(200);
    return acknowledgementReportSchema.parse(response.body);
  }

  async masterList(person: Person, query = ''): Promise<MasterListEntry[]> {
    const response = await this.get(`/v1/master-list${query}`, person.session);
    expect(response.status, response.text).toBe(200);
    return masterListResponseSchema.parse(response.body).data;
  }

  /** Eventos de la bandeja de salida de un tipo, de la empresa del escenario. */
  async outbox(eventType: string): Promise<OutboxEvent[]> {
    return this.inTenant((tx) => tx.outboxEvent.findMany({ where: { eventType } }));
  }

  async auditActions(entityId: string): Promise<string[]> {
    const events = await this.inTenant((tx) => tx.auditEvent.findMany({ where: { entityId } }));
    return events.map((event) => event.action);
  }
}
