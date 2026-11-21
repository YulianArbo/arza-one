import { Inject, Injectable } from '@nestjs/common';
import { valueRisk, type Hazard, type SaveHazard } from '@arza/contracts';

import type { SstHazard } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  activeProcesses,
  fromCalendarDate,
  orgUnitsById,
  toCalendarDate,
} from '../../core/index.js';
import { auditSst, sstInvalid, sstNotFound, type SstActor, type Target } from './sst-support.js';

// Matriz de peligros con GTC 45 (B37, decisión 3; RE-SST-001). La plataforma calcula la
// probabilidad, el valor del riesgo y su nivel a partir de lo que indica SST; la base lo verifica.

function hazardView(row: SstHazard, processName: string): Hazard {
  return {
    id: row.id,
    process: { id: row.processId, name: processName },
    activity: row.activity,
    routine: row.routine,
    hazard_class: row.hazardClass as Hazard['hazard_class'],
    hazard: row.hazard,
    effects: row.effects,
    existing_controls: row.existingControls,
    deficiency: row.deficiency,
    exposure: row.exposure,
    consequence: row.consequence,
    probability: row.probability,
    risk: row.risk,
    risk_level: row.riskLevel as Hazard['risk_level'],
    proposed_controls: row.proposedControls,
    review_on: toCalendarDate(row.reviewOn),
    version: row.version,
  };
}

function hazardData(input: SaveHazard) {
  const valuation = valueRisk(input.deficiency, input.exposure, input.consequence);
  return {
    processId: input.process_id,
    activity: input.activity,
    routine: input.routine,
    hazardClass: input.hazard_class,
    hazard: input.hazard,
    effects: input.effects,
    existingControls: input.existing_controls,
    deficiency: input.deficiency,
    exposure: input.exposure,
    consequence: input.consequence,
    probability: valuation.probability,
    risk: valuation.risk,
    riskLevel: valuation.level,
    proposedControls: input.proposed_controls,
    reviewOn: fromCalendarDate(input.review_on),
  };
}

function auditOf(row: Pick<SstHazard, 'activity' | 'hazardClass' | 'risk' | 'riskLevel'>) {
  return {
    activity: row.activity,
    hazard_class: row.hazardClass,
    risk: row.risk,
    risk_level: row.riskLevel,
  };
}

async function assertProcess(tx: TenantTransaction, processId: string): Promise<void> {
  const processes = await activeProcesses(tx);
  if (processes.some((process) => process.id === processId)) return;
  throw sstInvalid('El proceso no existe o no está activo.');
}

@Injectable()
export class Hazards {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** La matriz, del riesgo más alto al más bajo. */
  async list(principal: Principal): Promise<Hazard[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.sstHazard.findMany({
        where: { deletedAt: null },
        orderBy: [{ risk: 'desc' }, { id: 'asc' }],
        take: 500,
      });
      const units = await orgUnitsById(tx, [...new Set(rows.map((row) => row.processId))]);
      return rows.map((row) => hazardView(row, units.get(row.processId)?.name ?? 'Proceso'));
    });
  }

  async create(principal: Principal, meta: RequestMeta, input: SaveHazard): Promise<string> {
    const actor: SstActor = { ...principal, at: this.clock.now(), meta };
    return this.database.withTenant(principal, async (tx) => {
      await assertProcess(tx, input.process_id);
      const row = await tx.sstHazard.create({
        data: { tenantId: actor.tenantId, ...hazardData(input) },
      });
      await auditSst(tx, actor, {
        action: 'sst.hazard.create',
        entityType: 'sst_hazard',
        entityId: row.id,
        changes: auditOf(row),
      });
      return row.id;
    });
  }

  async update(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: SaveHazard,
  ): Promise<void> {
    const actor: SstActor = { ...principal, at: this.clock.now(), meta };
    await this.database.withTenant(principal, async (tx) => {
      const row = await tx.sstHazard.findFirst({ where: { id: target.id, deletedAt: null } });
      if (row === null) throw sstNotFound('El peligro no existe.');
      await assertProcess(tx, input.process_id);
      const data = hazardData(input);
      const updated = await tx.sstHazard.updateMany({
        where: { id: row.id, version: target.version },
        data,
      });
      if (updated.count !== 1) throw versionConflict();
      await auditSst(tx, actor, {
        action: 'sst.hazard.update',
        entityType: 'sst_hazard',
        entityId: row.id,
        changes: changesBetween(auditOf(row), auditOf(data)),
      });
    });
  }
}
