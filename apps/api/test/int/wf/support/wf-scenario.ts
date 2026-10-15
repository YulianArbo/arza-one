import {
  definitionSchema,
  instanceSchema,
  taskListResponseSchema,
  taskSchema,
  type CreateDefinitionRequest,
  type InstanceView,
  type SystemRoleCode,
  type TaskSummary,
  type TaskView,
  type WorkflowFacts,
} from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { expect } from 'vitest';

import type { WorkflowTask } from '../../../../src/generated/prisma/client.js';
import { startWorkflow } from '../../../../src/modules/wf/index.js';
import { CoreScenario, unique } from '../../core/support/core-scenario.js';
import type { Person } from '../../iam/support/access-scenario.js';
import { tenantScope } from '../../iam/support/iam-fixtures.js';
import { apiDatabase } from '../../support/integration-database.js';

// Escenario de las pruebas del motor de flujos (B15): dos empresas con la semilla del núcleo,
// personas con roles y un flujo de ejemplo que ensaya condición, aprobación en serie (jefe y
// Calidad), en paralelo (Dirección y Finanzas), devolución y cancelación.

export const LIMIT = 1000;

type State = CreateDefinitionRequest['states'][number];
type Transition = CreateDefinitionRequest['transitions'][number];

function state(key: string, label: string, kind: State['kind'], extra: Partial<State> = {}): State {
  const none = { sla_hours: null, priority: 'normal', assignee: null, approval: null } as const;
  return { ...none, key, label, kind, ...extra };
}

function step(from: string, to: string, action: string, extra: Partial<Transition> = {}) {
  const none = { required_permission: null, condition: null, requires_comment: false } as const;
  return {
    ...none,
    from_state: from,
    to_state: to,
    action,
    label: action,
    ...extra,
  } satisfies Transition;
}

function serial(): State['approval'] {
  return { mode: 'serial', approvers: [{ type: 'supervisor' }, { type: 'role', role: 'CALIDAD' }] };
}

function parallel(): State['approval'] {
  const roles = ['DIRECCION', 'ADMIN_FINANCIERO'];
  return { mode: 'parallel', approvers: roles.map((role) => ({ type: 'role', role })) };
}

/** Flujo de ejemplo con clave única; la aprobación en serie se puede delegar (doc.version.approve). */
export function sampleFlow(): CreateDefinitionRequest {
  const key = unique('test.flow');
  return {
    key,
    entity_type: key,
    name: `Flujo de prueba ${key}`,
    description: null,
    states: [
      state('draft', 'Borrador', 'initial', { sla_hours: 4, assignee: { type: 'initiator' } }),
      state('review', 'Revisión', 'approval', { sla_hours: 8, approval: serial() }),
      state('board', 'Junta', 'approval', { approval: parallel() }),
      state('done', 'Aprobada', 'final'),
      state('rejected', 'Rechazada', 'final'),
      state('cancelled', 'Cancelada', 'final'),
    ],
    transitions: [
      step('draft', 'review', 'submit', {
        label: 'Enviar',
        condition: [{ fact: 'amount', op: 'lte', value: LIMIT }],
      }),
      step('draft', 'board', 'submit_board', {
        label: 'Enviar a la junta',
        condition: [{ fact: 'amount', op: 'gt', value: LIMIT }],
      }),
      step('draft', 'cancelled', 'cancel', {
        label: 'Cancelar',
        required_permission: 'wf.task.reassign',
        requires_comment: true,
      }),
      step('review', 'done', 'approve', {
        label: 'Aprobar',
        required_permission: 'doc.version.approve',
      }),
      step('review', 'draft', 'reject', { label: 'Devolver' }),
      step('board', 'done', 'approve', { label: 'Aprobar' }),
      step('board', 'rejected', 'reject', { label: 'Rechazar' }),
    ],
  };
}

