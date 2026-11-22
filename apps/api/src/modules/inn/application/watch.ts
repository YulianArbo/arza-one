import { Inject, Injectable } from '@nestjs/common';
import type { Competitor, SaveCompetitor, SaveWatchEntry, WatchEntry } from '@arza/contracts';

import type { InnCompetitor, InnTechWatch } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { fromCalendarDate, toCalendarDate } from '../../core/index.js';
import {
  innActorOf,
  innNotFound,
  recordInnChange,
  refOf,
  userRefs,
  type Target,
} from './inn-support.js';

// Vigilancia tecnológica (FT-INN-006) y análisis de competencia (RE-INN-002) (B40, ficha 17.16).

function watchData(input: SaveWatchEntry) {
  return {
    topic: input.topic,
    source: input.source,
    finding: input.finding,
    relevance: input.relevance,
    observedOn: fromCalendarDate(input.observed_on),
  };
}

function competitorData(input: SaveCompetitor) {
  return {
    name: input.name,
    segment: input.segment,
    website: input.website,
    strengths: input.strengths,
    weaknesses: input.weaknesses,
    updatedOn: fromCalendarDate(input.updated_on),
  };
}

function watchView(row: InnTechWatch, recordedBy: WatchEntry['recorded_by']): WatchEntry {
  return {
    id: row.id,
    topic: row.topic,
    source: row.source,
    finding: row.finding,
    relevance: row.relevance as WatchEntry['relevance'],
    observed_on: toCalendarDate(row.observedOn),
    recorded_by: recordedBy,
    version: row.version,
  };
}

function competitorView(row: InnCompetitor): Competitor {
  return {
    id: row.id,
    name: row.name,
    segment: row.segment,
    website: row.website,
    strengths: row.strengths,
    weaknesses: row.weaknesses,
    updated_on: toCalendarDate(row.updatedOn),
    version: row.version,
  };
}

@Injectable()
export class TechWatch {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Los hallazgos, del más reciente al más antiguo. */
  async list(principal: Principal): Promise<WatchEntry[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.innTechWatch.findMany({
        where: { deletedAt: null },
        orderBy: [{ observedOn: 'desc' }, { id: 'desc' }],
        take: 500,
      });
      const refs = await userRefs(
        tx,
        rows.map((row) => row.recordedBy),
      );
      return rows.map((row) => watchView(row, refOf(refs, row.recordedBy)));
    });
  }

  async create(principal: Principal, meta: RequestMeta, input: SaveWatchEntry): Promise<string> {
    const actor = innActorOf(principal, this.clock.now(), meta);
    return this.database.withTenant(principal, async (tx) => {
      const row = await tx.innTechWatch.create({
        data: { tenantId: actor.tenantId, ...watchData(input), recordedBy: principal.userId },
      });
      await recordInnChange(tx, actor, {
        action: 'inn.watch.create',
        event: 'inn.watch.created',
        entityType: 'inn_tech_watch',
        entityId: row.id,
        changes: { topic: row.topic, relevance: row.relevance },
      });
      return row.id;
    });
  }

  async update(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: SaveWatchEntry,
  ): Promise<void> {
    const actor = innActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const updated = await tx.innTechWatch.updateMany({
        where: { id: target.id, version: target.version, deletedAt: null },
        data: watchData(input),
      });
      if (updated.count !== 1) {
        const exists = await tx.innTechWatch.count({ where: { id: target.id, deletedAt: null } });
        throw exists === 0 ? innNotFound('El hallazgo no existe.') : versionConflict();
      }
      await recordInnChange(tx, actor, {
        action: 'inn.watch.update',
        event: 'inn.watch.updated',
        entityType: 'inn_tech_watch',
        entityId: target.id,
        changes: { topic: input.topic, relevance: input.relevance },
      });
    });
  }
}

@Injectable()
export class Competitors {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal): Promise<Competitor[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.innCompetitor.findMany({
        where: { deletedAt: null },
        orderBy: [{ name: 'asc' }],
        take: 500,
      });
      return rows.map(competitorView);
    });
  }

  async create(principal: Principal, meta: RequestMeta, input: SaveCompetitor): Promise<string> {
    const actor = innActorOf(principal, this.clock.now(), meta);
    return this.database.withTenant(principal, async (tx) => {
      const row = await tx.innCompetitor.create({
        data: { tenantId: actor.tenantId, ...competitorData(input) },
      });
      await recordInnChange(tx, actor, {
        action: 'inn.competitor.create',
        event: 'inn.competitor.created',
        entityType: 'inn_competitor',
        entityId: row.id,
        changes: { name: row.name, segment: row.segment },
      });
      return row.id;
    });
  }

  async update(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: SaveCompetitor,
  ): Promise<void> {
    const actor = innActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const updated = await tx.innCompetitor.updateMany({
        where: { id: target.id, version: target.version, deletedAt: null },
        data: competitorData(input),
      });
      if (updated.count !== 1) {
        const exists = await tx.innCompetitor.count({ where: { id: target.id, deletedAt: null } });
        throw exists === 0 ? innNotFound('El competidor no existe.') : versionConflict();
      }
      await recordInnChange(tx, actor, {
        action: 'inn.competitor.update',
        event: 'inn.competitor.updated',
        entityType: 'inn_competitor',
        entityId: target.id,
        changes: { name: input.name, segment: input.segment },
      });
    });
  }
}
