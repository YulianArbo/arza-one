import { Inject, Injectable } from '@nestjs/common';
import {
  canMoveItem,
  isWorkItem,
  type CreateItemRequest,
  type ItemStatus,
  type MoveItemRequest,
  type PlanItemRequest,
  type UpdateItemRequest,
} from '@arza/contracts';

import type { PrjItem } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  assertAssignee,
  assertParent,
  findItem,
  itemAudit,
  itemPayload,
  nextItemNumber,
  statusOfItem,
  typeOf,
  updateItemVersioned,
} from './item-records.js';
import {
  criteriaRequired,
  moveInvalid,
  reviewRequired,
  statusInvalid,
} from './project-messages.js';
import { assertWorking, findProjectForItems, lockProject } from './project-records.js';
import { findSprint } from './sprints.js';
import {
  projectActorOf,
  recordProjectChange,
  type ProjectActor,
  type ProjectPartTarget,
} from './project-support.js';

// La lista de pendientes y el tablero (B26, ficha 17.8). Los ítems los gestiona el equipo del
// proyecto (y quien gestiona todos los proyectos). Un ítem no entra a una iteración sin criterios de
// aceptación; avanza de a una columna; no pasa a terminado sin una revisión de código FT-TEC-002
// aprobada (B27) y la nota de pruebas; uno terminado no se edita: se reabre moviéndolo.

/** Quien actúa con sus permisos, para revisar su pertenencia al proyecto. */
export interface ItemRequester {
  readonly principal: Principal;
  readonly ability: AppAbility;
  readonly meta: RequestMeta;
}

/** El ítem es de trabajo y avanza de a una columna; devuelve de dónde sale. */
function assertMove(item: PrjItem, input: MoveItemRequest): ItemStatus {
  if (!isWorkItem(typeOf(item))) throw moveInvalid('Las épicas no se mueven en el tablero.');
  const from = statusOfItem(item);
  if (!canMoveItem(from, input.status)) {
    throw moveInvalid(
      'Un ítem avanza de a una columna: no se salta la revisión ni las pruebas. Puede devolverlo a cualquier columna anterior.',
    );
  }
  return from;
}

/**
 * La evidencia con que el ítem termina: la nota de pruebas (la que llega o la que ya tenía) y, desde
 * el B27, su última revisión de código FT-TEC-002 aprobada.
 */
