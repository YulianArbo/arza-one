import { Inject, Injectable } from '@nestjs/common';
import type { ItemListQuery, ItemListResponse, ProjectBoard } from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { findVisibleProject } from './project-records.js';
import { peopleNames } from './project-support.js';
import { itemView, sprintView } from './project-views.js';

// La lista de pendientes y el tablero (B26). El tablero muestra la iteración en curso; sin
// iteración (o en flujo continuo), los ítems de trabajo fuera de iteraciones, con los terminados de
// las dos últimas semanas. El navegador lo vuelve a pedir cada pocos segundos para ver los cambios
// de los demás.

const RECENT_DONE_MS = 14 * 86_400_000;

const ORDER: Prisma.PrjItemOrderByWithRelationInput[] = [{ number: 'asc' }];

async function itemsWhere(tx: TenantTransaction, where: Prisma.PrjItemWhereInput) {
  const items = await tx.prjItem.findMany({
    where: { ...where, deletedAt: null },
    include: {
      parent: { select: { id: true, number: true, title: true } },
      codeReviews: {
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: { result: true },
      },
    },
    orderBy: ORDER,
  });
  const names = await peopleNames(
    tx,
    items.map((item) => item.assigneeId),
  );
  return items.map((item) => itemView(item, names));
}

function filterOf(projectId: string, query: ItemListQuery): Prisma.PrjItemWhereInput {
  return {
    projectId,
    ...(query.type === undefined ? {} : { type: query.type }),
    ...(query.sprint_id === undefined ? {} : { sprintId: query.sprint_id }),
    ...(query.backlog === 'true' ? { sprintId: null } : {}),
  };
}

@Injectable()
export class ItemQueries {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(
    principal: Principal,
    ability: AppAbility,
    projectId: string,
    query: ItemListQuery,
  ): Promise<ItemListResponse> {
    return this.database.withTenant(principal, async (tx) => {
      await findVisibleProject(tx, ability, projectId);
      return { data: await itemsWhere(tx, filterOf(projectId, query)) };
    });
  }

  async board(principal: Principal, ability: AppAbility, projectId: string): Promise<ProjectBoard> {
    const now = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      await findVisibleProject(tx, ability, projectId);
      const sprint = await tx.prjSprint.findFirst({
        where: { projectId, status: 'active', deletedAt: null },
      });
      const where: Prisma.PrjItemWhereInput =
        sprint === null
          ? {
              projectId,
              sprintId: null,
              type: { not: 'epic' },
              OR: [
                { status: { not: 'done' } },
                { doneAt: { gte: new Date(now.getTime() - RECENT_DONE_MS) } },
              ],
            }
          : { projectId, sprintId: sprint.id };
      const items = await itemsWhere(tx, where);
      return {
        sprint: sprint === null ? null : sprintView(sprint, items.length),
        items,
        refreshed_at: now.toISOString(),
      };
    });
  }
}
