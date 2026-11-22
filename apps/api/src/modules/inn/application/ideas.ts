import { Inject, Injectable } from '@nestjs/common';
import type { Idea, IdeaStage, InnCodeResponse, SaveIdea } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate, nextBusinessCode } from '../../core/index.js';
import { ideaViews } from './idea-views.js';
import {
  innActorOf,
  innConflict,
  innNotFound,
  recordInnChange,
  type Target,
} from './inn-support.js';

// Banco de ideas (B40, ficha 17.16; FT-INN-005). Todo colaborador propone y ve las suyas; quien lee
// Innovación ve todas (decisión 2). La idea se corrige mientras sigue inscrita.

const IDEAS = { name: 'Banco de ideas', prefix: 'IDE', padding: 4 };

function ideaData(input: SaveIdea) {
  return {
    title: input.title,
    description: input.description,
    expectedBenefit: input.expected_benefit,
  };
}

@Injectable()
export class Ideas {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Todas, de la más reciente a la más antigua. */
  async list(principal: Principal, stage: IdeaStage | undefined): Promise<Idea[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.innIdea.findMany({
        where: { deletedAt: null, ...(stage === undefined ? {} : { stage }) },
        orderBy: [{ code: 'desc' }],
        take: 500,
      });
      return ideaViews(tx, rows);
    });
  }

  /** Las que propuso la persona. */
  async mine(principal: Principal): Promise<Idea[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.innIdea.findMany({
        where: { proposerId: principal.userId, deletedAt: null },
        orderBy: [{ code: 'desc' }],
        take: 200,
      });
      return ideaViews(tx, rows);
    });
  }

  async create(principal: Principal, meta: RequestMeta, input: SaveIdea): Promise<InnCodeResponse> {
    const actor = innActorOf(principal, this.clock.now(), meta);
    return this.database.withTenant(principal, async (tx) => {
      const code = await nextBusinessCode(tx, 'inn.idea', actor.at, IDEAS);
      const row = await tx.innIdea.create({
        data: {
          tenantId: actor.tenantId,
          code,
          ...ideaData(input),
          proposerId: principal.userId,
          proposedOn: fromCalendarDate(bogotaToday(actor.at)),
        },
      });
      await recordInnChange(tx, actor, {
        action: 'inn.idea.create',
        event: 'inn.idea.registered',
        entityType: 'inn_idea',
        entityId: row.id,
        changes: { code, title: row.title, stage: row.stage },
      });
      return { id: row.id, code };
    });
  }

  /** Solo quien la propuso, y mientras sigue inscrita. */
  async update(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: SaveIdea,
  ): Promise<void> {
    const actor = innActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const row = await tx.innIdea.findFirst({
        where: { id: target.id, proposerId: principal.userId, deletedAt: null },
      });
      if (row === null) throw innNotFound('La idea no existe.');
      if (row.stage !== 'registered') {
        throw innConflict('La idea ya pasó a evaluación: no se puede corregir.');
      }
      const data = ideaData(input);
      const updated = await tx.innIdea.updateMany({
        where: { id: row.id, version: target.version },
        data,
      });
      if (updated.count !== 1) throw versionConflict();
      await recordInnChange(tx, actor, {
        action: 'inn.idea.update',
        event: 'inn.idea.updated',
        entityType: 'inn_idea',
        entityId: row.id,
        changes: changesBetween(
          { title: row.title, description: row.description, benefit: row.expectedBenefit },
          { title: data.title, description: data.description, benefit: data.expectedBenefit },
        ),
      });
    });
  }
}