async function evidenceFor(tx: TenantTransaction, item: PrjItem, input: MoveItemRequest) {
  const reviewUrl = input.review_url ?? item.reviewUrl;
  const testNote = input.test_note ?? item.testNote;
  const done = input.status === 'done';
  if (!done) return { reviewUrl, testNote, done };
  const last = await tx.prjCodeReview.findFirst({
    where: { itemId: item.id, deletedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { result: true, referenceUrl: true },
  });
  if (last?.result !== 'approved' || testNote === null) throw reviewRequired();
  return { reviewUrl: reviewUrl ?? last.referenceUrl, testNote, done };
}

function itemData(input: UpdateItemRequest) {
  return {
    parentId: input.parent_id,
    title: input.title,
    description: input.description,
    acceptanceCriteria: input.acceptance_criteria,
    priority: input.priority,
    estimateHours: input.estimate_hours,
    assigneeId: input.assignee_id,
  };
}

@Injectable()
export class ItemsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(requester: ItemRequester): ProjectActor {
    return projectActorOf(requester.principal, requester.meta, this.clock.now());
  }

  async create(
    requester: ItemRequester,
    projectId: string,
    input: CreateItemRequest,
  ): Promise<string> {
    const actor = this.actor(requester);
    return this.database.withTenant(requester.principal, async (tx) => {
      const { project, memberIds } = await findProjectForItems(tx, requester.ability, projectId);
      await assertParent(tx, projectId, input.type, input.parent_id);
      assertAssignee(memberIds, input.assignee_id);
      await lockProject(tx, projectId);
      const number = await nextItemNumber(tx, projectId);
      const item = await tx.prjItem.create({
        data: {
          tenantId: actor.tenantId,
          projectId,
          type: input.type,
          number,
          code: `${project.code}-${String(number)}`,
          ...itemData(input),
        },
      });
      await recordProjectChange(tx, actor, {
        action: 'project.item.create',
        event: 'project.item.created',
        entityType: 'prj_item',
        entityId: item.id,
        changes: itemAudit(item),
        payload: itemPayload(item),
      });
      return item.id;
    });
  }

  async update(
    requester: ItemRequester,
    target: ProjectPartTarget,
    input: UpdateItemRequest,
  ): Promise<void> {
    const actor = this.actor(requester);
    await this.database.withTenant(requester.principal, async (tx) => {
      const { memberIds } = await findProjectForItems(tx, requester.ability, target.projectId);
      const before = await findItem(tx, target);
      if (before.status === 'done') {
        throw statusInvalid(
          'Un ítem terminado no se edita: muévalo a otra columna para reabrirlo.',
        );
      }
      if (input.parent_id === before.id) throw moveInvalid('Un ítem no cuelga de sí mismo.');
      await assertParent(tx, target.projectId, typeOf(before), input.parent_id);
      assertAssignee(memberIds, input.assignee_id);
      if (before.sprintId !== null && input.acceptance_criteria === null) throw criteriaRequired();
      await updateItemVersioned(tx, target, itemData(input));
      const after = await findItem(tx, target);
      await recordProjectChange(tx, actor, {
        action: 'project.item.update',
        event: 'project.item.updated',
        entityType: 'prj_item',
        entityId: target.id,
        changes: { code: before.code, ...changesBetween(itemAudit(before), itemAudit(after)) },
        payload: itemPayload(after),
      });
    });
  }

  /** Mueve el ítem a otra columna del tablero (arrastrar y soltar o el menú «Mover a»). */
  async move(
    requester: ItemRequester,
    target: ProjectPartTarget,
    input: MoveItemRequest,
  ): Promise<void> {
    const actor = this.actor(requester);
    await this.database.withTenant(requester.principal, async (tx) => {
      const { project } = await findProjectForItems(tx, requester.ability, target.projectId);
      assertWorking(
        project,
        'El tablero se mueve cuando el proyecto está en ejecución o en riesgo.',
      );
      const item = await findItem(tx, target);
      const from = assertMove(item, input);
      const { reviewUrl, testNote, done } = await evidenceFor(tx, item, input);
      await updateItemVersioned(tx, target, {
        status: input.status,
        reviewUrl,
        testNote,
        doneAt: done ? actor.at : null,
      });
      await recordProjectChange(tx, actor, {
        action: 'project.item.move',
        event: 'project.item.moved',
        entityType: 'prj_item',
        entityId: item.id,
        changes: {
          ...itemAudit(item),
          status: [from, input.status],
          ...(done ? { review_url: reviewUrl, test_note: testNote } : {}),
        },
        payload: { ...itemPayload(item), status: input.status },
      });
    });
  }

  /** Lleva el ítem a una iteración o lo devuelve a la lista de pendientes. */
  async plan(
    requester: ItemRequester,
    target: ProjectPartTarget,
    input: PlanItemRequest,
  ): Promise<void> {
    const actor = this.actor(requester);
    await this.database.withTenant(requester.principal, async (tx) => {
      await findProjectForItems(tx, requester.ability, target.projectId);
      const item = await findItem(tx, target);
      if (item.status === 'done') throw statusInvalid('Un ítem terminado no se vuelve a planear.');
      if (input.sprint_id !== null) {
        const sprint = await findSprint(tx, { id: input.sprint_id, projectId: target.projectId });
        if (sprint.status === 'closed') {
          throw statusInvalid(
            'La iteración ya se cerró. Elija una planeada o la que está en curso.',
          );
        }
        if (!isWorkItem(typeOf(item)) || item.acceptanceCriteria === null) throw criteriaRequired();
      }
      await updateItemVersioned(tx, target, { sprintId: input.sprint_id });
      await recordProjectChange(tx, actor, {
        action: 'project.item.plan',
        event: 'project.item.planned',
        entityType: 'prj_item',
        entityId: item.id,
        changes: { ...itemAudit(item), sprint_id: [item.sprintId, input.sprint_id] },
        payload: itemPayload(item),
      });
    });
  }
}
