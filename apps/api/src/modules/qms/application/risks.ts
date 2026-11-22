import { Inject, Injectable } from '@nestjs/common';
import { rateRisk, type QmsRisk, type SaveQmsRisk } from '@arza/contracts';

import type { QmsRisk as QmsRiskRow } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  bogotaToday,
  fromCalendarDate,
  nextBusinessCode,
  toCalendarDate,
} from '../../core/index.js';
import {
  assertPerson,
  assertProcess,
  auditQms,
  processRefs,
  qmsActorOf,
  qmsNotFound,
  refOf,
  userRefs,
  type Target,
} from './qms-support.js';

// Riesgos y oportunidades (B38, decisión 9; FT-SGC-003). La plataforma calcula el valor y el nivel
// a partir de la probabilidad y el impacto; la base lo verifica.

const RISKS = { name: 'Riesgos y oportunidades', prefix: 'RSG', padding: 4 };

function riskData(input: SaveQmsRisk) {
  const rating = rateRisk(input.probability, input.impact);
  return {
    kind: input.kind,
    processId: input.process_id,
    description: input.description,
    causes: input.causes,
    probability: input.probability,
    impact: input.impact,
    score: rating.score,
    level: rating.level,
    treatment: input.treatment,
    treatmentPlan: input.treatment_plan,
    ownerId: input.owner_id,
    reviewOn: fromCalendarDate(input.review_on),
    status: input.status,
  };
}

function auditOf(row: { kind: string; score: number; level: string; status: string }) {
  return { kind: row.kind, score: row.score, level: row.level, status: row.status };
}

async function assertRiskRefs(tx: TenantTransaction, input: SaveQmsRisk): Promise<void> {
  await assertProcess(tx, input.process_id);
  await assertPerson(tx, input.owner_id);
}

@Injectable()
export class Risks {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** La matriz, del valor más alto al más bajo; marca los que ya debían revisarse. */
  async list(principal: Principal): Promise<QmsRisk[]> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.qmsRisk.findMany({
        where: { deletedAt: null },
        orderBy: [{ score: 'desc' }, { code: 'asc' }],
        take: 500,
      });
      const people = await userRefs(
        tx,
        rows.map((row) => row.ownerId),
      );
      const processes = await processRefs(
        tx,
        rows.map((row) => row.processId),
      );
      return rows.map((row) =>
        riskView(
          row,
          refOf(processes, row.processId, 'Proceso'),
          refOf(people, row.ownerId),
          today,
        ),
      );
    });
  }

  async create(principal: Principal, meta: RequestMeta, input: SaveQmsRisk): Promise<string> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    return this.database.withTenant(principal, async (tx) => {
      await assertRiskRefs(tx, input);
      const code = await nextBusinessCode(tx, 'qms.risk', actor.at, RISKS);
      const row = await tx.qmsRisk.create({
        data: { tenantId: actor.tenantId, code, ...riskData(input) },
      });
      await auditQms(tx, actor, {
        action: 'qms.risk.create',
        entityType: 'qms_risk',
        entityId: row.id,
        changes: { code, ...auditOf(row) },
      });
      return row.id;
    });
  }

  async update(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: SaveQmsRisk,
  ): Promise<void> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const row = await tx.qmsRisk.findFirst({ where: { id: target.id, deletedAt: null } });
      if (row === null) throw qmsNotFound('El riesgo no existe.');
      await assertRiskRefs(tx, input);
      const data = riskData(input);
      const updated = await tx.qmsRisk.updateMany({
        where: { id: row.id, version: target.version },
        data,
      });
      if (updated.count !== 1) throw versionConflict();
      await auditQms(tx, actor, {
        action: 'qms.risk.update',
        entityType: 'qms_risk',
        entityId: row.id,
        changes: changesBetween(auditOf(row), auditOf(data)),
      });
    });
  }
}

function riskView(
  row: QmsRiskRow,
  process: QmsRisk['process'],
  owner: QmsRisk['owner'],
  today: string,
): QmsRisk {
  const reviewOn = toCalendarDate(row.reviewOn);
  return {
    id: row.id,
    code: row.code,
    kind: row.kind as QmsRisk['kind'],
    process,
    description: row.description,
    causes: row.causes,
    probability: row.probability,
    impact: row.impact,
    score: row.score,
    level: row.level as QmsRisk['level'],
    treatment: row.treatment as QmsRisk['treatment'],
    treatment_plan: row.treatmentPlan,
    owner,
    review_on: reviewOn,
    review_due: row.status === 'active' && reviewOn <= today,
    status: row.status as QmsRisk['status'],
    version: row.version,
  };
}
