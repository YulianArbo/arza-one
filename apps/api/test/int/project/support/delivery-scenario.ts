import {
  deliverableListResponseSchema,
  indicatorsSchema,
  timeListResponseSchema,
  type Deliverable,
  type ProjectIndicators,
  type TimeListResponse,
} from '@arza/contracts';
import type request from 'supertest';
import { expect } from 'vitest';

import { renderTenantPdfs } from '../../../../src/modules/doc/index.js';
import {
  followAcceptances,
  type AcceptanceWorkResult,
} from '../../../../src/modules/project/index.js';
import { samplePdf, storage } from '../../doc/support/file-scenario.js';
import type { Person } from '../../iam/support/access-scenario.js';
import { tenantScope } from '../../iam/support/iam-fixtures.js';
import { apiDatabase } from '../../support/integration-database.js';
import type { SigningClient } from '../../contract/support/signature-scenario.js';
import { ProjectScenario } from './project-scenario.js';

// Escenario de las pruebas del B27: un proyecto en ejecución desde un contrato vigente de un
// cliente con su firmante autorizado (correo y documento), un hito, y el trabajo del worker de
// prueba: los PDF de los formatos, el envío del acta a firma y la lectura de la respuesta.
// Datos ficticios.

export interface DeliveryProject {
  readonly leader: Person;
  readonly sales: Person;
  readonly client: SigningClient;
  readonly projectId: string;
  readonly milestoneId: string;
}

export class DeliveryScenario extends ProjectScenario {
  /** Contrato vigente (con copia firmada registrada) del cliente dado. */
  async activeContractFor(sales: Person, partyId: string): Promise<string> {
    const id = await this.create(
      '/v1/contracts',
      sales,
      this.body(await this.templateId(sales), partyId),
    );
    expect((await this.contractStep(sales, id, 'submit')).status).toBe(204);
    expect((await this.contractStep(await this.director(), id, 'approve', {})).status).toBe(204);
    await this.renderPdfs();
    const signed = await this.contractStep(sales, id, 'register-signature', {
      file_id: await this.signedCopy(sales),
      signed_on: this.day(0),
    });
    expect(signed.status, signed.text).toBe(204);
    return id;
  }

  /** Proyecto en ejecución de un cliente que firma, con un hito del 25 % del contrato. */
  async deliveryProject(): Promise<DeliveryProject> {
    const sales = await this.sales();
    const leader = await this.leader();
    const client = await this.signingClient(sales);
    const contractId = await this.activeContractFor(sales, client.partyId);
    const projectId = await this.create(
      '/v1/projects',
      leader,
      this.projectBody(leader, { contract_id: contractId }),
    );
    expect((await this.projectStep(leader, projectId, 'start')).status).toBe(204);
    const milestoneId = await this.create(`/v1/projects/${projectId}/milestones`, leader, {
      name: 'Entrega del portal',
      due_on: this.day(30),
      billing_pct: 25,
    });
    return { leader, sales, client, projectId, milestoneId };
  }

  deliverableBody(overrides: object = {}): Record<string, unknown> {
    return {
      name: 'Portal de autogestión',
      description: 'Consulta de facturas y certificados.',
      version_label: '1.0.0',
      milestone_id: null,
      evidence_url: 'https://repositorio.example.com/portal',
      ...overrides,
    };
  }

  async deliverables(person: Person, projectId: string): Promise<Deliverable[]> {
    const response = await this.get(`/v1/projects/${projectId}/deliverables`, person.session);
    expect(response.status, response.text).toBe(200);
    return deliverableListResponseSchema.parse(response.body).data;
  }

  async deliverableOf(person: Person, projectId: string, id: string): Promise<Deliverable> {
    const found = (await this.deliverables(person, projectId)).find((row) => row.id === id);
    if (found === undefined) throw new Error(`No aparece el entregable ${id}`);
    return found;
  }

  /** Entregar al cliente con la versión vigente. */
  async deliver(
    person: Person,
    target: { readonly projectId: string; readonly id: string; readonly signerId: string },
    overrides: object = {},
  ): Promise<request.Response> {
    const { version } = await this.deliverableOf(person, target.projectId, target.id);
    const path = `/v1/projects/${target.projectId}/deliverables/${target.id}/actions/deliver`;
    return this.action(path, person, version, {
      signer_id: target.signerId,
      environment: 'production',
      pending_note: null,
      message: 'Quedamos atentos a su aceptación.',
      ...overrides,
    });
  }

  /** Lo que hace el worker con «doc.pdf-render» en la empresa: el PDF del acta y de las listas. */
  async renderForms(): Promise<void> {
    await renderTenantPdfs(
      {
        database: apiDatabase(),
        clock: this.clock,
        storage: storage(),
        convertHtml: () => Promise.resolve(samplePdf('Acta')),
        convertOffice: () => Promise.resolve(samplePdf('Acta Word')),
        stamp: (pdf) => Promise.resolve(pdf),
      },
      this.tenant.id,
    );
  }

  /** Una pasada del worker de actas: envía las listas y cierra las respondidas. */
  async acceptanceWork(): Promise<AcceptanceWorkResult> {
    return followAcceptances({ database: this.workerDatabase(), clock: this.clock });
  }

  /** Entregado, con el PDF del acta generado, enviado a firma y el enlace en el correo. */
  async deliveredToClient(delivery: DeliveryProject, deliverableId: string): Promise<void> {
    const signerId = delivery.client.signers[0]?.personId ?? '';
    const response = await this.deliver(delivery.leader, {
      projectId: delivery.projectId,
      id: deliverableId,
      signerId,
    });
    expect(response.status, response.text).toBe(201);
    await this.renderForms();
    expect((await this.acceptanceWork()).sent).toBeGreaterThanOrEqual(1);
    await this.signatureWork();
  }

  async times(person: Person, projectId: string, query = ''): Promise<TimeListResponse> {
    const response = await this.get(
      `/v1/projects/${projectId}/time-entries${query}`,
      person.session,
    );
    expect(response.status, response.text).toBe(200);
    return timeListResponseSchema.parse(response.body);
  }

  logTime(person: Person, projectId: string, body: object = {}): request.Test {
    return this.post(`/v1/projects/${projectId}/time-entries`, person.session, {
      work_date: this.day(0),
      hours: 4,
      item_id: null,
      billable: true,
      note: 'Construcción de la consulta de facturas.',
      ...body,
    });
  }

  async indicators(person: Person, projectId: string): Promise<ProjectIndicators> {
    const response = await this.get(`/v1/projects/${projectId}/indicators`, person.session);
    expect(response.status, response.text).toBe(200);
    return indicatorsSchema.parse(response.body);
  }

  /** Avisos de un tipo para una persona. */
  async noticesFor(userId: string, kind = 'prj_project_update'): Promise<string[]> {
    const rows = await tenantScope(
      this.db,
      this.tenant.id,
    )((tx) => tx.notification.findMany({ where: { userId, kind }, orderBy: { createdAt: 'asc' } }));
    return rows.map((row) => row.body);
  }
}
