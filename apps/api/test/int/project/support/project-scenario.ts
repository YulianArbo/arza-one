import {
  boardSchema,
  itemListResponseSchema,
  projectDetailSchema,
  type ProjectBoard,
  type ProjectDetail,
  type ProjectItem,
} from '@arza/contracts';
import type request from 'supertest';
import { beforeAll, expect } from 'vitest';

import { publishTenantEvents } from '../../../../src/modules/ntf/application/publisher.js';
import { seedNotificationTemplates } from '../../../../src/modules/ntf/index.js';
import { seedProjects } from '../../../../src/modules/project/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import { ContractScenario } from '../../contract/support/contract-scenario.js';
import type { Person } from '../../iam/support/access-scenario.js';
import { tenantScope } from '../../iam/support/iam-fixtures.js';
import { apiDatabase } from '../../support/integration-database.js';

// Escenario de las pruebas de Proyectos (B26): el de Contratos (para tener un contrato vigente) más
// el flujo de autorización de la Dirección, el Líder técnico que crea los proyectos y las personas
// del equipo. Datos ficticios.

export class ProjectScenario extends ContractScenario {
  constructor(label: string) {
    super(label);
    beforeAll(async () => {
      const tenants = [this.tenant.id, this.otherTenant.id];
      await seedProjects(this.db, tenants, systemClock);
      await seedNotificationTemplates(this.db, tenants, systemClock);
    });
  }

  leader(tenantId = this.tenant.id): Promise<Person> {
    return this.person('lider', ['LIDER_TECNICO'], { tenantId });
  }

  developer(tenantId = this.tenant.id): Promise<Person> {
    return this.person('equipo', ['EQUIPO_PROYECTO'], { tenantId });
  }

  projectBody(manager: Person, overrides: object = {}): Record<string, unknown> {
    return { contract_id: null, party_id: null, ...this.projectData(manager, overrides) };
  }

  /** Los datos del proyecto que se editan con PUT: sin contrato ni cliente. */
  projectData(manager: Person, overrides: object = {}): Record<string, unknown> {
    return {
      name: 'Portal de autogestión',
      type: 'development',
      methodology: 'scrum',
      description: null,
      starts_on: this.day(0),
      ends_on: this.day(120),
      budget_hours: 480.5,
      budget_amount: null,
      manager_id: manager.id,
      ...overrides,
    };
  }

  /** Proyecto sin contrato, para un cliente nuevo de Terceros, en planeación. */
  async plannedProject(leader: Person, overrides: object = {}): Promise<string> {
    const partyId = await this.client(await this.sales());
    return this.create(
      '/v1/projects',
      leader,
      this.projectBody(leader, { party_id: partyId, ...overrides }),
    );
  }

  /** Proyecto desde un contrato vigente, ya en ejecución. */
  async runningProject(leader: Person, overrides: object = {}): Promise<string> {
    const contractId = await this.activeContract(await this.sales());
    const id = await this.create(
      '/v1/projects',
      leader,
      this.projectBody(leader, { contract_id: contractId, ...overrides }),
    );
    const started = await this.projectStep(leader, id, 'start');
    expect(started.status, started.text).toBe(204);
    return id;
  }

  async project(person: Person, id: string): Promise<ProjectDetail> {
    const response = await this.get(`/v1/projects/${id}`, person.session);
    expect(response.status, response.text).toBe(200);
    return projectDetailSchema.parse(response.body);
  }

  /** Paso del proyecto con la versión vigente. */
  async projectStep(
    person: Person,
    id: string,
    action: string,
    body: object = {},
  ): Promise<request.Response> {
    const project = await this.project(person, id);
    return this.action(`/v1/projects/${id}/actions/${action}`, person, project.version, body);
  }

  /** Agrega a la persona al equipo, por el Líder técnico. */
  async addMember(leader: Person, projectId: string, member: Person): Promise<string> {
    return this.create(`/v1/projects/${projectId}/members`, leader, {
      user_id: member.id,
      role: 'development',
      allocation_pct: 50,
    });
  }

  itemBody(overrides: object = {}): Record<string, unknown> {
    return {
      type: 'story',
      title: 'Consultar facturas',
      acceptance_criteria: 'El cliente ve sus facturas de los últimos 12 meses.',
      ...overrides,
    };
  }

  async item(person: Person, projectId: string, overrides: object = {}): Promise<string> {
    return this.create(`/v1/projects/${projectId}/items`, person, this.itemBody(overrides));
  }

  async items(person: Person, projectId: string, query = ''): Promise<ProjectItem[]> {
    const response = await this.get(`/v1/projects/${projectId}/items${query}`, person.session);
    expect(response.status, response.text).toBe(200);
    return itemListResponseSchema.parse(response.body).data;
  }

  async itemOf(person: Person, projectId: string, id: string): Promise<ProjectItem> {
    const found = (await this.items(person, projectId)).find((item) => item.id === id);
    if (found === undefined) throw new Error(`No aparece el ítem ${id}`);
    return found;
  }

  async board(person: Person, projectId: string): Promise<ProjectBoard> {
    const response = await this.get(`/v1/projects/${projectId}/board`, person.session);
    expect(response.status, response.text).toBe(200);
    return boardSchema.parse(response.body);
  }

  /** Acción sobre un ítem con su versión vigente. */
  async itemStep(
    person: Person,
    projectId: string,
    id: string,
    action: 'move' | 'plan',
    body: object,
  ): Promise<request.Response> {
    const item = await this.itemOf(person, projectId, id);
    return this.action(
      `/v1/projects/${projectId}/items/${id}/actions/${action}`,
      person,
      item.version,
      body,
    );
  }

  /** Iteración planeada dentro de las fechas del proyecto. */
  async sprint(leader: Person, projectId: string, overrides: object = {}): Promise<string> {
    return this.create(`/v1/projects/${projectId}/sprints`, leader, {
      name: 'Iteración 1',
      starts_on: this.day(1),
      ends_on: this.day(14),
      goal: null,
      ...overrides,
    });
  }

  async sprintStep(
    leader: Person,
    projectId: string,
    id: string,
    action: 'start' | 'close',
  ): Promise<request.Response> {
    const sprint = (await this.project(leader, projectId)).sprints.find((row) => row.id === id);
    if (sprint === undefined) throw new Error(`No aparece la iteración ${id}`);
    return this.action(
      `/v1/projects/${projectId}/sprints/${id}/actions/${action}`,
      leader,
      sprint.version,
    );
  }

  /** La tarea de la Dirección que espera en Mis tareas para el proyecto. */
  async authorizationTask(projectId: string): Promise<string> {
    const task = await tenantScope(
      this.db,
      this.tenant.id,
    )((tx) =>
      tx.workflowTask.findFirstOrThrow({
        where: { instance: { entityId: projectId }, completedAt: null },
      }),
    );
    expect(task.assigneeRole).toBe('DIRECCION');
    return task.id;
  }

  /** Publica la bandeja de salida de la empresa, como el worker: crea los avisos. */
  async dispatchNotices(): Promise<void> {
    await publishTenantEvents(
      { database: apiDatabase(), clock: this.clock },
      this.tenant.id,
      this.clock.now(),
    );
  }

  /** Eventos de la bandeja de salida de un registro, en orden. */
  async outboxEvents(entityId: string): Promise<string[]> {
    const events = await tenantScope(
      this.db,
      this.tenant.id,
    )((tx) =>
      tx.outboxEvent.findMany({
        where: { payload: { path: ['id'], equals: entityId } },
        orderBy: { occurredAt: 'asc' },
      }),
    );
    return events.map((event) => event.eventType);
  }
}
