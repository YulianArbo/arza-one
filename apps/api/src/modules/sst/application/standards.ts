import { Inject, Injectable } from '@nestjs/common';
import {
  MINIMUM_STANDARDS,
  scoreStandards,
  type AssessStandard,
  type StandardItem,
  type StandardResult,
  type StandardsAssessment,
} from '@arza/contracts';

import type { Prisma, SstStandardsAssessment } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  assertFile,
  auditSst,
  refOf,
  sstNotFound,
  userRefs,
  type SstActor,
} from './sst-support.js';

// Autoevaluación de estándares mínimos (B37, decisión 4; Resolución 0312 de 2019). Un registro por
// estándar y año; el puntaje lo calcula la plataforma con la tabla de valores y se clasifica.

export interface StandardTarget {
  readonly year: number;
  readonly code: string;
  /** 0 cuando el estándar aún no se evalúa ese año. */
  readonly version: number;
}

async function yearRows(tx: TenantTransaction, year: number) {
  return tx.sstStandardsAssessment.findMany({ where: { year, deletedAt: null } });
}

function resultsOf(rows: readonly SstStandardsAssessment[]): Map<string, StandardResult> {
  return new Map(rows.map((row) => [row.standard, row.result as StandardResult]));
}

type AssessmentData = Omit<
  Prisma.SstStandardsAssessmentUncheckedCreateInput,
  'tenantId' | 'year' | 'standard'
>;

/** Crea la evaluación del estándar o la cambia con su versión; devuelve su identificador. */
async function upsert(
  tx: TenantTransaction,
  at: {
    readonly actor: SstActor;
    readonly target: StandardTarget;
    readonly currentId: string | null;
  },
  data: AssessmentData,
): Promise<string> {
  const { actor, target, currentId } = at;
  if (currentId === null) {
    const row = await tx.sstStandardsAssessment.create({
      data: { ...data, tenantId: actor.tenantId, year: target.year, standard: target.code },
    });
    return row.id;
  }
  const updated = await tx.sstStandardsAssessment.updateMany({
    where: { id: currentId, version: target.version },
    data,
  });
  if (updated.count !== 1) throw versionConflict();
  return currentId;
}

@Injectable()
export class Standards {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async assessment(principal: Principal, year: number): Promise<StandardsAssessment> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await yearRows(tx, year);
      const byCode = new Map(rows.map((row) => [row.standard, row]));
      const refs = await userRefs(
        tx,
        rows.map((row) => row.assessedBy),
      );
      const data: StandardItem[] = MINIMUM_STANDARDS.map((standard) => {
        const row = byCode.get(standard.code);
        return {
          ...standard,
          result: (row?.result ?? null) as StandardResult | null,
          justification: row?.justification ?? null,
          evidence_file_id: row?.evidenceFileId ?? null,
          improvement: row?.improvement ?? null,
          assessed_by: row === undefined ? null : refOf(refs, row.assessedBy),
          version: row?.version ?? 0,
        };
      });
      return { year, score: scoreStandards(year, resultsOf(rows)), data };
    });
  }

  /** Evalúa un estándar del año; si ya estaba evaluado, se cambia con su versión. */
  async assess(
    principal: Principal,
    meta: RequestMeta,
    target: StandardTarget,
    input: AssessStandard,
  ): Promise<void> {
    const actor: SstActor = { ...principal, at: this.clock.now(), meta };
    const standard = MINIMUM_STANDARDS.find((entry) => entry.code === target.code);
    if (standard === undefined) throw sstNotFound('El estándar no existe.');
    const score = input.result === 'not_met' ? 0 : standard.weight;
    const data = {
      result: input.result,
      score,
      justification: input.justification,
      evidenceFileId: input.evidence_file_id,
      improvement: input.improvement,
      assessedBy: actor.userId,
    };
    await this.database.withTenant(principal, async (tx) => {
      await assertFile(tx, principal, input.evidence_file_id);
      const where = { year: target.year, standard: target.code, deletedAt: null };
      const current = await tx.sstStandardsAssessment.findFirst({ where });
      if ((current?.version ?? 0) !== target.version) throw versionConflict();
      const id = await upsert(tx, { actor, target, currentId: current?.id ?? null }, data);
      await auditSst(tx, actor, {
        action: 'sst.standards.assess',
        entityType: 'sst_standards_assessment',
        entityId: id,
        changes: { year: target.year, standard: target.code, result: input.result, score },
      });
    });
  }
}