export class WfScenario extends CoreScenario {
  /** Crea y publica el flujo por la API. Devuelve la definición. */
  async publish(admin: Person, flow = sampleFlow()): Promise<{ id: string; key: string }> {
    const id = await this.create('/v1/workflows', admin, flow);
    const view = definitionSchema.parse(
      (await this.get(`/v1/workflows/${id}`, admin.session)).body,
    );
    const published = await this.post(`/v1/workflows/${id}/actions/publish`, admin.session).set(
      'If-Match',
      String(view.row_version),
    );
    expect(published.status, published.text).toBe(204);
    return { id, key: flow.key };
  }

  /** Inicia el flujo como lo haría el módulo dueño del registro, a nombre de la persona. */
  async startAs(
    person: Person,
    key: string,
    facts: WorkflowFacts = { amount: 500 },
  ): Promise<string> {
    const context = {
      tenantId: this.tenant.id,
      userId: person.id,
      meta: null,
      at: this.clock.now(),
    };
    const instance = await apiDatabase().withTenant(
      { tenantId: this.tenant.id, userId: person.id },
      (tx) =>
        startWorkflow(tx, context, {
          key,
          entityType: key,
          entityId: uuidv7(),
          title: unique('Solicitud '),
          facts,
        }),
    );
    return instance.id;
  }

  /** Tareas abiertas del trámite, leídas directamente de la base. */
  async openTasks(instanceId: string, tenantId = this.tenant.id): Promise<WorkflowTask[]> {
    return tenantScope(
      this.db,
      tenantId,
    )((tx) =>
      tx.workflowTask.findMany({
        where: { instanceId, status: { in: ['pending', 'in_progress', 'overdue'] } },
        orderBy: { sequence: 'asc' },
      }),
    );
  }

  async onlyOpenTask(instanceId: string): Promise<WorkflowTask> {
    const [task, ...rest] = await this.openTasks(instanceId);
    expect(rest).toEqual([]);
    if (task === undefined) throw new Error('El trámite no tiene tareas abiertas.');
    return task;
  }

  async mine(person: Person, view = 'open'): Promise<TaskSummary[]> {
    const response = await this.get(`/v1/tasks/mine?view=${view}`, person.session);
    expect(response.status, response.text).toBe(200);
    return taskListResponseSchema.parse(response.body).data;
  }

  async task(person: Person, id: string): Promise<TaskView> {
    const response = await this.get(`/v1/tasks/${id}`, person.session);
    expect(response.status, response.text).toBe(200);
    return taskSchema.parse(response.body);
  }

  async instance(person: Person, id: string): Promise<InstanceView> {
    const response = await this.get(`/v1/workflow-instances/${id}`, person.session);
    expect(response.status, response.text).toBe(200);
    return instanceSchema.parse(response.body);
  }

  /** Acción sobre una tarea; espera que la API la acepte. */
  async act(person: Person, taskId: string, action: string, body: object = {}): Promise<void> {
    const response = await this.post(`/v1/tasks/${taskId}/actions/${action}`, person.session, body);
    expect(response.status, response.text).toBe(204);
  }

  /** Pone a `worker` a reportar a `boss` en el organigrama (cargos nuevos en un proceso). */
  async reportsTo(worker: Person, boss: Person): Promise<void> {
    await this.inTenant(async (tx) => {
      const unit = await tx.orgUnit.findFirstOrThrow({ where: { deletedAt: null } });
      const top = await tx.position.create({
        data: { tenantId: this.tenant.id, orgUnitId: unit.id, name: unique('Jefe ') },
      });
      const below = await tx.position.create({
        data: {
          tenantId: this.tenant.id,
          orgUnitId: unit.id,
          name: unique('Analista '),
          reportsToId: top.id,
        },
      });
      await tx.user.update({ where: { id: boss.id }, data: { positionId: top.id } });
      await tx.user.update({ where: { id: worker.id }, data: { positionId: below.id } });
    });
  }

  people(
    label: string,
    roles: readonly SystemRoleCode[],
    tenantId = this.tenant.id,
  ): Promise<Person> {
    return this.person(unique(label), roles, { tenantId });
  }
}
