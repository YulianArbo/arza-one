import { Inject, Injectable } from '@nestjs/common';
import type {
  LinkObjectiveIndicators,
  QmsCodeResponse,
  SaveStrategicObjective,
  StrategicObjective,
} from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { nextPlainCode } from '../../core/index.js';
import { auditQms, qmsActorOf, qmsInvalid, qmsNotFound, type Target } from './qms-support.js';

// Objetivos del plan estratégico (PL-DG-001) para el cuadro de mando integral (B46, decisión 4).
// Calidad los registra en una de las cuatro perspectivas y les asigna los indicadores que los
// miden; cada indicador mide a lo sumo un objetivo.

const OBJECTIVES = { key: 'qms.strategic_objective', name: 'Objetivos', prefix: 'OBJ', padding: 3 };

function objectiveData(input: SaveStrategicObjective) {
  return {
    perspective: input.perspective,
    name: input.name,
    description: input.description,
    yearFrom: input.year_from,
    yearTo: input.year_to,
    active: input.active,
  };
}

@Injectable()
export class StrategicObjectives {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal): Promise<StrategicObjective[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.qmsStrategicObjective.findMany({
        where: { deletedAt: null },
        orderBy: [{ code: 'asc' }],
        include: { indicators: { where: { deletedAt: null }, select: { id: true } } },
      });
      return rows.map((row) => ({
        id: row.id,
        code: row.code,
        perspective: row.perspective as StrategicObjective['perspective'],
        name: row.name,
        description: row.description,
        year_from: row.yearFrom,
        year_to: row.yearTo,
        active: row.active,
        indicator_ids: row.indicators.map((indicator) => indicator.id),
        version: row.version,
      }));
    });
  }

  async create(
    principal: Principal,
    meta: RequestMeta,
    input: SaveStrategicObjective,
  ): Promise<QmsCodeResponse> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    return this.database.withTenant(principal, async (tx) => {
      const code = await nextPlainCode(tx, OBJECTIVES);
      const row = await tx.qmsStrategicObjective.create({
        data: { tenantId: actor.tenantId, code, ...objectiveData(input) },
      });
      await auditQms(tx, actor, {
        action: 'qms.strategic_objective.create',
        entityType: 'qms_strategic_objective',
        entityId: row.id,
        changes: { code, perspective: input.perspective, name: input.name },
      });
      return { id: row.id, code };
    });
  }

  async update(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: SaveStrategicObjective,
  ): Promise<void> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const updated = await tx.qmsStrategicObjective.updateMany({
        where: { id: target.id, version: target.version, deletedAt: null },
        data: objectiveData(input),
      });
      if (updated.count !== 1) {
        const exists = await tx.qmsStrategicObjective.count({
          where: { id: target.id, deletedAt: null },
        });
        throw exists === 0 ? qmsNotFound('El objetivo no existe.') : versionConflict();
      }
      await auditQms(tx, actor, {
        action: 'qms.strategic_objective.update',
        entityType: 'qms_strategic_objective',
        entityId: target.id,
        changes: { perspective: input.perspective, name: input.name, active: input.active },
      });
    });
  }

  /** Reemplaza los indicadores que miden el objetivo. */
  async linkIndicators(
    principal: Principal,
    meta: RequestMeta,
    id: string,
    input: LinkObjectiveIndicators,
  ): Promise<void> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    const wanted = [...new Set(input.indicator_ids)];
    await this.database.withTenant(principal, async (tx) => {
      const objective = await tx.qmsStrategicObjective.count({ where: { id, deletedAt: null } });
      if (objective === 0) throw qmsNotFound('El objetivo no existe.');
      const found = await tx.qmsIndicator.count({ where: { id: { in: wanted }, deletedAt: null } });
      if (found !== wanted.length) throw qmsInvalid('Algún indicador no existe.');
      await tx.qmsIndicator.updateMany({
        where: { strategicObjectiveId: id, id: { notIn: wanted } },
        data: { strategicObjectiveId: null },
      });
      await tx.qmsIndicator.updateMany({
        where: { id: { in: wanted } },
        data: { strategicObjectiveId: id },
      });
      await auditQms(tx, actor, {
        action: 'qms.strategic_objective.link',
        entityType: 'qms_strategic_objective',
        entityId: id,
        changes: { indicator_ids: wanted },
      });
    });
  }
}
