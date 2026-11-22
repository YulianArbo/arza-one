import { viabilityScoresSchema, type Idea, type InnRef } from '@arza/contracts';

import type { InnIdea } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCalendarDate } from '../../core/index.js';
import { dateOf, optionalRef, refOf, userRefs } from './inn-support.js';

// Cómo se muestra una idea del banco (B40): sus personas con nombre y su evaluación de viabilidad.

function viabilityOf(row: InnIdea, refs: ReadonlyMap<string, InnRef>): Idea['viability'] {
  if (row.viabilityTotal === null || row.evaluatedBy === null || row.evaluatedOn === null) {
    return null;
  }
  return {
    scores: viabilityScoresSchema.parse(row.viabilityScores),
    total: row.viabilityTotal,
    concept: row.viabilityConcept as NonNullable<Idea['viability']>['concept'],
    observations: row.viabilityNote,
    evaluated_by: refOf(refs, row.evaluatedBy),
    evaluated_on: toCalendarDate(row.evaluatedOn),
    record_code: row.viabilityRecordCode,
  };
}

function ideaView(row: InnIdea, refs: ReadonlyMap<string, InnRef>): Idea {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    expected_benefit: row.expectedBenefit,
    stage: row.stage as Idea['stage'],
    proposer: refOf(refs, row.proposerId),
    proposed_on: toCalendarDate(row.proposedOn),
    evaluator: optionalRef(refs, row.evaluatorId),
    viability: viabilityOf(row, refs),
    decision_note: row.decisionNote,
    decided_by: optionalRef(refs, row.decidedBy),
    decided_on: dateOf(row.decidedOn),
    version: row.version,
  };
}

/** Las ideas con los nombres de todas sus personas. */
export async function ideaViews(tx: TenantTransaction, rows: readonly InnIdea[]): Promise<Idea[]> {
  const refs = await userRefs(
    tx,
    rows.flatMap((row) => [row.proposerId, row.evaluatorId, row.evaluatedBy, row.decidedBy]),
  );
  return rows.map((row) => ideaView(row, refs));
}
